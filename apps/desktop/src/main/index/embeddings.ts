/**
 * Embeddings locales con un modelo pequeño (multilingual-e5-small) que corre en
 * una ventana oculta ("cerebro") con transformers.js. No depende del proveedor de IA
 * y no cuesta nada. Si el modelo no carga, Lumi sigue con búsqueda por texto.
 */
import type { IndexDb } from "./db";
import { vecBuffer, EMBED_DIM } from "./db";
import { uid, log, errorText } from "../util";

export type BrainState = "apagada" | "cargando" | "lista" | "error";

type Pending = { resolve: (v: number[][]) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

export class BrainEmbedder {
  state: BrainState = "apagada";
  detail: string | null = null;
  private pending = new Map<string, Pending>();
  private sender: ((id: string, texts: string[]) => void) | null = null;

  /** El proceso principal registra cómo mandar trabajo a la ventana oculta. */
  attach(sender: (id: string, texts: string[]) => void): void {
    this.sender = sender;
  }

  setStatus(state: BrainState, detail?: string | null): void {
    this.state = state;
    this.detail = detail ?? null;
  }

  ready(): boolean {
    return this.state === "lista" && !!this.sender;
  }

  embed(texts: string[], timeoutMs = 120_000): Promise<number[][]> {
    if (!this.sender) return Promise.reject(new Error("El cerebro no está listo"));
    const id = uid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Tiempo de espera agotado al calcular embeddings"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.sender!(id, texts);
    });
  }

  resolve(id: string, vectors: number[][] | null, error: string | null): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (error || !vectors) p.reject(new Error(error ?? "sin resultado"));
    else p.resolve(vectors);
  }
}

/** Calcula en segundo plano los vectores de los fragmentos que aún no tienen. */
export class EmbeddingQueue {
  private running = false;
  private again = false;

  constructor(
    private idx: IndexDb,
    private brain: BrainEmbedder,
    private onProgress: () => void,
  ) {}

  kick(): void {
    if (!this.idx.vec) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    this.loop()
      .catch((e) => log.warn("embeddings:", errorText(e)))
      .finally(() => {
        this.running = false;
        if (this.again) {
          this.again = false;
          this.kick();
        }
      });
  }

  private async loop(): Promise<void> {
    const db = this.idx.db;
    const select = db.prepare(`
      SELECT c.id, c.text, c.heading, n.title FROM chunks c
      JOIN notes n ON n.path = c.path
      WHERE n.private = 0 AND c.id NOT IN (SELECT rowid FROM chunks_vec)
      LIMIT 16`);
    const insert = db.prepare("INSERT OR REPLACE INTO chunks_vec(rowid, embedding) VALUES (?, ?)");
    for (let round = 0; round < 10_000; round++) {
      if (!this.brain.ready()) return;
      const rows = select.all() as { id: number; text: string; heading: string | null; title: string }[];
      if (!rows.length) return;
      const texts = rows.map((r) => `passage: ${r.title}${r.heading ? ` · ${r.heading}` : ""}\n${r.text}`.slice(0, 2000));
      const vectors = await this.brain.embed(texts);
      db.transaction(() => {
        rows.forEach((r, i) => {
          const v = vectors[i];
          if (v && v.length === EMBED_DIM) insert.run(BigInt(r.id), vecBuffer(v));
        });
      })();
      this.onProgress();
    }
  }
}
