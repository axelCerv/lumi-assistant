import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Settings, enabledModes, type Meeting } from "@lumi/shared";

// Configuración en memoria (la real vive en la carpeta de datos de la app)
const store = vi.hoisted(() => ({ s: null as unknown }));
vi.mock("../src/main/settings", async () => {
  const { deepMerge } = await import("../src/main/util");
  const { Settings: S } = await import("@lumi/shared");
  return {
    getSettings: () => store.s,
    updateSettings: (patch: unknown) => {
      store.s = S.parse(deepMerge(store.s, patch));
      return store.s;
    },
    loadSettings: () => store.s,
  };
});
// Estado interno en memoria
const state = vi.hoisted(() => ({ s: null as any }));
vi.mock("../src/main/state", () => ({
  getState: () => state.s,
  mutateState: (fn: (x: unknown) => void) => fn(state.s),
  getChat: () => [],
  setChat: () => {},
  loadState: () => {},
}));
vi.mock("../src/main/secrets", () => ({ getSecret: () => "clave-falsa", hasSecret: () => true, getSecretJson: () => null, setSecretJson: () => {} }));

import { Brain } from "../src/main/vault/brain";
import { BrainEmbedder } from "../src/main/index/embeddings";
import { ensureModeStructure, installStructure, FILES } from "../src/main/vault/structure";
import { buildContext } from "../src/main/memory/context-builder";
import { cleanDeadlineTitle, createStudyPlan, dueCards, gradeCard, matchSubject, syncDeadlines } from "../src/main/school";
import { executeTool, toolsFor, type ToolContext } from "../src/main/llm/tools";
import { activeProvider, requireProvider, NO_AI_FOR_MINORS } from "../src/main/llm/provider";
import { localDraft } from "../src/main/memory/extractor";

let root: string;
let data: string;
let brain: Brain;

function write(rel: string, text: string) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

beforeEach(async () => {
  store.s = Settings.parse({ onboarded: true, ageGroup: "adulto", ai: { enabled: false } });
  state.s = { srs: {}, deadlines: {}, studyLog: [], alerts: {}, pendingFacts: [], completions: [], notified: {}, snoozed: {} };
  root = mkdtempSync(path.join(tmpdir(), "lumi-modes-"));
  data = mkdtempSync(path.join(tmpdir(), "lumi-modes-data-"));
  await installStructure(root);
  const modes = enabledModes((store.s as Settings).modes);
  await ensureModeStructure(root, modes);
  write("05-Clientes/Acme.md", "---\ntype: cliente\n---\n# Acme\n\nCliente. El precio del mantenimiento es 12 mil.\n");
  write("02-Reuniones/2026/10/2026-10-06-acme.md", "---\ntype: reunion\ntitle: Revisión Acme\ndate: 2026-10-06\n---\n# Revisión Acme\n\nHablamos del precio del rediseño.\n\n- [ ] Enviar propuesta a [[Acme]] 📅 2026-10-15 #cliente/acme\n");
  write(
    "10-Escuela/Materias/Cálculo I/Cálculo I.md",
    "---\ntype: materia\nmodo: escuela\nprofesor: \"[[Dra. Pérez]]\"\nhorario: [\"lun 09:00-10:30 A-204\", \"mie 09:00-10:30 A-204\"]\nfaltas_max: 6\nia_permitida: false\nsource: lumi\n---\n# Cálculo I\n",
  );
  write("10-Escuela/Materias/Cálculo I/Apuntes/Límites.md", "# Límites\n\nEl precio de entender límites: sen(x)/x tiende a 1 cuando x tiende a 0.\n");
  write("10-Escuela/Materias/Cálculo I/Repaso - Cálculo I.md", "---\ntype: repaso\nmateria: \"[[Cálculo I]]\"\nsource: lumi\n---\n# Repaso\n\n¿Derivada de x²?::2x\nLímite de sen(x)/x en 0::1\n");
  write("03-Pendientes/Pendientes.md", "---\ntype: pendientes\nsource: lumi\n---\n# Pendientes\n\n- [ ] Estudiar para el parcial 📅 2026-10-16 #escuela/calculo-i\n- [ ] Comprar regalo 📅 2026-10-16 #personal\n- [ ] Llamar al banco 📅 2026-10-16\n");
  write("06-Personas/Ana López.md", "---\ntype: persona\ncumple: \"1995-10-20\"\n---\n# Ana López\n");
  write("20-Personal/Pagos.md", "---\ntype: pagos\nsource: lumi\n---\n# Pagos\n\n- Renta · día 5 · $8,500\n");
  write("20-Personal/Listas/Súper.md", "---\ntype: lista\nsource: lumi\n---\n# Súper\n\n- [ ] Leche\n- [x] Huevos\n");
  write("90-Lumi/memoria/General.md", "---\ntype: memoria\nsource: lumi\n---\n# Memoria\n\n- 2026-10-01 · Acme renueva en enero · (origen: [[2026-10-01]]) · modo: trabajo\n- 2026-10-02 · Le gusta estudiar de noche · modo: escuela\n- 2026-10-03 · Se llama Axel\n");
  brain = new Brain(root, data, new BrainEmbedder(), () => {});
  brain.setModes(modes);
  await brain.reindex();
});

