/**
 * Modo Escuela en el proceso principal: entregas importadas de Moodle/Canvas,
 * plan inverso, tarjetas de repaso (con o sin IA) y la foto para la interfaz.
 */
import {
  addDays,
  classOccurrences,
  dayKey,
  fmtTime,
  formatTaskLine,
  isCardDue,
  parseTaskLine,
  reversePlan,
  reviewCard,
  slugify,
  startOfDay,
  stripAccents,
  type CardInfo,
  type Grade,
  type Meeting,
  type PlanStep,
  type SchoolSnapshot,
  type Subject,
} from "@lumi/shared";
import type { Brain } from "../vault/brain";
import { FILES } from "../vault/structure";
import { getState, mutateState } from "../state";
import { activeProvider, parseJsonLoose } from "../llm/provider";
import { studiedTodayMin, studySession } from "./study";
import { log, errorText } from "../util";

/* ------------------------------ Entregas ------------------------------ */

const norm = (s: string) => stripAccents(s).toLowerCase();

/** «Tarea 3 is due» → «Tarea 3». Los avisos de «se abre» no son entregas. */
export function cleanDeadlineTitle(title: string): string | null {
  const t = title.trim();
  if (/\b(se abre|abre|opens?|apertura)\b/i.test(t) && !/\b(vence|cierra|due|closes)\b/i.test(t)) return null;
  return (
    t
      .replace(/\s*\[[^\]]+\]\s*$/, "")
      .replace(/\s*\((?:vence|cierra|due|closes)\)\s*$/i, "")
      .replace(/\s+(?:is due|vence|cierra|closes|should be completed|debe completarse|fecha límite)\s*$/i, "")
      .trim() || t
  );
}

/** ¿A qué materia pertenece un evento? Busca su nombre en el título, las categorías o la descripción. */
export function matchSubject(e: Pick<Meeting, "title" | "categories" | "description">, subjects: Subject[]): Subject | null {
  const hay = norm([e.title, ...(e.categories ?? []), e.description ?? ""].join(" \u0000 "));
  return subjects.filter((s) => s.name.length > 2).sort((a, b) => b.name.length - a.name.length).find((s) => hay.includes(norm(s.name)) || hay.includes(s.slug.replace(/-/g, " "))) ?? null;
}

/**
 * Copia las entregas del calendario de la escuela a 10-Escuela/Entregas.md como
 * pendientes (#escuela/<materia>). Si una fecha cambia, la actualiza; nunca duplica.
 */
export async function syncDeadlines(brain: Brain, events: Meeting[]): Promise<number> {
  if (!events.length) return 0;
  const subjects = brain.subjects();
  const st = getState();
  const base = (id: string) => id.replace(/:\d+$/, "");
  const counts = new Map<string, number>();
  for (const e of events) counts.set(base(e.id), (counts.get(base(e.id)) ?? 0) + 1);

  const fresh: string[] = [];
  const records: Record<string, { text: string; due: string }> = {};
  let changed = 0;
  for (const e of events) {
    const title = cleanDeadlineTitle(e.title);
    if (!title) continue;
    const key = counts.get(base(e.id))! > 1 ? e.id : base(e.id);
    const start = new Date(e.start);
    const due = dayKey(e.allDay ? new Date(start.getTime() + 12 * 3600_000) : start);
    const subj = matchSubject(e, subjects);
    const line = formatTaskLine({
      title,
      date: due,
      time: e.allDay ? null : fmtTime(start),
      tags: [],
      contact: null,
      mode: "escuela",
      extraTags: subj ? [`escuela/${subj.slug}`] : [],
    });
    const text = parseTaskLine(line)!.text;
    const prev = st.deadlines[key];
    if (!prev) {
      fresh.push(line);
      records[key] = { text, due };
    } else if (prev.due !== due) {
      // La fecha cambió en la plataforma: se actualiza la línea si sigue igual y sin marcar
      const note = await brain.vault.read(FILES.entregas);
      const lines = note?.raw.split(/\r?\n/) ?? [];
      const i = lines.findIndex((l) => {
        const p = parseTaskLine(l);
        return p && !p.done && p.text === prev.text && p.due === prev.due;
      });
      if (i >= 0) {
        await brain.vault.replaceLine(FILES.entregas, i, lines[i], lines[i].replace(/📅️?\s*\d{4}-\d{2}-\d{2}/u, `📅 ${due}`));
        changed++;
      }
      records[key] = { text: prev.text, due };
    }
  }
  if (fresh.length) {
    await brain.vault.appendLumi(FILES.entregas, fresh.join("\n"), {
      fm: { type: "entregas", modo: "escuela" },
      body: "# Entregas\n\nImportadas del calendario de tu escuela (Moodle, Canvas…). Márcalas aquí, en Lumi o con el plugin Tasks. Si la fecha cambia en la plataforma, Lumi la actualiza.",
    });
  }
  if (fresh.length || changed) await brain.touch(FILES.entregas);
  if (Object.keys(records).length) mutateState((s) => Object.assign(s.deadlines, records));
  return fresh.length + changed;
}

