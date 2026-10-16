import { describe, expect, it } from "vitest";
import { parseIcs } from "../src/main/calendar/ics";
import { parseMeetingList } from "../src/main/granola/mcp-client";
import { periodFor } from "../src/main/memory/summaries";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:America/Mexico_City
BEGIN:STANDARD
TZOFFSETFROM:-0600
TZOFFSETTO:-0600
TZNAME:CST
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:weekly@x
DTSTART;TZID=America/Mexico_City:20260105T163000
DTEND;TZID=America/Mexico_City:20260105T171500
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
SUMMARY:Llamada semanal
DESCRIPTION:Únete: https://teams.microsoft.com/l/meetup-join/abc
ATTENDEE;CN=Ana López:mailto:ana@x.com
END:VEVENT
BEGIN:VEVENT
UID:weekly@x
RECURRENCE-ID;TZID=America/Mexico_City:20261014T163000
DTSTART;TZID=America/Mexico_City:20261014T180000
DTEND;TZID=America/Mexico_City:20261014T183000
SUMMARY:Llamada semanal (movida)
END:VEVENT
BEGIN:VEVENT
UID:cancel@x
STATUS:CANCELLED
DTSTART:20261013T170000Z
DTEND:20261013T180000Z
SUMMARY:Cancelada
END:VEVENT
END:VCALENDAR`;

describe("calendario iCal", () => {
  it("expande eventos que se repiten, respeta excepciones y zonas horarias", () => {
    const list = parseIcs(ICS, { id: "c", name: "Trabajo", url: "", enabled: true, kind: "calendario" }, new Date("2026-10-12T06:00:00Z"), new Date("2026-10-17T06:00:00Z")).sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    expect(list.map((m) => [m.title, m.start])).toEqual([
      ["Llamada semanal", "2026-10-12T22:30:00.000Z"],
      ["Llamada semanal (movida)", "2026-10-15T00:00:00.000Z"],
    ]);
    expect(list[0].link).toBe("https://teams.microsoft.com/l/meetup-join/abc");
    expect(list[0].attendees).toEqual(["Ana López"]);
  });
});

describe("lista de reuniones del MCP de Granola", () => {
  it("lee JSON", () => {
    expect(parseMeetingList(JSON.stringify({ meetings: [{ id: "abc-1", title: "Kickoff", date: "2026-10-10T10:00:00Z" }] }))).toEqual([{ id: "abc-1", title: "Kickoff", date: "2026-10-10T10:00:00Z" }]);
  });
  it("lee etiquetas tipo XML", () => {
    expect(parseMeetingList('<meetings><meeting id="m1" title="Revisión" date="2026-10-09"></meeting></meetings>')).toEqual([{ id: "m1", title: "Revisión", date: "2026-10-09" }]);
  });
  it("lee texto con identificadores", () => {
    const r = parseMeetingList("- 2026-10-08 Revisión Acme (0b4f2a1c-1111-2222-3333-444455556666)");
    expect(r[0].id).toBe("0b4f2a1c-1111-2222-3333-444455556666");
    expect(r[0].date).toBe("2026-10-08");
    expect(r[0].title).toContain("Revisión Acme");
  });
});

describe("periodos de resumen", () => {
  it("semana anterior completa y mes anterior", () => {
    const ref = new Date(2026, 9, 13, 10); // martes 13 oct
    expect(periodFor("semanal", ref)).toMatchObject({ from: "2026-10-05", to: "2026-10-11", rel: "90-Lumi/resumenes/2026-S41.md" });
    expect(periodFor("mensual", ref)).toMatchObject({ from: "2026-09-01", to: "2026-09-30", rel: "90-Lumi/resumenes/2026-09.md" });
  });
});
