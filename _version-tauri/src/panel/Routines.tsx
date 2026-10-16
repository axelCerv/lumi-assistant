import { useState } from "react";
import { IconTrash } from "../components/Icons";
import { suggestRoutines } from "../lib/routines";
import { uid, updateData } from "../lib/store";
import { DAY_NAMES, DAY_SHORT, daysText } from "../lib/time";
import type { LumiData } from "../lib/types";
import { Card, ViewHeader } from "./ui";
import type { View } from "./main";

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function Routines({ data, go }: { data: LumiData; go: (v: View) => void }) {
  const suggestions = suggestRoutines(data);
  const [adding, setAdding] = useState(data.routines.length === 0 && suggestions.length === 0);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !days.length) return;
    await updateData((d) => {
      d.routines.push({ id: uid(), title: title.trim(), days: [...days].sort(), time, enabled: true, lastFired: null });
    });
    setTitle("");
    setAdding(false);
  }

  return (
    <>
      <ViewHeader title="Rutinas" onBack={() => go({ name: "home" })} />
      <div className="scroll" style={{ flex: 1, padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {suggestions.length > 0 && (
          <>
            <p className="section-title">Lumi notó esto</p>
            {suggestions.map((s) => (
              <Card key={s.key} tone="sun">
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--sun-ink)" }}>{s.reason}</span>
                <span style={{ fontSize: 14.5, lineHeight: 1.45 }}>
                  {daysText(s.days)} sueles «{s.title.toLowerCase()}». ¿Te lo recuerdo a las {s.time}?
                </span>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="btn btn-dark"
                    onClick={() =>
                      updateData((d) => {
                        d.routines.push({ id: uid(), title: s.title, days: s.days, time: s.time, enabled: true, lastFired: null });
                      })
                    }
                  >
                    Sí, recuérdame
                  </button>
                  <button
                    className="btn btn-soft"
                    style={{ background: "#fff" }}
                    onClick={() =>
                      updateData((d) => {
                        d.settings.dismissedSuggestions.push(s.key);
                      })
                    }
                  >
                    No, gracias
                  </button>
                </div>
              </Card>
            ))}
          </>
        )}

        <p className="section-title">Tus rutinas</p>
        {data.routines.length === 0 && !adding && (
          <span className="hint">Aún no tienes rutinas. Lumi también te propondrá algunas cuando note cosas que haces seguido.</span>
        )}
        {data.routines.map((r) => (
          <div key={r.id} className="row" style={{ gap: 10, padding: "12px 12px 12px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2, opacity: r.enabled ? 1 : 0.55 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{r.title}</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                {daysText(r.days)} · {r.time}
              </span>
            </span>
            <input
              type="checkbox"
              className="switch"
              aria-label={`Activar ${r.title}`}
              checked={r.enabled}
              onChange={(e) =>
                updateData((d) => {
                  const x = d.routines.find((y) => y.id === r.id);
                  if (x) x.enabled = e.target.checked;
                })
              }
            />
            <button
              type="button"
              className="icon-btn plain"
              aria-label={`Eliminar ${r.title}`}
              onClick={() =>
                updateData((d) => {
                  d.routines = d.routines.filter((y) => y.id !== r.id);
                })
              }
            >
              <IconTrash size={17} />
            </button>
          </div>
        ))}

        {adding ? (
          <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 16, background: "var(--surface)" }}>
            <div>
              <label htmlFor="rutina-titulo" className="field-label">
                ¿Qué te recuerdo?
              </label>
              <input id="rutina-titulo" className="input" style={{ background: "#fff" }} placeholder="Ej. Revisar correo y agenda" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="row" style={{ gap: 12, alignItems: "flex-end" }}>
              <div>
                <label htmlFor="rutina-hora" className="field-label">
                  Hora
                </label>
                <input id="rutina-hora" type="time" className="input" style={{ background: "#fff", width: 120 }} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-label">Días</legend>
                <div className="row" style={{ gap: 4 }}>
                  {ORDER.map((d) => {
                    const on = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        aria-label={DAY_NAMES[d]}
                        onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                        style={{
                          width: 32,
                          height: 36,
                          borderRadius: 10,
                          border: 0,
                          fontWeight: 700,
                          fontSize: 13,
                          background: on ? "var(--indigo)" : "#fff",
                          color: on ? "#fff" : "var(--muted)",
                        }}
                      >
                        {DAY_SHORT[d]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={!title.trim() || !days.length}>
                Guardar rutina
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-lavender btn-lg" style={{ border: "1px dashed #8F8BC9", background: "transparent" }} onClick={() => setAdding(true)}>
            + Nueva rutina
          </button>
        )}
      </div>
    </>
  );
}