/* ----------------------------- Plan inverso ----------------------------- */

interface PlanJson {
  pasos?: { titulo?: string; fecha?: string }[];
}

/** Pasos con IA (si hay) o con la plantilla local. Las fechas siempre quedan entre hoy y la entrega. */
export async function planSteps(title: string, due: string, subject: string | null, now = new Date()): Promise<PlanStep[]> {
  const fallback = reversePlan(title, due, now);
  const provider = activeProvider();
  if (!provider) return fallback;
  try {
    const r = await provider.chat({
      system: `Ayudas a estudiantes que procrastinan a partir una entrega o examen en pasos pequeños. Devuelve SOLO JSON: {"pasos":[{"titulo":"acción concreta en infinitivo","fecha":"AAAA-MM-DD"}]}
- Entre 3 y 6 pasos, en orden.
- El primero es para hoy (${dayKey(now)}) y se hace en 5 minutos; empieza con «Primer paso (5 min):».
- El último es entregar o presentar, el ${due}.
- Fechas entre hoy y ${due}, repartidas (fechas intermedias, no todo al final).
- No hagas el trabajo por el estudiante: los pasos son acciones suyas.`,
      messages: [{ role: "user", content: `Entrega: ${title}${subject ? `\nMateria: ${subject}` : ""}\nFecha de entrega: ${due}` }],
      profile: "rapido",
      maxTokens: 700,
      json: true,
    });
    const j = parseJsonLoose<PlanJson>(r.text);
    const today = dayKey(now);
    const steps = (j?.pasos ?? [])
      .filter((p) => p.titulo?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha ?? ""))
      .map((p) => ({ title: p.titulo!.trim(), date: p.fecha! < today ? today : p.fecha! > due ? due : p.fecha! }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return steps.length >= 2 && steps.length <= 8 ? steps : fallback;
  } catch (e) {
    log.warn("plan de estudio con IA:", errorText(e));
    return fallback;
  }
}

/** Crea los pasos como pendientes del modo Escuela (con la etiqueta de la materia). */
export async function createStudyPlan(brain: Brain, input: { title: string; due: string; subject: string | null; steps?: PlanStep[] }): Promise<string[]> {
  const subj = input.subject ? brain.subjects().find((s) => s.name.toLowerCase() === input.subject!.toLowerCase() || s.slug === slugify(input.subject!)) : null;
  const steps = input.steps?.length ? input.steps : await planSteps(input.title, input.due, subj?.name ?? input.subject);
  const keys: string[] = [];
  for (const st of steps) {
    keys.push(
      await brain.createTask({
        title: st.title,
        date: st.date,
        time: null,
        tags: [],
        contact: null,
        mode: "escuela",
        extraTags: subj ? [`escuela/${subj.slug}`] : input.subject ? [`escuela/${slugify(input.subject)}`] : [],
      }),
    );
  }
  return keys;
}

/* ------------------------------ Tarjetas ------------------------------ */

export function dueCards(brain: Brain, subject?: string | null, now = new Date()): CardInfo[] {
  const srs = getState().srs;
  return brain
    .cards()
    .filter((c) => (!subject || c.subject === subject) && isCardDue(srs[c.id], now))
    .map((c) => ({ ...c, state: srs[c.id] }))
    .sort((a, b) => (a.state?.due ?? "0").localeCompare(b.state?.due ?? "0"))
    .slice(0, 60);
}

export function gradeCard(id: string, grade: Grade, now = new Date()): void {
  mutateState((s) => (s.srs[id] = reviewCard(s.srs[id], grade, now)));
}

interface CardsJson {
  tarjetas?: { pregunta?: string; respuesta?: string }[];
}

/** Preguntas de repaso a partir de los apuntes de una materia (recuerdo activo). Requiere IA. */
export async function generateCards(brain: Brain, subjectPath: string): Promise<number> {
  const provider = activeProvider();
  if (!provider) throw new Error("Para generar preguntas necesito la IA. También puedes escribir tus tarjetas a mano.");
  const material = await brain.subjectNotes(subjectPath);
  if (!material.trim()) throw new Error("No encontré apuntes en la carpeta de esta materia. Guarda tus notas ahí (por ejemplo «Apuntes/Tema 1.md») y vuelve a intentarlo.");
  const existing = new Set(brain.cards().filter((c) => c.path.startsWith(subjectPath.split("/").slice(0, -1).join("/"))).map((c) => norm(c.question)));
  const r = await provider.chat({
    system: `Haces tarjetas de repaso (recuerdo activo) a partir de los apuntes de un estudiante, en español. Devuelve SOLO JSON: {"tarjetas":[{"pregunta":"…","respuesta":"…"}]}
- Entre 5 y 12 tarjetas sobre lo más importante.
- Preguntas claras que obliguen a recordar (no de sí/no). Respuestas cortas (una línea).
- Usa solo lo que está en los apuntes; no inventes datos.`,
    messages: [{ role: "user", content: `Apuntes:\n${material}` }],
    profile: "rapido",
    maxTokens: 1800,
    json: true,
  });
  const j = parseJsonLoose<CardsJson>(r.text);
  const cards = (j?.tarjetas ?? [])
    .map((c) => ({ question: (c.pregunta ?? "").trim(), answer: (c.respuesta ?? "").trim() }))
    .filter((c) => c.question && c.answer && !existing.has(norm(c.question)))
    .slice(0, 12);
  if (!cards.length) throw new Error("La IA no propuso tarjetas nuevas. Intenta con más apuntes.");
  await brain.addCards(subjectPath, cards);
  return cards.length;
}

/* ------------------------------ Foto ------------------------------ */

export function schoolSnapshot(brain: Brain | null, now = new Date()): SchoolSnapshot {
  const empty: SchoolSnapshot = { subjects: [], cycle: null, classesToday: [], nextClass: null, cards: { total: 0, due: 0, bySubject: {} }, study: studySession(), studiedTodayMin: studiedTodayMin(now) };
  if (!brain) return empty;
  const subjects = brain.subjects();
  const cycle = brain.cycle();
  const range = cycle ? { inicio: cycle.start, fin: cycle.end } : null;
  const today = classOccurrences(subjects, startOfDay(now), addDays(startOfDay(now), 1), range);
  const upcoming = classOccurrences(subjects, now, addDays(startOfDay(now), 8), range);
  const srs = getState().srs;
  const cards = brain.cards();
  const bySubject: Record<string, { total: number; due: number }> = {};
  let due = 0;
  for (const c of cards) {
    const k = c.subject ?? "General";
    bySubject[k] ??= { total: 0, due: 0 };
    bySubject[k].total++;
    if (isCardDue(srs[c.id], now)) {
      bySubject[k].due++;
      due++;
    }
  }
  return {
    subjects,
    cycle,
    classesToday: today,
    nextClass: upcoming.find((o) => new Date(o.end) > now) ?? null,
    cards: { total: cards.length, due, bySubject },
    study: studySession(),
    studiedTodayMin: studiedTodayMin(now),
  };
}
