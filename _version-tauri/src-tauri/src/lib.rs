//! Lumi: lado nativo (Rust).
//!
//! Aquí vive lo que la interfaz no puede hacer sola:
//! - guardar tus datos en disco (un archivo JSON en la carpeta de datos de la app),
//! - mover, mostrar y ocultar las tres ventanas (avatar, burbuja y menú),
//! - guardar tu clave de Claude en el llavero del sistema y hablar con la API,
//! - descargar tus calendarios (enlaces iCal de Google u Outlook),
//! - el ícono en la barra de menú / bandeja del sistema.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent,
};

const KEYRING_SERVICE: &str = "lumi-assistant";
const KEYRING_USER: &str = "anthropic-api-key";
const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

struct Store {
    rev: u64,
    value: Value,
    path: PathBuf,
}

#[derive(Default)]
struct UiState {
    /// Aviso que la burbuja debe mostrar (o que espera a que se cierre el menú).
    bubble: Option<Value>,
    /// Reuniones ya leídas de tus calendarios (las calcula el avatar).
    meetings: Value,
    panel_pinned: bool,
    panel_hidden_at: Option<Instant>,
    avatar_pos: Option<(i32, i32)>,
    avatar_pos_dirty: bool,
}

struct AppState {
    store: Mutex<Store>,
    ui: Mutex<UiState>,
    window_file: PathBuf,
}

#[derive(Serialize)]
struct DataSnapshot {
    rev: u64,
    data: Value,
}

