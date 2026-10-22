/**
 * Las ventanas de Lumi: avatar flotante, burbuja de aviso, panel (menú) y una
 * ventana oculta ("cerebro") que calcula embeddings. Todas transparentes, sin
 * bordes y siempre encima (menos la oculta).
 */
import { app, BrowserWindow, Menu, powerMonitor, screen, type MenuItemConstructorOptions, type Rectangle } from "electron";
import path from "node:path";
import { enabledModes, type BubblePayload, type LumiEvents, type PanelView } from "@lumi/shared";
import { getSettings, updateSettings } from "./settings";
import { bus, emitChanged, log } from "./util";
import { activeMode, setMode } from "./modes";

const isMac = process.platform === "darwin";
const AVATAR = { w: 96, h: 104 };
const PANEL = { w: 424, h: 684 };
const BUBBLE_W = 340;

let avatar: BrowserWindow | null = null;
let bubble: BrowserWindow | null = null;
let panel: BrowserWindow | null = null;
let brainWin: BrowserWindow | null = null;

let pinned = false;
let panelHiddenAt = 0;
let currentBubble: BubblePayload | null = null;
let pressOffset = { x: 0, y: 0 };
let dragTimer: NodeJS.Timeout | null = null;
/** Última señal de «sigo arrastrando» de la interfaz (si se pierde el soltar, el arrastre se corta solo). */
let dragBeat = 0;
/** Vigila que la burbuja de verdad aparezca después de mandarle un aviso. */
let bubbleWatch: NodeJS.Timeout | null = null;
let bubbleShownAt = 0;

function pageUrl(page: string): { url?: string; file?: string } {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) return { url: `${process.env.ELECTRON_RENDERER_URL}/${page}.html` };
  return { file: path.join(__dirname, `../renderer/${page}.html`) };
}

function load(win: BrowserWindow, page: string) {
  const u = pageUrl(page);
  if (u.url) void win.loadURL(u.url);
  else void win.loadFile(u.file!);
}

function floating(opts: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
    ...opts,
  });
  win.setAlwaysOnTop(true, isMac ? "floating" : "screen-saver");
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Los enlaces externos se abren en el navegador, nunca dentro de Lumi
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  return win;
}

function workAreaFor(rect: Rectangle): Rectangle {
  return screen.getDisplayMatching(rect).workArea;
}

function defaultAvatarPos(): { x: number; y: number } {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - AVATAR.w - 40, y: wa.y + wa.height - AVATAR.h - 90 };
}

function onScreen(p: { x: number; y: number }): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return p.x >= a.x - 20 && p.y >= a.y - 20 && p.x < a.x + a.width - 40 && p.y < a.y + a.height - 40;
  });
}

export function createWindows(): void {
  const saved = getSettings().avatarPos;
  const pos = saved && onScreen(saved) ? saved : defaultAvatarPos();

  avatar = floating({ width: AVATAR.w, height: AVATAR.h, x: pos.x, y: pos.y, focusable: true, acceptFirstMouse: true, title: "Lumi" });
  load(avatar, "avatar");
  avatar.once("ready-to-show", () => avatar?.showInactive());

  createBubble();

  panel = floating({ width: PANEL.w, height: PANEL.h, acceptFirstMouse: true, title: "Lumi · Menú" });
  load(panel, "panel");
  panel.on("blur", () => {
    if (!pinned && panel?.isVisible()) hidePanel();
  });

  brainWin = new BrowserWindow({
    show: false,
    width: 200,
    height: 200,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  load(brainWin, "brain");

  // Cerrar una ventana solo la esconde (para salir: ícono de la bandeja)
  for (const w of [avatar, panel]) hideOnClose(w);
  watchHealth(avatar, "avatar");
  watchHealth(panel, "panel");

  // Al volver de la suspensión o desbloquear, la burbuja se rehace (la GPU pudo reiniciarse)
  // y Lumi se acomoda por si cambiaron las pantallas.
  const afterWake = () =>
    setTimeout(() => {
      recreateBubble("volviste de la suspensión");
      keepAvatarOnScreen();
    }, 2000);
  powerMonitor.on("resume", afterWake);
  powerMonitor.on("unlock-screen", afterWake);
  screen.on("display-removed", () => keepAvatarOnScreen());
  screen.on("display-metrics-changed", () => keepAvatarOnScreen());
  app.on("child-process-gone", (_e, d) => {
    if (d.type !== "GPU" || quitting) return;
    log.warn("GPU reiniciada:", d.reason);
    setTimeout(() => {
      recreateBubble("se reinició la GPU");
      for (const w of [avatar, panel]) if (w && !w.isDestroyed()) w.webContents.reload();
    }, 1500);
  });
}

function hideOnClose(w: BrowserWindow): void {
  w.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      w.hide();
    }
  });
}

