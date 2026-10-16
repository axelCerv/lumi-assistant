/**
 * El modo activo de Lumi (Trabajo, Escuela, Personal…), calculado cada vez que
 * algo cambia: horario, calendario, clases o un cambio manual.
 *
 * Reglas de transición (plan §15.3):
 * - Nunca cambia solo a mitad de una sesión de estudio, una reunión en curso
 *   o un chat activo: espera a que terminen.
 * - Un cambio manual (o «Deshacer») sí cambia de inmediato.
 */
import {
  addDays,
  classOccurrences,
  describeMode,
  enabledModes,
  manualUntil,
  modeById,
  modeCategories,
  slugify,
  nextBoundary,
  resolveMode,
  startOfDay,
  type ActiveMode,
  type ManualDuration,
  type ModeEvent,
  type ModesConfig,
} from "@lumi/shared";
import { getSettings, updateSettings } from "../settings";
import { meetings } from "../calendar";
import { studySession } from "../school/study";
import { bus } from "../util";
import type { Brain } from "../vault/brain";

let brainRef: () => Brain | null = () => null;
let current: ActiveMode | null = null;
let lastChatAt = 0;
/** Para «Deshacer»: cómo estaba antes del último cambio. */
let undoInfo: { from: string; fijado: ModesConfig["fijado"] } | null = null;

export interface ModeChange {
  prev: ActiveMode;
  next: ActiveMode;
  manual: boolean;
}

export function attachBrain(get: () => Brain | null): void {
  brainRef = get;
}

/**
 * Si un pendiente usa una categoría nueva («Mascotas»), se suma a la lista del
 * modo para que aparezca la próxima vez. Las materias no cuentan (tienen su nota).
 */
export function rememberCategory(modeId: string | null | undefined, name: string | null | undefined): void {
  const clean = name?.trim();
  if (!modeId || !clean) return;
  const cfg = getSettings().modes;
  const mode = modeById(cfg, modeId);
  if (!mode) return;
  const list = modeCategories(mode);
  if (list.some((c) => slugify(c) === slugify(clean))) return;
  if (modeId === "escuela" && brainRef()?.subjects().some((x) => x.slug === slugify(clean))) return;
  const s = updateSettings({ modes: { ...cfg, lista: cfg.lista.map((m) => (m.id === modeId ? { ...m, categorias: [...list, clean] } : m)) } });
  brainRef()?.setModes(enabledModes(s.modes));
}

export function markChatActivity(): void {
  lastChatAt = Date.now();
}

/** Eventos que activan modos: calendarios asignados y clases de tus materias. */
export function modeEvents(now = new Date(), cfg: ModesConfig = getSettings().modes): ModeEvent[] {
  const ev: ModeEvent[] = [];
  for (const m of meetings()) {
    const mode = cfg.calendarios[m.calendar];
    if (!mode || m.allDay) continue;
    ev.push({ start: m.start, end: m.end, mode, label: m.title });
  }
  const brain = brainRef();
  const escuela = enabledModes(cfg).some((m) => m.id === "escuela");
  if (brain && escuela && cfg.clasesActivan) {
    const from = addDays(startOfDay(now), -1);
    for (const o of classOccurrences(brain.subjects(), from, addDays(from, 9), brain.cycle() ? { inicio: brain.cycle()!.start, fin: brain.cycle()!.end } : null)) {
      ev.push({ start: o.start, end: o.end, mode: "escuela", label: o.subject });
    }
  }
  return ev;
}

/** ¿Hay algo en curso que no conviene interrumpir? */
export function sessionActive(now = new Date()): boolean {
  if (studySession()) return true;
  if (now.getTime() - lastChatAt < 2 * 60_000) return true;
  return meetings().some((m) => !m.allDay && new Date(m.start) <= now && new Date(m.end) > now);
}

export function activeMode(): ActiveMode {
  return current ?? refreshMode();
}

/** Recalcula el modo. Avisa por el bus («mode-changed») si cambió. */
export function refreshMode(opts: { manual?: boolean } = {}): ActiveMode {
  const s = getSettings();
  const now = new Date();
  const cfg = s.modes;
  let r = resolveMode(now, cfg, modeEvents(now, cfg));
  let held = false;
  const stillEnabled = current && enabledModes(cfg).some((m) => m.id === current!.id);
  if (current && stillEnabled && !opts.manual && r.mode !== current.id && r.source !== "fijo" && r.source !== "manual" && sessionActive(now)) {
    r = { mode: current.id, source: current.source, until: current.until, label: current.label };
    held = true;
  }
  const text = held ? `${describeMode(r, cfg, now).replace(/\)$/, "")}; sigo aquí hasta que termines lo que estás haciendo)` : describeMode(r, cfg, now);
  const next: ActiveMode = { id: r.mode, source: r.source, until: r.until, label: r.label, held, text };
  const prev = current;
  current = next;
  if (prev && prev.id !== next.id) {
    if (!opts.manual) undoInfo = { from: prev.id, fijado: cfg.fijado };
    bus.emit("mode-changed", { prev, next, manual: !!opts.manual } satisfies ModeChange);
  }
  return next;
}

/** Cambio manual. `null` o "automatico" regresa al horario. */
export function setMode(id: string | null, duration: ManualDuration | "automatico"): ActiveMode {
  const s = getSettings();
  const now = new Date();
  undoInfo = { from: current?.id ?? s.modes.porDefecto, fijado: s.modes.fijado };
  if (!id || duration === "automatico" || !modeById(s.modes, id)) {
    updateSettings({ modes: { fijado: null } });
  } else {
    updateSettings({ modes: { fijado: { modo: id, hasta: manualUntil(duration, now, s.modes, modeEvents(now)) } } });
  }
  return refreshMode({ manual: true });
}

/** Deshace el último cambio de modo (manual o automático). */
export function undoMode(): ActiveMode {
  const u = undoInfo;
  if (!u) return activeMode();
  const s = getSettings();
  const now = new Date();
  undoInfo = null;
  if (u.fijado !== s.modes.fijado) updateSettings({ modes: { fijado: u.fijado } });
  // Si sigue tocando otro modo, se queda en el anterior hasta el siguiente bloque
  if (resolveMode(now, getSettings().modes, modeEvents(now)).mode !== u.from) {
    const until = nextBoundary(now, s.modes, modeEvents(now));
    updateSettings({ modes: { fijado: { modo: u.from, hasta: (until ?? addDays(startOfDay(now), 1)).toISOString() } } });
  }
  return refreshMode({ manual: true });
}

export function canUndoMode(): boolean {
  return !!undoInfo;
}
