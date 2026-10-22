import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import type { BubbleAction, BubblePayload } from "@lumi/shared";
import "../styles.css";
import { IconClose } from "../components/Icons";
import { lumi } from "../lib/api";

const KIND_LABEL: Record<BubblePayload["kind"], string> = {
  recordatorio: "Recordatorio",
  reunion: "Reunión",
  rutina: "Rutina",
  sugerencia: "Idea de Lumi",
  hola: "Lumi",
  resumen: "Resumen",
  granola: "Granola",
  modo: "Modo",
  clase: "Clase",
  estudio: "Sesión de estudio",
  carga: "Semana cargada",
  repaso: "Repaso",
  pago: "Pago",
  cumple: "Cumpleaños",
  cierre: "Cierre del día",
};

function Bubble() {
  const [p, setP] = useState<BubblePayload | null>(null);
  const [key, setKey] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  // Al tocar un botón, la burbuja se quita de inmediato aquí mismo; no espera a nadie
  const act = (a: BubbleAction, minutes?: number) => {
    setP(null);
    void lumi.bubbleAction(a, minutes).catch(() => {});
  };

  useEffect(() => {
    lumi.getBubble().then((b) => {
      if (b) {
        setP(b);
        setKey((k) => k + 1);
      }
    });
    return lumi.on("bubble", (b) => {
      setP(b);
      setKey((k) => k + 1);
    });
  }, []);

  useLayoutEffect(() => {
    const el = card.current;
    if (!p || !el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      void lumi.bubbleReady(Math.ceil(r.width), Math.ceil(r.height));
    };
    report();
    // Si el tamaño cambia después (la letra terminó de cargar, por ejemplo), la ventana se ajusta:
    // así los botones nunca quedan fuera de ella
    const ro = new ResizeObserver(report);
    ro.observe(el);
    void document.fonts?.ready.then(report);
    return () => ro.disconnect();
  }, [p, key]);

  if (!p) return null;
  const tailOnLeft = p.side === "right";

  return (
    <div ref={card} key={key} style={{ display: "inline-block", padding: "10px 14px 14px", animation: "lumi-pop 0.18s ease-out", transformOrigin: tailOnLeft ? "left center" : "right center" }}>
      <div
        role="alert"
        style={{
          position: "relative",
          width: 300,
          background: "#fff",
          borderRadius: 20,
          padding: 16,
          boxShadow: "0 10px 28px rgba(10, 11, 30, 0.28), 0 0 0 1px rgba(30,32,51,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span
          aria-hidden="true"
          style={{ position: "absolute", top: "50%", [tailOnLeft ? "left" : "right"]: -6, width: 14, height: 14, marginTop: -7, background: "#fff", transform: "rotate(45deg)", borderRadius: 2 }}
        />
        <div className="row" style={{ justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
          <span className="row" style={{ gap: 6, color: "var(--indigo-strong)" }}>
            {KIND_LABEL[p.kind]}
            {p.fromMode && (
              <span className="tag neutral" title="Es de otro modo: te aviso porque es importante o porque ese modo no silencia sus avisos">
                {p.fromMode}
              </span>
            )}
          </span>
          <span className="row" style={{ gap: 4, color: "var(--muted)" }}>
            {p.time}
            <button type="button" className="icon-btn plain" aria-label="Cerrar aviso" onClick={() => act("close")} style={{ width: 28, height: 28, marginRight: -8, marginTop: -4 }}>
              <IconClose size={14} />
            </button>
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.45 }}>{p.text}</p>
        {!!p.tags?.length && (
          <div className="row wrap" style={{ gap: 6 }}>
            {p.tags.map((t) => (
              <span key={t.kind + t.name} className={`tag ${t.kind}`}>
                {t.name}
              </span>
            ))}
          </div>
        )}
        <div className="row wrap" style={{ gap: 8, marginTop: 2 }}>
          {p.kind === "recordatorio" &&
            (p.daily ? (
              <>
                <button className="btn btn-primary" onClick={() => act("done")} title="Ya no te lo recuerdo">
                  Hecho
                </button>
                <button className="btn btn-outline" onClick={() => act("snooze", 120)}>
                  En 2 h
                </button>
                <button className="btn btn-ghost" onClick={() => act("close")} title="Te lo vuelvo a recordar mañana">
                  Mañana
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => act("done")}>
                  Hecho
                </button>
                <button className="btn btn-outline" onClick={() => act("snooze", 30)}>
                  En 30 min
                </button>
                <button className="btn btn-ghost" onClick={() => act("snooze", 120)}>
                  En 2 h
                </button>
              </>
            ))}
          {p.kind === "reunion" && (
            <>
              {p.link ? (
                <button className="btn btn-primary" onClick={() => act("open-link")}>
                  Unirme
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => act("open-panel")}>
                  Ver agenda
                </button>
              )}
              {p.granola && (
                <button className="btn btn-lavender" onClick={() => act("open-granola")}>
                  Abrir Granola
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => act("close")}>
                Entendido
              </button>
            </>
          )}
          {p.kind === "rutina" && (
            <>
              <button className="btn btn-primary" onClick={() => act("done")}>
                Listo
              </button>
              <button className="btn btn-outline" onClick={() => act("snooze", 15)}>
                En 15 min
              </button>
            </>
          )}
          {p.kind === "sugerencia" && (
            <>
              <button className="btn btn-dark" onClick={() => act("accept-suggestion")}>
                Sí, recuérdamelo
              </button>
              <button className="btn btn-outline" onClick={() => act("reject-suggestion")}>
                No, gracias
              </button>
            </>
          )}
          {p.kind === "resumen" && (
            <>
              <button className="btn btn-primary" onClick={() => act("open-note")}>
                Abrir en Obsidian
              </button>
              <button className="btn btn-outline" onClick={() => act("close")}>
                Luego
              </button>
            </>
          )}
          {p.kind === "modo" &&
            (p.cta ? (
              <>
                <button className="btn btn-primary" onClick={() => act("open-panel")}>
                  {p.cta}
                </button>
                <button className="btn btn-outline" onClick={() => act("close")}>
                  Luego
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => act("open-panel")}>
                  Ver
                </button>
                <button className="btn btn-outline" onClick={() => act("undo-mode")}>
                  Deshacer
                </button>
              </>
            ))}
          {p.kind === "estudio" && (
            <>
              {p.studyPhase === "enfoque" ? (
                <>
                  <button className="btn btn-primary" onClick={() => act("study-break")}>
                    Descansar
                  </button>
                  <button className="btn btn-outline" onClick={() => act("study-focus")}>
                    Otro bloque
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => act("study-focus")}>
                  Otro bloque
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => act("study-stop")}>
                Terminar
              </button>
            </>
          )}
          {(p.kind === "clase" || p.kind === "carga" || p.kind === "repaso" || p.kind === "pago" || p.kind === "cumple") && (
            <>
              <button className="btn btn-primary" onClick={() => act("open-panel")}>
                {p.kind === "clase" ? "Ver mi día" : p.kind === "carga" ? "Repartir en pasos" : p.kind === "repaso" ? "Repasar ahora" : p.kind === "pago" ? "Ver pagos" : "Ver"}
              </button>
              <button className="btn btn-outline" onClick={() => act("close")}>
                {p.kind === "repaso" ? "Más tarde" : p.kind === "carga" ? "Luego" : "Entendido"}
              </button>
            </>
          )}
          {p.kind === "cierre" &&
            (p.movable ? (
              <>
                <button className="btn btn-primary" onClick={() => act("move-to-tomorrow")}>
                  Pasar a mañana
                </button>
                <button className="btn btn-outline" onClick={() => act("open-panel")}>
                  Ver mi día
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => act("close")}>
                Gracias, Lumi
              </button>
            ))}
          {(p.kind === "hola" || p.kind === "granola") && (
            <>
              <button className="btn btn-primary" onClick={() => act("open-panel")}>
                {p.cta ?? "Ver mi día"}
              </button>
              <button className="btn btn-outline" onClick={() => act("close")}>
                Gracias, Lumi
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Bubble />);
