/** Estado central de la app: el vault abierto y la "foto" que se envía a la interfaz. */
import { app } from "electron";
import { enabledModes, type AppSnapshot } from "@lumi/shared";
import { Brain } from "./vault/brain";
import { BrainEmbedder } from "./index/embeddings";
import { getSettings } from "./settings";
import { hasSecret } from "./secrets";
import { getState } from "./state";
import { calendarState } from "./calendar";
import { granolaStatus } from "./granola/sync";
import { googleCredentials, microsoftClientId } from "./calendar/providers";
import { bubbleBusy, send } from "./windows";
import { bus, debounce, errorText, log } from "./util";
import { updateInfo } from "./updater";
import { activeMode, attachBrain, refreshMode } from "./modes";
import { schoolSnapshot } from "./school";
import { personalSnapshot } from "./personal";
import { ensureModeStructure } from "./vault/structure";

export const embedder = new BrainEmbedder();
let brain: Brain | null = null;
let opening: Promise<void> | null = null;

export function getBrain(): Brain | null {
  return brain;
}

export async function openVault(root: string): Promise<void> {
  const run = async () => {
    if (brain?.vault.root === root) return;
    await brain?.close().catch(() => {});
    brain = new Brain(root, app.getPath("userData"), embedder, () => scheduleSnapshot());
    brain.setDefaultReminderTime(getSettings().defaultReminderTime);
    brain.setModes(enabledModes(getSettings().modes));
    scheduleSnapshot();
    try {
      await ensureModeStructure(root, enabledModes(getSettings().modes));
      await brain.start();
    } catch (e) {
      log.error("No pude abrir el vault:", errorText(e));
    }
    refreshMode();
  };
  opening = run().finally(() => (opening = null));
  return opening;
}

export async function ready(): Promise<void> {
  if (opening) await opening;
}

/** Los modos cambiaron en Ajustes: el cerebro y el modo activo se ponen al día. */
export async function modesChanged(): Promise<void> {
  const modes = enabledModes(getSettings().modes);
  brain?.setModes(modes);
  if (brain) await ensureModeStructure(brain.vault.root, modes).catch((e) => log.warn("modos:", errorText(e)));
  refreshMode();
  scheduleSnapshot();
}

attachBrain(() => brain);

export function snapshot(): AppSnapshot {
  const s = getSettings();
  const cal = calendarState();
  const g = granolaStatus();
  const st = getState();
  const stats = brain?.indexer.stats() ?? { notes: 0, chunks: 0, embedded: 0 };
  return {
    settings: s,
    vaultName: brain?.vault.name ?? null,
    keys: { claude: hasSecret("claude"), gemini: hasSecret("gemini"), granola: hasSecret("granola") || hasSecret("granola-mcp") },
    tasks: brain?.tasks() ?? [],
    meetings: cal.meetings,
    routines: brain?.routines() ?? [],
    entities: brain?.entities() ?? [],
    proposals: st.pendingFacts,
    index: {
      ...stats,
      indexing: brain?.status.indexing ?? false,
      progress: brain?.status.progress ?? 0,
      semantic: s.ai.semanticSearch ? (brain?.idx.vec === false ? "error" : embedder.state) : "apagada",
      semanticDetail: brain?.idx.vec === false ? brain.idx.vecError : embedder.detail,
    },
    calendars: { google: cal.google, microsoft: cal.microsoft, ics: cal.ics, updatedAt: cal.updatedAt },
    granola: { ok: g.ok, label: g.syncing ? "Sincronizando…" : g.label, detail: g.detail, lastSync: s.granola.lastSync, count: st.granolaCount },
    oauthConfigured: { google: !!googleCredentials(), microsoft: !!microsoftClientId() },
    update: updateInfo(),
    bubbleOpen: bubbleBusy(),
    appVersion: app.getVersion(),
    mode: activeMode(),
    school: schoolSnapshot(brain),
    personal: personalSnapshot(brain),
  };
}

export const scheduleSnapshot = debounce(() => {
  try {
    const snap = snapshot();
    send("avatar", "snapshot", snap);
    send("panel", "snapshot", snap);
  } catch (e) {
    log.warn("snapshot:", errorText(e));
  }
}, 150);

bus.on("changed", () => scheduleSnapshot());
