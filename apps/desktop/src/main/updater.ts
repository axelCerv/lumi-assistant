/**
 * Auto-actualización con electron-updater desde GitHub Releases.
 * Solo funciona en la app instalada y cuando el repositorio está configurado
 * en electron-builder.yml (publish).
 */
import { app } from "electron";
import electronUpdater from "electron-updater";
import { emitChanged, errorText, log } from "./util";

const { autoUpdater } = electronUpdater;

let info = { available: false, version: null as string | null, downloaded: false };

export function updateInfo() {
  return info;
}

export function initUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (i) => {
    info = { available: true, version: i.version, downloaded: false };
    emitChanged();
  });
  autoUpdater.on("update-downloaded", (i) => {
    info = { available: true, version: i.version, downloaded: true };
    emitChanged();
  });
  autoUpdater.on("error", (e) => log.warn("updater:", errorText(e)));
  void autoUpdater.checkForUpdates().catch((e) => log.warn("updater:", errorText(e)));
  setInterval(() => void autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600_000);
}

export async function checkForUpdates(): Promise<string> {
  if (!app.isPackaged) return "Las actualizaciones solo funcionan en la app instalada.";
  const r = await autoUpdater.checkForUpdates();
  const v = r?.updateInfo.version;
  return v && v !== app.getVersion() ? `Hay una versión nueva: ${v}. Se descargará sola.` : `Tienes la última versión (${app.getVersion()}).`;
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}