/** Si una ventana se cae o se congela, se recupera sola (sin reiniciar la app). */
function watchHealth(w: BrowserWindow, name: "avatar" | "bubble" | "panel"): void {
  w.webContents.on("render-process-gone", (_e, d) => {
    if (quitting || w.isDestroyed()) return;
    log.warn(`${name}: la ventana se cayó (${d.reason}); la recupero`);
    if (name === "bubble") recreateBubble(d.reason);
    else w.webContents.reload();
  });
  w.on("unresponsive", () => {
    if (quitting || w.isDestroyed()) return;
    log.warn(`${name}: la ventana no responde; la recupero`);
    if (name === "bubble") recreateBubble("no respondía");
    else w.webContents.forcefullyCrashRenderer();
  });
}

function createBubble(): void {
  const b = floating({ width: BUBBLE_W, height: 200, focusable: false, acceptFirstMouse: true, title: "Lumi · Aviso" });
  bubble = b;
  load(b, "bubble");
  hideOnClose(b);
  watchHealth(b, "bubble");
}

/**
 * Rehace la ventana de la burbuja desde cero. La nueva pide el aviso actual al
 * cargar, así que si había uno vuelve a salir (ya con botones que responden).
 */
export function recreateBubble(reason: string): void {
  if (quitting) return;
  log.warn("Rehago la burbuja:", reason);
  const old = bubble;
  createBubble();
  if (old && !old.isDestroyed()) {
    old.removeAllListeners("close");
    old.destroy();
  }
  if (currentBubble && !panelVisible()) armBubbleWatch();
}

/** Si la burbuja no confirma que se dibujó en 5 s, se rehace (una sola vez por aviso). */
function armBubbleWatch(retry = true): void {
  if (bubbleWatch) clearTimeout(bubbleWatch);
  bubbleWatch = setTimeout(() => {
    bubbleWatch = null;
    if (!currentBubble || panelVisible() || quitting) return;
    if (bubble && !bubble.isDestroyed() && bubble.isVisible() && bubbleShownAt > 0) return;
    if (retry) {
      recreateBubble("no apareció a tiempo");
      armBubbleWatch(false);
    }
  }, 5000);
}

function keepAvatarOnScreen(): void {
  if (!avatar || avatar.isDestroyed()) return;
  const [x, y] = avatar.getPosition();
  if (onScreen({ x, y })) return;
  const p = defaultAvatarPos();
  avatar.setPosition(p.x, p.y);
  followAvatar();
}

/** Para la bandeja: «¿Lumi se trabó?» → rehace sus ventanas sin cerrar la app. */
export function resetWindows(): void {
  stopDrag();
  recreateBubble("lo pediste desde la bandeja");
  for (const w of [avatar, panel]) if (w && !w.isDestroyed()) w.webContents.reload();
  keepAvatarOnScreen();
  avatar?.showInactive();
}

let quitting = false;
export function markQuitting(): void {
  quitting = true;
}

export function send<K extends keyof LumiEvents>(target: "avatar" | "bubble" | "panel" | "brain" | "all", event: K, payload: LumiEvents[K]): void {
  const wins = target === "all" ? [avatar, bubble, panel] : [{ avatar, bubble, panel, brain: brainWin }[target]];
  for (const w of wins) if (w && !w.isDestroyed()) w.webContents.send(`lumi:${event}`, payload);
}

/* --------------------------- Posición relativa --------------------------- */

