import { describe, expect, it } from "vitest";
import {
  classOccurrences,
  formatClassSlot,
  formatPayment,
  isCardDue,
  nextBirthday,
  nextPaymentDate,
  parseBirthday,
  parseCards,
  parseClassSlot,
  parsePaymentLine,
  parsePayments,
  parseSubjectLine,
  reversePlan,
  reviewCard,
  scrubAccountNumbers,
  weekLoad,
  weekLoadText,
} from "@lumi/shared";

const day = (d: number, h = 9) => new Date(2026, 9, d, h); // octubre 2026; el 14 es miércoles

describe("escuela: horario de clases", () => {
  it("entiende días, rangos, horas y salón", () => {
    expect(parseClassSlot("lun mie 9:00-10:30 A-204")).toEqual([
      { day: 1, start: "09:00", end: "10:30", room: "A-204" },
      { day: 3, start: "09:00", end: "10:30", room: "A-204" },
    ]);
    expect(parseClassSlot("lunes a viernes 7-8:30").map((s) => s.day)).toEqual([1, 2, 3, 4, 5]);
    expect(parseClassSlot("mar-jue 16:00 a 18:00")).toHaveLength(3);
    expect(parseClassSlot("Martes y Jueves 12:00-13:30").map((s) => s.day)).toEqual([2, 4]);
    expect(parseClassSlot("sin horario")).toEqual([]);
    expect(formatClassSlot({ day: 3, start: "09:00", end: "10:30", room: "A-204" })).toBe("mié 09:00-10:30 A-204");
  });

  it("una materia por línea en el onboarding", () => {
    expect(parseSubjectLine("Cálculo I · lun mie 9:00-10:30 A-204")).toMatchObject({ name: "Cálculo I", slots: [{ day: 1 }, { day: 3 }] });
    expect(parseSubjectLine("Ética")).toEqual({ name: "Ética", slots: [] });
  });

  it("clases concretas dentro del ciclo", () => {
    const subjects = [{ name: "Cálculo I", path: "10-Escuela/Materias/Cálculo I/Cálculo I.md", slots: parseClassSlot("lun mie 9:00-10:30") }];
    const occ = classOccurrences(subjects, day(12, 0), day(19, 0));
    expect(occ.map((o) => new Date(o.start).getDate())).toEqual([12, 14]);
    expect(classOccurrences(subjects, day(12, 0), day(19, 0), { inicio: "2026-10-13", fin: null })).toHaveLength(1);
  });
});

describe("escuela: plan inverso", () => {
  it("parte una entrega en pasos con fechas intermedias, empezando hoy con 5 minutos", () => {
    const steps = reversePlan("Ensayo de Ética", "2026-10-24", day(14));
    expect(steps).toHaveLength(5);
    expect(steps[0]).toEqual({ title: "Primer paso (5 min): abrir el archivo y anotar 3 ideas para «Ensayo de Ética»", date: "2026-10-14" });
    expect(steps.map((s) => s.date)).toEqual(["2026-10-14", "2026-10-17", "2026-10-20", "2026-10-23", "2026-10-24"]);
    // Las fechas nunca retroceden ni pasan de la entrega
    const sorted = [...steps].map((s) => s.date).sort();
    expect(steps.map((s) => s.date)).toEqual(sorted);
  });

  it("si es para hoy, todo es hoy; los exámenes tienen sus propios pasos", () => {
    expect(new Set(reversePlan("Tarea 3", "2026-10-14", day(14)).map((s) => s.date))).toEqual(new Set(["2026-10-14"]));
    const exam = reversePlan("Parcial de Cálculo", "2026-10-16", day(14));
    expect(exam[0].title).toContain("lista de temas");
    expect(exam[4]).toEqual({ title: "Presentar «Parcial de Cálculo»", date: "2026-10-16" });
    // Para mañana: todo hoy y solo el examen mañana, en orden
    expect(reversePlan("Parcial", "2026-10-15", day(14)).map((s) => s.date)).toEqual(["2026-10-14", "2026-10-14", "2026-10-14", "2026-10-14", "2026-10-15"]);
  });
});

