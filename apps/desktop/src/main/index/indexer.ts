/**
 * Indexa el vault: notas, fragmentos por encabezado (FTS5), pendientes y enlaces.
 * Los vectores se calculan aparte, en segundo plano (embeddings.ts).
 */
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { parseTaskLine, TASK_RE } from "@lumi/shared";
import { parseNote, Vault, type Frontmatter } from "../vault/vault";
import { IgnoreRules } from "../vault/ignore";
import type { IndexDb } from "./db";
import { log } from "../util";

const MAX_CHUNK = 1400;
const MAX_CHUNKS_PER_NOTE = 250;

const FOLDER_TYPES: [string, string][] = [
  ["02-Reuniones", "reunion"],
  ["05-Clientes", "cliente"],
  ["04-Proyectos", "proyecto"],
  ["06-Personas", "persona"],
  ["07-Rutinas", "rutina"],
  ["01-Diario", "diario"],
  ["00-Inbox", "inbox"],
  ["03-Pendientes", "pendientes"],
  ["90-Lumi/memoria", "memoria"],
  ["90-Lumi/resumenes", "resumen"],
  ["90-Lumi/modos", "modo"],
  ["20-Personal/Listas", "lista"],
  ["99-Plantillas", "plantilla"],
];

export function noteType(rel: string, fm: Frontmatter, body = ""): string {
  // Las plantillas nunca cuentan como clientes, rutinas, etc.
  if (rel.startsWith("99-Plantillas/") || /\{\{\s*title\s*\}\}/.test(body) || /\{\{\s*title\s*\}\}/.test(String(fm.title ?? ""))) return "plantilla";
  if (typeof fm.type === "string" && fm.type) return fm.type;
  return FOLDER_TYPES.find(([f]) => rel.startsWith(`${f}/`))?.[1] ?? "nota";
}

export function noteTitle(rel: string, fm: Frontmatter, body: string): string {
  if (typeof fm.title === "string" && fm.title.trim()) return fm.title.trim();
  const h = /^#\s+(.+)$/m.exec(body);
  if (h) return h[1].trim();
  return rel.split("/").pop()!.replace(/\.md$/, "");
}

function linksIn(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((m) => m[1].trim());
}

function tagsIn(fm: Frontmatter, body: string): string[] {
  const out = new Set<string>();
  const fmTags = Array.isArray(fm.tags) ? fm.tags : typeof fm.tags === "string" ? fm.tags.split(/[,\s]+/) : [];
  for (const t of fmTags) if (typeof t === "string" && t) out.add(t.replace(/^#/, ""));
  // Las etiquetas de los pendientes son de cada pendiente, no de la nota (una lista puede mezclar modos)
  const text = body
    .split(/\r?\n/)
    .filter((l) => !TASK_RE.test(l))
    .join("\n");
  for (const m of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) if (!/^\d+$/.test(m[1])) out.add(m[1]);
  return [...out];
}

/** Trocea una nota por encabezados; los bloques largos se parten por párrafos. */
export function chunkNote(body: string): { heading: string | null; text: string }[] {
  const sections: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];
  for (const line of body.split(/\r?\n/)) {
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) sections.push({ heading: h[2].trim(), lines: [] });
    else sections[sections.length - 1].lines.push(line);
  }
  const out: { heading: string | null; text: string }[] = [];
  for (const s of sections) {
    const text = s.lines.join("\n").trim();
    if (!text) continue;
    if (text.length <= MAX_CHUNK) {
      out.push({ heading: s.heading, text });
      continue;
    }
    let buf = "";
    for (const para of text.split(/\n{2,}/)) {
      if (buf && buf.length + para.length > MAX_CHUNK) {
        out.push({ heading: s.heading, text: buf.trim() });
        buf = "";
      }
      if (para.length > MAX_CHUNK) {
        for (let i = 0; i < para.length; i += MAX_CHUNK) out.push({ heading: s.heading, text: para.slice(i, i + MAX_CHUNK) });
      } else buf += `${para}\n\n`;
    }
    if (buf.trim()) out.push({ heading: s.heading, text: buf.trim() });
  }
  return out.slice(0, MAX_CHUNKS_PER_NOTE);
}

export function taskKey(rel: string, text: string, occurrence: number): string {
  return createHash("sha1").update(`${rel}\u0000${text}\u0000${occurrence}`).digest("hex").slice(0, 16);
}

function dateOf(rel: string, fm: Frontmatter): string | null {
  if (typeof fm.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(fm.date)) return fm.date.slice(0, 10);
  const m = /(\d{4}-\d{2}-\d{2})/.exec(rel.split("/").pop() ?? "");
  return m ? m[1] : null;
}

export class Indexer {
  constructor(
    private vault: Vault,
    private ignore: IgnoreRules,
    private idx: IndexDb,
  ) {}

  private get db() {
    return this.idx.db;
  }

