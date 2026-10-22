import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Brain } from "../src/main/vault/brain";
import { BrainEmbedder } from "../src/main/index/embeddings";
import { installStructure, FILES } from "../src/main/vault/structure";
import { writeMeeting } from "../src/main/granola/mapper";

let root: string;
let data: string;
let brain: Brain;

function write(rel: string, text: string) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "lumi-brain-"));
  data = mkdtempSync(path.join(tmpdir(), "lumi-data-"));
  await installStructure(root);
  write("05-Clientes/Acme.md", "---\ntype: cliente\naliases: [ACME Corp]\n---\n# Acme\n\nCliente de consultoría. Renueva contrato en enero.\n");
  write(
    "02-Reuniones/2026/10/2026-10-06-revision-acme.md",
    "---\ntype: reunion\ntitle: Revisión trimestral Acme\ndate: 2026-10-06\ncliente: \"[[Acme]]\"\n---\n# Revisión trimestral Acme\n\n## Resumen\nAcordamos bajar el precio del mantenimiento a 12 mil pesos y entregar el rediseño en noviembre.\n\n## Pendientes\n- [ ] Enviar propuesta corregida a [[Acme]] ⏰ 10:00 📅 2026-10-15 #cliente/acme\n- [x] Agendar llamada ✅ 2026-10-07\n",
  );
  write("08-Conocimiento/Secreto.md", "---\nlumi: privado\n---\n# Secreto\n\nLa contraseña del wifi es pato123 y el precio especial.\n");
  write("Personal/diario-intimo.md", "# Diario\n\nprecio de las cosas que nadie debe leer\n");
  writeFileSync(path.join(root, ".lumiignore"), "Personal/\n");
  brain = new Brain(root, data, new BrainEmbedder(), () => {});
  await brain.reindex();
});

