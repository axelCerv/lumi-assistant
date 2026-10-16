/** Configuración de Lumi (no secreta) en la carpeta de datos de la app. */
import { app } from "electron";
import path from "node:path";
import { Settings, type DeepPartial } from "@lumi/shared";
import { deepMerge, emitChanged, readJsonSync, writeFileAtomicSync } from "./util";

let file = "";
let current: Settings = Settings.parse({});

export function loadSettings(): Settings {
  file = path.join(app.getPath("userData"), "configuracion.json");
  const raw = readJsonSync<unknown>(file, {});
  const parsed = Settings.safeParse(raw);
  current = parsed.success ? parsed.data : Settings.parse({});
  return current;
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: DeepPartial<Settings>): Settings {
  const merged = deepMerge(current, patch);
  // Mapas que se reemplazan completos (si no, no se podría quitar una entrada)
  if (patch.modes?.calendarios) merged.modes = { ...merged.modes, calendarios: { ...(patch.modes.calendarios as Record<string, string>) } };
  const parsed = Settings.safeParse(merged);
  if (!parsed.success) throw new Error(`Configuración inválida: ${parsed.error.message}`);
  current = parsed.data;
  writeFileAtomicSync(file, JSON.stringify(current, null, 2));
  emitChanged("settings-changed");
  emitChanged();
  return current;
}
