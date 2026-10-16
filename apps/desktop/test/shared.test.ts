import { describe, expect, it } from "vitest";
import { formatTaskLine, parseNote, parseTaskLine, toggleTaskLine } from "@lumi/shared";

describe("formato de pendientes (plugin Tasks)", () => {
  it("lee fecha, hora, etiquetas y enlaces", () => {
    const t = parseTaskLine("- [ ] Enviar propuesta a [[Acme]] ⏰ 17:00 📅 2026-10-15 #cliente/acme")!;
    expect(t.done).toBe(false);
    expect(t.due).toBe("2026-10-15");
    expect(t.time).toBe("17:00");
    expect(t.tags).toEqual(["cliente/acme"]);
    expect(t.links).toEqual(["Acme"]);
    expect(t.text).toBe("Enviar propuesta a Acme");
  });

  it("arma la línea con ⏰ antes de 📅 y etiquetas al final", () => {
    const line = formatTaskLine({ title: "Mandar correo a Laura", date: "2026-10-14", time: "13:00", tags: [{ kind: "cliente", name: "Grupo Norte" }], contact: "Laura" });
    expect(line).toBe("- [ ] Mandar correo a [[Laura]] · [[Grupo Norte]] ⏰ 13:00 📅 2026-10-14 #cliente/grupo-norte");
    const back = parseTaskLine(line)!;
    expect(back.due).toBe("2026-10-14");
    expect(back.time).toBe("13:00");
    expect(back.text).toBe("Mandar correo a Laura · Grupo Norte");
  });

  it("marca y desmarca como Obsidian Tasks", () => {
    const line = "- [ ] Revisar contrato 📅 2026-10-15 #cliente/ruiz";
    const done = toggleTaskLine(line, "2026-10-14");
    expect(done).toBe("- [x] Revisar contrato 📅 2026-10-15 ✅ 2026-10-14 #cliente/ruiz");
    expect(parseTaskLine(done)!.doneDate).toBe("2026-10-14");
    expect(toggleTaskLine(done, "2026-10-14")).toBe(line);
  });

  it("ignora líneas que no son pendientes", () => {
    expect(parseTaskLine("- texto normal")).toBeNull();
    expect(parseTaskLine("Texto [ ] raro")).toBeNull();
  });
});

describe("lector de notas rápidas", () => {
  const now = new Date(2026, 9, 13, 9, 35); // martes
  const known = [{ name: "Grupo Norte", kind: "cliente" as const }];
  it("entiende 'mañana a las 5' y clientes conocidos", () => {
    const r = parseNote("llamar a Laura de Grupo Norte mañana a las 5", known, now);
    expect(new Date(r.remindAt!).getDate()).toBe(14);
    expect(new Date(r.remindAt!).getHours()).toBe(17);
    expect(r.tags).toEqual(known);
    expect(r.contact).toBe("Laura");
  });
  it("entiende @cliente y #proyecto", () => {
    const r = parseNote("subir avances #Rediseño_web hoy 5pm @Despacho_Ruiz", [], now);
    expect(r.tags).toEqual([
      { kind: "proyecto", name: "Rediseño web" },
      { kind: "cliente", name: "Despacho Ruiz" },
    ]);
    expect(r.title).toBe("Subir avances");
  });
});
