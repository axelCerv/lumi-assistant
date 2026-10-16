/**
 * Entiende notas rápidas en español sin necesidad de IA:
 *   "mandar correo hoy a Laura para explicarle la propuesta antes de comer @GrupoNorte #PropuestaQ4"
 *   → título, fecha y hora del aviso, etiquetas y contacto.
 *
 * Etiquetas: @Cliente  ·  #Proyecto  (usa _ o - para espacios: @Grupo_Norte)
 * Si Claude está conectado, su lectura reemplaza a esta (ver claude.ts).
 */
import type { Tag } from "./types.ts";
import { addDays, roundUpQuarter, startOfDay } from "./time.ts";
import { stripAccents } from "./slug.ts";

export interface ParsedNote {
  title: string;
  remindAt: string | null;
  tags: Tag[];
  contact: string | null;
  /** Explica de dónde salió la hora, p. ej. "antes de comer → 13:00". */
  reason: string | null;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = [
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

const NUM_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  diez: 10,
  quince: 15,
  veinte: 20,
  treinta: 30,
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const sameTag = (a: Tag, b: Tag) => a.kind === b.kind && a.name.toLowerCase() === b.name.toLowerCase();

export function parseNote(input: string, knownTags: Tag[] = [], now: Date = new Date()): ParsedNote {
  const original = input.normalize("NFC").trim();
  // `work` es una copia sin acentos y en minúsculas, con la misma longitud que el original:
  // lo que se reconoce se borra (con espacios) en ambas para armar el título al final.
  let work = stripAccents(original).toLowerCase();
  const chars = original.split("");
  if (chars.length !== work.length) work = work.padEnd(chars.length).slice(0, chars.length);

  const blank = (start: number, end: number) => {
    work = work.slice(0, start) + " ".repeat(end - start) + work.slice(end);
    for (let i = start; i < end; i++) chars[i] = " ";
  };
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(work);
    if (m) blank(m.index, m.index + m[0].length);
    return m;
  };

  // ---- etiquetas ----
  const tags: Tag[] = [];
  for (const m of original.matchAll(/(^|\s)([#@])([\p{L}\p{N}_.-]+)/gu)) {
    const name = m[3].replace(/[_-]+/g, " ").replace(/\.$/, "").trim();
    if (!name) continue;
    const tag: Tag = { name, kind: m[2] === "@" ? "cliente" : "proyecto" };
    // Si ya existe con otro formato de mayúsculas, se usa el conocido.
    const known = knownTags.find((k) => sameTag(k, tag) || (k.kind === tag.kind && compact(k.name) === compact(name)));
    if (!tags.some((t) => sameTag(t, known ?? tag))) tags.push(known ?? tag);
    const start = (m.index ?? 0) + m[1].length;
    blank(start, start + m[0].length - m[1].length);
  }
  for (const k of knownTags) {
    if (tags.some((t) => sameTag(t, k))) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(stripAccents(k.name).toLowerCase())}($|[^a-z0-9])`);
    if (re.test(work)) tags.push(k);
  }

  // ---- fecha y hora ----
  let day: Date | null = null;
  let hour: number | null = null;
  let minute = 0;
  let exact: Date | null = null;
  let reason: string | null = null;

  // "en 30 minutos", "en 2 horas", "en media hora", "en una hora", "en 3 días"
  let m = take(/\ben (\d+|un|una|dos|tres|cuatro|cinco|diez|quince|veinte|treinta|media) (minutos?|mins?|horas?|hrs?|h|dias?)\b/);
  if (m) {
    const n = m[1] === "media" ? 0.5 : NUM_WORDS[m[1]] ?? parseInt(m[1], 10);
    const unit = m[2];
    if (unit.startsWith("d")) {
      day = addDays(startOfDay(now), n);
    } else {
      const ms = unit.startsWith("m") ? n * 60000 : n * 3600000;
      exact = new Date(now.getTime() + ms);
      exact.setSeconds(0, 0);
    }
  }

  // Momentos del día
  const moments: [RegExp, number, number, string][] = [
    [/\b(?:en|por) la manana\b|\btemprano\b|\besta manana\b/, 9, 0, "por la mañana → 9:00"],
    [/\b(?:al|a|de) mediodia\b/, 12, 0, "mediodía → 12:00"],
    [/\bantes de (?:la )?comida\b|\bantes de comer\b/, 13, 0, "antes de comer → 13:00"],
    [/\bdespues de (?:la )?comida\b|\bdespues de comer\b/, 16, 0, "después de comer → 16:00"],
    [/\b(?:en|por) la tarde\b|\besta tarde\b/, 16, 0, "por la tarde → 16:00"],
    [/\bal final del dia\b|\bfin del dia\b|\bantes de irme\b|\bantes de salir\b/, 18, 0, "al final del día → 18:00"],
    [/\b(?:en|por) la noche\b|\besta noche\b/, 20, 0, "por la noche → 20:00"],
  ];
  let todayFromMoment = false;
  for (const [re, h, mi, why] of moments) {
    const mm = take(re);
    if (mm) {
      if (hour === null) {
        hour = h;
        minute = mi;
        reason = why;
      }
      if (mm[0].startsWith("esta")) todayFromMoment = true;
    }
  }

  // Hora explícita: "a las 5", "a las 5:30 pm", "a la 1", "17:30", "5pm", "5 de la tarde"
  const timeRe =
    /\b(?:a las?|alas|para las?)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|hrs?\.?|horas)?(?:\s*de la (manana|tarde|noche))?|\b(\d{1,2})[:.](\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?|hrs?\.?)?|\b(\d{1,2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?=\s|$|[,.])/;
  m = take(timeRe);
  if (m) {
    const h = parseInt(m[1] ?? m[5] ?? m[8], 10);
    const mi = parseInt(m[2] ?? m[6] ?? "0", 10);
    const suffix = (m[3] ?? m[7] ?? m[9] ?? "").replace(/[\s.]/g, "");
    const part = m[4];
    if (h <= 23 && mi <= 59) {
      let hh = h;
      if (suffix === "pm" && hh < 12) hh += 12;
      else if (suffix === "am" && hh === 12) hh = 0;
      else if ((part === "tarde" || part === "noche") && hh < 12) hh += 12;
      // "a las 5" casi siempre es de la tarde en horario de trabajo
      else if (!suffix && !part && hh >= 1 && hh <= 7) hh += 12;
      hour = hh;
      minute = mi;
      reason = null;
    }
  }

  // Día
  if (take(/\bpasado manana\b/)) day = addDays(startOfDay(now), 2);
  else if (take(/\b(?:para )?manana\b/)) day = addDays(startOfDay(now), 1);
  else if (take(/\b(?:para )?hoy\b|\bahorita\b/)) day = startOfDay(now);

  m = take(/\b(?:(?:el|este|esta|para el|el proximo|proximo|el siguiente|siguiente)\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(\s+(?:que viene|proximo|de la proxima semana))?\b/);
  if (m) {
    const target = WEEKDAYS.indexOf(m[1]);
    const forceNext = /proximo|siguiente|que viene|proxima/.test(m[0]);
    let diff = (target - now.getDay() + 7) % 7;
    if (diff === 0 && !(m[0].startsWith("este") || m[0].startsWith("esta"))) diff = 7;
    if (forceNext && diff < 7 && /de la proxima semana/.test(m[0])) diff += 7;
    day = addDays(startOfDay(now), diff);
  }

  if (!day && take(/\b(?:la )?(?:proxima semana|semana que viene)\b/)) {
    const diff = ((1 - now.getDay() + 7) % 7) || 7;
    day = addDays(startOfDay(now), diff);
    if (hour === null) {
      hour = 9;
      reason = "la próxima semana → lunes 9:00";
    }
  }
  if (!day && take(/\b(?:este |el )?fin de semana\b/)) {
    const diff = (6 - now.getDay() + 7) % 7;
    day = addDays(startOfDay(now), diff);
  }

  // "el 15", "el 15 de octubre", "15 de octubre", "15/10", "15/10/2026"
  m = take(/\b(?:el\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/);
  if (m) {
    const d = new Date(now.getFullYear(), MONTHS.indexOf(m[2]), parseInt(m[1], 10));
    if (d < startOfDay(now)) d.setFullYear(d.getFullYear() + 1);
    day = d;
  } else {
    m = take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : now.getFullYear();
      const d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
      if (!m[3] && d < startOfDay(now)) d.setFullYear(d.getFullYear() + 1);
      if (!isNaN(d.getTime())) day = d;
    } else {
      m = take(/\bel (?:dia )?(\d{1,2})\b(?!\s*(?:de la|:|am|pm|hrs|horas|minutos))/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 31) {
          const d = new Date(now.getFullYear(), now.getMonth(), n);
          if (d < startOfDay(now)) d.setMonth(d.getMonth() + 1);
          day = d;
        }
      }
    }
  }

  if (todayFromMoment && !day) day = startOfDay(now);

  // ---- armar la fecha final ----
  let when: Date | null = exact;
  if (!when) {
    if (day && hour !== null) {
      when = new Date(day);
      when.setHours(hour, minute, 0, 0);
    } else if (day) {
      when = new Date(day);
      if (startOfDay(day).getTime() === startOfDay(now).getTime()) {
        // "hoy" sin hora: en una hora
        const soon = roundUpQuarter(new Date(now.getTime() + 60 * 60000));
        when = soon;
        reason = "hoy sin hora → en una hora";
      } else {
        when.setHours(9, 0, 0, 0);
        reason = "sin hora → 9:00";
      }
    } else if (hour !== null) {
      when = new Date(now);
      when.setHours(hour, minute, 0, 0);
      if (when.getTime() <= now.getTime()) when = addDays(when, 1);
    } else {
      // Nada de fecha: te lo recuerdo en una hora (o mañana temprano si ya es tarde).
      if (now.getHours() < 19) {
        when = roundUpQuarter(new Date(now.getTime() + 60 * 60000));
        reason = "sin fecha → en una hora";
      } else {
        when = addDays(startOfDay(now), 1);
        when.setHours(9, 0, 0, 0);
        reason = "sin fecha → mañana 9:00";
      }
    }
  }

  // ---- contacto ----
  const remaining = chars.join("");
  let contact: string | null = null;
  const cm = remaining.match(
    /(?:^|\s)(?:a|con|para|le|de parte de)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]+)?)/u,
  );
  if (cm) {
    const name = cm[1].trim();
    const isTag = [...tags, ...knownTags].some((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!isTag) contact = name;
  }

  // ---- título ----
  let title = remaining.replace(/\s+/g, " ").trim();
  title = title.replace(
    /^(?:recu[eé]rdame|recordarme|recordar|no olvides|no olvidar|no se me olvide|ac[uú]erdate de|tengo que|hay que|debo|necesito)\s+(?:que\s+|de\s+)?/i,
    "",
  );
  for (let i = 0; i < 3; i++) {
    title = title
      .replace(/^(?:y|que|el|la|de|a|para|en|,|\.)\s+/i, "")
      .replace(/\s+(?:y|que|el|la|de|del|a|para|en|antes|despu[eé]s|,)\s*$/i, "")
      .replace(/[\s,;:.-]+$/, "")
      .trim();
  }
  if (!title) title = original;
  title = title[0].toUpperCase() + title.slice(1);

  return { title, remindAt: when ? when.toISOString() : null, tags, contact, reason };
}

function compact(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]/g, "");
}
