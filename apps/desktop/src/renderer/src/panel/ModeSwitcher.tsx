/** Chip del modo activo y selector: cambiar de modo, por cuánto tiempo, o volver al horario. */
import { useState } from "react";
import { SOURCE_LABEL, type AppSnapshot, type ManualDuration } from "@lumi/shared";
import { lumi } from "../lib/api";
import { modeInfo, tint, useModeView } from "../lib/modes";
import type { View } from "./main";

const DURATIONS: [ManualDuration, string][] = [
  ["bloque", "Hasta mi siguiente bloque"],
  ["hora", "Una hora"],
  ["hoy", "Hasta mañana"],
  ["fijo", "Fijo (hasta que lo cambie)"],
];

export function ModeBar({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const { all, setAll } = useModeView();
  const info = modeInfo(snap, all);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  if (!info.multi || !info.active) return null;
  const a = info.active;
  const manual = snap.mode.source === "manual" || snap.mode.source === "fijo";
  const until = snap.mode.until ? new Date(snap.mode.until) : null;
  const untilText = until ? `hasta ${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}` : "";

  async function choose(id: string, d: ManualDuration) {
    await lumi.setMode(id, d);
    setOpen(false);
    setPick(null);
  }

  return (
    <div style={{ padding: "0 16px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ gap: 6 }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="selector-modo"
          onClick={() => {
            setOpen(!open);
            setPick(null);
          }}
          className="row grow"
          title="Cambiar de modo"
          style={{ gap: 8, minHeight: 38, padding: "0 12px", borderRadius: 12, border: 0, background: tint(a.color, 0.14), textAlign: "left" }}
        >
          <span aria-hidden="true" style={{ fontSize: 17 }}>
            {a.icono}
          </span>
          <span className="grow" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Modo {a.nombre}</span>
            <span style={{ fontSize: 11.5, color: "var(--muted-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {snap.mode.held ? "Sigo aquí hasta que termines" : `${SOURCE_LABEL[snap.mode.source]}${untilText ? ` · ${untilText}` : ""}`}
            </span>
          </span>
          <span aria-hidden="true" style={{ fontSize: 12, color: "var(--muted)" }}>
            {open ? "▲" : "▼"}
          </span>
        </button>
        <button
          type="button"
          className={`tag big ${all ? "selected-dark" : "neutral"}`}
          aria-pressed={all}
          title={all ? "Mostrando todos los modos" : `Mostrando solo ${a.nombre} y lo compartido`}
          onClick={() => setAll(!all)}
          style={{ minHeight: 38, borderRadius: 12 }}
        >
          Todo
        </button>
      </div>

      {open && (
        <div id="selector-modo" role="group" aria-label="Elegir modo" style={{ padding: 10, borderRadius: 14, border: "1px solid var(--line-strong)", background: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(info.modes.length, 3)}, minmax(0, 1fr))`, gap: 6 }}>
            {info.modes.map((m, i) => {
              const on = (pick ?? a.id) === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPick(m.id)}
                  title={i < 9 ? `Atajo: ${lumi.platform === "darwin" ? "⌘⌥⇧" : "Ctrl+Alt+Mayús+"}${i + 1}` : undefined}
                  style={{
                    minHeight: 56,
                    borderRadius: 12,
                    border: on ? `2px solid ${m.color}` : "1px solid var(--line-strong)",
                    background: on ? tint(m.color, 0.12) : "#fff",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 18 }}>
                    {m.icono}
                  </span>
                  {m.nombre}
                </button>
              );
            })}
          </div>
          {pick && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="field-label" style={{ marginBottom: 2 }}>
                ¿Por cuánto tiempo?
              </span>
              {DURATIONS.map(([d, label]) => (
                <button key={d} type="button" className="btn btn-soft" style={{ justifyContent: "flex-start" }} onClick={() => choose(pick, d)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="row wrap" style={{ gap: 6 }}>
            {manual && (
              <button type="button" className="btn btn-lavender" onClick={() => lumi.setMode(null, "automatico").then(() => setOpen(false))}>
                Volver a mi horario
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => go({ name: "modes" })}>
              Configurar modos y horario
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
