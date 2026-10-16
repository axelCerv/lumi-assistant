/**
 * Claves y tokens (API keys, OAuth). Se cifran con el llavero del sistema
 * mediante `safeStorage` de Electron y nunca se escriben en el vault.
 */
import { app, safeStorage } from "electron";
import path from "node:path";
import { readJsonSync, writeFileAtomicSync, log } from "../util";

export type SecretName =
  | "claude"
  | "gemini"
  | "granola"
  | "granola-mcp"
  | "google-oauth"
  | "microsoft-oauth";

let file = "";
let store: Record<string, { v: string; enc: boolean }> = {};

export function loadSecrets(): void {
  file = path.join(app.getPath("userData"), "secretos.json");
  store = readJsonSync(file, {});
}

function save(): void {
  writeFileAtomicSync(file, JSON.stringify(store));
}

export function setSecret(name: SecretName, value: string | null): void {
  if (value === null || value === "") {
    delete store[name];
  } else if (safeStorage.isEncryptionAvailable()) {
    store[name] = { v: safeStorage.encryptString(value).toString("base64"), enc: true };
  } else {
    log.warn("El llavero del sistema no está disponible; la clave se guarda sin cifrar.");
    store[name] = { v: Buffer.from(value, "utf8").toString("base64"), enc: false };
  }
  save();
}

export function getSecret(name: SecretName): string | null {
  const item = store[name];
  if (!item) return null;
  try {
    const buf = Buffer.from(item.v, "base64");
    return item.enc ? safeStorage.decryptString(buf) : buf.toString("utf8");
  } catch (e) {
    log.error("No pude leer el secreto", name, e);
    return null;
  }
}

export function getSecretJson<T>(name: SecretName): T | null {
  const s = getSecret(name);
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function setSecretJson(name: SecretName, value: unknown): void {
  setSecret(name, value == null ? null : JSON.stringify(value));
}

export function hasSecret(name: SecretName): boolean {
  return !!store[name];
}
