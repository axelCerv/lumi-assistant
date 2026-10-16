/** Junta las reuniones de todos los calendarios conectados (próximos 7 días). */
import type { Meeting, ServiceStatus } from "@lumi/shared";
import { getSettings } from "../settings";
import { googleEvents, microsoftEvents } from "./providers";
import { fetchIcs, parseIcs } from "./ics";
import { emitChanged, errorText } from "../util";

const DAYS_AHEAD = 7;
/** Las entregas de la escuela se leen con más anticipación. */
const DEADLINE_DAYS = 60;

export interface CalendarState {
  meetings: Meeting[];
  /** Eventos de calendarios de «entregas» (Moodle, Canvas…): se vuelven pendientes. */
  deadlines: Meeting[];
  google: ServiceStatus;
  microsoft: ServiceStatus;
  ics: (ServiceStatus & { id: string })[];
  updatedAt: string | null;
}

let state: CalendarState = {
  meetings: [],
  deadlines: [],
  google: { ok: false, label: "Sin conectar" },
  microsoft: { ok: false, label: "Sin conectar" },
  ics: [],
  updatedAt: null,
};
let running: Promise<void> | null = null;

export function calendarState(): CalendarState {
  return state;
}

export function meetings(): Meeting[] {
  return state.meetings;
}

export function deadlines(): Meeting[] {
  return state.deadlines;
}

/** Nombres de todos los calendarios conocidos (para asignarlos a un modo). */
export function calendarNames(): string[] {
  const s = getSettings().calendars;
  const names = new Set<string>(state.meetings.map((m) => m.calendar));
  for (const x of s.ics) if (x.kind !== "entregas") names.add(x.name);
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function refreshCalendars(): Promise<void> {
  if (!running) running = doRefresh().finally(() => (running = null));
  return running;
}

async function doRefresh(): Promise<void> {
  const s = getSettings().calendars;
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from.getTime() + DAYS_AHEAD * 86400000);
  const all: Meeting[] = [];
  const due: Meeting[] = [];
  const next: CalendarState = { ...state, ics: [] };

  if (s.google.connected) {
    try {
      const list = await googleEvents(from, to);
      all.push(...list);
      next.google = { ok: true, label: s.google.email ? `Conectado · ${s.google.email}` : "Conectado", detail: `${list.length} eventos esta semana` };
    } catch (e) {
      next.google = { ok: false, label: "Error", detail: errorText(e) };
    }
  } else next.google = { ok: false, label: "Sin conectar" };

  if (s.microsoft.connected) {
    try {
      const list = await microsoftEvents(from, to);
      all.push(...list);
      next.microsoft = { ok: true, label: s.microsoft.email ? `Conectado · ${s.microsoft.email}` : "Conectado", detail: `${list.length} eventos esta semana` };
    } catch (e) {
      next.microsoft = { ok: false, label: "Error", detail: errorText(e) };
    }
  } else next.microsoft = { ok: false, label: "Sin conectar" };

  for (const src of s.ics.filter((x) => x.enabled)) {
    try {
      if (src.kind === "entregas") {
        const list = parseIcs(await fetchIcs(src.url), src, from, new Date(from.getTime() + DEADLINE_DAYS * 86400000));
        due.push(...list);
        next.ics.push({ id: src.id, ok: true, label: src.name, detail: `${list.length} entregas en los próximos ${DEADLINE_DAYS} días` });
        continue;
      }
      const list = parseIcs(await fetchIcs(src.url), src, from, to);
      all.push(...list);
      next.ics.push({ id: src.id, ok: true, label: src.name, detail: `${list.length} eventos esta semana` });
    } catch (e) {
      next.ics.push({ id: src.id, ok: false, label: src.name, detail: errorText(e) });
    }
  }

  // Quita duplicados (el mismo evento en dos fuentes)
  const seen = new Set<string>();
  next.meetings = all
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((m) => {
      const k = `${m.title.toLowerCase()}|${m.start}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  next.deadlines = due.sort((a, b) => a.start.localeCompare(b.start));
  next.updatedAt = new Date().toISOString();
  state = next;
  emitChanged("calendar-changed");
  emitChanged();
}
