import { useEffect, useState } from "react";
import type { AppSnapshot, RoutineSuggestion } from "@lumi/shared";
import { DAY_NAMES, DAY_SHORT, daysText } from "@lumi/shared";
import { IconOpen, IconTrash } from "../components/Icons";
import { lumi } from "../lib/api";
import { Card, ViewHeader } from "./ui";
import type { View } from "./main";

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function Routines({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const [suggestions, setSuggestions] = useState<RoutineSuggestion[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => lumi.routineSuggestions().then(setSuggestions);
  useEffect(() => {
    void refresh();
  }, [snap.routines.length]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !days.length) return;
    const r = await lumi.saveRoutine({ title: title.trim(), days, time });
    if (!r.ok) return setError(r.error ?? "No pude guardar");
    setTitle("");
    setAdding(false);
  }

  return (
    <>
      <ViewHeader title="Rutinas" onBack={() => go({ name: "home" })} sub={<span className="hint">Viven en 07-Rutinas de tu vault</span>} />
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
                  <button className="btn btn-dark" onClick={async () => {
                    await lumi.acceptSuggestion(s);
                    void refresh();
                  }}>
                    Sí, recuérdame
                  </button>
                  <button className="btn btn-soft" style={{ background: "#fff" }} onClick={async () => {
                    await lumi.dismissSuggestion(s.key);
                    void refresh();
                  }}>
                    No, gracias
                  </button>
                </div>
              </Card>
            ))}
          </>
        )}

        <p className="section-title">Tus rutinas</p>
        {snap.routines.length === 0 && !adding && <span className="hint">Aún no tienes rutinas. Lumi también te propondrá algunas cuando note cosas que haces seguido.</span>}
        {snap.routines.map((r) => (
          <div key={r.path} className="row" style={{ gap: 8, padding: "10px 8px 10px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2, opacity: r.active ? 1 : 0.55 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{r.title}</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                {daysText(r.days)} · {r.time}
              </span>
            </span>
            <input type="checkbox" className="switch" aria-label={`Activar ${r.title}`} checked={r.active} onChange={(e) => lumi.setRoutineActive(r.path, e.target.checked)} />
            <button type="button" className="icon-btn plain" aria-label={`Abrir ${r.title} en Obsidian`} onClick={() => lumi.openInObsidian(r.path)}>
              <IconOpen size={16} />
            </button>
            {r.lumiFile && (
              <button type="button" className="icon-btn plain" aria-label={`Eliminar ${r.title}`} onClick={() => lumi.deleteRoutine(r.path)}>
                <IconTrash size={16} />
              </button>
            )}
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
                <input id="rutina-hora" type="time" className="input" style={{ background: "#fff", width: 110 }} value={time} onChange={(e) => setTime(e.target.value)} />
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
                        style={{ width: 32, height: 36, borderRadius: 10, border: 0, fontWeight: 700, fontSize: 13, background: on ? "var(--indigo)" : "#fff", color: on ? "#fff" : "var(--muted)" }}
                      >
                        {DAY_SHORT[d]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
            {error && <span className="hint" style={{ color: "var(--danger)" }}>{error}</span>}
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
