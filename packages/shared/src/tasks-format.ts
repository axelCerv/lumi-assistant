/**
 * Pendientes en el formato del plugin Tasks de Obsidian:
 *   - [ ] Enviar propuesta a [[Acme]] ⏰ 17:00 📅 2026-10-15 #cliente/acme
 *
 * ⏰ HH:MM es una extensión de Lumi para la hora del aviso. Va antes de 📅
 * para que el plugin Tasks siga reconociendo la fecha.
 */
import type { Tag, TaskDraft } from "./types.ts";
import { slugify } from "./slug.ts";

export const TASK_RE = /^(\s*)[-*+] \[([ xX/-])\] (.*)$/;

export interface ParsedTaskLine {
  indent: string;
  status: string;
  done: boolean;
  description: string;
  text: string;
  due: string | null;
  time: string | null;
  doneDate: string | null;
  scheduled: string | null;
  tags: string[];
  links: string[];
}

const DATE = "(\\d{4}-\\d{2}-\\d{2})";

export function parseTaskLine(line: string): ParsedTaskLine | null {
  const m = TASK_RE.exec(line);
  if (!m) return null;
  const [, indent, status, rest] = m;
  const pick = (emoji: string, pattern = DATE) => {
    const r = new RegExp(`${emoji}\\uFE0F?\\s*${pattern}`, "u");
    const x = r.exec(rest);
    return x ? x[1] : null;
  };
  const due = pick("📅");
  const doneDate = pick("✅");
  const scheduled = pick("⏳");
  const time = pick("⏰", "(\\d{1,2}:\\d{2})");
  const tags = [...rest.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((x) => x[1]);
  const links = [...rest.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((x) => x[1].trim());
  const text = rest
    .replace(/(?:📅|✅|⏳|🛫|➕|❌)️?\s*\d{4}-\d{2}-\d{2}/gu, "")
    .replace(/⏰️?\s*\d{1,2}:\d{2}/gu, "")
    .replace(/🔁️?[^📅✅⏳🛫➕⏰#]*/gu, "")
    .replace(/[🔺⏫🔼🔽⏬]️?/gu, "")
    .replace(/(?:^|\s)#[\p{L}\p{N}_/-]+/gu, "")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, "$1")
    .replace(/\s+·\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    indent,
    status,
    done: status === "x" || status === "X",
    description: rest,
    text,
    due,
    time: time ? time.padStart(5, "0") : null,
    doneDate,
    scheduled,
    tags,
    links,
  };
}

export function tagFor(tag: Tag): string {
  return `#${tag.kind}/${slugify(tag.name)}`;
}

/** Arma la línea de un pendiente nuevo a partir de un borrador. */
export function formatTaskLine(d: TaskDraft): string {
  let desc = d.title.trim();
  if (d.contact && !desc.toLowerCase().includes(d.contact.toLowerCase())) desc += ` · [[${d.contact}]]`;
  else if (d.contact) desc = desc.replace(new RegExp(`\\b${escapeRe(d.contact)}\\b`), `[[${d.contact}]]`);
  for (const t of d.tags) {
    if (!desc.includes(`[[${t.name}]]`)) {
      const re = new RegExp(`\\b${escapeRe(t.name)}\\b`, "i");
      desc = re.test(desc) ? desc.replace(re, (m) => (m === t.name ? `[[${t.name}]]` : `[[${t.name}|${m}]]`)) : `${desc} · [[${t.name}]]`;
    }
  }
  const parts = [`- [ ] ${desc}`];
  if (d.time && d.date) parts.push(`⏰ ${d.time}`);
  if (d.date) parts.push(`📅 ${d.date}`);
  const extra = (d.extraTags ?? []).map((t) => `#${t.replace(/^#/, "")}`);
  // La etiqueta del modo va primero, salvo que una etiqueta extra ya lo diga (#escuela/calculo)
  if (d.mode && !extra.some((t) => t === `#${d.mode}` || t.startsWith(`#${d.mode}/`))) parts.push(`#${d.mode}`);
  for (const t of d.tags) parts.push(tagFor(t));
  for (const t of extra) if (!parts.includes(t)) parts.push(t);
  return parts.join(" ");
}

/** Marca o desmarca una línea (como lo hace Obsidian Tasks). */
export function toggleTaskLine(line: string, today: string): string {
  const p = parseTaskLine(line);
  if (!p) return line;
  if (p.done) {
    return line.replace(/^(\s*[-*+] )\[[xX]\]/, "$1[ ]").replace(/\s*✅️?\s*\d{4}-\d{2}-\d{2}/u, "");
  }
  const checked = line.replace(/^(\s*[-*+] )\[[ /-]\]/, "$1[x]");
  // ✅ va antes de las etiquetas finales para no romper el formato de Tasks
  const tagTail = /((?:\s+#[\p{L}\p{N}_/-]+)+)\s*$/u.exec(checked);
  if (tagTail) return `${checked.slice(0, tagTail.index)} ✅ ${today}${tagTail[1]}`;
  return `${checked.trimEnd()} ✅ ${today}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
