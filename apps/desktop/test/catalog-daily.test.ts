import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dailyStartDate, dayKey, formatTaskLine, parseNote, parseTaskLine } from "@lumi/shared";
import { Brain, CATALOG_NOTE } from "../src/main/vault/brain";
import { BrainEmbedder } from "../src/main/index/embeddings";
import { installStructure, FILES } from "../src/main/vault/structure";
import { cleanName, detectCatalogDirs, scanCatalog } from "../src/main/vault/catalog";

let root: string;
let data: string;
let outside: string;

function write(base: string, rel: string, text = "") {
  mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  writeFileSync(path.join(base, rel), text);
}
function dir(base: string, rel: string) {
  mkdirSync(path.join(base, rel), { recursive: true });
}

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "lumi-cat-"));
  data = mkdtempSync(path.join(tmpdir(), "lumi-cat-data-"));
  outside = mkdtempSync(path.join(tmpdir(), "lumi-cat-out-"));
  await installStructure(root);
  // Tu forma de organizarte: Trabajo/Clientes/<cliente>/<proyecto>
  dir(root, "Trabajo/Clientes/01 - Acme/Sitio web");
  dir(root, "Trabajo/Clientes/01 - Acme/App móvil");
  dir(root, "Trabajo/Clientes/01 - Acme/Reuniones");
  dir(root, "Trabajo/Clientes/01 - Acme/2025");
  write(root, "Trabajo/Clientes/01 - Acme/01 - Acme.md", "# Acme\n");
  dir(root, "Trabajo/Clientes/Grupo Norte/Proyectos/Campaña Q4");
  write(root, "Trabajo/Clientes/Grupo Norte/Proyectos/Auditoría.md", "# Auditoría\n");
  dir(root, "Trabajo/Clientes/Grupo Norte/Facturas");
  write(root, "Trabajo/Clientes/Ruiz.md", "---\ntype: cliente\n---\n# Ruiz\n");
  dir(root, "Trabajo/Clientes/Archivo/Viejo");
  // Proyectos sueltos en otra carpeta
  write(root, "Trabajo/Proyectos/Rediseño.md", "---\ntype: proyecto\ncliente: \"[[Ruiz]]\"\n---\n# Rediseño\n");
  dir(root, "Trabajo/Proyectos/Acme/Tienda");
  dir(root, "Trabajo/Proyectos/Sin dueño");
});

afterEach(() => {
  for (const d of [root, data, outside]) rmSync(d, { recursive: true, force: true });
});

describe("carpetas de clientes y proyectos", () => {
  it("limpia los números de orden de los nombres", () => {
    expect(cleanName("01 - Acme")).toBe("Acme");
    expect(cleanName("02. Grupo Norte.md")).toBe("Grupo Norte");
    expect(cleanName("2025")).toBe("2025");
  });

  it("encuentra solas las carpetas de clientes y proyectos", async () => {
    const d = await detectCatalogDirs(root);
    expect(d.clients[0]).toBe("Trabajo/Clientes");
    expect(d.projects[0]).toBe("Trabajo/Proyectos");
    // La carpeta «Proyectos» dentro de un cliente no es la de todos los proyectos
    expect(d.projects).not.toContain("Trabajo/Clientes/Grupo Norte/Proyectos");
    // Las de Lumi (vacías al empezar) no cuentan
    expect(d.clients).toEqual(["Trabajo/Clientes"]);
  });

  it("lee clientes, sus proyectos y a qué cliente pertenece cada uno", async () => {
    const e = await scanCatalog(root, { clientsDir: "Trabajo/Clientes", projectsDir: "Trabajo/Proyectos" });
    const clients = e.filter((x) => x.kind === "cliente").map((x) => x.name);
    expect(clients.sort()).toEqual(["Acme", "Grupo Norte", "Ruiz"]);
    const proj = Object.fromEntries(e.filter((x) => x.kind === "proyecto").map((x) => [x.name, x.client]));
    expect(proj).toEqual({
      "Sitio web": "Acme",
      "App móvil": "Acme",
      "Campaña Q4": "Grupo Norte",
      Auditoría: "Grupo Norte",
      Rediseño: "Ruiz",
      Tienda: "Acme",
      "Sin dueño": null,
    });
    // «Reuniones», «Facturas», años y «Archivo» no son proyectos ni clientes
    expect(e.some((x) => ["Reuniones", "Facturas", "2025", "Archivo", "Viejo"].includes(x.name))).toBe(false);
  });

  it("también lee carpetas fuera del vault (ruta completa)", async () => {
    dir(outside, "Clientes/Bimbo/Rebranding");
    const e = await scanCatalog(root, { clientsDir: path.join(outside, "Clientes"), projectsDir: null });
    expect(e.find((x) => x.name === "Rebranding")).toMatchObject({ kind: "proyecto", client: "Bimbo" });
    expect(path.isAbsolute(e[0].path)).toBe(true);
  });

  it("el cerebro las suma a lo que conoce, con asignaciones y una nota para la IA", async () => {
    const brain = new Brain(root, data, new BrainEmbedder(), () => {});
    try {
      await brain.reindex();
      brain.setCatalogConfig({ clientsDir: "Trabajo/Clientes", projectsDir: "Trabajo/Proyectos", assign: {} }, false);
      await brain.rescanCatalog();
      const ents = brain.entities();
      expect(ents.find((x) => x.name === "Sitio web")).toMatchObject({ kind: "proyecto", client: "Acme", origin: "carpeta" });
      expect(ents.find((x) => x.name === "Sin dueño")?.client).toBeNull();
      // Tú le asignas cliente al proyecto suelto
      brain.setCatalogConfig({ clientsDir: "Trabajo/Clientes", projectsDir: "Trabajo/Proyectos", assign: { "sin-dueno": "acme" } });
      expect(brain.entities().find((x) => x.name === "Sin dueño")?.client).toBe("Acme");
      // La lista queda en el vault, en un archivo de Lumi
      const note = readFileSync(path.join(root, CATALOG_NOTE), "utf8");
      expect(note).toContain("## Acme");
      expect(note).toContain("- Sitio web");
      expect(note).toContain("source: lumi");

      // Un pendiente con solo el proyecto muestra también su cliente
      write(root, FILES.pendientes, "---\nsource: lumi\n---\n# Pendientes\n\n- [ ] Subir banners 📅 2026-10-20 #proyecto/sitio-web\n");
      await brain.touch(FILES.pendientes);
      const t = brain.tasks().find((x) => x.text === "Subir banners")!;
      expect(t.tags).toEqual([
        { kind: "cliente", name: "Acme" },
        { kind: "proyecto", name: "Sitio web" },
      ]);

      // Un proyecto nuevo nace dentro de su cliente
      const name = await brain.ensureEntity("proyecto", "Landing navidad", "Acme");
      const proj = readFileSync(path.join(root, "04-Proyectos", `${name}.md`), "utf8");
      expect(proj).toContain('cliente: "[[Acme]]"');
      expect(brain.entities().find((x) => x.name === "Landing navidad")?.client).toBe("Acme");
      // Si ya existe en tus carpetas, no se duplica en 04-Proyectos
      expect(await brain.ensureEntity("proyecto", "sitio web", "Acme")).toBe("Sitio web");
    } finally {
      await brain.close();
    }
  });
});

