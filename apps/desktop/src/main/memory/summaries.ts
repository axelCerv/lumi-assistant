/**
 * Resúmenes periódicos (semanal y mensual) en 90-Lumi/resumenes/.
 * Mantienen el contexto largo barato: la IA lee el resumen en vez de todo el mes.
 */
import { addDays, dayKey, enabledModes, MONTHS, startOfDay } from "@lumi/shared";
import { getSettings } from "../settings";
import type { Brain } from "../vault/brain";
import { FOLDERS } from "../vault/structure";
import { requireProvider } from "../llm/provider";

function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { year, week };
}

export function periodFor(kind: "semanal" | "mensual", ref = new Date()): { from: string; to: string; rel: string; title: string } {
  if (kind === "semanal") {
    // Semana anterior completa (lunes a domingo)
    const dow = (ref.getDay() + 6) % 7;
    const thisMonday = addDays(startOfDay(ref), -dow);
    const from = addDays(thisMonday, -7);
    const to = addDays(thisMonday, -1);
    const { year, week } = isoWeek(from);
    const id = `${year}-S${String(week).padStart(2, "0")}`;
    return { from: dayKey(from), to: dayKey(to), rel: `${FOLDERS.resumenes}/${id}.md`, title: `Resumen semanal ${id}` };
  }
  const first = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const last = new Date(ref.getFullYear(), ref.getMonth(), 0);
  const id = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`;
  return { from: dayKey(first), to: dayKey(last), rel: `${FOLDERS.resumenes}/${id}.md`, title: `Resumen de ${MONTHS[first.getMonth()]} ${first.getFullYear()}` };
}

export async function generateSummary(brain: Brain, kind: "semanal" | "mensual", ref = new Date()): Promise<string> {
  const provider = requireProvider();
  const p = periodFor(kind, ref);
  const notes = brain.notesBetween(p.from, p.to, ["diario", "reunion", "inbox", "nota"]);
  const budget = kind === "semanal" ? 40_000 : 60_000;
  const per = Math.max(1200, Math.floor(budget / Math.max(1, notes.length)));
  let material = "";
  for (const n of notes) {
    const r = await brain.readForAI(n.path);
    if (!r) continue;
    material += `\n\n### ${n.title} (${n.type}, ${n.date})\n${r.text.slice(0, per)}`;
    if (material.length > budget) break;
  }
  const done = brain
    .tasks({ includeDone: true })
    .filter((t) => t.done && t.doneDate && t.doneDate >= p.from && t.doneDate <= p.to && !t.private)
    .map((t) => `- ${t.text}${t.mode ? ` [${t.mode}]` : ""}`);
  const open = brain
    .tasks()
    .filter((t) => !t.done && !t.private)
    .slice(0, 40)
    .map((t) => `- ${t.text}${t.due ? ` (${t.due})` : ""}${t.mode ? ` [${t.mode}]` : ""}`);
  const modes = enabledModes(getSettings().modes);
  const byMode =
    modes.length > 1
      ? `\n## Por modo\n(una o dos líneas por cada modo: ${modes.map((m) => `${m.nombre} ${m.icono}`).join(", ")}; los pendientes llevan su modo entre corchetes)`
      : "";
  if (kind === "mensual") {
    for (const s of brain.summaries().filter((x) => x.kind === "semanal" && x.date >= p.from && x.date <= p.to)) {
      const r = await brain.readForAI(s.path);
      if (r) material += `\n\n### ${s.title}\n${r.text.slice(0, 4000)}`;
    }
  }

  const system = `Escribes resúmenes ${kind === "semanal" ? "semanales" : "mensuales"} para el vault de Obsidian del usuario, en español y en Markdown.
Estructura exacta:
## En pocas palabras
(3–5 líneas)
## Reuniones y acuerdos
## Clientes y proyectos
(enlaza con [[Nombre]] los clientes, proyectos y personas)
## Hecho
## Sigue pendiente
## Para la próxima ${kind === "semanal" ? "semana" : "etapa"}
(2–4 sugerencias concretas)${byMode}
No inventes nada que no esté en el material.`;
  const user = `Periodo: ${p.from} a ${p.to}\n\n# Material${material || "\n(sin notas con fecha en este periodo)"}\n\n# Pendientes completados\n${done.join("\n") || "(ninguno registrado)"}\n\n# Pendientes abiertos\n${open.join("\n") || "(ninguno)"}`;
  const r = await provider.chat({ system, messages: [{ role: "user", content: user }], profile: "inteligente", maxTokens: 2500 });
  await brain.vault.writeLumi(p.rel, { type: "resumen", periodo: kind, desde: p.from, hasta: p.to, date: p.to }, `# ${p.title}\n\n${r.text.trim()}\n`);
  await brain.touch(p.rel);
  return p.rel;
}
