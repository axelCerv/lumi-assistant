import { describe, expect, it } from "vitest";
import {
  ModesConfig,
  categoryFromTags,
  categoryTag,
  modeCategories,
  taskGrouping,
  Settings,
  defaultModesConfig,
  describeMode,
  enabledModes,
  extractModeTag,
  formatTaskLine,
  inScope,
  manualUntil,
  modeOfNote,
  modeOfTask,
  nextBoundary,
  resolveMode,
  withinHours,
  type ModeEvent,
} from "@lumi/shared";

// Miércoles 14 de octubre de 2026
const at = (h: number, m = 0, day = 14) => new Date(2026, 9, day, h, m);

function cfg(extra: Partial<ModesConfig> = {}): ModesConfig {
  return ModesConfig.parse({
    ...defaultModesConfig(),
    porDefecto: "personal",
    horario: [
      { id: "b1", dias: [1, 2, 3, 4, 5], inicio: "07:00", fin: "14:00", modo: "escuela" },
      { id: "b2", dias: [1, 2, 3, 4, 5], inicio: "15:00", fin: "19:00", modo: "trabajo" },
    ],
    ...extra,
  });
}

describe("modos: cuál está activo", () => {
  it("usa el horario semanal y, fuera de él, el modo por defecto", () => {
    expect(resolveMode(at(9), cfg())).toMatchObject({ mode: "escuela", source: "horario" });
    expect(new Date(resolveMode(at(9), cfg()).until!).getHours()).toBe(14);
    expect(resolveMode(at(16), cfg())).toMatchObject({ mode: "trabajo", source: "horario" });
    const evening = resolveMode(at(21), cfg());
    expect(evening).toMatchObject({ mode: "personal", source: "defecto" });
    // El sábado no hay bloques
    expect(resolveMode(at(10, 0, 17), cfg()).mode).toBe("personal");
  });

  it("precedencia: fijo > manual > calendario > horario > defecto", () => {
    const ev: ModeEvent[] = [{ start: at(8, 30), end: at(9, 30), mode: "trabajo", label: "Llamada con Acme" }];
    expect(resolveMode(at(9), cfg(), ev)).toMatchObject({ mode: "trabajo", source: "calendario", label: "Llamada con Acme" });
    const manual = cfg({ fijado: { modo: "personal", hasta: at(10).toISOString() } });
    expect(resolveMode(at(9), manual, ev)).toMatchObject({ mode: "personal", source: "manual" });
    // El manual temporal vence solo
    expect(resolveMode(at(11), manual, ev)).toMatchObject({ mode: "escuela", source: "horario" });
    const fixed = cfg({ fijado: { modo: "trabajo", hasta: null } });
    expect(resolveMode(at(21), fixed)).toMatchObject({ mode: "trabajo", source: "fijo", until: null });
  });

  it("ignora los modos apagados", () => {
    const c = cfg();
    c.lista = c.lista.map((m) => (m.id === "escuela" ? { ...m, enabled: false } : m));
    expect(enabledModes(c).map((m) => m.id)).toEqual(["trabajo", "personal"]);
    expect(resolveMode(at(9), c).mode).toBe("personal");
    c.fijado = { modo: "escuela", hasta: null };
    expect(resolveMode(at(9), c).mode).toBe("personal");
  });

  it("bloques que cruzan la medianoche", () => {
    const c = cfg({ horario: [{ id: "n", dias: [3], inicio: "22:00", fin: "02:00", modo: "trabajo" }] });
    expect(resolveMode(at(23), c).mode).toBe("trabajo");
    expect(resolveMode(at(1, 0, 15), c).mode).toBe("trabajo");
    expect(resolveMode(at(3, 0, 15), c).mode).toBe("personal");
  });

  it("«hasta el siguiente bloque», una hora, hoy o fijo", () => {
    const c = cfg();
    expect(nextBoundary(at(9), c)?.getHours()).toBe(14);
    expect(new Date(manualUntil("bloque", at(14, 30), c)!).getHours()).toBe(15);
    expect(new Date(manualUntil("hora", at(9), c)!).getTime()).toBe(at(10).getTime());
    expect(new Date(manualUntil("hoy", at(9), c)!).getDate()).toBe(15);
    expect(manualUntil("fijo", at(9), c)).toBeNull();
  });

  it("describe el modo para mostrarlo y para la IA", () => {
    const text = describeMode(resolveMode(at(9), cfg()), cfg(), at(9));
    expect(text).toBe("Escuela 📚 (por tu horario, hasta 14:00)");
  });

  it("silencio por horas, incluso cruzando la medianoche", () => {
    expect(withinHours(at(23), ["22:00", "07:00"])).toBe(true);
    expect(withinHours(at(6), ["22:00", "07:00"])).toBe(true);
    expect(withinHours(at(12), ["22:00", "07:00"])).toBe(false);
    expect(withinHours(at(12), null)).toBe(false);
  });
});

