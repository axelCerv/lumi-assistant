/**
 * Modo Escuela: horario de clases, plan inverso anti-procrastinación,
 * semana cargada y repaso espaciado (tarjetas «Pregunta::Respuesta»).
 * Todo es local y funciona sin IA.
 */
import { addDays, dayKey, pad, startOfDay } from "./time.ts";
import { stripAccents } from "./slug.ts";

/* ------------------------------- Horario ------------------------------- */

export interface ClassSlot {
  /** 0 = domingo … 6 = sábado */
  day: number;
  start: string;
  end: string;
  room: string | null;
}

const DAY_TOKENS: Record<string, number> = {
  domingo: 0, dom: 0, do: 0, d: 0,
  lunes: 1, lun: 1, lu: 1, l: 1,
  martes: 2, mar: 2, ma: 2, m: 2,
  miercoles: 3, mie: 3, mi: 3, x: 3,
  jueves: 4, jue: 4, ju: 4, j: 4,
  viernes: 5, vie: 5, vi: 5, v: 5,
  sabado: 6, sab: 6, sa: 6, s: 6,
};
const SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function dayToken(w: string): number | null {
  const k = stripAccents(w).toLowerCase().replace(/\.$/, "");
  return k in DAY_TOKENS ? DAY_TOKENS[k] : null;
}

function hhmm(h: string, m?: string): string | null {
  const H = parseInt(h, 10);
  const M = m ? parseInt(m, 10) : 0;
  if (isNaN(H) || H > 23 || M > 59) return null;
  return `${pad(H)}:${pad(M)}`;
}

/**
 * Lee un horario: «lun mie 9:00-10:30 A-204», «lun-vie 7-8:30», «martes 16:00 a 18:00».
 * Devuelve una franja por día.
 */
export function parseClassSlot(text: string): ClassSlot[] {
  const src = text.trim();
  const tm = /(\d{1,2})(?::(\d{2}))?\s*(?:-|–|a)\s*(\d{1,2})(?::(\d{2}))?/.exec(src);
  if (!tm) return [];
  const start = hhmm(tm[1], tm[2]);
  const end = hhmm(tm[3], tm[4]);
  if (!start || !end) return [];
  const before = src.slice(0, tm.index);
  const after = src.slice(tm.index + tm[0].length).trim().replace(/^[·,;\s]+/, "");
  const days = new Set<number>();
  // Rangos «lun-vie» o «lunes a viernes»
  for (const range of before.matchAll(/(?:^|\s)([a-záéíóú]+)\.?\s*(?:-|–|\s+a\s+)\s*([a-záéíóú]+)/gi)) {
    const a = dayToken(range[1]);
    const b = dayToken(range[2]);
    if (a !== null && b !== null) {
      for (let d = a; ; d = (d + 1) % 7) {
        days.add(d);
        if (d === b) break;
      }
    }
  }
  for (const w of before.split(/[\s,;/-]+|\s+[ya]\s+/)) {
    const d = dayToken(w);
    if (d !== null) days.add(d);
  }
  if (!days.size) return [];
  return [...days].sort().map((day) => ({ day, start, end, room: after || null }));
}

/** Varias franjas, como vienen en el encabezado de la materia (lista o texto). */
export function parseSchedule(v: unknown): ClassSlot[] {
  const items = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n|;/) : [];
  return items.flatMap((x) => (typeof x === "string" ? parseClassSlot(x) : []));
}

export function formatClassSlot(s: ClassSlot): string {
  return `${SHORT[s.day]} ${s.start}-${s.end}${s.room ? ` ${s.room}` : ""}`;
}

/** «Cálculo I · lun mie 9:00-10:30 A-204» (una materia por línea, en el onboarding). */
export function parseSubjectLine(line: string): { name: string; slots: ClassSlot[] } | null {
  const t = line.trim().replace(/^[-*•]\s*/, "");
  if (!t) return null;
  const [name, ...rest] = t.split(/\s*[·|:]\s*/);
  const slots = rest.length ? parseClassSlot(rest.join(" ")) : [];
  if (!name.trim()) return null;
  return { name: name.trim(), slots };
}

export interface ClassOccurrence {
  subject: string;
  path: string;
  start: string;
  end: string;
  room: string | null;
}

