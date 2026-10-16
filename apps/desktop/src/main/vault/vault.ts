/**
 * Lectura y escritura del vault con las reglas de convivencia:
 * - Lumi nunca sobrescribe texto del usuario.
 * - Solo crea archivos nuevos, agrega secciones "## Lumi · …" o edita archivos con
 *   `source: lumi` (o importados por Lumi, como las reuniones de Granola).
 * - Escrituras atómicas (temporal + renombrado).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { writeFileAtomic, exists } from "../util";

export type Frontmatter = Record<string, unknown>;

export interface NoteFile {
  rel: string;
  fm: Frontmatter;
  body: string;
  raw: string;
}

/** Fuentes que Lumi considera "suyas" (puede editar su frontmatter y contenido). */
const LUMI_SOURCES = new Set(["lumi", "granola"]);

export class VaultError extends Error {}

/** gray-matter convierte fechas YAML en Date; aquí se regresan a texto. */
function normalizeValue(v: unknown): unknown {
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizeValue(x)]));
  return v;
}

export function parseNote(raw: string): { fm: Frontmatter; body: string } {
  try {
    const m = matter(raw, {});
    return { fm: normalizeValue(m.data) as Frontmatter, body: m.content };
  } catch {
    // frontmatter con YAML inválido: se trata como texto normal
    return { fm: {}, body: raw };
  }
}

/** Separa el bloque de frontmatter tal cual está escrito (para no reformatearlo). */
export function splitRaw(raw: string): { head: string; body: string } {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw);
  return m ? { head: m[0], body: raw.slice(m[0].length) } : { head: "", body: raw };
}

