/**
 * Las ventanas de Lumi: avatar flotante, burbuja de aviso, panel (menú) y una
 * ventana oculta ("cerebro") que calcula embeddings. Todas transparentes, sin
 * bordes y siempre encima (menos la oculta).
 */
import { app, BrowserWindow, Menu, screen, type MenuItemConstructorOptions, type Rectangle } from "electron";
import path from "node:path";
import { enabledModes, type BubblePayload, type LumiEvents, type PanelView } from "@lumi/shared";
import { getSettings, updateSettings } from "./settings";
import { bus, emitChanged } from "./util";
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

  bubble = floating({ width: BUBBLE_W, height: 200, focusable: false, acceptFirstMouse: true, title: "Lumi · Aviso" });
  load(bubble, "bubble");

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
  for (const w of [avatar, bubble, panel]) {
    w.on("close", (e) => {
      if (!quitting) {
        e.preventDefault();
        w.hide();
      }
    });
  }
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
  if (currentBubble) send("bubble", "bubble", currentBubble);
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
  if (!panelVisible()) send("bubble", "bubble", currentBubble);
  emitChanged();
}

export function getBubble(): BubblePayload | null {
  return currentBubble;
}

export function bubbleReady(width: number, height: number): void {
  if (!bubble || !currentBubble || panelVisible()) return;
  placeBeside(bubble, { w: Math.ceil(width), h: Math.ceil(height) }, currentBubble.side);
  bubble.showInactive();
}

export function hideBubble(): void {
  currentBubble = null;
  bubble?.hide();
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
    if (dragTimer) return;
    dragTimer = setInterval(() => {
      if (!avatar) return;
      const c = screen.getCursorScreenPoint();
      avatar.setPosition(Math.round(c.x - pressOffset.x), Math.round(c.y - pressOffset.y));
      followAvatar();
    }, 16);
  } else {
    if (dragTimer) clearInterval(dragTimer);
    dragTimer = null;
    // Si quedó fuera del área visible, se acomoda
    const b = avatar.getBounds();
    const wa = workAreaFor(b);
    const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width);
    const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height);
    avatar.setPosition(x, y);
    followAvatar();
    updateSettings({ avatarPos: { x, y } });
  }
}

export function brainWindow(): BrowserWindow | null {
  return brainWin;
}
