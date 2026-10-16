/**
 * Detección de hábitos: a partir de pendientes completados (con hora, cuando
 * Lumi lo sabe) y notas diarias, propone rutinas. El usuario decide.
 */
import { cap, DAY_NAMES, pad, stripAccents, type RoutineSuggestion } from "@lumi/shared";
import type { Brain } from "../vault/brain";
import { getState } from "../state";
import { getSettings } from "../settings";

const STOP = new Set(["a", "al", "el", "la", "los", "las", "de", "del", "y", "en", "con", "para", "por", "un", "una", "que", "mi", "mis", "su", "sus", "lo"]);

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
  return `${y}-${Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)}`;
}

function typicalTime(dates: Date[]): string {
  const mins = dates.map((d) => d.getHours() * 60 + d.getMinutes()).sort((a, b) => a - b);
  const mid = mins[Math.floor(mins.length / 2)] ?? 540;
  const r = Math.round(mid / 30) * 30;
  return `${pad(Math.floor(r / 60) % 24)}:${pad(r % 60)}`;
}

export function suggestRoutines(brain: Brain | null, now = new Date()): RoutineSuggestion[] {
  const since = now.getTime() - 70 * 86400000;
  type Hit = { date: Date; text: string };
  const groups = new Map<string, Hit[]>();
  const add = (text: string, date: Date) => {
    if (date.getTime() < since || date > now) return;
    const key = topicKey(text);
    if (!key) return;
    const l = groups.get(key) ?? [];
    l.push({ date, text });
    groups.set(key, l);
  };

  // Completados con hora (registrados por Lumi)
  const logged = new Set<string>();
  for (const c of getState().completions) {
    add(c.text, new Date(c.at));
    logged.add(`${topicKey(c.text)}|${c.at.slice(0, 10)}`);
  }
  // Completados en Obsidian (solo fecha ✅): se asume la hora por defecto
  for (const t of brain?.tasks({ includeDone: true }) ?? []) {
    if (!t.done || !t.doneDate || logged.has(`${topicKey(t.text)}|${t.doneDate}`)) continue;
    const [y, m, d] = t.doneDate.split("-").map(Number);
    const [h, mi] = (t.time ?? getSettings().defaultReminderTime).split(":").map(Number);
    add(t.text, new Date(y, m - 1, d, h, mi));
  }

  const existing = new Set((brain?.routines() ?? []).map((r) => topicKey(r.title)));
  const dismissed = new Set(getSettings().dismissedSuggestions);
  const out: RoutineSuggestion[] = [];
  for (const [key, hits] of groups) {
    if (existing.has(key)) continue;
    const byDay = new Map<number, Hit[]>();
    for (const h of hits) byDay.set(h.date.getDay(), [...(byDay.get(h.date.getDay()) ?? []), h]);
    for (const [day, list] of byDay) {
      const weeks = new Set(list.map((h) => isoWeek(h.date)));
      const sk = `${key}|${day}`;
      if (weeks.size < 3 || dismissed.has(sk)) continue;
      out.push({ key: sk, title: cap(list[list.length - 1].text), days: [day], time: typicalTime(list.map((h) => h.date)), reason: `Visto ${weeks.size} ${DAY_NAMES[day]}${day === 0 || day === 6 ? "s" : ""}` });
    }
    const workdays = new Set(hits.filter((h) => h.date.getDay() >= 1 && h.date.getDay() <= 5).map((h) => h.date.toDateString()));
    const distinct = new Set(hits.map((h) => h.date.getDay()));
    const sk = `${key}|habiles`;
    if (workdays.size >= 6 && distinct.size >= 4 && !dismissed.has(sk) && !out.some((s) => s.key.startsWith(`${key}|`))) {
      out.push({ key: sk, title: cap(hits[hits.length - 1].text), days: [1, 2, 3, 4, 5], time: typicalTime(hits.map((h) => h.date)), reason: `Lo hiciste ${workdays.size} días hábiles recientes` });
    }
  }
  return out.slice(0, 5);
}

export function suggestionText(s: RoutineSuggestion): string {
  const when = s.days.length === 5 ? "cada día hábil" : `cada ${DAY_NAMES[s.days[0]]}`;
  return `Noté que ${when} sueles «${s.title.toLowerCase()}». ¿Te lo recuerdo como rutina a las ${s.time}?`;
}
