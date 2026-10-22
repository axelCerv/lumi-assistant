import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";

/** Avisos internos entre módulos ("algo cambió, redibuja"). */
export const bus = new EventEmitter();
bus.setMaxListeners(50);

export type BusEvent = "changed" | "vault-changed" | "calendar-changed" | "settings-changed";
export const emitChanged = (what: BusEvent = "changed") => bus.emit(what);

/** Escritura atómica: archivo temporal en la misma carpeta + renombrado. */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.lumi-tmp`);
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
}

export function writeFileAtomicSync(file: string, content: string): void {
  fsSync.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.lumi-tmp`);
  fsSync.writeFileSync(tmp, content, "utf8");
  fsSync.renameSync(tmp, file);
}

export function readJsonSync<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fsSync.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: NodeJS.Timeout | undefined;
  return (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Registro: consola + archivo (userData/lumi.log, máx. ~2 MB, guarda el anterior
 * como lumi.log.1). Sirve para saber qué pasó si algo se traba.
 */
let logFile: string | null = null;
let logQueue: Promise<void> = Promise.resolve();

export function setLogFile(file: string): void {
  logFile = file;
}

function toFile(level: string, a: unknown[]): void {
  if (!logFile) return;
  const f = logFile;
  const line = `${new Date().toISOString()} ${level} ${a.map((x) => (x instanceof Error ? x.stack ?? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" ")}\n`;
  logQueue = logQueue
    .then(async () => {
      const st = await fs.stat(f).catch(() => null);
      if (st && st.size > 2_000_000) await fs.rename(f, `${f}.1`).catch(() => {});
      await fs.appendFile(f, line, "utf8");
    })
    .catch(() => {});
}

export const log = {
  info: (...a: unknown[]) => {
    console.log("[lumi]", ...a);
    toFile("INFO", a);
  },
  warn: (...a: unknown[]) => {
    console.warn("[lumi]", ...a);
    toFile("WARN", a);
  },
  error: (...a: unknown[]) => {
    console.error("[lumi]", ...a);
    toFile("ERROR", a);
  },
};

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
