/**
 * Todo lo que tiene que ver con Claude: armar el contexto con tus cosas,
 * leer notas rápidas y conversar. La llamada real la hace el lado nativo
 * (Rust) para que tu clave nunca esté expuesta en la interfaz.
 */
import { invoke } from "@tauri-apps/api/core";
import { avatarCatalogText, describeAvatar } from "./avatar";
import type { LumiData, Meeting, PendingReminder, Tag } from "./types";
import type { ParsedNote } from "./parse";
import { DAY_NAMES, daysText, fmtTime, longDate, whenLabel } from "./time";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export async function askClaude(data: LumiData, system: string, messages: Turn[], maxTokens = 1024): Promise<string> {
  return invoke<string>("ask_claude", {
    model: data.settings.model,
    system,
    messages,
    maxTokens,
  });
}

export async function hasApiKey(): Promise<boolean> {
  try {
    return await invoke<boolean>("has_api_key");
  } catch {
    return false;
  }
}

function tagText(tags: Tag[]): string {
  return tags.length ? ` [${tags.map((t) => `${t.kind}: ${t.name}`).join(", ")}]` : "";
}

/** Resumen de tu mundo que Lumi le pasa a Claude en cada pregunta. */
export function buildContext(data: LumiData, meetings: Meeting[], now = new Date()): string {
  const s = data.settings;
  const lines: string[] = [];
  lines.push(`Fecha y hora actual: ${longDate(now)} ${now.getFullYear()}, ${fmtTime(now)} (zona horaria local del usuario).`);
  if (s.userName) lines.push(`El usuario se llama ${s.userName}.`);
  lines.push(`Tu apariencia actual (Lumi, una esferita que flota en la pantalla): ${describeAvatar(data.avatar)}.`);

  const pending = data.tasks
    .filter((t) => !t.done)
    .sort((a, b) => (a.remindAt ?? "9").localeCompare(b.remindAt ?? "9"))
    .slice(0, 60);
  lines.push("", "## Pendientes");
  if (!pending.length) lines.push("(ninguno)");
  for (const t of pending) {
    const late = t.remindAt && new Date(t.remindAt) < now ? " (atrasado)" : "";
    lines.push(`- ${t.text} — ${whenLabel(t.remindAt, now)}${late}${tagText(t.tags)}${t.contact ? ` · contacto: ${t.contact}` : ""}`);
  }

  const done = data.tasks
    .filter((t) => t.done && t.doneAt)
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""))
    .slice(0, 20);
  if (done.length) {
    lines.push("", "## Completados recientemente");
    for (const t of done) lines.push(`- ${t.text} — hecho ${whenLabel(t.doneAt, now)}${tagText(t.tags)}`);
  }

  const upcoming = meetings
    .filter((m) => new Date(m.end) > now)
    .slice(0, 25);
  lines.push("", "## Reuniones próximas (7 días)");
  if (!upcoming.length) lines.push("(ninguna o calendario sin conectar)");
  for (const m of upcoming) {
    const when = m.allDay ? `${whenLabel(m.start, now).split(" ")[0]} (todo el día)` : whenLabel(m.start, now);
    lines.push(`- ${when}: ${m.title}${m.location ? ` · ${m.location}` : ""}`);
  }

  if (data.routines.length) {
    lines.push("", "## Rutinas");
    for (const r of data.routines) lines.push(`- ${r.title} — ${daysText(r.days)} ${r.time}${r.enabled ? "" : " (pausada)"}`);
  }

  if (data.tags.length) {
    lines.push("", "## Clientes y proyectos conocidos");
    lines.push(data.tags.map((t) => `${t.kind}: ${t.name}`).join("; "));
  }

  if (data.memories.length) {
    lines.push("", "## Lo que Lumi sabe del usuario (memoria)");
    for (const m of data.memories.slice(-150)) lines.push(`- ${m.text}`);
  }
  return lines.join("\n");
}

export function chatSystemPrompt(data: LumiData, meetings: Meeting[]): string {
  const learn = data.settings.learn;
  return `Eres Lumi, un asistente personal de escritorio: amable, cálido y práctico. Hablas en español de México, en tono cercano, con respuestas breves y accionables (usa listas cortas solo si ayudan). Ayudas al usuario a organizar sus pendientes, reuniones y rutinas, y le sugieres qué hacer y en qué orden.

Usa SOLO la información del contexto y de la conversación; si te falta algo, dilo o pregunta. No inventes reuniones, personas ni datos.

Acciones especiales (al final de tu respuesta, sin mencionarlas ni explicarlas):
- Si el usuario te pide que le recuerdes algo, o acuerdan algo con fecha, agrega exactamente una línea:
<recordatorio>{"titulo": "texto corto en infinitivo", "fecha_hora": "AAAA-MM-DDTHH:MM", "etiquetas": [{"nombre": "...", "tipo": "cliente|proyecto"}]}</recordatorio>
- Si el usuario te pide cambiar tu apariencia (ropa, cabello, lentes, accesorios o colores), agrega exactamente una línea con SOLO los campos que cambian, por ejemplo:
<apariencia>{"lentes": "sol", "lentesColor": "dorado"}</apariencia>
Ids válidos:
${avatarCatalogText()}
Si pide algo que no existe, dile qué es lo más parecido y no agregues la línea. Nunca cambies tu apariencia si no te lo piden. Puedes mencionar tu look con naturalidad, sin insistir.
${
  learn
    ? `- Si el usuario te comparte un dato durable que valga la pena recordar en el futuro (sobre sus clientes, proyectos, contactos, preferencias, horarios o hábitos) y que NO esté ya en la memoria, agrega:
<recuerdo>el dato en una sola frase, en tercera persona</recuerdo>
Máximo un recuerdo por respuesta. No guardes datos sensibles (salud, contraseñas, números de cuentas o tarjetas).`
    : "- No propongas recuerdos nuevos: el usuario desactivó el aprendizaje."
}

# Contexto del usuario
${buildContext(data, meetings)}`;
}

