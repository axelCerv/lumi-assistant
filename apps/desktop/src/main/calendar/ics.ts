/**
 * Calendarios por enlace iCal privado (Google, Outlook, iCloud…). Sirve sin
 * configurar OAuth y como respaldo. Incluye eventos que se repiten.
 */
import ICAL from "ical.js";
import type { Meeting } from "@lumi/shared";
import type { IcsSource } from "@lumi/shared";
import { findMeetingLink } from "./providers";

const MAX_OCCURRENCES = 5000;

const str = (v: unknown) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
};

export function parseIcs(text: string, source: IcsSource, from: Date, to: Date): Meeting[] {
  const comp = new ICAL.Component(ICAL.parse(text));
  for (const tz of comp.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* zona repetida */
    }
  }
  type Ev = InstanceType<typeof ICAL.Event>;
  type T = InstanceType<typeof ICAL.Time>;
  const masters = new Map<string, Ev>();
  const exceptions: Ev[] = [];
  const singles: Ev[] = [];
  for (const ve of comp.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(ve);
    const status = str(ve.getFirstPropertyValue("status"));
    if (status?.toUpperCase() === "CANCELLED") continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else if (ev.isRecurring()) masters.set(ev.uid, ev);
    else singles.push(ev);
  }
  for (const ex of exceptions) {
    const m = masters.get(ex.uid);
    if (m) m.relateException(ex);
    else singles.push(ex);
  }

  const out: Meeting[] = [];
  const push = (ev: Ev, start: T, end: T | null) => {
    const s = start.toJSDate();
    const e = end ? end.toJSDate() : new Date(s.getTime() + 30 * 60000);
    if (e <= from || s >= to) return;
    const attendees = ev.attendees
      .map((a) => str(a.getParameter("cn")) ?? str(a.getFirstValue())?.replace(/^mailto:/i, "") ?? "")
      .filter(Boolean) as string[];
    out.push({
      id: `ics:${source.id}:${ev.uid}:${s.getTime()}`,
      title: str(ev.summary) ?? "(Sin título)",
      start: s.toISOString(),
      end: e.toISOString(),
      allDay: start.isDate,
      location: str(ev.location),
      link: findMeetingLink(str(ev.location), str(ev.component.getFirstPropertyValue("url")), str(ev.description)),
      calendar: source.name,
      source: "ics",
      attendees,
      categories: ev.component
        .getAllProperties("categories")
        .flatMap((p) => p.getValues().map((v) => String(v).trim()))
        .filter(Boolean),
      description: str(ev.description),
    });
  };
  for (const ev of singles) if (ev.startDate) push(ev, ev.startDate, ev.endDate);
  for (const ev of masters.values()) {
    if (!ev.startDate) continue;
    const it = ev.iterator();
    let next: T | null;
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

export async function fetchIcs(url: string): Promise<string> {
  let u = url.trim();
  if (u.startsWith("webcal://")) u = `https://${u.slice(9)}`;
  if (!/^https?:\/\//.test(u)) throw new Error("El enlace debe empezar con https:// o webcal://");
  const res = await fetch(u, { headers: { "User-Agent": "Lumi" } });
  if (!res.ok) throw new Error(`El calendario respondió ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("El enlace no es un calendario iCal (.ics)");
  return text;
}