  async fullScan(onProgress?: (done: number, total: number) => void): Promise<{ changed: number }> {
    await this.ignore.load();
    const files = (await this.vault.listMarkdown("")).filter((f) => !this.ignore.isIgnored(f));
    const known = new Map(
      (this.db.prepare("SELECT path, mtime FROM notes").all() as { path: string; mtime: number }[]).map((r) => [r.path, r.mtime]),
    );
    const present = new Set(files);
    let changed = 0;
    for (const p of known.keys()) if (!present.has(p)) this.remove(p);
    for (let i = 0; i < files.length; i++) {
      const rel = files[i];
      try {
        const st = await fs.stat(this.vault.abs(rel));
        if (known.get(rel) !== st.mtimeMs) {
          await this.indexFile(rel, st.mtimeMs);
          changed++;
        }
      } catch (e) {
        log.warn("No pude indexar", rel, e);
      }
      if (onProgress && (i % 20 === 0 || i === files.length - 1)) onProgress(i + 1, files.length);
    }
    return { changed };
  }

  async indexFile(rel: string, mtime?: number): Promise<void> {
    if (!rel.endsWith(".md") || this.ignore.isIgnored(rel)) return;
    let raw: string;
    try {
      raw = await fs.readFile(this.vault.abs(rel), "utf8");
      mtime ??= (await fs.stat(this.vault.abs(rel))).mtimeMs;
    } catch {
      this.remove(rel);
      return;
    }
    const { fm, body } = parseNote(raw);
    const title = noteTitle(rel, fm, body);
    const type = noteType(rel, fm, body);
    const isPrivate = fm.lumi === "privado" || fm.lumi === "private";
    const fmLinks = linksIn(JSON.stringify(fm));
    const links = [...new Set([...fmLinks, ...linksIn(body)])];
    const tags = tagsIn(fm, body);
    const aliases = Array.isArray(fm.aliases) ? fm.aliases.filter((a): a is string => typeof a === "string") : [];
    const isLumi = typeof fm.source === "string" && (fm.source === "lumi" || fm.source === "granola");
    const chunks = type === "plantilla" ? [] : chunkNote(body);

    const lines = raw.split(/\r?\n/);
    const seen = new Map<string, number>();
    const tasks: unknown[][] = [];
    if (type !== "plantilla") {
      lines.forEach((line, i) => {
        const t = parseTaskLine(line);
        if (!t || !t.text) return;
        const occ = seen.get(t.text) ?? 0;
        seen.set(t.text, occ + 1);
        tasks.push([
          taskKey(rel, t.text, occ),
          rel,
          i,
          line,
          t.text,
          t.done ? 1 : 0,
          t.due,
          t.time,
          t.doneDate,
          JSON.stringify(t.tags),
          JSON.stringify(t.links),
          isPrivate ? 1 : 0,
          isLumi ? 1 : 0,
        ]);
      });
    }

    const tx = this.db.transaction(() => {
      this.removeRows(rel);
      this.db
        .prepare("INSERT INTO notes(path,title,type,folder,date,mtime,private,fm,tags,links,aliases) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(rel, title, type, rel.split("/")[0], dateOf(rel, fm), mtime, isPrivate ? 1 : 0, JSON.stringify(fm), JSON.stringify(tags), JSON.stringify(links), JSON.stringify(aliases));
      const insChunk = this.db.prepare("INSERT INTO chunks(path, ord, heading, text) VALUES (?,?,?,?)");
      const insFts = this.db.prepare("INSERT INTO chunks_fts(rowid, title, heading, text) VALUES (?,?,?,?)");
      chunks.forEach((c, i) => {
        const r = insChunk.run(rel, i, c.heading, c.text);
        insFts.run(r.lastInsertRowid, title, c.heading ?? "", c.text);
      });
      const insTask = this.db.prepare(
        "INSERT OR REPLACE INTO tasks(key,path,line,raw,text,done,due,time,done_date,tags,links,private,lumi) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      for (const t of tasks) insTask.run(...t);
      const insLink = this.db.prepare("INSERT INTO links(src, dst) VALUES (?, ?)");
      for (const l of links) insLink.run(rel, l.toLowerCase());
    });
    tx();
  }

  private removeRows(rel: string): void {
    const ids = (this.db.prepare("SELECT id FROM chunks WHERE path = ?").all(rel) as { id: number }[]).map((r) => r.id);
    const delFts = this.db.prepare("DELETE FROM chunks_fts WHERE rowid = ?");
    const delVec = this.idx.vec ? this.db.prepare("DELETE FROM chunks_vec WHERE rowid = ?") : null;
    for (const id of ids) {
      delFts.run(id);
      delVec?.run(BigInt(id));
    }
    this.db.prepare("DELETE FROM chunks WHERE path = ?").run(rel);
    this.db.prepare("DELETE FROM notes WHERE path = ?").run(rel);
    this.db.prepare("DELETE FROM tasks WHERE path = ?").run(rel);
    this.db.prepare("DELETE FROM links WHERE src = ?").run(rel);
  }

  remove(rel: string): void {
    this.db.transaction(() => this.removeRows(rel))();
  }

  stats(): { notes: number; chunks: number; embedded: number } {
    const n = (sql: string) => (this.db.prepare(sql).get() as { c: number }).c;
    return {
      notes: n("SELECT count(*) c FROM notes"),
      chunks: n("SELECT count(*) c FROM chunks"),
      embedded: this.idx.vec ? n("SELECT count(*) c FROM chunks_vec") : 0,
    };
  }
}