function placeBeside(win: BrowserWindow, size: { w: number; h: number }, side?: "left" | "right", align: "center" | "bottom" = "center"): void {
  if (!avatar) return;
  const a = avatar.getBounds();
  const wa = workAreaFor(a);
  const gap = 6;
  const right = side ? side === "right" : wa.x + wa.width - (a.x + a.width) >= size.w + gap;
  let x = right ? a.x + a.width + gap : a.x - size.w - gap;
  let y = align === "bottom" ? a.y + a.height - size.h : a.y + Math.round(a.height / 2 - size.h / 2);
  x = Math.min(Math.max(x, wa.x), wa.x + wa.width - size.w);
  y = Math.min(Math.max(y, wa.y), wa.y + wa.height - size.h);
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: size.w, height: size.h });
}

function sideForBubble(): "left" | "right" {
  if (!avatar) return "left";
  const a = avatar.getBounds();
  const wa = workAreaFor(a);
  return wa.x + wa.width - (a.x + a.width) >= BUBBLE_W + 8 ? "right" : "left";
}

/* --------------------------------- Panel -------------------------------- */

export function panelVisible(): boolean {
  return !!panel?.isVisible();
}

export function showPanel(): void {
  if (!panel) return;
  bubble?.hide();
  if (!avatar?.isVisible()) avatar?.showInactive();
  placeBeside(panel, PANEL, undefined, "bottom");
  panel.show();
  panel.focus();
  send("panel", "panel-opened", null);
}

/** Abre el menú directo en una vista (p. ej. el editor de apariencia). */
export function showPanelView(view: PanelView): void {
  showPanel();
  send("panel", "panel-view", view);
}

export function hidePanel(): void {
  panel?.hide();
  panelHiddenAt = Date.now();
  // Si había un aviso esperando, ahora sí sale
  if (currentBubble) {
    bubbleShownAt = 0;
    send("bubble", "bubble", currentBubble);
    armBubbleWatch();
  }
}

export function togglePanel(): void {
  if (panelVisible()) return hidePanel();
  // El clic en el avatar quita el foco al menú y lo esconde un instante antes:
  // ese clic cuenta como "cerrar", no como "abrir".
  if (Date.now() - panelHiddenAt < 350) return;
  showPanel();
}

export function setPinned(v: boolean): void {
  pinned = v;
}

/* --------------------------------- Burbuja -------------------------------- */

export function bubbleBusy(): boolean {
  return !!currentBubble;
}

export function showBubble(payload: BubblePayload): void {
  currentBubble = { ...payload, side: sideForBubble() };
  bubbleShownAt = 0;
  if (!panelVisible()) {
    // Si la ventana de la burbuja se cayó, se rehace antes de mandarle el aviso
    if (!bubble || bubble.isDestroyed() || bubble.webContents.isCrashed()) recreateBubble("estaba caída");
    else send("bubble", "bubble", currentBubble);
    armBubbleWatch();
  }
  emitChanged();
}

export function getBubble(): BubblePayload | null {
  return currentBubble;
}

export function bubbleReady(width: number, height: number): void {
  if (!bubble || bubble.isDestroyed() || !currentBubble || panelVisible()) return;
  const w = Math.max(40, Math.ceil(width));
  const h = Math.max(40, Math.ceil(height));
  const b = bubble.getBounds();
  if (!(bubble.isVisible() && b.width === w && b.height === h)) {
    placeBeside(bubble, { w, h }, currentBubble.side);
    if (!bubble.isVisible()) bubble.showInactive();
    // Que se vuelva a dibujar completa con el tamaño nuevo (si no, en Windows la parte
    // nueva puede quedar transparente y los clics la atraviesan)
    bubble.webContents.invalidate();
  }
  bubbleShownAt = Date.now();
  if (bubbleWatch) {
    clearTimeout(bubbleWatch);
    bubbleWatch = null;
  }
}

export function hideBubble(): void {
  currentBubble = null;
  bubbleShownAt = 0;
  if (bubbleWatch) {
    clearTimeout(bubbleWatch);
    bubbleWatch = null;
  }
  if (bubble && !bubble.isDestroyed()) bubble.hide();
  emitChanged();
}

/* --------------------------------- Avatar -------------------------------- */