export function parseAssistant(text: string): { clean: string; memory: string | null; reminder: PendingReminder | null; look: Record<string, unknown> | null } {
  let memory: string | null = null;
  let look: Record<string, unknown> | null = null;
  const ap = text.match(/<apariencia>([\s\S]*?)<\/apariencia>/);
  if (ap) {
    try {
      const obj = JSON.parse(ap[1].trim());
      if (obj && typeof obj === "object") look = obj;
    } catch {
      /* respuesta malformada: se ignora */
    }
  }
  let reminder: PendingReminder | null = null;
  const mem = text.match(/<recuerdo>([\s\S]*?)<\/recuerdo>/);
  if (mem) memory = mem[1].trim() || null;
  const rem = text.match(/<recordatorio>([\s\S]*?)<\/recordatorio>/);
  if (rem) {
    try {
      const obj = JSON.parse(rem[1].trim());
      if (obj && typeof obj.titulo === "string") reminder = obj;
    } catch {
      /* respuesta malformada: se ignora */
    }
  }
  const clean = text
    .replace(/<recuerdo>[\s\S]*?<\/recuerdo>/g, "")
    .replace(/<recordatorio>[\s\S]*?<\/recordatorio>/g, "")
    .replace(/<apariencia>[\s\S]*?<\/apariencia>/g, "")
    .trim();
  return { clean, memory, reminder, look };
}

/** Convierte "AAAA-MM-DDTHH:MM" (hora local) a ISO. */
export function localToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v.length === 16 ? v : v.slice(0, 16));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function tagsFromClaude(list: { nombre: string; tipo: string }[] | undefined): Tag[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && typeof t.nombre === "string" && t.nombre.trim())
    .map((t) => ({ name: t.nombre.trim(), kind: t.tipo === "proyecto" ? "proyecto" : "cliente" }));
}

/** Pide a Claude que entienda una nota rápida. Devuelve null si algo falla. */
export async function parseNoteWithClaude(data: LumiData, note: string, now = new Date()): Promise<ParsedNote | null> {
  const known = data.tags.map((t) => `${t.kind}: ${t.name}`).join("; ") || "(ninguno)";
  const mem = data.memories.slice(-60).map((m) => `- ${m.text}`).join("\n") || "(vacía)";
  const system = `Conviertes notas rápidas en español en recordatorios estructurados. Responde SOLO con un objeto JSON, sin texto adicional:
{"titulo": "acción corta y clara, empieza con verbo en infinitivo, sin la fecha ni la hora", "fecha_hora": "AAAA-MM-DDTHH:MM" o null, "etiquetas": [{"nombre": "...", "tipo": "cliente" | "proyecto"}], "contacto": "nombre de la persona" o null}

Reglas:
- Ahora es ${DAY_NAMES[now.getDay()]} ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${fmtTime(now)} (hora local).
- Interpreta expresiones como "hoy", "mañana", "el jueves", "antes de comer" (13:00), "en la tarde" (16:00), "al final del día" (18:00), "en 30 min".
- Si no hay fecha ni hora, propone una razonable para hoy (en ~1 hora) o mañana a las 9:00 si ya es tarde.
- "@Nombre" es un cliente y "#Nombre" un proyecto. Usa los clientes/proyectos conocidos si la nota o la memoria los relacionan (p. ej., si la persona mencionada trabaja con un cliente conocido).
- Clientes y proyectos conocidos: ${known}
- Memoria del usuario:
${mem}`;
  try {
    const text = await askClaude(data, system, [{ role: "user", content: note }], 400);
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) return null;
    const obj = JSON.parse(json[0]);
    if (!obj || typeof obj.titulo !== "string") return null;
    return {
      title: obj.titulo.trim(),
      remindAt: localToIso(obj.fecha_hora),
      tags: tagsFromClaude(obj.etiquetas),
      contact: typeof obj.contacto === "string" && obj.contacto.trim() ? obj.contacto.trim() : null,
      reason: "leído por Claude",
    };
  } catch (e) {
    console.warn("Claude no pudo leer la nota", e);
    return null;
  }
}