afterEach(async () => {
  await brain.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

describe("índice y búsqueda", () => {
  it("indexa notas y encuentra por texto (con o sin acentos)", async () => {
    const hits = await brain.searcher.search("¿qué quedé con Acme sobre el precio?");
    expect(hits[0].path).toContain("revision-acme");
    expect(hits.some((h) => h.path.includes("Secreto"))).toBe(false); // privada
    expect(hits.some((h) => h.path.startsWith("Personal/"))).toBe(false); // .lumiignore
    const accent = await brain.searcher.search("revision trimestral");
    expect(accent[0].title).toBe("Revisión trimestral Acme");
  });

  it("las notas privadas no se leen para la IA", async () => {
    expect(await brain.readForAI("08-Conocimiento/Secreto.md")).toBeNull();
    expect(await brain.readForAI("Personal/diario-intimo.md")).toBeNull();
    expect((await brain.readForAI("05-Clientes/Acme.md"))?.title).toBe("Acme");
  });

  it("detecta pendientes en cualquier nota y su cliente", () => {
    const tasks = brain.tasks({ includeDone: true });
    const t = tasks.find((x) => x.text.startsWith("Enviar propuesta"))!;
    expect(t.due).toBe("2026-10-15");
    expect(t.time).toBe("10:00");
    expect(t.tags).toEqual([{ kind: "cliente", name: "Acme" }]);
    expect(t.lumiFile).toBe(false);
    expect(new Date(t.remindAt!).getHours()).toBe(10);
    expect(tasks.find((x) => x.text === "Agendar llamada")?.done).toBe(true);
  });

  it("entidades: clientes con alias", () => {
    expect(brain.entities()).toEqual([{ name: "Acme", kind: "cliente", path: "05-Clientes/Acme.md", slug: "acme", origin: "vault" }]);
  });
});

describe("pendientes creados por Lumi", () => {
  it("crea, edita, marca y borra en 03-Pendientes y crea la nota del cliente", async () => {
    const key = await brain.createTask({ title: "Mandar factura", date: "2026-10-20", time: "11:00", tags: [{ kind: "cliente", name: "Grupo Norte" }], contact: null });
    expect(key).toBeTruthy();
    expect(readFileSync(path.join(root, FILES.pendientes), "utf8")).toContain("- [ ] Mandar factura · [[Grupo Norte]] ⏰ 11:00 📅 2026-10-20 #cliente/grupo-norte");
    expect(readFileSync(path.join(root, "05-Clientes/Grupo Norte.md"), "utf8")).toContain("type: cliente");

    const k2 = await brain.updateTask(key, { title: "Mandar factura de octubre", date: "2026-10-21", time: null, tags: [{ kind: "cliente", name: "Grupo Norte" }], contact: null });
    let t = brain.task(k2)!;
    expect(t.due).toBe("2026-10-21");

    await brain.toggleTask(k2);
    t = brain.tasks({ includeDone: true }).find((x) => x.text.startsWith("Mandar factura de octubre"))!;
    expect(t.done).toBe(true);
    await brain.deleteTask(t.key);
    expect(readFileSync(path.join(root, FILES.pendientes), "utf8")).not.toContain("Mandar factura");
  });

  it("no borra pendientes que viven en notas del usuario", async () => {
    const t = brain.tasks().find((x) => x.text.startsWith("Enviar propuesta"))!;
    await expect(brain.deleteTask(t.key)).rejects.toThrow(/Obsidian/);
  });

  it("marca un pendiente de una nota del usuario solo en su línea", async () => {
    const t = brain.tasks().find((x) => x.text.startsWith("Enviar propuesta"))!;
    await brain.toggleTask(t.key);
    const text = readFileSync(path.join(root, t.path), "utf8");
    expect(text).toMatch(/- \[x\] Enviar propuesta corregida a \[\[Acme\]\] ⏰ 10:00 📅 2026-10-15 ✅ \d{4}-\d{2}-\d{2} #cliente\/acme/);
    expect(text).toContain("Acordamos bajar el precio");
  });
});

describe("memoria, rutinas e inbox", () => {
  it("guarda hechos confirmados y los lista", async () => {
    await brain.addFact("Acme renueva en enero", "Acme", "[[2026-10-13]]");
    const f = brain.facts().find((x) => x.topic === "Acme")!;
    expect(f.text).toBe("Acme renueva en enero");
    expect(f.origin).toBe("[[2026-10-13]]");
    await brain.deleteFact(f.path, f.line);
    expect(brain.facts().some((x) => x.text === "Acme renueva en enero")).toBe(false);
  });

  it("crea rutinas en 07-Rutinas y las lee", async () => {
    const rel = await brain.createRoutine({ title: "Revisar correo", days: [1, 2, 3, 4, 5], time: "09:00" });
    const r = brain.routines().find((x) => x.path === rel)!;
    expect(r.days).toEqual([1, 2, 3, 4, 5]);
    expect(r.time).toBe("09:00");
    await brain.setRoutineActive(rel, false);
    expect(brain.routines().find((x) => x.path === rel)!.active).toBe(false);
  });

  it("guarda la nota rápida original en el Inbox del día", async () => {
    await brain.appendInbox("mandar correo hoy a Laura");
    const files = brain.notesBetween("2000-01-01", "2100-01-01", ["inbox"]);
    expect(files.length).toBe(1);
    expect(readFileSync(path.join(root, files[0].path), "utf8")).toMatch(/- \d{2}:\d{2} · mandar correo hoy a Laura/);
  });
});

describe("Granola → vault", () => {
  it("guarda una reunión con el esquema estándar y no la duplica", async () => {
    const m = {
      id: "not_1d3tmYTlCICgjy",
      title: "Revisión trimestral Acme",
      start: "2026-10-13T16:00:00.000Z",
      durationMin: 45,
      attendees: ["Ana López"],
      summary: "Se habló del precio.",
      notes: "Mis notas",
      transcript: "**Yo:** hola",
    };
    const rel = await writeMeeting(brain, m);
    expect(rel).toMatch(/^02-Reuniones\/2026\/10\/2026-10-13-revision-trimestral-acme\.md$/);
    const text = readFileSync(path.join(root, rel!), "utf8");
    expect(text).toContain("granola_id: not_1d3tmYTlCICgjy");
    expect(text).toContain("source: granola");
    expect(text).toContain("## Lumi · Pendientes detectados");
    expect(await writeMeeting(brain, m)).toBeNull();
    // Lumi puede escribir sus secciones en la reunión importada
    await brain.vault.upsertLumiSection(rel!, "Decisiones", "- Bajar precio");
    expect(readFileSync(path.join(root, rel!), "utf8")).toContain("- Bajar precio");
  });
});

describe("texto visible de pendientes", () => {
  it("no repite el cliente que ya aparece como etiqueta", async () => {
    await brain.createTask({ title: "Mandar factura", date: null, time: null, tags: [{ kind: "cliente", name: "Grupo Norte" }], contact: "Laura" });
    const t = brain.tasks().find((x) => x.text.startsWith("Mandar factura"))!;
    expect(t.text).toBe("Mandar factura · Laura");
  });
});