export function stringifyNote(fm: Frontmatter, body: string): string {
  const clean = Object.fromEntries(Object.entries(fm).filter(([, v]) => v !== undefined));
  if (!Object.keys(clean).length) return body;
  return matter.stringify(body.startsWith("\n") ? body : `\n${body}`, clean);
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export class Vault {
  constructor(public readonly root: string) {}

  get name(): string {
    return path.basename(this.root);
  }

  abs(rel: string): string {
    const p = path.resolve(this.root, rel);
    if (p !== this.root && !p.startsWith(this.root + path.sep)) throw new VaultError(`Ruta fuera del vault: ${rel}`);
    return p;
  }

  rel(abs: string): string {
    return path.relative(this.root, abs).split(path.sep).join("/");
  }

  async exists(rel: string): Promise<boolean> {
    return exists(this.abs(rel));
  }

  async read(rel: string): Promise<NoteFile | null> {
    try {
      const raw = await fs.readFile(this.abs(rel), "utf8");
      const { fm, body } = parseNote(raw);
      return { rel, fm, body, raw };
    } catch {
      return null;
    }
  }

  isLumiOwned(fm: Frontmatter): boolean {
    return typeof fm.source === "string" && LUMI_SOURCES.has(fm.source);
  }

  /** Crea un archivo nuevo. Si ya existe, usa "Nombre (2).md". Devuelve la ruta final. */
  async createNew(rel: string, fm: Frontmatter, body: string): Promise<string> {
    let target = rel;
    const ext = path.posix.extname(rel);
    const base = rel.slice(0, -ext.length || undefined);
    for (let i = 2; await this.exists(target); i++) target = `${base} (${i})${ext}`;
    const data = { ...fm, updated: fm.updated ?? nowIso() };
    await writeFileAtomic(this.abs(target), stringifyNote(data, body));
    return target;
  }

  /** Crea el archivo solo si no existe (no hace nada si ya está). */
  async createIfMissing(rel: string, fm: Frontmatter, body: string): Promise<boolean> {
    if (await this.exists(rel)) return false;
    await writeFileAtomic(this.abs(rel), stringifyNote(fm, body));
    return true;
  }

  /** Escribe un archivo de Lumi. Falla si existe y no es de Lumi. */
  async writeLumi(rel: string, fm: Frontmatter, body: string): Promise<void> {
    const cur = await this.read(rel);
    if (cur && !this.isLumiOwned(cur.fm)) throw new VaultError(`«${rel}» es tuyo; Lumi no lo sobrescribe.`);
    await writeFileAtomic(this.abs(rel), stringifyNote({ ...fm, source: fm.source ?? "lumi", updated: nowIso() }, body));
  }

  /** Agrega texto al final de un archivo de Lumi (lo crea si no existe). */
  async appendLumi(rel: string, text: string, init: { fm: Frontmatter; body: string }): Promise<void> {
    const cur = await this.read(rel);
    if (!cur) {
      const body = `${init.body.replace(/\s*$/, "")}\n\n${text}\n`;
      await writeFileAtomic(this.abs(rel), stringifyNote({ ...init.fm, source: "lumi", updated: nowIso() }, body));
      return;
    }
    if (!this.isLumiOwned(cur.fm)) throw new VaultError(`«${rel}» es tuyo; Lumi no lo modifica.`);
    const trimmed = cur.body.replace(/\s*$/, "");
    const lastLine = trimmed.split("\n").pop() ?? "";
    // Línea en blanco entre un párrafo y la lista; las listas siguen pegadas
    const sep = /^\s*[-*+] /.test(lastLine) || !trimmed ? "\n" : "\n\n";
    const body = `${trimmed}${sep}${text}\n`;
    await writeFileAtomic(this.abs(rel), stringifyNote({ ...cur.fm, updated: nowIso() }, body));
  }

  /**
   * Agrega o reemplaza una sección "## Lumi · <título>" en cualquier nota.
   * Solo toca esa sección; el resto del texto queda igual.
   */
  async upsertLumiSection(rel: string, title: string, content: string): Promise<void> {
    const cur = await this.read(rel);
    if (!cur) throw new VaultError(`No existe «${rel}»`);
    const owned = this.isLumiOwned(cur.fm);
    // En archivos tuyos se trabaja sobre el texto exacto (el encabezado no se reformatea)
    const { head, body: rawBody } = splitRaw(cur.raw);
    const source = owned ? cur.body : rawBody;
    const heading = `## Lumi · ${title}`;
    const lines = source.split("\n");
    const start = lines.findIndex((l) => l.trim() === heading);
    let body: string;
    if (start === -1) {
      body = `${source.replace(/\s*$/, "")}\n\n${heading}\n${content.trim()}\n`;
    } else {
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) {
        if (/^#{1,2} /.test(lines[i])) {
          end = i;
          break;
        }
      }
      const next = [...lines.slice(0, start + 1), content.trim(), "", ...lines.slice(end)];
      body = next.join("\n").replace(/\n{3,}/g, "\n\n");
    }
    if (owned) await writeFileAtomic(this.abs(rel), stringifyNote({ ...cur.fm, updated: nowIso() }, body));
    else await writeFileAtomic(this.abs(rel), head + body);
  }

  /** Cambia claves del frontmatter de un archivo de Lumi (o de una rutina, si el usuario lo pide). */
  async setFrontmatter(rel: string, patch: Frontmatter, opts: { userRequested?: boolean } = {}): Promise<void> {
    const cur = await this.read(rel);
    if (!cur) throw new VaultError(`No existe «${rel}»`);
    if (!this.isLumiOwned(cur.fm) && !opts.userRequested) throw new VaultError(`«${rel}» es tuyo; Lumi no cambia su encabezado.`);
    const fm = { ...cur.fm, ...patch };
    if (this.isLumiOwned(cur.fm)) fm.updated = nowIso();
    await writeFileAtomic(this.abs(rel), stringifyNote(fm, cur.body));
  }

  /**
   * Reemplaza una línea concreta (por ejemplo, marcar un pendiente que tú tocaste).
   * Verifica que la línea siga siendo la esperada para no pisar ediciones recientes.
   */
  async replaceLine(rel: string, lineNo: number, expected: string, replacement: string | null): Promise<void> {
    const raw = await fs.readFile(this.abs(rel), "utf8");
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const lines = raw.split(/\r?\n/);
    let idx = lineNo;
    if (lines[idx] !== expected) {
      idx = lines.findIndex((l) => l === expected);
      if (idx === -1) throw new VaultError("La nota cambió mientras tanto; vuelve a intentarlo.");
    }
    if (replacement === null) lines.splice(idx, 1);
    else lines[idx] = replacement;
    await writeFileAtomic(this.abs(rel), lines.join(eol));
  }

  async deleteLumiFile(rel: string): Promise<void> {
    const cur = await this.read(rel);
    if (!cur) return;
    if (!this.isLumiOwned(cur.fm)) throw new VaultError(`«${rel}» es tuyo; Lumi no lo borra.`);
    await fs.rm(this.abs(rel));
  }

  async listMarkdown(dirRel: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (d: string) => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(this.abs(d), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const r = d ? `${d}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(r);
        else if (e.name.endsWith(".md")) out.push(r);
      }
    };
    await walk(dirRel);
    return out;
  }
}