describe("recordatorios de cada día", () => {
  it("se escriben con 🔔 diario y se leen de vuelta", () => {
    const line = formatTaskLine({ title: "Tomar vitaminas", date: "2026-10-21", time: "09:00", tags: [], contact: null, daily: true });
    expect(line).toBe("- [ ] Tomar vitaminas 🔔 diario ⏰ 09:00 📅 2026-10-21");
    const t = parseTaskLine(line)!;
    expect(t.daily).toBe(true);
    expect(t.text).toBe("Tomar vitaminas");
    expect(t.due).toBe("2026-10-21");
    expect(parseTaskLine("- [ ] Normal 📅 2026-10-21")!.daily).toBe(false);
  });

  it("la nota rápida entiende «todos los días» y «hasta que lo haga»", () => {
    const now = new Date(2026, 9, 21, 10, 0);
    const a = parseNote("recuérdame todos los días tomar vitaminas", [], now);
    expect(a.daily).toBe(true);
    expect(a.title).toBe("Tomar vitaminas");
    expect(a.remindAt).toBeNull(); // sin hora: la de siempre
    const b = parseNote("llamar a mamá cada día a las 8 de la noche", [], now);
    expect(b.daily).toBe(true);
    expect(new Date(b.remindAt!).getHours()).toBe(20);
    expect(parseNote("mandar factura hasta que lo haga", [], now).daily).toBe(true);
    expect(parseNote("mandar factura mañana", [], now).daily).toBe(false);
  });

  it("el primer día es hoy si la hora no ha pasado; si ya pasó, mañana", () => {
    const now = new Date(2026, 9, 21, 10, 0);
    expect(dailyStartDate("18:00", "09:00", now)).toBe("2026-10-21");
    expect(dailyStartDate(null, "09:00", now)).toBe("2026-10-22");
  });

  it("el cerebro lo pone para hoy aunque su fecha ya pasó, y no lo da por atrasado", async () => {
    const brain = new Brain(root, data, new BrainEmbedder(), () => {});
    try {
      await brain.reindex();
      const old = dayKey(new Date(Date.now() - 5 * 86400000));
      write(root, FILES.pendientes, `---\nsource: lumi\n---\n# Pendientes\n\n- [ ] Revisar correo de cobranza 🔔 diario ⏰ 08:30 📅 ${old}\n`);
      await brain.touch(FILES.pendientes);
      const t = brain.tasks().find((x) => x.text === "Revisar correo de cobranza")!;
      expect(t.daily).toBe(true);
      const at = new Date(t.remindAt!);
      expect(dayKey(at)).toBe(dayKey(new Date()));
      expect(at.getHours()).toBe(8);
      expect(at.getMinutes()).toBe(30);
      // Guardar uno nuevo sin fecha le pone su primer día
      const key = await brain.createTask({ title: "Estirarme", date: null, time: null, tags: [], contact: null, daily: true });
      const n = brain.task(key)!;
      expect(n.daily).toBe(true);
      expect(n.due).not.toBeNull();
      expect(brain.taskDraft(key)?.daily).toBe(true);
    } finally {
      await brain.close();
    }
  });
});