afterEach(async () => {
  await brain.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

describe("estructura por modo", () => {
  it("crea 10-Escuela, 20-Personal y la personalidad de cada modo, sin tocar lo existente", async () => {
    expect(existsSync(path.join(root, "10-Escuela/Materias"))).toBe(true);
    expect(existsSync(path.join(root, "20-Personal/Listas"))).toBe(true);
    expect(read("90-Lumi/modos/escuela.md")).toContain("tutora paciente");
    write("90-Lumi/modos/escuela.md", "# Mi versión\n");
    await ensureModeStructure(root, enabledModes((store.s as Settings).modes));
    expect(read("90-Lumi/modos/escuela.md")).toBe("# Mi versión\n");
  });
});

describe("cerebro con modos", () => {
  it("cada pendiente sabe su modo y su materia", () => {
    const by = (t: string) => brain.tasks().find((x) => x.text.startsWith(t))!;
    expect(by("Enviar propuesta")).toMatchObject({ mode: "trabajo" });
    expect(by("Estudiar para el parcial")).toMatchObject({ mode: "escuela", subject: "Cálculo I" });
    expect(by("Comprar regalo").mode).toBe("personal");
    expect(by("Llamar al banco").mode).toBeNull(); // compartido
    // Las listas no son pendientes
    expect(brain.tasks().some((t) => t.text === "Leche")).toBe(false);
  });

  it("materias, tarjetas, listas, pagos y cumpleaños", () => {
    const [s] = brain.subjects();
    expect(s).toMatchObject({ name: "Cálculo I", slug: "calculo-i", teacher: "Dra. Pérez", maxAbsences: 6, aiAllowed: false });
    expect(s.slots.map((x) => x.day)).toEqual([1, 3]);
    expect(brain.cards().map((c) => [c.question, c.subject])).toEqual([
      ["¿Derivada de x²?", "Cálculo I"],
      ["Límite de sen(x)/x en 0", "Cálculo I"],
    ]);
    expect(brain.lists()[0]).toMatchObject({ name: "Súper", items: [{ text: "Leche", done: false }, { text: "Huevos", done: true }] });
    expect(brain.payments(new Date(2026, 9, 14))[0]).toMatchObject({ name: "Renta", next: "2026-11-05", daysLeft: 22 });
    expect(brain.birthdays(new Date(2026, 9, 14))[0]).toMatchObject({ name: "Ana López", daysLeft: 6, age: 31 });
    expect(brain.facts().map((f) => f.mode)).toEqual(["trabajo", "escuela", null]);
  });

  it("crea materias, tarjetas, listas y pagos respetando las reglas del vault", async () => {
    const rel = await brain.saveSubject({ name: "Ética", teacher: "Mtro. Ruiz", schedule: ["martes y jueves 12-13:30"], platform: "moodle", link: "", maxAbsences: null, aiAllowed: true });
    expect(rel).toBe("10-Escuela/Materias/Ética/Ética.md");
    expect(read(rel)).toContain("mar 12:00-13:30");
    expect(existsSync(path.join(root, "06-Personas/Mtro. Ruiz.md"))).toBe(true);
    await brain.addCards(rel, [{ question: "¿Qué es la ética?", answer: "El estudio de la moral" }]);
    expect(read("10-Escuela/Materias/Ética/Repaso - Ética.md")).toContain("¿Qué es la ética?::El estudio de la moral");
    const list = await brain.createList("Casa");
    await brain.addListItem(list, "focos, pilas");
    expect(read(list)).toContain("- [ ] focos\n- [ ] pilas");
    await brain.toggleListItem("20-Personal/Listas/Súper.md", read("20-Personal/Listas/Súper.md").split("\n").findIndex((l) => l.includes("Leche")));
    expect(await brain.clearList("20-Personal/Listas/Súper.md")).toBe(2);
    await brain.savePayment({ name: "Tarjeta 4152 3133 0000 1234", day: 20, month: null, amount: "$1,200", lead: 3 });
    expect(read(FILES.pagos)).toContain("- Tarjeta •••• · día 20 · $1,200 · avisar 3 días antes");
    await brain.setBirthday("Luis", "15 de marzo");
    expect(read("06-Personas/Luis.md")).toContain("cumple: 03-15");
  });

  it("al editar un pendiente conserva su modo y su materia", async () => {
    const t = brain.tasks().find((x) => x.text.startsWith("Estudiar"))!;
    const key = await brain.updateTask(t.key, { title: "Estudiar límites", date: "2026-10-17", time: null, tags: [], contact: null });
    expect(brain.task(key)).toMatchObject({ mode: "escuela", subject: "Cálculo I", due: "2026-10-17" });
    expect(read(FILES.pendientes)).toContain("- [ ] Estudiar límites 📅 2026-10-17 #escuela/calculo-i");
  });

  it("en Personal y Escuela los pendientes van por categoría o materia, no por cliente", async () => {
    const empty = { date: null, time: null, tags: [], contact: null };
    const k = await brain.createTask({ title: "Pagar el gas", ...empty, mode: "personal", category: "Casa" });
    expect(read(FILES.pendientes)).toContain("- [ ] Pagar el gas #personal/casa\n");
    expect(brain.task(k)).toMatchObject({ mode: "personal", category: "Casa", subject: null });
    // Cambiar la categoría reemplaza la etiqueta; quitarla deja el modo
    const k2 = await brain.updateTask(k, { title: "Pagar el gas", ...empty, category: "Finanzas" });
    expect(read(FILES.pendientes)).toContain("- [ ] Pagar el gas #personal/finanzas\n");
    const k3 = await brain.updateTask(k2, { title: "Pagar el gas", ...empty, category: null });
    expect(read(FILES.pendientes)).toContain("- [ ] Pagar el gas #personal\n");
    expect(brain.task(k3)).toMatchObject({ mode: "personal", category: null });
    // En Escuela: una categoría que no es materia, o una materia
    const e1 = await brain.createTask({ title: "Pedir constancia", ...empty, mode: "escuela", category: "Trámites" });
    expect(brain.task(e1)).toMatchObject({ mode: "escuela", category: "Trámites", subject: null });
    const e2 = await brain.createTask({ title: "Resolver guía", ...empty, mode: "escuela", subject: "Cálculo I" });
    expect(read(FILES.pendientes)).toContain("- [ ] Resolver guía #escuela/calculo-i");
    expect(brain.task(e2)).toMatchObject({ subject: "Cálculo I", category: null });
    // Pasar de materia a categoría
    await brain.updateTask(e2, { title: "Resolver guía", ...empty, subject: null, category: "Extracurricular" });
    expect(read(FILES.pendientes)).toContain("- [ ] Resolver guía #escuela/extracurricular\n");
    expect(brain.taskDraft(brain.tasks().find((t) => t.text === "Resolver guía")!.key)).toMatchObject({ mode: "escuela", category: "Extracurricular", subject: null });
  });

  it("en una nota rápida de Personal, #algo es categoría y @alguien es persona", () => {
    const d = localDraft("Comprar focos #personal #casa @Ana", brain);
    expect(d).toMatchObject({ mode: "personal", category: "Casa", contact: "Ana", tags: [] });
    expect(localDraft("Pagar inscripción #escuela #tramites", brain)).toMatchObject({ mode: "escuela", category: "Trámites" });
    expect(localDraft("Repasar derivadas #escuela #calculo-i", brain)).toMatchObject({ subject: "Cálculo I" });
    // En Trabajo sigue siendo cliente/proyecto
    expect(localDraft("Llamar #trabajo @Acme", brain).tags).toEqual([{ kind: "cliente", name: "Acme" }]);
  });

  it("pasa a mañana solo la fecha de lo que quedó pendiente", async () => {
    const keys = brain.tasks().filter((t) => t.due === "2026-10-16").map((t) => t.key);
    expect(await brain.moveDueToTomorrow(keys, "2026-10-17")).toBe(3);
    expect(read(FILES.pendientes)).toContain("- [ ] Comprar regalo 📅 2026-10-17 #personal");
  });
});

describe("contexto para la IA por modo", () => {
  const mode = (id: string) => ({ id, source: "manual" as const, until: null, label: null, held: false, text: `${id} (elegido a mano)` });

  it("en modo Escuela no ve lo de Trabajo; en «Todo» sí", async () => {
    const ctx = await buildContext(brain, [], "precio", { mode: mode("escuela") });
    expect(ctx.text).toContain("Modo actual: escuela");
    expect(ctx.text).toContain("tutora paciente"); // archivo de personalidad del modo
    expect(ctx.text).toContain("Estudiar para el parcial");
    expect(ctx.text).toContain("Llamar al banco"); // compartido
    expect(ctx.text).not.toContain("Enviar propuesta");
    expect(ctx.text).not.toContain("Comprar regalo");
    expect(ctx.text).not.toContain("Acme renueva");
    expect(ctx.text).toContain("Le gusta estudiar de noche");
    expect(ctx.text).toContain("IA permitida por el profesor: no");
    expect(ctx.hits.some((h) => h.path.includes("Límites"))).toBe(true);
    expect(ctx.hits.some((h) => h.path.startsWith("02-Reuniones") || h.path.startsWith("05-Clientes"))).toBe(false);

    const all = await buildContext(brain, [], "precio", { mode: mode("escuela"), all: true });
    expect(all.text).toContain("Enviar propuesta");
    expect(all.hits.some((h) => h.path.startsWith("05-Clientes") || h.path.startsWith("02-Reuniones"))).toBe(true);
  });

  it("en modo Personal ve pagos y cumpleaños", async () => {
    const ctx = await buildContext(brain, [], null, { mode: mode("personal") });
    expect(ctx.text).toContain("Listas: Súper");
    expect(ctx.text).toContain("Comprar regalo");
    expect(ctx.text).not.toContain("Estudiar para el parcial");
  });
});

describe("escuela: entregas, plan y repaso", () => {
  const ev = (id: string, title: string, start: string, extra: Partial<Meeting> = {}): Meeting => ({
    id: `ics:moodle:${id}:${new Date(start).getTime()}`,
    title,
    start,
    end: start,
    allDay: false,
    location: null,
    link: null,
    calendar: "Moodle",
    source: "ics",
    attendees: [],
    ...extra,
  });

  it("limpia títulos y reconoce la materia", () => {
    expect(cleanDeadlineTitle("Tarea 3 is due")).toBe("Tarea 3");
    expect(cleanDeadlineTitle("Cuestionario 2 se abre")).toBeNull();
    expect(matchSubject({ title: "Tarea 3", categories: ["Cálculo I"], description: null }, brain.subjects())?.name).toBe("Cálculo I");
  });

  it("importa entregas sin duplicar y actualiza la fecha si cambia", async () => {
    const events = [ev("t3", "Tarea 3 is due", "2026-10-20T23:59:00-06:00", { categories: ["Cálculo I"] }), ev("q2", "Cuestionario 2 se abre", "2026-10-18T08:00:00-06:00")];
    expect(await syncDeadlines(brain, events)).toBe(1);
    expect(read(FILES.entregas)).toContain("- [ ] Tarea 3 ⏰ 23:59 📅 2026-10-20 #escuela/calculo-i");
    expect(await syncDeadlines(brain, events)).toBe(0);
    const moved = [ev("t3", "Tarea 3 is due", "2026-10-22T23:59:00-06:00", { categories: ["Cálculo I"] })];
    expect(await syncDeadlines(brain, moved)).toBe(1);
    expect(read(FILES.entregas)).toContain("📅 2026-10-22");
    expect(read(FILES.entregas).match(/Tarea 3/g)).toHaveLength(1);
    expect(brain.tasks().find((t) => t.text === "Tarea 3")).toMatchObject({ mode: "escuela", subject: "Cálculo I" });
  });

  it("plan inverso sin IA: crea los pasos como pendientes de la materia", async () => {
    const due = new Date(Date.now() + 10 * 86400000);
    const dueKey = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
    const keys = await createStudyPlan(brain, { title: "Proyecto final", due: dueKey, subject: "Cálculo I" });
    expect(keys).toHaveLength(5);
    const tasks = keys.map((k) => brain.task(k)!);
    expect(tasks[0].text).toContain("Primer paso (5 min)");
    expect(tasks.every((t) => t.mode === "escuela" && t.subject === "Cálculo I")).toBe(true);
    expect(tasks[4].due).toBe(dueKey);
  });

  it("repaso espaciado: lo calificado como «bien» ya no toca hoy", () => {
    const due = dueCards(brain);
    expect(due).toHaveLength(2);
    gradeCard(due[0].id, 2);
    expect(dueCards(brain).map((c) => c.id)).toEqual([due[1].id]);
  });
});

describe("herramientas de la IA para modos", () => {
  const ctx = (): ToolContext => ({ brain, meetings: [], sources: [], actions: [], origin: null, mode: "escuela" });

  it("solo ofrece las herramientas de los modos activos", () => {
    const s = store.s as Settings;
    expect(toolsFor(s).map((t) => t.name)).toEqual(expect.arrayContaining(["cambiar_modo", "plan_de_estudio", "agregar_a_lista"]));
    const onlyWork = Settings.parse({ modes: { ...s.modes, lista: s.modes.lista.map((m) => ({ ...m, enabled: m.id === "trabajo" })) } });
    const names = toolsFor(onlyWork).map((t) => t.name);
    expect(names).not.toContain("plan_de_estudio");
    expect(names).not.toContain("cambiar_modo");
  });

  it("cambia de modo por chat", async () => {
    const c = ctx();
    const r = await executeTool(c, { id: "1", name: "cambiar_modo", input: { modo: "personal", duracion: "fijo" } });
    expect(r.content).toContain("Personal");
    expect((store.s as Settings).modes.fijado).toEqual({ modo: "personal", hasta: null });
    await executeTool(c, { id: "2", name: "cambiar_modo", input: { duracion: "automatico" } });
    expect((store.s as Settings).modes.fijado).toBeNull();
    expect((await executeTool(c, { id: "3", name: "cambiar_modo", input: { modo: "gym" } })).isError).toBe(true);
  });

  it("crea tarjetas, agrega a listas y registra pagos", async () => {
    const c = ctx();
    await executeTool(c, { id: "1", name: "crear_tarjetas", input: { materia: "calculo", tarjetas: ["¿Qué es un límite? :: El valor al que se acerca f(x)"] } });
    expect(read("10-Escuela/Materias/Cálculo I/Repaso - Cálculo I.md")).toContain("¿Qué es un límite?::El valor al que se acerca f(x)");
    await executeTool(c, { id: "2", name: "agregar_a_lista", input: { lista: "súper", elementos: ["pan", "café"] } });
    expect(read("20-Personal/Listas/Súper.md")).toContain("- [ ] pan\n- [ ] café");
    await executeTool(c, { id: "3", name: "registrar_pago_recurrente", input: { nombre: "Internet", dia: 12, monto: "$499" } });
    expect(read(FILES.pagos)).toContain("- Internet · día 12 · $499");
  });

  it("por chat: categoría en Personal (las nuevas se recuerdan) y materia en Escuela", async () => {
    await executeTool({ ...ctx(), mode: "personal" }, { id: "1", name: "crear_pendiente", input: { titulo: "Vacunar al perro", categoria: "Mascotas" } });
    expect(read(FILES.pendientes)).toContain("- [ ] Vacunar al perro #personal/mascotas");
    expect((store.s as Settings).modes.lista.find((m) => m.id === "personal")!.categorias).toContain("Mascotas");
    await executeTool(ctx(), { id: "2", name: "crear_pendiente", input: { titulo: "Hacer la guía", materia: "calculo" } });
    expect(read(FILES.pendientes)).toContain("- [ ] Hacer la guía #escuela/calculo-i");
  });

  it("lo que se anota en modo Escuela lleva su etiqueta", async () => {
    await executeTool(ctx(), { id: "1", name: "crear_pendiente", input: { titulo: "Leer capítulo 3", fecha: "2026-10-18" } });
    expect(read(FILES.pendientes)).toContain("- [ ] Leer capítulo 3 📅 2026-10-18 #escuela");
  });
});

describe("Lumi sin IA para menores", () => {
  it("ningún proveedor se usa si el usuario es menor", () => {
    store.s = Settings.parse({ ageGroup: "menor", ai: { enabled: true } });
    expect(activeProvider()).toBeNull();
    expect(() => requireProvider()).toThrow(NO_AI_FOR_MINORS);
    store.s = Settings.parse({ ageGroup: "adulto", ai: { enabled: true } });
    expect(activeProvider()).not.toBeNull();
  });
});
