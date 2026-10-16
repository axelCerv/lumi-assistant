/**
 * Contrato común: cualquier fuente de Granola (MCP, API o plugin) se convierte en
 * una nota de reunión con el mismo frontmatter, dentro de 02-Reuniones/AAAA/MM/.
 */
import { slugify } from "@lumi/shared";
import type { Brain } from "../vault/brain";
import { FOLDERS } from "../vault/structure";

export interface GranolaMeeting {
  id: string;
  title: string;
  /** ISO con zona horaria, o null si no se conoce */
  start: string | null;
  durationMin: number | null;
  attendees: string[];
  summary: string;
  notes: string;
  transcript: string | null;
}

function localIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${sign}${hh}:${mm}`;
}

export function meetingPath(m: GranolaMeeting): { rel: string; date: string } {
  const d = m.start ? new Date(m.start) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { rel: `${FOLDERS.reuniones}/${d.getFullYear()}/${p(d.getMonth() + 1)}/${date}-${slugify(m.title, 50)}.md`, date };
}

/** Guarda la reunión si no existe todavía. Devuelve la ruta creada o null si ya estaba. */
export async function writeMeeting(brain: Brain, m: GranolaMeeting): Promise<string | null> {
  if (brain.findByFrontmatter("granola_id", m.id)) return null;
  const { rel, date } = meetingPath(m);
  const fm: Record<string, unknown> = {
    type: "reunion",
    source: "granola",
    granola_id: m.id,
    title: m.title,
    date,
    ...(m.start ? { start: localIso(new Date(m.start)) } : {}),
    ...(m.durationMin ? { duration_min: m.durationMin } : {}),
    attendees: m.attendees.map((a) => `[[${a}]]`),
    tags: ["reunion"],
    lumi_procesada: false,
  };
  const body = [
    `# ${m.title}`,
    "",
    "## Resumen (Granola)",
    m.summary.trim() || "_Sin resumen._",
    "",
    "## Mis notas (Granola)",
    m.notes.trim() || "_Sin notas._",
    "",
    "## Lumi · Pendientes detectados",
    "_Lumi los agregará al procesar la reunión._",
    "",
    "## Lumi · Decisiones",
    "_Lumi las agregará al procesar la reunión._",
    "",
    "## Transcripción",
    m.transcript?.trim() || "_Sin transcripción._",
    "",
  ].join("\n");
  const created = await brain.vault.createNew(rel, fm, body);
  await brain.touch(created);
  return created;
}
