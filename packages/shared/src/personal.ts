/**
 * Modo Personal: pagos recurrentes y cumpleaños.
 * Los pagos viven en 20-Personal/Pagos.md, una línea por pago:
 *   - Renta · día 5 · $8,500 · avisar 2 días antes
 *   - Seguro del coche · 15/04 · $6,200          (anual)
 * Nunca se guardan números de tarjeta ni de cuenta.
 */
import { addDays, MONTHS, pad, startOfDay } from "./time.ts";
import { stripAccents } from "./slug.ts";

export interface Payment {
  name: string;
  /** Día del mes (1–31). */
  day: number;
  /** Mes (1–12) si es anual; null si es mensual. */
  month: number | null;
  amount: string | null;
  /** Días de anticipación del aviso. */
  lead: number;
  line: number;
  raw: string;
}

const MONTH_KEYS = MONTHS.map((m) => stripAccents(m).slice(0, 3));

/** Quita lo que parezca número de tarjeta o cuenta (8+ dígitos seguidos). */
export function scrubAccountNumbers(s: string): string {
  return s.replace(/\b(?:\d[ -]?){8,}\d\b/g, "••••");
}

export function parsePaymentLine(raw: string, line = 0): Payment | null {
  const m = /^\s*[-*+]\s+(?!\[)(.+)$/.exec(raw);
  if (!m) return null;
  const parts = m[1].split(/\s*·\s*/);
  const name = parts.shift()?.trim().replace(/^\[\[|\]\]$/g, "");
  if (!name) return null;
  let day: number | null = null;
  let month: number | null = null;
  let amount: string | null = null;
  let lead = 2;
  for (const p of parts) {
    const k = stripAccents(p).toLowerCase();
    let x: RegExpExecArray | null;
    if ((x = /^(?:dia|el)\s*(\d{1,2})(?:\s+de cada mes)?$/.exec(k))) day = parseInt(x[1], 10);
    else if ((x = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(k))) {
      day = parseInt(x[1], 10);
      month = parseInt(x[2], 10);
    } else if ((x = /^(\d{1,2})\s*(?:de\s*)?([a-z]{3})[a-z]*$/.exec(k)) && MONTH_KEYS.includes(x[2])) {
      day = parseInt(x[1], 10);
      month = MONTH_KEYS.indexOf(x[2]) + 1;
    } else if ((x = /^avisar\s*(\d{1,2})\s*dias?/.exec(k))) lead = parseInt(x[1], 10);
    else if (/^\$|\d/.test(k) && amount === null) amount = p.trim();
  }
  if (day === null || day < 1 || day > 31 || (month !== null && (month < 1 || month > 12))) return null;
  return { name, day, month, amount, lead: Math.min(15, Math.max(0, lead)), line, raw };
}

export function parsePayments(text: string): Payment[] {
  return text
    .split(/\r?\n/)
    .map((l, i) => parsePaymentLine(l, i))
    .filter((p): p is Payment => !!p);
}

export function formatPayment(p: { name: string; day: number; month?: number | null; amount?: string | null; lead?: number }): string {
  const when = p.month ? `${p.day}/${pad(p.month)}` : `día ${p.day}`;
  const parts = [scrubAccountNumbers(p.name.trim()), when];
  if (p.amount?.trim()) parts.push(scrubAccountNumbers(p.amount.trim()));
  if (p.lead !== undefined && p.lead !== 2) parts.push(`avisar ${p.lead} días antes`);
  return `- ${parts.join(" · ")}`;
}

function clampDay(y: number, m0: number, d: number): Date {
  const last = new Date(y, m0 + 1, 0).getDate();
  return new Date(y, m0, Math.min(d, last));
}

/** Próxima fecha de pago (hoy cuenta). */
export function nextPaymentDate(p: Pick<Payment, "day" | "month">, now = new Date()): Date {
  const today = startOfDay(now);
  if (p.month) {
    let d = clampDay(now.getFullYear(), p.month - 1, p.day);
    if (d < today) d = clampDay(now.getFullYear() + 1, p.month - 1, p.day);
    return d;
  }
  let d = clampDay(now.getFullYear(), now.getMonth(), p.day);
  if (d < today) d = clampDay(now.getFullYear(), now.getMonth() + 1, p.day);
  return d;
}

/* ------------------------------- Cumpleaños ------------------------------- */

/** Lee «03-15», «1990-03-15», «15/03» o «15 de marzo». */
export function parseBirthday(v: unknown): { month: number; day: number; year: number | null } | null {
  if (v === null || v === undefined) return null;
  const s = stripAccents(String(v)).toLowerCase().trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return valid(+m[2], +m[3], +m[1]);
  if ((m = /^(\d{1,2})-(\d{1,2})$/.exec(s))) return valid(+m[1], +m[2], null);
  if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s))) return valid(+m[2], +m[1], m[3] ? +m[3] : null);
  if ((m = /^(\d{1,2})\s*(?:de\s*)?([a-z]{3})[a-z]*(?:\s*(?:de\s*)?(\d{4}))?$/.exec(s))) {
    const i = MONTH_KEYS.indexOf(m[2]);
    if (i >= 0) return valid(i + 1, +m[1], m[3] ? +m[3] : null);
  }
  return null;
}

function valid(month: number, day: number, year: number | null) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day, year };
}

/** Próximo cumpleaños (hoy cuenta). El 29 de febrero se celebra el 28 en años no bisiestos. */
export function nextBirthday(b: { month: number; day: number }, now = new Date()): Date {
  const today = startOfDay(now);
  let d = clampDay(now.getFullYear(), b.month - 1, b.day);
  if (d < today) d = clampDay(now.getFullYear() + 1, b.month - 1, b.day);
  return d;
}

export function daysUntil(d: Date, now = new Date()): number {
  return Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
}

/** «03-15» para guardar en el encabezado de la persona. */
export function birthdayKey(b: { month: number; day: number; year?: number | null }): string {
  return b.year ? `${b.year}-${pad(b.month)}-${pad(b.day)}` : `${pad(b.month)}-${pad(b.day)}`;
}

export function inDays(n: number, now = new Date()): Date {
  return addDays(startOfDay(now), n);
}