describe("escuela: semana cargada", () => {
  it("avisa cuando un día junta 3 entregas o 2 y un examen", () => {
    const items = [
      { date: "2026-10-15", title: "Tarea 3" },
      { date: "2026-10-15", title: "Reporte de laboratorio" },
      { date: "2026-10-15", title: "Parcial de Química" },
      { date: "2026-10-19", title: "Ensayo" },
    ];
    const w = weekLoad(items, day(14));
    expect(w.heavy).toBe(true);
    expect(w.peak).toMatchObject({ date: "2026-10-15", count: 3, exams: 1 });
    expect(weekLoadText(w, day(14))).toBe("Se viene una semana cargada: mañana tienes 2 entregas y un examen (4 en total esta semana). ¿Lo repartimos en pasos pequeños?");
    expect(weekLoad(items.slice(3), day(14)).heavy).toBe(false);
  });
});

describe("escuela: tarjetas y repaso espaciado", () => {
  it("lee tarjetas «Pregunta::Respuesta» e ignora código y pendientes", () => {
    const cards = parseCards("# Repaso\n- ¿Derivada de x²?::2x\nLímite notable::sen(x)/x → 1\n```\na::b\n```\n- [ ] tarea::no\nHora: 10:30", "r.md");
    expect(cards.map((c) => c.question)).toEqual(["¿Derivada de x²?", "Límite notable"]);
    expect(cards[0].answer).toBe("2x");
    expect(cards[0].id).toBe(parseCards("¿Derivada de x²?::otra", "r.md")[0].id); // id estable aunque cambie la respuesta
  });

  it("programa los repasos cada vez más espaciados", () => {
    const t = day(14);
    let s = reviewCard(undefined, 2, t);
    expect(s).toMatchObject({ interval: 1, due: "2026-10-15", reps: 1 });
    s = reviewCard(s, 2, day(15));
    expect(s).toMatchObject({ interval: 3, due: "2026-10-18" });
    s = reviewCard(s, 2, day(18));
    expect(s.interval).toBeGreaterThanOrEqual(7);
    const lapse = reviewCard(s, 0, day(25));
    expect(lapse).toMatchObject({ interval: 0, reps: 0, lapses: 1, due: "2026-10-25" });
    expect(isCardDue(undefined, t)).toBe(true);
    expect(isCardDue(s, day(18))).toBe(false);
  });
});

describe("personal: pagos y cumpleaños", () => {
  it("lee pagos mensuales y anuales", () => {
    const list = parsePayments("# Pagos\n- Renta · día 5 · $8,500\n- Seguro del coche · 15/04 · $6,200 · avisar 7 días antes\n- nota suelta\n");
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ name: "Renta", day: 5, month: null, amount: "$8,500", lead: 2, line: 1 });
    expect(list[1]).toMatchObject({ name: "Seguro del coche", day: 15, month: 4, lead: 7 });
    expect(parsePaymentLine("- Tarjeta · 20 de marzo")).toMatchObject({ day: 20, month: 3 });
  });

  it("calcula la siguiente fecha (y ajusta el día 31)", () => {
    expect(nextPaymentDate({ day: 5, month: null }, day(14)).toDateString()).toBe(new Date(2026, 10, 5).toDateString());
    expect(nextPaymentDate({ day: 14, month: null }, day(14)).getDate()).toBe(14);
    expect(nextPaymentDate({ day: 31, month: null }, new Date(2026, 10, 2)).getDate()).toBe(30);
    expect(nextPaymentDate({ day: 15, month: 4 }, day(14)).getFullYear()).toBe(2027);
  });

  it("nunca guarda números de tarjeta o cuenta", () => {
    expect(scrubAccountNumbers("Tarjeta 4152 3133 0000 1234")).toBe("Tarjeta ••••");
    expect(formatPayment({ name: "Tarjeta 4152313300001234", day: 20, amount: "$1,200" })).toBe("- Tarjeta •••• · día 20 · $1,200");
  });

  it("cumpleaños en varios formatos", () => {
    expect(parseBirthday("03-15")).toEqual({ month: 3, day: 15, year: null });
    expect(parseBirthday("1990-03-15")).toEqual({ month: 3, day: 15, year: 1990 });
    expect(parseBirthday("15/03")).toEqual({ month: 3, day: 15, year: null });
    expect(parseBirthday("15 de marzo")).toEqual({ month: 3, day: 15, year: null });
    expect(parseBirthday("hola")).toBeNull();
    expect(nextBirthday({ month: 10, day: 14 }, day(14)).getFullYear()).toBe(2026);
    expect(nextBirthday({ month: 3, day: 15 }, day(14)).getFullYear()).toBe(2027);
  });
});