describe("modos: a qué modo pertenece cada cosa", () => {
  const modes = enabledModes(cfg());

  it("encabezado > carpeta > etiqueta > compartido", () => {
    expect(modeOfNote("02-Reuniones/2026/10/x.md", {}, [], modes)).toBe("trabajo");
    expect(modeOfNote("10-Escuela/Materias/Cálculo I/Cálculo I.md", {}, [], modes)).toBe("escuela");
    expect(modeOfNote("08-Conocimiento/idea.md", {}, ["escuela/calculo-i"], modes)).toBe("escuela");
    expect(modeOfNote("02-Reuniones/x.md", { modo: "Personal" }, [], modes)).toBe("personal");
    expect(modeOfNote("01-Diario/2026-10-14.md", {}, [], modes)).toBeNull();
    expect(modeOfNote("05-Clientes/Acme.md", {}, [], modes)).toBe("trabajo");
  });

  it("la etiqueta del pendiente gana sobre la de su nota", () => {
    expect(modeOfTask(["escuela/etica"], null, modes)).toBe("escuela");
    expect(modeOfTask(["cliente/acme"], null, modes)).toBe("trabajo");
    expect(modeOfTask([], "personal", modes)).toBe("personal");
    expect(modeOfTask(["personal"], "trabajo", modes)).toBe("personal");
  });

  it("lo compartido se ve en todos los modos; «Todo» lo muestra todo", () => {
    expect(inScope(null, "escuela")).toBe(true);
    expect(inScope("trabajo", "escuela")).toBe(false);
    expect(inScope("trabajo", "escuela", true)).toBe(true);
  });

  it("la captura rápida reconoce #escuela sin confundirlo con un proyecto", () => {
    expect(extractModeTag("estudiar para el parcial #escuela mañana", modes)).toEqual({ text: "estudiar para el parcial mañana", mode: "escuela" });
    expect(extractModeTag("revisar #PropuestaQ4 hoy", modes)).toEqual({ text: "revisar #PropuestaQ4 hoy", mode: null });
  });

  it("el pendiente lleva la etiqueta del modo", () => {
    const line = formatTaskLine({ title: "Ensayo de Ética, borrador", date: "2026-10-16", time: "18:00", tags: [], contact: null, mode: "escuela", extraTags: ["escuela/etica"] });
    expect(line).toBe("- [ ] Ensayo de Ética, borrador ⏰ 18:00 📅 2026-10-16 #escuela/etica");
    const work = formatTaskLine({ title: "Enviar propuesta", date: null, time: null, tags: [{ kind: "cliente", name: "Acme" }], contact: null, mode: "trabajo" });
    expect(work).toBe("- [ ] Enviar propuesta · [[Acme]] #trabajo #cliente/acme");
  });
});

describe("configuración", () => {
  it("las configuraciones viejas reciben los modos sin perder nada", () => {
    const s = Settings.parse({ userName: "Axel", onboarded: true });
    expect(s.userName).toBe("Axel");
    expect(s.modes.lista.map((m) => m.id)).toEqual(["trabajo", "escuela", "personal"]);
    expect(s.ageGroup).toBeNull();
    expect(s.modesIntroduced).toBe(false);
    // Cada parse tiene su propia copia
    const s2 = Settings.parse({});
    s2.modes.lista[0].nombre = "X";
    expect(Settings.parse({}).modes.lista[0].nombre).toBe("Trabajo");
  });
});

describe("categorías de pendientes por modo", () => {
  it("Trabajo usa cliente/proyecto; Personal, Escuela y los modos nuevos, categorías", () => {
    const c = defaultModesConfig();
    const by = (id: string) => c.lista.find((m) => m.id === id)!;
    expect(taskGrouping(by("trabajo"))).toBe("clientes");
    expect(taskGrouping(by("personal"))).toBe("categorias");
    expect(taskGrouping(by("escuela"))).toBe("categorias");
    expect(taskGrouping(null)).toBe("clientes");
    expect(taskGrouping({ id: "freelance", organizar: "clientes" })).toBe("clientes");
    expect(modeCategories(by("personal"))).toContain("Casa");
    expect(modeCategories({ id: "personal", categorias: ["Gym"] })).toEqual(["Gym"]);
  });

  it("la categoría vive en la etiqueta del modo", () => {
    const personal = defaultModesConfig().lista.find((m) => m.id === "personal")!;
    expect(categoryTag("personal", "Trámites")).toBe("personal/tramites");
    expect(categoryFromTags(["personal/tramites"], personal)).toBe("Trámites");
    expect(categoryFromTags(["#personal/super-mercado"], personal)).toBe("Super mercado");
    expect(categoryFromTags(["trabajo/x"], personal)).toBeNull();
    // Una configuración guardada antes de las categorías sigue funcionando
    const old = ModesConfig.parse({ lista: [{ id: "personal", nombre: "Personal" }] });
    expect(modeCategories(old.lista[0])).toContain("Compras");
  });
});