/** Clases concretas entre dos fechas (respetando el inicio y fin del ciclo si se conocen). */
export function classOccurrences(
  subjects: { name: string; path: string; slots: ClassSlot[] }[],
  from: Date,
  to: Date,
  cycle?: { inicio?: string | null; fin?: string | null } | null,
): ClassOccurrence[] {
  const out: ClassOccurrence[] = [];
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    const key = dayKey(d);
    if (cycle?.inicio && key < cycle.inicio) continue;
    if (cycle?.fin && key > cycle.fin) continue;
    for (const s of subjects) {
      for (const slot of s.slots) {
        if (slot.day !== d.getDay()) continue;
        const [sh, sm] = slot.start.split(":").map(Number);
        const [eh, em] = slot.end.split(":").map(Number);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm);
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em);
        if (end <= from || start >= to) continue;
        out.push({ subject: s.name, path: s.path, start: start.toISOString(), end: end.toISOString(), room: slot.room });
      }
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/* --------------------------- Plan inverso --------------------------- */

export interface PlanStep {
  title: string;
  /** AAAA-MM-DD */
  date: string;
}

const EXAM_RE = /\b(examen|parcial|final|quiz|prueba|evaluaci[oó]n)\b/i;

export function isExam(title: string): boolean {
  return EXAM_RE.test(stripAccents(title));
}

/**
 * Parte una entrega (o un examen) en pasos con fechas intermedias, empezando
 * por un primer paso de 5 minutos hoy. La investigación sobre procrastinación
 * recomienda justo esto: tareas pequeñas y fechas más frecuentes.
 */
export function reversePlan(title: string, due: string, today: Date = new Date()): PlanStep[] {
  const t0 = startOfDay(today);
  const [y, m, d] = due.split("-").map(Number);
  const end = new Date(y, m - 1, d);
  const span = Math.max(0, Math.round((end.getTime() - t0.getTime()) / 86400000));
  const name = title.trim();
  const exam = isExam(name);
  const steps: [string, number][] = exam
    ? [
        [`Primer paso (5 min): hacer la lista de temas de «${name}»`, 0],
        [`Repasar los temas de «${name}» con tarjetas`, 0.3],
        [`Resolver ejercicios o un examen de práctica de «${name}»`, 0.6],
        [`Repaso final ligero de «${name}» y dormir bien`, -1],
        [`Presentar «${name}»`, 1],
      ]
    : [
        [`Primer paso (5 min): abrir el archivo y anotar 3 ideas para «${name}»`, 0],
        [`Juntar material e investigar para «${name}»`, 0.3],
        [`Hacer el borrador de «${name}»`, 0.6],
        [`Revisar y corregir «${name}»`, -1],
        [`Entregar «${name}»`, 1],
      ];
  // Solo el último paso cae el día de la entrega; los demás, antes. Nunca retroceden.
  let prev = 0;
  return steps.map(([stepTitle, pos]) => {
    const before = Math.max(0, span - 1);
    const raw = pos === 1 ? span : pos === -1 ? before : Math.min(before, Math.floor(pos * span));
    prev = Math.max(prev, raw);
    return { title: stepTitle, date: dayKey(addDays(t0, prev)) };
  });
}

/* --------------------------- Semana cargada --------------------------- */

export interface LoadItem {
  date: string;
  title: string;
}

export interface WeekLoad {
  heavy: boolean;
  total: number;
  days: { date: string; count: number; exams: number }[];
  /** Día más cargado (si lo hay). */
  peak: { date: string; count: number; exams: number } | null;
}

