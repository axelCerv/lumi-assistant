/**
 * Puente Granola → vault. Sincronización incremental (al abrir y cada ~15 min),
 * sin duplicados (por granola_id) y con post-proceso opcional con IA.
 */
import { execFile } from "node:child_process";
import { shell } from "electron";
import type { Brain } from "../vault/brain";
import { getSettings, updateSettings } from "../settings";
import { getSecret, setSecret } from "../secrets";
import { getState, mutateState } from "../state";
import { emitChanged, errorText, log } from "../util";
import { writeMeeting } from "./mapper";
import { getMeeting, listNotes } from "./api-client";
import { connectInteractive, connectSilent, forgetMcp, mcpGetMeeting, mcpListMeetings, mcpTools } from "./mcp-client";
import { postProcessMeeting } from "../memory/extractor";

export interface GranolaStatus {
  ok: boolean;
  label: string;
  detail: string | null;
  syncing: boolean;
}

let status: GranolaStatus = { ok: false, label: "Sin conectar", detail: null, syncing: false };

export function granolaStatus(): GranolaStatus {
  const mode = getSettings().granola.mode;
  if (mode === "none") return { ok: false, label: "Sin conectar", detail: null, syncing: false };
  return status;
}

function setStatus(s: Partial<GranolaStatus>) {
  status = { ...status, ...s };
  emitChanged();
}

export async function granolaConnect(): Promise<string> {
  const client = await connectInteractive();
  const tools = await mcpTools(client);
  await client.close();
  updateSettings({ granola: { mode: "mcp" } });
  setStatus({ ok: true, label: "Conectado (MCP)", detail: `${tools.length} herramientas disponibles` });
  return `Granola conectado. Herramientas: ${tools.map((t) => t.name).join(", ")}`;
}

export async function granolaUseApiKey(key: string): Promise<string> {
  const k = key.trim();
  if (!/^grn_/.test(k)) throw new Error("La clave de Granola empieza con grn_.");
  const notes = await listNotes(k, new Date(Date.now() - 7 * 86400000).toISOString());
  setSecret("granola", k);
  updateSettings({ granola: { mode: "api" } });
  setStatus({ ok: true, label: "Conectado (API)", detail: `${notes.length} reuniones en los últimos 7 días` });
  return `Clave válida: ${notes.length} reuniones en los últimos 7 días.`;
}

export function granolaDisconnect(): void {
  forgetMcp();
  setSecret("granola", null);
  updateSettings({ granola: { mode: "none" } });
  setStatus({ ok: false, label: "Sin conectar", detail: null });
}

export async function granolaDiagnostics(): Promise<string> {
  const mode = getSettings().granola.mode;
  if (mode === "api") {
    const k = getSecret("granola");
    if (!k) return "Falta la clave de API.";
    const notes = await listNotes(k, new Date(Date.now() - 30 * 86400000).toISOString());
    return `API: ${notes.length} reuniones en los últimos 30 días.`;
  }
  if (mode === "mcp") {
    const client = await connectSilent();
    const tools = await mcpTools(client);
    const meetings = await mcpListMeetings(client);
    await client.close();
    return `MCP: herramientas ${tools.map((t) => t.name).join(", ")}. Reuniones encontradas: ${meetings.length}.`;
  }
  return "Granola no está conectado.";
}

let syncing: Promise<number> | null = null;

export function syncGranola(brain: Brain | null): Promise<number> {
  if (!brain) return Promise.resolve(0);
  if (!syncing) syncing = doSync(brain).finally(() => (syncing = null));
  return syncing;
}

async function doSync(brain: Brain): Promise<number> {
  const s = getSettings().granola;
  if (s.mode === "none") return 0;
  setStatus({ syncing: true });
  const known = new Set(getState().granolaSynced);
  const created: string[] = [];
  try {
    if (s.mode === "api") {
      const key = getSecret("granola");
      if (!key) throw new Error("Falta la clave de API de Granola.");
      // Incremental: desde la última sincronización (con 2 días de margen)
      const since = s.lastSync ? new Date(new Date(s.lastSync).getTime() - 2 * 86400000).toISOString() : null;
      for (const ref of await listNotes(key, since)) {
        if (known.has(ref.id) || brain.findByFrontmatter("granola_id", ref.id)) continue;
        const m = await getMeeting(key, ref);
        const rel = await writeMeeting(brain, m);
        mutateState((st) => st.granolaSynced.push(ref.id));
        if (rel) created.push(rel);
      }
    } else {
      const client = await connectSilent();
      try {
        for (const ref of await mcpListMeetings(client)) {
          if (known.has(ref.id) || brain.findByFrontmatter("granola_id", ref.id)) continue;
          const m = await mcpGetMeeting(client, ref);
          const rel = await writeMeeting(brain, m);
          mutateState((st) => st.granolaSynced.push(ref.id));
          if (rel) created.push(rel);
        }
      } finally {
        await client.close().catch(() => {});
      }
    }
    updateSettings({ granola: { lastSync: new Date().toISOString() } });
    mutateState((st) => (st.granolaCount = st.granolaSynced.length));
    setStatus({ ok: true, label: s.mode === "api" ? "Conectado (API)" : "Conectado (MCP)", detail: created.length ? `${created.length} reuniones nuevas` : "Al día", syncing: false });
  } catch (e) {
    log.warn("granola:", errorText(e));
    setStatus({ ok: false, label: "Error al sincronizar", detail: errorText(e), syncing: false });
    throw e;
  }
  // Post-proceso con IA (en segundo plano, una por una)
  for (const rel of created) {
    try {
      await postProcessMeeting(brain, rel);
    } catch (e) {
      log.warn("post-proceso:", errorText(e));
    }
  }
  return created.length;
}

/** Abre la app de Granola (si está instalada). */
export function openGranolaApp(): void {
  if (process.platform === "darwin") {
    execFile("open", ["-a", "Granola"], (err) => {
      if (err) void shell.openExternal("https://www.granola.ai/download");
    });
  } else {
    shell.openExternal("granola://").catch(() => shell.openExternal("https://www.granola.ai/download"));
  }
}
