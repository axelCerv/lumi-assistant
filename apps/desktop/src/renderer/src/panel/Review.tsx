/** Repaso con tarjetas: pregunta → «Mostrar respuesta» → qué tan bien la recordaste. */
import { useEffect, useState } from "react";
import { GRADE_LABELS, type AppSnapshot, type CardInfo, type Grade } from "@lumi/shared";
import { LumiFace } from "../components/LumiFace";
import { lumi } from "../lib/api";
import { ViewHeader } from "./ui";
import type { View } from "./main";

const GRADE_HINT: Record<Grade, string> = { 0: "hoy otra vez", 1: "pronto", 2: "en unos días", 3: "más adelante" };

export function Review({ snap, go, subject }: { snap: AppSnapshot; go: (v: View) => void; subject?: string | null }) {
  const [queue, setQueue] = useState<CardInfo[] | null>(null);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const total = queue ? done + queue.length : 0;

  useEffect(() => {
    lumi.dueCards(subject ?? null).then(setQueue);
  }, [subject]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!queue?.length || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) void grade((parseInt(e.key, 10) - 1) as Grade);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function grade(g: Grade) {
    if (!queue?.length) return;
    const [card, ...rest] = queue;
    await lumi.gradeCard(card.id, g);
    // «Otra vez»: vuelve al final de la fila de hoy
    setQueue(g === 0 ? [...rest, card] : rest);
    if (g !== 0) setDone((d) => d + 1);
    setShown(false);
  }

  const card = queue?.[0];
  return (
    <>
      <ViewHeader
        title={subject ? `Repaso · ${subject}` : "Repaso"}
        onBack={() => go({ name: "school" })}
        sub={queue && <span className="hint">{queue.length ? `${done} de ${total} · faltan ${queue.length}` : `${done} repasadas hoy`}</span>}
      />
      <div className="scroll" style={{ flex: 1, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {queue === null && <span className="hint">Buscando tus tarjetas…</span>}
        {queue && !card && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "24px 8px" }}>
            <LumiFace size={84} mood="hablando" shadow />
            <span style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 700 }}>{done ? "¡Repaso terminado!" : "Nada que repasar hoy"}</span>
            <span style={{ fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.5 }}>
              {done ? `Repasaste ${done} ${done === 1 ? "tarjeta" : "tarjetas"}. Te pregunto cada una justo antes de que se te olvide.` : `Tienes ${snap.school.cards.total} tarjetas y ninguna toca hoy.`}
            </span>
            <button type="button" className="btn btn-primary" onClick={() => go({ name: "school" })}>
              Volver a Escuela
            </button>
          </div>
        )}
        {card && (
          <>
            <div style={{ height: 6, borderRadius: 3, background: "var(--line-strong)", overflow: "hidden" }} role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
              <div style={{ width: `${total ? (done / total) * 100 : 0}%`, height: "100%", background: "var(--indigo)", transition: "width 0.2s" }} />
            </div>
            <div style={{ borderRadius: 20, background: "var(--lavender)", padding: "22px 18px", minHeight: 200, display: "flex", flexDirection: "column", gap: 14 }}>
              {card.subject && <span className="tag neutral" style={{ alignSelf: "flex-start", background: "#fff" }}>{card.subject}</span>}
              <span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.35 }}>{card.question}</span>
              {shown ? (
                <div style={{ borderTop: "1px dashed #B9B6CF", paddingTop: 14, fontSize: 17, lineHeight: 1.45 }} aria-live="polite">
                  {card.answer}
                </div>
              ) : (
                <span className="hint" style={{ marginTop: "auto" }}>
                  Intenta responder en tu cabeza (o en voz alta) antes de ver la respuesta.
                </span>
              )}
            </div>
            {!shown ? (
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setShown(true)}>
                Mostrar respuesta
              </button>
            ) : (
              <div>
                <span className="field-label">¿Qué tan bien la recordaste?</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
                  {([0, 1, 2, 3] as Grade[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`btn ${g === 2 ? "btn-primary" : g === 0 ? "btn-danger" : "btn-soft"}`}
                      style={{ minHeight: 54, flexDirection: "column", gap: 0, whiteSpace: "normal" }}
                      onClick={() => grade(g)}
                    >
                      {GRADE_LABELS[g]}
                      <span style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.8 }}>{GRADE_HINT[g]}</span>
                    </button>
                  ))}
                </div>
                <span className="hint" style={{ display: "block", marginTop: 8 }}>
                  Teclas: espacio para mostrar · 1 a 4 para calificar.
                </span>
              </div>
            )}
            <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => lumi.openInObsidian(card.path)}>
              Editar esta tarjeta en Obsidian
            </button>
          </>
        )}
      </div>
    </>
  );
}
