/**
 * Extracción con el perfil "rápido" de la IA:
 * - notas rápidas → pendiente con fecha, hora y etiquetas;
 * - reuniones → pendientes, decisiones, personas, cliente/proyecto y hechos.
 */
import type { Tag, TaskDraft } from "@lumi/shared";
import { DAY_NAMES, dayKey, enabledModes, extractModeTag, fmtTime, formatTaskLine, modeCategories, parseNote as parseQuick, slugify, taskGrouping, type Mode } from "@lumi/shared";
import type { Brain } from "../vault/brain";
import { activeProvider, parseJsonLoose } from "../llm/provider";
import { proposeFact } from "./facts";
import { getSettings } from "../settings";
import { activeMode } from "../modes";
import { log, errorText } from "../util";
import { today } from "../vault/vault";

function nowLine(): string {
  const n = new Date();
  return `${DAY_NAMES[n.getDay()]} ${today()} ${fmtTime(n)}`;
}

/** Lectura local (sin IA), siempre disponible e instantánea. */
/** «#escuela», «#personal»… dicen el modo, no son proyectos. */
function splitMode(text: string): { text: string; mode: string | null } {
  const modes = enabledModes(getSettings().modes);
  return modes.length > 1 ? extractModeTag(text, modes) : { text, mode: null };
}

/** Modo en el que caerá la nota: el que diga (#escuela) o el activo. */
function targetMode(explicit: string | null): Mode | null {
  const modes = enabledModes(getSettings().modes);
  const id = explicit ?? (modes.length > 1 ? activeMode().id : modes[0]?.id);
  return modes.find((m) => m.id === id) ?? null;
}

/**
 * En modos que ordenan por categoría (Personal, Escuela…), «#súper» no es un
 * proyecto: es la categoría (o la materia, en Escuela), y «@Ana» es una persona.
 * Los clientes y proyectos que ya existen se quedan como están.
 */
export function classifyDraft(draft: TaskDraft, mode: Mode | null, brain: Brain | null): TaskDraft {
  if (!mode || taskGrouping(mode) !== "categorias") return draft;
  const known = (brain?.entities() ?? []).filter((e) => e.kind !== "persona");
  const isKnown = (t: Tag) => known.some((k) => k.kind === t.kind && k.name.toLowerCase() === t.name.toLowerCase());
  const subjects = mode.id === "escuela" ? (brain?.subjects() ?? []) : [];
  const cats = modeCategories(mode);
  const out: TaskDraft = { ...draft, tags: [] };
  for (const t of draft.tags) {
    if (isKnown(t)) out.tags.push(t);
    else if (t.kind === "cliente" && !out.contact) out.contact = t.name;
    else if (out.subject == null && out.category == null) {
      const subj = subjects.find((x) => x.slug === slugify(t.name));
      if (subj) out.subject = subj.name;
      else out.category = cats.find((c) => slugify(c) === slugify(t.name)) ?? t.name.replace(/^\w/, (c) => c.toUpperCase());
    }
  }
  return out;
}

export function localDraft(text: string, brain: Brain | null): TaskDraft {
  const known: Tag[] = (brain?.entities() ?? []).filter((e) => e.kind !== "persona").map((e) => ({ name: e.name, kind: e.kind as Tag["kind"] }));
  const split = splitMode(text);
  const p = parseQuick(split.text || text, known);
  const d = p.remindAt ? new Date(p.remindAt) : null;
  return classifyDraft(
    {
      title: p.title,
      date: d ? dayKey(d) : null,
      time: d ? fmtTime(d) : null,
      tags: p.tags,
      contact: p.contact,
      original: text,
      reason: p.reason,
      // undefined = la interfaz pone el modo activo
      mode: split.mode ?? undefined,
    },
    targetMode(split.mode),
    brain,
  );
}

interface QuickJson {
  titulo?: string;
  fecha?: string | null;
  hora?: string | null;
  cliente?: string | null;
  proyecto?: string | null;
  persona?: string | null;
  categoria?: string | null;
  materia?: string | null;
}

