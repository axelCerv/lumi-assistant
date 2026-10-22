/** Lumi: proceso principal de Electron. */
import { app, globalShortcut, Menu, nativeImage, shell, Tray } from "electron";
import path from "node:path";
import { enabledModes } from "@lumi/shared";
import { loadSettings, getSettings } from "./settings";
import { loadState } from "./state";
import { loadSecrets } from "./secrets";
import { createWindows, hidePanel, markQuitting, modeMenu, resetWindows, send, setAvatarVisible, showPanel, showPanelView } from "./windows";
import { registerIpc } from "./ipc";
import { embedder, getBrain, openVault, scheduleSnapshot } from "./core";
import { startScheduler } from "./scheduler";
import { initUpdater } from "./updater";
import { bus, debounce, log, errorText, setLogFile } from "./util";
import { activeMode, setMode } from "./modes";

app.setName("Lumi");
if (process.platform === "win32") app.setAppUserModelId("com.axelcervantes.lumi");

// Una sola copia de Lumi a la vez
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    setAvatarVisible(true);
    showPanel();
  });
  app.whenReady().then(start).catch((e) => log.error("No pude iniciar:", errorText(e)));
}

let tray: Tray | null = null;

function resource(name: string): string {
  return app.isPackaged ? path.join(process.resourcesPath, name) : path.join(__dirname, "../../resources", name);
}

function trayMenu(): Menu {
  const modes = enabledModes(getSettings().modes);
  const cur = modes.find((m) => m.id === activeMode().id);
  return Menu.buildFromTemplate([
    { label: "Abrir menú de Lumi", click: () => showPanel() },
    ...(modes.length > 1 ? [{ label: `Modo: ${cur ? `${cur.icono} ${cur.nombre}` : "—"}`, submenu: modeMenu() }] : []),
    { label: "Cambiar el look de Lumi…", click: () => showPanelView("appearance") },
    { label: "Mostrar a Lumi", click: () => setAvatarVisible(true) },
    { label: "Esconder a Lumi", click: () => setAvatarVisible(false) },
    { type: "separator" },
    { label: "Abrir mi vault", click: () => void (getBrain() && shell.openPath(getBrain()!.vault.root)) },
    { label: "¿Lumi se trabó? Reiniciar sus ventanas", click: () => resetWindows() },
    { label: "Ver registro de Lumi", click: () => void shell.openPath(path.join(app.getPath("userData"), "lumi.log")) },
    { type: "separator" },
    { label: "Salir de Lumi", click: () => app.quit() },
  ]);
}

function buildTray(): void {
  const isMac = process.platform === "darwin";
  const img = nativeImage.createFromPath(resource(isMac ? "trayTemplate.png" : "tray.png"));
  if (isMac) img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip("Lumi");
  tray.setContextMenu(trayMenu());
  if (!isMac) tray.on("click", () => showPanel());
  // El menú muestra el modo actual: se rehace cuando cambia
  const rebuild = debounce(() => tray?.setContextMenu(trayMenu()), 300);
  bus.on("mode-changed", rebuild);
  bus.on("settings-changed", rebuild);
}

/**
 * Atajos para cambiar de modo: Cmd/Ctrl + Alt/Opción + Mayús + 1…9.
 * (Cmd + Mayús + 3/4/5 son las capturas de pantalla de macOS, y Ctrl + Alt + número
 * escribe símbolos en teclados en español de Windows; por eso se agrega Alt/Opción.)
 */
function registerShortcuts(): void {
  for (let i = 1; i <= 9; i++) {
    try {
      globalShortcut.register(`CommandOrControl+Alt+Shift+${i}`, () => {
        const m = enabledModes(getSettings().modes)[i - 1];
        if (!m || enabledModes(getSettings().modes).length < 2) return;
        setMode(m.id, "bloque");
        bus.emit("mode-announce");
      });
    } catch (e) {
      log.warn("atajo de modo:", errorText(e));
    }
  }
}

// Un error suelto no debe dejar a Lumi a medias: se registra y se sigue
process.on("uncaughtException", (e) => log.error("Error no atrapado:", e));
process.on("unhandledRejection", (e) => log.error("Promesa rechazada:", e));

async function start(): Promise<void> {
  setLogFile(path.join(app.getPath("userData"), "lumi.log"));
  log.info(`Lumi ${app.getVersion()} en ${process.platform}`);
  loadSettings();
  loadState();
  loadSecrets();
  if (process.platform === "darwin") app.dock?.hide();

  registerIpc();
  createWindows();
  buildTray();

  // La ventana oculta calcula embeddings; aquí se conecta con el índice
  embedder.attach((id, texts) => send("brain", "brain-task", { id, texts }));

  const s = getSettings();
  if (s.vaultPath) await openVault(s.vaultPath);
  if (s.openAtLogin !== app.getLoginItemSettings().openAtLogin) app.setLoginItemSettings({ openAtLogin: s.openAtLogin, openAsHidden: true });

  startScheduler();
  registerShortcuts();
  initUpdater();
  scheduleSnapshot();
}

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("before-quit", () => {
  markQuitting();
  hidePanel();
  void getBrain()?.close();
});

// Lumi vive en la bandeja: no se cierra al cerrar ventanas
app.on("window-all-closed", () => {
  /* nada */
});