/** Submenú «Modo»: elegir uno (hasta el siguiente bloque), fijarlo o volver al horario. */
export function modeMenu(): MenuItemConstructorOptions[] {
  const onChange = () => bus.emit("mode-announce");
  const s = getSettings();
  const modes = enabledModes(s.modes);
  const cur = activeMode();
  const pinned = !!s.modes.fijado;
  const items: MenuItemConstructorOptions[] = modes.map((m, i) => ({
    label: `${m.icono}  ${m.nombre}`,
    type: "radio",
    checked: cur.id === m.id,
    accelerator: i < 9 ? `CommandOrControl+Alt+Shift+${i + 1}` : undefined,
    registerAccelerator: false,
    click: () => {
      setMode(m.id, "bloque");
      onChange();
    },
  }));
  return [
    ...items,
    { type: "separator" },
    {
      label: "Quedarme en este modo",
      type: "checkbox",
      checked: s.modes.fijado?.hasta === null,
      click: (item) => {
        setMode(item.checked ? cur.id : null, item.checked ? "fijo" : "automatico");
        onChange();
      },
    },
    {
      label: "Volver a mi horario",
      enabled: pinned,
      click: () => {
        setMode(null, "automatico");
        onChange();
      },
    },
    { label: "Configurar modos…", click: () => showPanelView("modes") },
  ];
}

/** Clic derecho sobre el avatar: atajos rápidos. */
export function avatarMenu(): void {
  if (!avatar) return;
  const modes = enabledModes(getSettings().modes);
  const cur = modes.find((m) => m.id === activeMode().id);
  const school = modes.some((m) => m.id === "escuela");
  Menu.buildFromTemplate([
    { label: "Abrir menú", click: () => showPanelView("home") },
    ...(modes.length > 1 ? [{ label: `Modo: ${cur ? `${cur.icono} ${cur.nombre}` : "—"}`, submenu: modeMenu() } as MenuItemConstructorOptions] : []),
    ...(school ? [{ label: "Repasar tarjetas", click: () => showPanelView("review") } as MenuItemConstructorOptions] : []),
    { label: "Cambiar mi look…", click: () => showPanelView("appearance") },
    { label: "Platicar con Lumi", click: () => showPanelView("chat") },
    { type: "separator" },
    { label: "Esconder a Lumi", click: () => setAvatarVisible(false) },
  ]).popup({ window: avatar });
}

export function setAvatarVisible(visible: boolean): void {
  if (visible) avatar?.showInactive();
  else {
    avatar?.hide();
    bubble?.hide();
    panel?.hide();
  }
}

export function avatarPress(): void {
  if (!avatar) return;
  const c = screen.getCursorScreenPoint();
  const [x, y] = avatar.getPosition();
  pressOffset = { x: c.x - x, y: c.y - y };
}

function followAvatar(): void {
  if (panel?.isVisible()) placeBeside(panel, PANEL, undefined, "bottom");
  if (bubble?.isVisible() && currentBubble) {
    const b = bubble.getBounds();
    placeBeside(bubble, { w: b.width, h: b.height }, sideForBubble());
  }
}

export function avatarDrag(active: boolean): void {
  if (!avatar) return;
  if (active) {
    dragBeat = Date.now();
    if (dragTimer) return;
    dragTimer = setInterval(() => {
      if (!avatar || avatar.isDestroyed()) return stopDrag();
      // Si se perdió el «soltar» (otra ventana se puso encima, el sistema se lo comió…),
      // Lumi deja de seguir al mouse en vez de quedarse pegado.
      if (Date.now() - dragBeat > 1500) return stopDrag();
      const c = screen.getCursorScreenPoint();
      avatar.setPosition(Math.round(c.x - pressOffset.x), Math.round(c.y - pressOffset.y));
      followAvatar();
    }, 16);
  } else stopDrag();
}

function stopDrag(): void {
  if (dragTimer) clearInterval(dragTimer);
  const wasDragging = !!dragTimer;
  dragTimer = null;
  if (!wasDragging || !avatar || avatar.isDestroyed()) return;
  // Si quedó fuera del área visible, se acomoda
  const b = avatar.getBounds();
  const wa = workAreaFor(b);
  const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width);
  const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height);
  avatar.setPosition(x, y);
  followAvatar();
  updateSettings({ avatarPos: { x, y } });
}

export function brainWindow(): BrowserWindow | null {
  return brainWin;
}