export async function refineDraft(text: string, brain: Brain | null): Promise<TaskDraft | null> {
  const provider = activeProvider();
  if (!provider) return null;
  const ents = brain?.entities() ?? [];
  const list = (k: string) => ents.filter((e) => e.kind === k).map((e) => e.name).slice(0, 120).join(", ") || "(ninguno)";
  const mem = (brain?.facts() ?? []).slice(-60).map((f) => `- ${f.text}`).join("\n") || "(vacía)";
  const split = splitMode(text);
  const mode = targetMode(split.mode);
  const byCategory = taskGrouping(mode) === "categorias";
  const subjects = mode?.id === "escuela" ? (brain?.subjects() ?? []).map((x) => x.name) : [];
  // Trabajo: cliente/proyecto. Personal, Escuela…: categoría (y materia en Escuela)
  const fields = byCategory
    ? `${subjects.length ? `"materia": "nombre" o null, ` : ""}"categoria": "nombre" o null, "cliente": "nombre" o null, "proyecto": "nombre" o null`
    : `"cliente": "nombre" o null, "proyecto": "nombre" o null`;
  const classRules = byCategory
    ? `- Estás en el modo ${mode!.nombre}: ordena el pendiente por ${subjects.length ? "materia o " : ""}categoría, no por cliente o proyecto. Usa cliente/proyecto solo si la nota nombra uno conocido.
${subjects.length ? `- Materias: ${subjects.join(", ")} (usa el nombre tal cual).\n` : ""}- Categorías del modo: ${modeCategories(mode).join(", ") || "(ninguna)"}. Si ninguna encaja, puedes proponer una nueva de una o dos palabras, o null.
- "#Nombre" es la ${subjects.length ? "materia o " : ""}categoría y "@Nombre" es una persona.`
    : `- "@Nombre" es cliente y "#Nombre" es proyecto. Usa los nombres conocidos tal cual si la nota o la memoria los relacionan.`;
  const system = `Conviertes notas rápidas en español en pendientes estructurados. Devuelve SOLO un objeto JSON:
{"titulo": "acción corta que empieza con verbo en infinitivo, sin fecha ni hora", "fecha": "AAAA-MM-DD" o null, "hora": "HH:MM" o null, ${fields}, "persona": "nombre" o null}

- Ahora es ${nowLine()} (hora local).
- Interpreta "hoy", "mañana", "el jueves", "antes de comer" (13:00), "en la tarde" (16:00), "al final del día" (18:00), "en 30 min".
- Si no hay fecha ni hora, propone hoy en ~1 hora (o mañana 09:00 si ya es noche).
${classRules}
- Clientes conocidos: ${list("cliente")}
- Proyectos conocidos: ${list("proyecto")}
- Personas conocidas: ${list("persona")}
- Memoria:
${mem}`;
  try {
    const r = await provider.chat({ system, messages: [{ role: "user", content: split.text || text }], profile: "rapido", maxTokens: 300, json: true });
    const j = parseJsonLoose<QuickJson>(r.text);
    if (!j?.titulo) return null;
    const tags: Tag[] = [];
    if (j.cliente) tags.push({ kind: "cliente", name: j.cliente });
    if (j.proyecto) tags.push({ kind: "proyecto", name: j.proyecto });
    const subject = j.materia?.trim() ? (subjects.find((x) => slugify(x) === slugify(j.materia!)) ?? null) : null;
    const draft: TaskDraft = {
      title: j.titulo.trim(),
      date: j.fecha && /^\d{4}-\d{2}-\d{2}$/.test(j.fecha) ? j.fecha : null,
      time: j.hora && /^\d{1,2}:\d{2}$/.test(j.hora) ? j.hora.padStart(5, "0") : null,
      tags,
      contact: j.persona?.trim() || null,
      original: text,
      reason: "leído con IA",
      mode: split.mode ?? undefined,
    };
    if (byCategory) {
      if (subject) draft.subject = subject;
      else if (j.categoria?.trim()) draft.category = modeCategories(mode).find((c) => slugify(c) === slugify(j.categoria!)) ?? j.categoria.trim();
      return classifyDraft(draft, mode, brain);
    }
    return draft;
  } catch (e) {
    log.warn("refineDraft:", errorText(e));
    return null;
  }
}

interface MeetingJson {
  pendientes?: { titulo: string; fecha?: string | null; responsable?: string | null; para_mi?: boolean }[];
  decisiones?: string[];
  personas?: string[];
  cliente?: string | null;
  proyecto?: string | null;
  hechos?: { hecho: string; tema?: string }[];
}

