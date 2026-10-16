/**
 * Calendarios: Lumi lee la "dirección secreta en formato iCal" de Google Calendar
 * o el enlace ICS publicado de Outlook. No necesita contraseñas ni permisos extra.
 */
import { invoke } from "@tauri-apps/api/core";
import ICAL from "ical.js";
import type { CalendarSource, CalendarStatus, Meeting, MeetingsCache } from "./types";

const DAYS_AHEAD = 7;
const MAX_OCCURRENCES = 5000;

const LINK_RE =
  /https?:\/\/(?:[\w-]+\.)?(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|meet\.jit\.si)\/[^\s"<>)\]]+/i;

function findLink(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(LINK_RE);
    if (m) return m[0];
  }
  return null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function parseIcs(text: string, source: CalendarSource, from: Date, to: Date): Meeting[] {
  const comp = new ICAL.Component(ICAL.parse(text));
  for (const tz of comp.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* zona horaria repetida o rara: se ignora */
    }
  }

  const masters = new Map<string, InstanceType<typeof ICAL.Event>>();
  const exceptions: InstanceType<typeof ICAL.Event>[] = [];
  const singles: InstanceType<typeof ICAL.Event>[] = [];
  for (const ve of comp.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(ve);
    const status = str(ve.getFirstPropertyValue("status"));
    if (status && status.toUpperCase() === "CANCELLED") continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else if (ev.isRecurring()) masters.set(ev.uid, ev);
    else singles.push(ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else singles.push(ex);
  }

  const out: Meeting[] = [];
  const push = (ev: InstanceType<typeof ICAL.Event>, start: InstanceType<typeof ICAL.Time>, end: InstanceType<typeof ICAL.Time>) => {
    const s = start.toJSDate();
    const e = end ? end.toJSDate() : new Date(s.getTime() + 30 * 60000);
    if (e <= from || s >= to) return;
    const description = str(ev.description);
    const location = str(ev.location);
    const url = str(ev.component.getFirstPropertyValue("url"));
    out.push({
      id: `${source.id}:${ev.uid}:${s.getTime()}`,
      title: str(ev.summary) ?? "(Sin título)",
      start: s.toISOString(),
      end: e.toISOString(),
      allDay: start.isDate,
      location,
      link: findLink(location, url, description),
      calendar: source.name,
    });
  };

  for (const ev of singles) {
    if (!ev.startDate) continue;
    push(ev, ev.startDate, ev.endDate);
  }
  for (const ev of masters.values()) {
    if (!ev.startDate) continue;
    const it = ev.iterator();
    let next: InstanceType<typeof ICAL.Time> | null;
    let n = 0;
    while ((next = it.next()) && n++ < MAX_OCCURRENCES) {
      if (next.toJSDate() > to) break;
      const occ = ev.getOccurrenceDetails(next);
      if (occ.endDate.toJSDate() <= from) continue;
      push(occ.item, occ.startDate, occ.endDate);
    }
  }
  return out;
}

export async function loadCalendars(sources: CalendarSource[], now = new Date()): Promise<MeetingsCache> {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from.getTime() + DAYS_AHEAD * 86400000);
  const meetings: Meeting[] = [];
  const status: CalendarStatus[] = [];
  for (const src of sources.filter((s) => s.enabled && s.url.trim())) {
    try {
      const text = await invoke<string>("fetch_text", { url: src.url });
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("El enlace no es un calendario iCal (.ics)");
      const list = parseIcs(text, src, from, to);
      meetings.push(...list);
      status.push({ id: src.id, name: src.name, ok: true, error: null, count: list.length });
    } catch (e) {
      status.push({ id: src.id, name: src.name, ok: false, error: String(e instanceof Error ? e.message : e), count: 0 });
    }
  }
  meetings.sort((a, b) => a.start.localeCompare(b.start));
  return { meetings, status, updatedAt: new Date().toISOString() };
}

export const CALENDAR_HELP: Record<string, string> = {
  google:
    "Google Calendar (en la web) → ⚙ Configuración → elige tu calendario a la izquierda → «Integrar el calendario» → copia la «Dirección secreta en formato iCal».",
  outlook:
    "Outlook en la web → ⚙ Configuración → Calendario → Calendarios compartidos → «Publicar un calendario» → elige tu calendario y «Puede ver todos los detalles» → Publicar → copia el enlace ICS.",
  otro: "Pega cualquier enlace .ics o webcal:// (Apple iCloud, Proton, Fastmail…).",
};
