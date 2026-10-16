export const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const DAY_SHORT = ["D", "L", "M", "M", "J", "V", "S"];
export const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export const pad = (n: number) => String(n).padStart(2, "0");

/** AAAA-MM-DD en hora local. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Hoy", "Mañana", "Ayer", "jueves", "15 oct" */
export function dayLabel(d: Date, now = new Date()): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  if (diff > 1 && diff < 7) return cap(DAY_NAMES[d.getDay()]);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "Hoy 11:30", "Mañana 09:00", "Jueves 17:00" */
export function whenLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "Sin aviso";
  const d = new Date(iso);
  return `${dayLabel(d, now)} ${fmtTime(d)}`;
}

/** "en 10 min", "en 2 h", "hace 5 min", "ahora" */
export function relative(d: Date, now = new Date()): string {
  const min = Math.round((d.getTime() - now.getTime()) / 60000);
  if (Math.abs(min) < 1) return "ahora";
  const abs = Math.abs(min);
  const txt = abs < 60 ? `${abs} min` : abs < 60 * 24 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  return min > 0 ? `en ${txt}` : `hace ${txt}`;
}

/** "Martes 13 de octubre" */
export function longDate(d = new Date()): string {
  return `${cap(DAY_NAMES[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Valor para <input type="datetime-local">. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${dayKey(d)}T${fmtTime(d)}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Redondea hacia arriba al siguiente cuarto de hora. */
export function roundUpQuarter(d: Date): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const m = r.getMinutes();
  const next = Math.ceil((m + 1) / 15) * 15;
  r.setMinutes(next);
  return r;
}

export function daysText(days: number[]): string {
  const s = [...days].sort();
  if (s.length === 7) return "Todos los días";
  if (s.join() === "1,2,3,4,5") return "Lunes a viernes";
  if (s.join() === "0,6") return "Fines de semana";
  return s.map((d) => cap(DAY_NAMES[d])).join(", ");
}
