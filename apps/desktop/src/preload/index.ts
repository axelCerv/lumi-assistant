/**
 * Puente seguro entre la interfaz y el proceso principal: expone `window.lumi`.
 * La interfaz no tiene acceso a Node ni al sistema de archivos.
 */
import { contextBridge, ipcRenderer } from "electron";
// Import directo (sin zod): el preload corre en sandbox y no puede cargar dependencias
import { INVOKE_METHODS, type LumiApi, type LumiEvents } from "@lumi/shared/src/ipc.ts";

const api: Record<string, unknown> = {};
for (const name of INVOKE_METHODS) {
  api[name] = (...args: unknown[]) => ipcRenderer.invoke(`lumi:${name}`, ...args);
}
api.on = <K extends keyof LumiEvents>(event: K, cb: (payload: LumiEvents[K]) => void) => {
  const listener = (_e: Electron.IpcRendererEvent, payload: LumiEvents[K]) => cb(payload);
  ipcRenderer.on(`lumi:${event}`, listener);
  return () => ipcRenderer.removeListener(`lumi:${event}`, listener);
};
api.platform = process.platform;

contextBridge.exposeInMainWorld("lumi", api as unknown as LumiApi);