#[derive(Serialize, Deserialize)]
struct ChatTurn {
    role: String,
    content: String,
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    match serde_json::from_str(&text) {
        Ok(v) => Some(v),
        Err(_) => {
            // Archivo dañado: se guarda una copia y se empieza de cero.
            let _ = fs::copy(path, path.with_extension("json.bak"));
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_data(state: tauri::State<AppState>) -> DataSnapshot {
    let s = state.store.lock().unwrap();
    DataSnapshot {
        rev: s.rev,
        data: s.value.clone(),
    }
}

/// Guarda todos los datos. `rev` evita que dos ventanas se pisen:
/// si alguien guardó antes, responde "conflict" y la interfaz reintenta.
#[tauri::command]
fn save_data(
    app: AppHandle,
    state: tauri::State<AppState>,
    data: Value,
    rev: u64,
) -> Result<u64, String> {
    let new_rev = {
        let mut s = state.store.lock().map_err(|e| e.to_string())?;
        if s.rev != rev {
            return Err("conflict".into());
        }
        write_json(&s.path, &data)?;
        s.value = data;
        s.rev += 1;
        s.rev
    };
    let _ = app.emit("lumi://data", new_rev);
    Ok(new_rev)
}

#[tauri::command]
fn data_folder(state: tauri::State<AppState>) -> String {
    let s = state.store.lock().unwrap();
    s.path
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_default()
}

#[tauri::command]
fn set_meetings(app: AppHandle, state: tauri::State<AppState>, meetings: Value) {
    state.ui.lock().unwrap().meetings = meetings;
    let _ = app.emit("lumi://meetings", ());
}

#[tauri::command]
fn get_meetings(state: tauri::State<AppState>) -> Value {
    state.ui.lock().unwrap().meetings.clone()
}

// ---------------------------------------------------------------------------
// Ventanas
// ---------------------------------------------------------------------------

fn monitor_rect(win: &WebviewWindow) -> (i32, i32, i32, i32) {
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten());
    match monitor {
        Some(m) => {
            let p = m.position();
            let s = m.size();
            (p.x, p.y, s.width as i32, s.height as i32)
        }
        None => (0, 0, 1920, 1080),
    }
}

/// Tamaño de una ventana en px físicos. Si el sistema aún no lo sabe (ventana
/// oculta en algunos sistemas), se usa el tamaño configurado.
fn phys_size(win: &WebviewWindow) -> (i32, i32) {
    if let Ok(s) = win.outer_size() {
        if s.width >= 20 && s.height >= 20 {
            return (s.width as i32, s.height as i32);
        }
    }
    let scale = win.scale_factor().unwrap_or(1.0);
    let (w, h) = match win.label() {
        "avatar" => (96.0, 104.0),
        "bubble" => (340.0, 200.0),
        _ => (424.0, 684.0),
    };
    ((w * scale) as i32, (h * scale) as i32)
}

/// ¿Cabe `width` (px lógicos) a la derecha del avatar? Si no, va a la izquierda.
fn side_for(app: &AppHandle, width_logical: f64) -> &'static str {
    let Some(avatar) = app.get_webview_window("avatar") else {
        return "left";
    };
    let Ok(pos) = avatar.outer_position() else {
        return "left";
    };
    let (aw, _) = phys_size(&avatar);
    let scale = avatar.scale_factor().unwrap_or(1.0);
    let (mx, _, mw, _) = monitor_rect(&avatar);
    let needed = ((width_logical + 8.0) * scale) as i32;
    if mx + mw - (pos.x + aw) >= needed {
        "right"
    } else {
        "left"
    }
}

/// Coloca la ventana `label` junto al avatar. `size` (px físicos) sirve cuando
/// la ventana acaba de cambiar de tamaño y el sistema aún no lo refleja.
fn place_beside(app: &AppHandle, label: &str, side: Option<&str>, size: Option<(i32, i32)>) {
    let (Some(avatar), Some(win)) = (
        app.get_webview_window("avatar"),
        app.get_webview_window(label),
    ) else {
        return;
    };
    let Ok(apos) = avatar.outer_position() else {
        return;
    };
    let scale = avatar.scale_factor().unwrap_or(1.0);
    let gap = (6.0 * scale) as i32;
    let (mx, my, mw, mh) = monitor_rect(&avatar);
    let (aw, ah) = phys_size(&avatar);
    let (ww, wh) = size.unwrap_or_else(|| phys_size(&win));

    let right = match side {
        Some(s) => s == "right",
        None => mx + mw - (apos.x + aw) >= ww + gap,
    };
    let x = if right { apos.x + aw + gap } else { apos.x - ww - gap };
    let y = if label == "panel" {
        apos.y + ah - wh
    } else {
        apos.y + ah / 2 - wh / 2
    };
    let x = x.clamp(mx, (mx + mw - ww).max(mx));
    let y = y.clamp(my, (my + mh - wh).max(my));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

fn show_panel_inner(app: &AppHandle) {
    if let Some(bubble) = app.get_webview_window("bubble") {
        let _ = bubble.hide();
    }
    if let Some(panel) = app.get_webview_window("panel") {
        place_beside(app, "panel", None, None);
        let _ = panel.show();
        let _ = panel.set_focus();
        let _ = app.emit_to("panel", "lumi://panel-opened", ());
    }
}

fn hide_panel_inner(app: &AppHandle) {
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }
    let state = app.state::<AppState>();
    let pending = {
        let mut ui = state.ui.lock().unwrap();
        ui.panel_hidden_at = Some(Instant::now());
        ui.bubble.clone()
    };
    // Si había un aviso esperando, ahora sí se muestra.
    if let Some(payload) = pending {
        let _ = app.emit_to("bubble", "lumi://bubble", payload);
    }
}

fn panel_visible(app: &AppHandle) -> bool {
    app.get_webview_window("panel")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

#[tauri::command]
fn toggle_panel(app: AppHandle, state: tauri::State<AppState>) {
    if panel_visible(&app) {
        hide_panel_inner(&app);
        return;
    }
    // Al hacer clic en el avatar, el menú pierde el foco y se oculta solo
    // un instante antes: ese clic debe contarse como "cerrar", no "abrir".
    let just_hidden = state
        .ui
        .lock()
        .unwrap()
        .panel_hidden_at
        .map(|t| t.elapsed() < Duration::from_millis(350))
        .unwrap_or(false);
    if !just_hidden {
        show_panel_inner(&app);
    }
}

#[tauri::command]
fn show_panel(app: AppHandle) {
    show_panel_inner(&app);
}

#[tauri::command]
fn hide_panel(app: AppHandle) {
    hide_panel_inner(&app);
}

#[tauri::command]
fn set_panel_pinned(state: tauri::State<AppState>, pinned: bool) {
    state.ui.lock().unwrap().panel_pinned = pinned;
}

/// Pide a la burbuja que muestre un aviso. Si el menú está abierto, el aviso
/// espera a que se cierre.
#[tauri::command]
fn show_bubble(app: AppHandle, state: tauri::State<AppState>, mut payload: Value) {
    let side = side_for(&app, 340.0);
    payload["side"] = json!(side);
    state.ui.lock().unwrap().bubble = Some(payload.clone());
    if !panel_visible(&app) {
        let _ = app.emit_to("bubble", "lumi://bubble", payload);
    }
}

/// La burbuja ya se dibujó y midió: se ajusta su tamaño y aparece.
#[tauri::command]
fn bubble_ready(app: AppHandle, state: tauri::State<AppState>, width: f64, height: f64) {
    if panel_visible(&app) {
        return;
    }
    let side = state
        .ui
        .lock()
        .unwrap()
        .bubble
        .as_ref()
        .and_then(|b| b["side"].as_str().map(String::from));
    if let Some(win) = app.get_webview_window("bubble") {
        let _ = win.set_size(tauri::LogicalSize::new(width, height));
        let scale = win.scale_factor().unwrap_or(1.0);
        let size = ((width * scale).round() as i32, (height * scale).round() as i32);
        place_beside(&app, "bubble", side.as_deref(), Some(size));
        let _ = win.show();
    }
}

#[tauri::command]
fn get_bubble(state: tauri::State<AppState>) -> Option<Value> {
    state.ui.lock().unwrap().bubble.clone()
}

#[tauri::command]
fn hide_bubble(app: AppHandle, state: tauri::State<AppState>) {
    state.ui.lock().unwrap().bubble = None;
    if let Some(win) = app.get_webview_window("bubble") {
        let _ = win.hide();
    }
    let _ = app.emit("lumi://bubble-closed", ());
}

#[tauri::command]
fn set_avatar_visible(app: AppHandle, visible: bool) {
    if let Some(avatar) = app.get_webview_window("avatar") {
        if visible {
            let _ = avatar.show();
        } else {
            let _ = avatar.hide();
            for l in ["bubble", "panel"] {
                if let Some(w) = app.get_webview_window(l) {
                    let _ = w.hide();
                }
            }
        }
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

// ---------------------------------------------------------------------------
// Internet: calendarios y Claude
// ---------------------------------------------------------------------------

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("Lumi/0.1")
        .build()
        .map_err(|e| e.to_string())
}

/// Descarga un calendario (.ics). Acepta enlaces webcal://, http:// y https://.
#[tauri::command]
async fn fetch_text(url: String) -> Result<String, String> {
    let url = url.trim().to_string();
    let url = match url.strip_prefix("webcal://") {
        Some(rest) => format!("https://{rest}"),
        None => url,
    };
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("El enlace debe empezar con https:// o webcal://".into());
    }
    let res = http()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("No pude descargar el calendario: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("El calendario respondió {}", res.status()));
    }
    res.text().await.map_err(|e| e.to_string())
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

fn read_api_key() -> Option<String> {
    keyring_entry()
        .ok()?
        .get_password()
        .ok()
        .filter(|k| !k.trim().is_empty())
}

#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("La clave está vacía".into());
    }
    keyring_entry()?
        .set_password(key)
        .map_err(|e| format!("No pude guardar la clave en el llavero: {e}"))
}

#[tauri::command]
fn has_api_key() -> bool {
    read_api_key().is_some()
}

#[tauri::command]
fn delete_api_key() -> Result<(), String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Envía una conversación a Claude y devuelve el texto de la respuesta.
/// La clave nunca sale del lado nativo.
#[tauri::command]
async fn ask_claude(
    model: String,
    system: String,
    messages: Vec<ChatTurn>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let key = read_api_key()
        .ok_or("Falta tu clave de API de Claude. Agrégala en Ajustes → Inteligencia.")?;
    let body = json!({
        "model": model,
        "max_tokens": max_tokens.unwrap_or(1024),
        "system": system,
        "messages": messages,
    });
    let res = http()?
        .post(ANTHROPIC_URL)
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("No pude conectar con Claude: {e}"))?;
    let status = res.status();
    let value: Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = value["error"]["message"]
            .as_str()
            .unwrap_or("error desconocido");
        return Err(format!("Claude respondió {}: {msg}", status.as_u16()));
    }
    let text = value["content"]
        .as_array()
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b["type"] == "text")
                .filter_map(|b| b["text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    Ok(text)
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

fn place_avatar_at_start(app: &AppHandle, window_file: &Path) {
    let Some(avatar) = app.get_webview_window("avatar") else {
        return;
    };
    let saved = read_json(window_file).and_then(|v| {
        Some((v["x"].as_i64()? as i32, v["y"].as_i64()? as i32))
    });
    // Solo se usa la posición guardada si sigue dentro de alguna pantalla.
    let on_screen = |x: i32, y: i32| {
        avatar
            .available_monitors()
            .map(|ms| {
                ms.iter().any(|m| {
                    let p = m.position();
                    let s = m.size();
                    x >= p.x
                        && y >= p.y
                        && x < p.x + s.width as i32 - 40
                        && y < p.y + s.height as i32 - 40
                })
            })
            .unwrap_or(false)
    };
    let pos = match saved {
        Some((x, y)) if on_screen(x, y) => (x, y),
        _ => {
            let (mx, my, mw, mh) = monitor_rect(&avatar);
            let scale = avatar.scale_factor().unwrap_or(1.0);
            let (aw, ah) = phys_size(&avatar);
            (
                mx + mw - aw - (48.0 * scale) as i32,
                my + mh - ah - (120.0 * scale) as i32,
            )
        }
    };
    let _ = avatar.set_position(PhysicalPosition::new(pos.0, pos.1));
    let _ = avatar.show();
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir menú de Lumi", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Mostrar a Lumi", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Esconder a Lumi", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Salir de Lumi", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &show, &hide, &sep, &quit])?;

    let mut tray = TrayIconBuilder::with_id("lumi")
        .tooltip("Lumi")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                set_avatar_visible(app.clone(), true);
                show_panel_inner(app);
            }
            "show" => set_avatar_visible(app.clone(), true),
            "hide" => set_avatar_visible(app.clone(), false),
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Si abres Lumi otra vez, se muestra la que ya está corriendo.
            set_avatar_visible(app.clone(), true);
            show_panel_inner(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // En Mac, Lumi vive en la barra de menú y no ocupa lugar en el Dock.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            let data_path = dir.join("lumi-datos.json");
            let window_file = dir.join("ventana.json");
            let value = read_json(&data_path).unwrap_or_else(|| json!({}));

            app.manage(AppState {
                store: Mutex::new(Store {
                    rev: 1,
                    value,
                    path: data_path,
                }),
                ui: Mutex::new(UiState::default()),
                window_file: window_file.clone(),
            });

            let handle = app.handle().clone();
            place_avatar_at_start(&handle, &window_file);
            build_tray(&handle)?;

            // Guarda la posición del avatar cada pocos segundos si cambió.
            let saver = handle.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(2));
                let state = saver.state::<AppState>();
                let pos = {
                    let mut ui = state.ui.lock().unwrap();
                    if ui.avatar_pos_dirty {
                        ui.avatar_pos_dirty = false;
                        ui.avatar_pos
                    } else {
                        None
                    }
                };
                if let Some((x, y)) = pos {
                    let _ = write_json(&state.window_file, &json!({ "x": x, "y": y }));
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            match event {
                WindowEvent::Moved(pos) if window.label() == "avatar" => {
                    if let Some(state) = app.try_state::<AppState>() {
                        let mut ui = state.ui.lock().unwrap();
                        ui.avatar_pos = Some((pos.x, pos.y));
                        ui.avatar_pos_dirty = true;
                    }
                    for label in ["bubble", "panel"] {
                        if let Some(w) = app.get_webview_window(label) {
                            if w.is_visible().unwrap_or(false) {
                                place_beside(app, label, None, None);
                            }
                        }
                    }
                }
                WindowEvent::Focused(false) if window.label() == "panel" => {
                    let pinned = app
                        .try_state::<AppState>()
                        .map(|s| s.ui.lock().unwrap().panel_pinned)
                        .unwrap_or(false);
                    if !pinned && window.is_visible().unwrap_or(false) {
                        hide_panel_inner(app);
                    }
                }
                WindowEvent::CloseRequested { api, .. } => {
                    // Cerrar una ventana solo la esconde; para salir usa el ícono
                    // de la barra de menú / bandeja.
                    api.prevent_close();
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_data,
            save_data,
            data_folder,
            set_meetings,
            get_meetings,
            toggle_panel,
            show_panel,
            hide_panel,
            set_panel_pinned,
            show_bubble,
            bubble_ready,
            get_bubble,
            hide_bubble,
            set_avatar_visible,
            quit_app,
            fetch_text,
            set_api_key,
            has_api_key,
            delete_api_key,
            ask_claude,
        ])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Lumi");
}
