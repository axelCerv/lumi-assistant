import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Brain } from "../src/main/vault/brain";
import { BrainEmbedder } from "../src/main/index/embeddings";
import { EMBED_DIM } from "../src/main/index/db";

// "Modelo" falso: bolsa de palabras con sinónimos → vectores normalizados de 384 dimensiones
const SYN: Record<string, string> = { costo: "precio", tarifa: "precio", cuota: "precio", junta: "reunion" };
function fakeEmbed(text: string): number[] {
  const v = new Array(EMBED_DIM).fill(0);
  for (let w of text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)) {
    if (!w || w === "query" || w === "passage") continue;
    w = SYN[w] ?? w;
    let h = 0;
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % EMBED_DIM] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

let root = "";
let data = "";
let brain: Brain;
const embedder = new BrainEmbedder();

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "lumi-vec-"));
  data = mkdtempSync(path.join(tmpdir(), "lumi-vec-data-"));
  mkdirSync(path.join(root, "notas"), { recursive: true });
  writeFileSync(path.join(root, "notas/acme.md"), "# Acme\n\nAcordamos la tarifa mensual de mantenimiento.\n");
  writeFileSync(path.join(root, "notas/otra.md"), "# Viaje\n\nReservar hotel en Oaxaca.\n");
  embedder.attach((id, texts) => setTimeout(() => embedder.resolve(id, texts.map(fakeEmbed), null), 5));
  embedder.setStatus("lista");
  brain = new Brain(root, data, embedder, () => {});
  await brain.reindex();
  for (let i = 0; i < 50 && brain.indexer.stats().embedded < brain.indexer.stats().chunks; i++) await new Promise((r) => setTimeout(r, 50));
});

afterAll(async () => {
  await brain.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

describe("búsqueda semántica con sqlite-vec", () => {
  it("guarda un vector por fragmento", () => {
    expect(brain.idx.vec).toBe(true);
    const s = brain.indexer.stats();
    expect(s.embedded).toBe(s.chunks);
  });

  it("encuentra por significado aunque no coincida la palabra exacta", async () => {
    // "costo" no aparece en ninguna nota; el "modelo" lo relaciona con "tarifa"
    const hits = await brain.searcher.search("costo");
    expect(hits[0]?.path).toBe("notas/acme.md");
  });

  it("borra los vectores al cambiar una nota", async () => {
    writeFileSync(path.join(root, "notas/otra.md"), "# Viaje\n\nYa no hay viaje.\n\n## Otra sección\nMás texto.\n");
    await brain.indexer.indexFile("notas/otra.md");
    const n = (brain.idx.db.prepare("SELECT count(*) c FROM chunks_vec WHERE rowid NOT IN (SELECT id FROM chunks)").get() as { c: number }).c;
    expect(n).toBe(0);
  });
});