/** ¿Viene una semana pesada? Un día con 3+ entregas (o 2 y un examen) o 6+ en la semana. */
export function weekLoad(items: LoadItem[], now = new Date(), days = 7): WeekLoad {
  const from = dayKey(now);
  const to = dayKey(addDays(startOfDay(now), days - 1));
  const by = new Map<string, { count: number; exams: number }>();
  let total = 0;
  for (const it of items) {
    if (it.date < from || it.date > to) continue;
    const cur = by.get(it.date) ?? { count: 0, exams: 0 };
    cur.count++;
    if (isExam(it.title)) cur.exams++;
    by.set(it.date, cur);
    total++;
  }
  const list = [...by.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  const peak = [...list].sort((a, b) => b.count + b.exams - (a.count + a.exams))[0] ?? null;
  const heavyDay = list.some((x) => x.count >= 3 || (x.count >= 2 && x.exams >= 1));
  return { heavy: heavyDay || total >= 6, total, days: list, peak };
}

export function weekLoadText(w: WeekLoad, now = new Date()): string | null {
  if (!w.heavy || !w.peak) return null;
  const [y, m, d] = w.peak.date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const diff = Math.round((startOfDay(day).getTime() - startOfDay(now).getTime()) / 86400000);
  const when = diff === 0 ? "hoy" : diff === 1 ? "mañana" : `el ${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][day.getDay()]}`;
  const entregas = w.peak.count - w.peak.exams;
  const parts: string[] = [];
  if (entregas) parts.push(entregas === 1 ? "1 entrega" : `${entregas} entregas`);
  if (w.peak.exams) parts.push(w.peak.exams === 1 ? "un examen" : `${w.peak.exams} exámenes`);
  return `Se viene una semana cargada: ${when} tienes ${parts.join(" y ")}${w.total > w.peak.count ? ` (${w.total} en total esta semana)` : ""}. ¿Lo repartimos en pasos pequeños?`;
}

/* --------------------------- Tarjetas de repaso --------------------------- */

export interface Card {
  id: string;
  question: string;
  answer: string;
  line: number;
}

/** Hash corto y estable (FNV-1a) para identificar una tarjeta. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Tarjetas en el formato del plugin Spaced Repetition de Obsidian:
 * una por línea, «Pregunta::Respuesta». Se ignoran bloques de código y pendientes.
 */
export function parseCards(text: string, path = ""): Card[] {
  const out: Card[] = [];
  let code = false;
  text.split(/\r?\n/).forEach((raw, line) => {
    if (/^\s*```/.test(raw)) code = !code;
    if (code) return;
    const l = raw.replace(/^\s*[-*+]\s+(?!\[)/, "").trim();
    if (/^[-*+] \[/.test(l) || l.startsWith("#")) return;
    const m = /^(.+?)\s*:::?\s*(.+)$/.exec(l);
    if (!m || /^https?$/i.test(m[1])) return;
    const question = m[1].trim();
    const answer = m[2].trim();
    if (question.length < 2 || !answer) return;
    out.push({ id: shortHash(`${path}\u0000${question}`), question, answer, line });
  });
  return out;
}

export function formatCard(question: string, answer: string): string {
  return `${question.replace(/::/g, ":").trim()}::${answer.replace(/\n+/g, " ").trim()}`;
}

/** Estado de repaso de una tarjeta (se guarda en los datos de la app, no en tus notas). */
export interface CardState {
  due: string;
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
}

/** 0 = otra vez · 1 = difícil · 2 = bien · 3 = fácil */
export type Grade = 0 | 1 | 2 | 3;

export const GRADE_LABELS: Record<Grade, string> = { 0: "Otra vez", 1: "Difícil", 2: "Bien", 3: "Fácil" };

/** Repaso espaciado (variante sencilla de SM-2). */
export function reviewCard(prev: CardState | undefined, grade: Grade, today: Date = new Date()): CardState {
  const s: CardState = prev ? { ...prev } : { due: dayKey(today), interval: 0, ease: 2.5, reps: 0, lapses: 0 };
  if (grade === 0) {
    s.lapses += prev ? 1 : 0;
    s.reps = 0;
    s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
  } else {
    if (grade === 1) {
      s.interval = s.reps === 0 ? 1 : Math.max(s.interval + 1, Math.round(s.interval * 1.2));
      s.ease = Math.max(1.3, s.ease - 0.15);
    } else if (grade === 2) {
      s.interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
    } else {
      s.interval = s.reps === 0 ? 3 : Math.max(s.interval + 2, Math.round(s.interval * s.ease * 1.3));
      s.ease = Math.min(3.2, s.ease + 0.15);
    }
    s.reps += 1;
  }
  s.due = dayKey(addDays(startOfDay(today), s.interval));
  return s;
}

export function isCardDue(state: CardState | undefined, today: Date = new Date()): boolean {
  return !state || state.due <= dayKey(today);
}