/** Post-proceso de una reunión importada: pendientes, decisiones, personas y enlaces. */
export async function postProcessMeeting(brain: Brain, rel: string): Promise<boolean> {
  if (!getSettings().postProcessMeetings) return false;
  const provider = activeProvider();
  if (!provider) return false;
  const note = await brain.vault.read(rel);
  if (!note || note.fm.lumi_procesada === true || note.fm.lumi === "privado") return false;

  const ents = brain.entities();
  const names = (k: string) => ents.filter((e) => e.kind === k).map((e) => e.name).slice(0, 150).join(", ") || "(ninguno)";
  const body = note.body.length > 24_000 ? `${note.body.slice(0, 24_000)}\n…` : note.body;
  const userName = getSettings().userName || "el usuario";
  const system = `Analizas notas de reuniones en español. Devuelve SOLO un objeto JSON:
{"pendientes": [{"titulo": "acción en infinitivo", "fecha": "AAAA-MM-DD" o null, "responsable": "nombre" o null, "para_mi": true si le toca a ${userName}}],
 "decisiones": ["decisión en una frase"],
 "personas": ["Nombre Apellido" de los asistentes o mencionados con un papel claro],
 "cliente": "nombre" o null, "proyecto": "nombre" o null,
 "hechos": [{"hecho": "dato durable sobre clientes, proyectos o personas que valga la pena recordar", "tema": "nombre del cliente o tema"}]}
- Hoy es ${today()}. Convierte fechas relativas ("el viernes") a AAAA-MM-DD.
- Usa nombres conocidos si coinciden. Clientes: ${names("cliente")}. Proyectos: ${names("proyecto")}. Personas: ${names("persona")}.
- No inventes nada que no esté en la nota. Máximo 12 pendientes, 8 decisiones y 3 hechos.`;
  let j: MeetingJson | null = null;
  try {
    const r = await provider.chat({ system, messages: [{ role: "user", content: `# ${String(note.fm.title ?? rel)}\n${body}` }], profile: "rapido", maxTokens: 1500, json: true });
    j = parseJsonLoose<MeetingJson>(r.text);
  } catch (e) {
    log.warn("postProcessMeeting:", errorText(e));
    return false;
  }
  if (!j) return false;

  const tags: Tag[] = [];
  let cliente: string | null = null;
  let proyecto: string | null = null;
  if (j.cliente) {
    cliente = await brain.ensureEntity("cliente", j.cliente);
    tags.push({ kind: "cliente", name: cliente });
  }
  if (j.proyecto) {
    proyecto = await brain.ensureEntity("proyecto", j.proyecto);
    tags.push({ kind: "proyecto", name: proyecto });
  }
  const personas: string[] = [];
  for (const p of (j.personas ?? []).slice(0, 15)) {
    if (!p?.trim() || p.trim().toLowerCase() === userName.toLowerCase()) continue;
    personas.push(await brain.ensureEntity("persona", p.trim()));
  }

  const mine = (j.pendientes ?? []).filter((p) => p.para_mi !== false);
  const others = (j.pendientes ?? []).filter((p) => p.para_mi === false);
  const taskLines = mine.map((p) =>
    formatTaskLine({
      title: p.titulo,
      date: p.fecha && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : null,
      time: null,
      tags,
      contact: null,
    }),
  );
  const otherLines = others.map((p) => `- ${p.responsable ? `[[${p.responsable}]]: ` : ""}${p.titulo}${p.fecha ? ` (${p.fecha})` : ""}`);
  await brain.vault.upsertLumiSection(
    rel,
    "Pendientes detectados",
    [...taskLines, ...(otherLines.length ? ["", "De otras personas:", ...otherLines] : [])].join("\n") || "_Sin pendientes._",
  );
  await brain.vault.upsertLumiSection(rel, "Decisiones", (j.decisiones ?? []).map((d) => `- ${d}`).join("\n") || "_Sin decisiones registradas._");

  const fmPatch: Record<string, unknown> = { lumi_procesada: true };
  if (personas.length) fmPatch.attendees = [...new Set([...(Array.isArray(note.fm.attendees) ? (note.fm.attendees as string[]) : []), ...personas.map((p) => `[[${p}]]`)])];
  if (cliente) fmPatch.cliente = `[[${cliente}]]`;
  if (proyecto) fmPatch.proyecto = `[[${proyecto}]]`;
  if (brain.vault.isLumiOwned(note.fm)) await brain.vault.setFrontmatter(rel, fmPatch);
  await brain.touch(rel);

  const title = String(note.fm.title ?? rel.split("/").pop()?.replace(/\.md$/, ""));
  for (const h of (j.hechos ?? []).slice(0, 3)) {
    if (h?.hecho) proposeFact(brain, h.hecho, h.tema ?? cliente ?? "General", `[[${rel.split("/").pop()?.replace(/\.md$/, "") ?? title}]]`);
  }
  return true;
}
