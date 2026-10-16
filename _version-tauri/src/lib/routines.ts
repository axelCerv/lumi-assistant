/**
 * Detección de rutinas: Lumi revisa qué haces seguido (lo que anotas y completas)
 * y, cuando algo se repite el mismo día de la semana 3 semanas o más,
 * te propone convertirlo en rutina. Nunca la activa sin preguntarte.
 */
import type { LumiData, Routine } from "./types";
import { DAY_NAMES, cap, pad } from "./time";
import { stripAccents } from "./parse";

export interface RoutineSuggestion {
  key: string;
  title: string;
  days: number[];
  time: string;
  reason: string;
}

const STOP = new Set([
  "a", "al", "el", "la", "los", "las", "de", "del", "y", "en", "con", "para", "por", "un", "una", "que", "mi", "mis", "su", "sus", "lo",
]);

/** Las primeras palabras con significado: "Mandar el reporte semanal a Ana" → "mandar reporte semanal" */
export function topicKey(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .slice(0, 3)
    .join(" ");
}

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-${w}`;
}

function alreadyRoutine(routines: Routine[], key: string): boolean {
  return routines.some((r) => topicKey(r.title) === key);
}

export function suggestRoutines(data: LumiData, now = new Date()): RoutineSuggestion[] {
  const since = now.getTime() - 70 * 86400000; // últimas 10 semanas
  type Hit = { date: Date; text: string };
  const groups = new Map<string, Hit[]>();

  for (const t of data.tasks) {
    const stamp = t.doneAt ?? t.remindAt ?? t.createdAt;
    if (!stamp) continue;
    const date = new Date(stamp);
    if (date.getTime() < since || date > now) continue;
    const key = topicKey(t.text);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({ date, text: t.text });
    groups.set(key, list);
  }

  const out: RoutineSuggestion[] = [];
  for (const [key, hits] of groups) {
    if (alreadyRoutine(data.routines, key)) continue;

    // ¿Mismo día de la semana en 3+ semanas distintas?
    const byDay = new Map<number, Hit[]>();
    for (const h of hits) {
      const l = byDay.get(h.date.getDay()) ?? [];
      l.push(h);
      byDay.set(h.date.getDay(), l);
    }
    for (const [day, list] of byDay) {
      const weeks = new Set(list.map((h) => isoWeek(h.date)));
      if (weeks.size < 3) continue;
      const sk = `${key}|${day}`;
      if (data.settings.dismissedSuggestions.includes(sk)) continue;
      out.push({
        key: sk,
        title: cap(list[list.length - 1].text),
        days: [day],
        time: typicalTime(list.map((h) => h.date)),
        reason: `Visto ${weeks.size} ${DAY_NAMES[day]}${day === 6 || day === 0 ? "s" : ""} seguidos`,
      });
    }

    // ¿Casi todos los días hábiles?
    const workdays = new Set(hits.filter((h) => h.date.getDay() >= 1 && h.date.getDay() <= 5).map((h) => h.date.toDateString()));
    const distinctDays = new Set(hits.map((h) => h.date.getDay()));
    if (workdays.size >= 6 && distinctDays.size >= 4) {
      const sk = `${key}|habiles`;
      if (!data.settings.dismissedSuggestions.includes(sk) && !out.some((s) => s.key.startsWith(`${key}|`))) {
        out.push({
          key: sk,
          title: cap(hits[hits.length - 1].text),
          days: [1, 2, 3, 4, 5],
          time: typicalTime(hits.map((h) => h.date)),
          reason: `Lo hiciste ${workdays.size} días hábiles recientes`,
        });
      }
    }
  }
  return out.slice(0, 5);
}

/** Hora típica (mediana) redondeada a media hora. */
function typicalTime(dates: Date[]): string {
  const mins = dates.map((d) => d.getHours() * 60 + d.getMinutes()).sort((a, b) => a - b);
  const mid = mins[Math.floor(mins.length / 2)] ?? 540;
  const r = Math.round(mid / 30) * 30;
  return `${pad(Math.floor(r / 60) % 24)}:${pad(r % 60)}`;
}

export function suggestionText(s: RoutineSuggestion): string {
  const when = s.days.length === 5 ? "cada día hábil" : `cada ${DAY_NAMES[s.days[0]]}`;
  return `Noté que ${when} sueles «${s.title.toLowerCase()}». ¿Te lo recuerdo como rutina a las ${s.time}?`;
}
