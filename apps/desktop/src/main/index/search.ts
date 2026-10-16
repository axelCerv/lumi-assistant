/**
 * Recuperación híbrida: texto (FTS5) + similitud semántica (vectores) +
 * recencia + cercanía en el grafo de enlaces (mismo cliente/persona/proyecto).
 */
import type { SearchHit } from "@lumi/shared";
import { stripAccents } from "@lumi/shared";
import type { IndexDb } from "./db";
import { vecBuffer } from "./db";
import type { BrainEmbedder } from "./embeddings";
import { log, errorText } from "../util";

const STOP = new Set(
  "a al ante como con de del el ella en entre es esta este la las le les lo los me mi mis mas para pero por que qué se si sin sobre su sus te tu un una uno y ya yo cual cuál cuando cuándo donde dónde quien quién hay fue eso esa ese".split(" "),
);

function ftsQuery(q: string): string | null {
  const words = stripAccents(q)
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return null;
  return [...new Set(words)].map((w) => `"${w}"*`).join(" OR ");
}

function recencyBoost(date: string | null, mtime: number): number {
  const t = date ? new Date(date).getTime() : mtime;
  if (!t || isNaN(t)) return 0;
  const days = Math.max(0, (Date.now() - t) / 86400000);
  return Math.exp(-days / 45); // vida media ~1 mes
}

export interface SearchOptions {
  k?: number;
  includePrivate?: boolean;
  /** Filtro por nota (p. ej. solo lo del modo activo y lo compartido). */
  filter?: (note: { path: string; fm: Record<string, unknown>; tags: string[] }) => boolean;
}

export class Searcher {
  constructor(
    private idx: IndexDb,
    private brain: BrainEmbedder,
  ) {}

  /** Nombres de entidades (clientes, personas, proyectos) mencionados en la consulta. */
  private entitiesIn(query: string): string[] {
    const q = stripAccents(query).toLowerCase();
    const rows = this.idx.db
      .prepare("SELECT title, aliases FROM notes WHERE type IN ('cliente','proyecto','persona')")
      .all() as { title: string; aliases: string }[];
    const out: string[] = [];
    for (const r of rows) {
      const names = [r.title, ...(JSON.parse(r.aliases || "[]") as string[])];
      if (names.some((n) => n && n.length > 2 && q.includes(stripAccents(n).toLowerCase()))) out.push(r.title.toLowerCase());
    }
    return out;
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    const k = opts.k ?? 8;
    const db = this.idx.db;
    const scores = new Map<number, { fts: number; vec: number }>();

    const fq = ftsQuery(query);
    if (fq) {
      try {
        const rows = db
          .prepare("SELECT rowid AS id, bm25(chunks_fts, 4.0, 2.0, 1.0) AS s FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY s LIMIT 50")
          .all(fq) as { id: number; s: number }[];
        if (rows.length) {
          const best = Math.min(...rows.map((r) => r.s));
          const worst = Math.max(...rows.map((r) => r.s));
          for (const r of rows) {
            const norm = worst === best ? 1 : (worst - r.s) / (worst - best); // bm25: menor = mejor
            scores.set(r.id, { fts: 0.3 + 0.7 * norm, vec: 0 });
          }
        }
      } catch (e) {
        log.warn("FTS:", errorText(e));
      }
    }

    if (this.idx.vec && this.brain.ready()) {
      try {
        const [qv] = await this.brain.embed([`query: ${query}`], 20_000);
        const rows = db
          .prepare("SELECT rowid AS id, distance FROM chunks_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 40")
          .all(vecBuffer(qv)) as { id: number | bigint; distance: number }[];
        for (const r of rows) {
          const id = Number(r.id);
          const sim = Math.max(0, 1 - r.distance / 2); // vectores normalizados: distancia L2 en [0, 2]
          const cur = scores.get(id) ?? { fts: 0, vec: 0 };
          cur.vec = sim;
          scores.set(id, cur);
        }
      } catch (e) {
        log.warn("búsqueda semántica:", errorText(e));
      }
    }

    if (!scores.size) return [];
    const ids = [...scores.keys()];
    const meta = db
      .prepare(
        `SELECT c.id, c.path, c.heading, c.text, n.title, n.date, n.mtime, n.private, n.links, n.fm, n.tags
         FROM chunks c JOIN notes n ON n.path = c.path WHERE c.id IN (${ids.map(() => "?").join(",")})`,
      )
      .all(...ids) as {
      id: number;
      path: string;
      heading: string | null;
      text: string;
      title: string;
      date: string | null;
      mtime: number;
      private: number;
      links: string;
      fm: string;
      tags: string;
    }[];

    const entities = this.entitiesIn(query);
    const hasVec = [...scores.values()].some((s) => s.vec > 0);
    const hits: SearchHit[] = [];
    const allowed = new Map<string, boolean>();
    const ok = (m: (typeof meta)[number]) => {
      if (!opts.filter) return true;
      if (!allowed.has(m.path)) allowed.set(m.path, opts.filter({ path: m.path, fm: JSON.parse(m.fm || "{}"), tags: JSON.parse(m.tags || "[]") }));
      return allowed.get(m.path)!;
    };
    for (const m of meta) {
      if (m.private && !opts.includePrivate) continue;
      if (!ok(m)) continue;
      const s = scores.get(m.id)!;
      const base = hasVec ? 0.55 * s.fts + 0.45 * s.vec : s.fts;
      const links = (JSON.parse(m.links || "[]") as string[]).map((l) => l.toLowerCase());
      const graph = entities.some((e) => links.includes(e) || m.title.toLowerCase() === e) ? 1 : 0;
      const score = base + 0.15 * recencyBoost(m.date, m.mtime) + 0.12 * graph;
      hits.push({
        path: m.path,
        title: m.title,
        heading: m.heading,
        snippet: m.text.length > 700 ? `${m.text.slice(0, 700)}…` : m.text,
        score,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    // Máximo 2 fragmentos por nota para variar las fuentes
    const perNote = new Map<string, number>();
    return hits
      .filter((h) => {
        const c = perNote.get(h.path) ?? 0;
        perNote.set(h.path, c + 1);
        return c < 2;
      })
      .slice(0, k);
  }
}
