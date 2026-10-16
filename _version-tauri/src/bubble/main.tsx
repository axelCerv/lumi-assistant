import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import "../styles.css";
import { IconClose } from "../components/Icons";
import { uid, updateData } from "../lib/store";
import type { BubblePayload } from "../lib/types";

const KIND_LABEL: Record<BubblePayload["kind"], string> = {
  recordatorio: "Recordatorio",
  reunion: "Reunión",
  rutina: "Rutina",
  sugerencia: "Idea de Lumi",
  hola: "Lumi",
};

const close = () => invoke("hide_bubble");

function Bubble() {
  const [p, setP] = useState<BubblePayload | null>(null);
  const [key, setKey] = useState(0);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<BubblePayload | null>("get_bubble").then((b) => {
      if (b) {
        setP(b);
        setKey((k) => k + 1);
      }
    });
    const un = listen<BubblePayload>("lumi://bubble", (e) => {
      setP(e.payload);
      setKey((k) => k + 1);
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      un.then((f) => f());
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Medir la burbuja ya dibujada y pedir a Lumi que la muestre de ese tamaño.
  useLayoutEffect(() => {
    if (!p || !card.current) return;
    const r = card.current.getBoundingClientRect();
    invoke("bubble_ready", { width: Math.ceil(r.width), height: Math.ceil(r.height) });
  }, [p, key]);

  if (!p) return null;
  const tailOnLeft = p.side === "right"; // la burbuja está a la derecha del avatar

  async function done() {
    if (p?.taskId) {
      await updateData((d) => {
        const t = d.tasks.find((x) => x.id === p.taskId);
        if (t) {
          t.done = true;
          t.doneAt = new Date().toISOString();
        }
      });
    }
    close();
  }

  async function snooze(min: number) {
    if (p?.taskId) {
      await updateData((d) => {
        const t = d.tasks.find((x) => x.id === p.taskId);
        if (t) {
          t.remindAt = new Date(Date.now() + min * 60_000).toISOString();
          t.notified = false;
        }
      });
    } else if (p?.routineId) {
      // Pospone la rutina creando un recordatorio de una sola vez.
      const title = p.text.replace(/^Es hora de:\s*/, "").replace(/\.$/, "");
      await updateData((d) => {
        d.tasks.push({
          id: uid(),
          text: title.charAt(0).toUpperCase() + title.slice(1),
          createdAt: new Date().toISOString(),
          remindAt: new Date(Date.now() + min * 60_000).toISOString(),
          done: false,
          doneAt: null,
          notified: false,
          tags: [],
          contact: null,
        });
      });
    }
    close();
  }

  async function acceptSuggestion() {
    const s = p?.suggestion;
    if (s) {
      await updateData((d) => {
        d.routines.push({ id: uid(), title: s.title, days: s.days, time: s.time, enabled: true, lastFired: null });
      });
    }
    close();
  }

  async function rejectSuggestion() {
    const s = p?.suggestion;
    if (s) {
      await updateData((d) => {
        if (!d.settings.dismissedSuggestions.includes(s.key)) d.settings.dismissedSuggestions.push(s.key);
      });
    }
    close();
  }

  const openPanel = async () => {
    await close();
    invoke("show_panel");
  };

  return (
    <div
      ref={card}
      key={key}
      style={{
        display: "inline-block",
        padding: "10px 14px 14px",
        animation: "lumi-pop 0.18s ease-out",
        transformOrigin: tailOnLeft ? "left center" : "right center",
      }}
    >
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
          style={{
            position: "absolute",
            top: "50%",
            [tailOnLeft ? "left" : "right"]: -6,
            width: 14,
            height: 14,
            marginTop: -7,
            background: "#fff",
            transform: "rotate(45deg)",
            borderRadius: 2,
          }}
        />
        <div className="row" style={{ justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
          <span style={{ color: "var(--indigo-strong)" }}>{KIND_LABEL[p.kind]}</span>
          <span className="row" style={{ gap: 4, color: "var(--muted)" }}>
            {p.time}
            <button
              type="button"
              className="icon-btn plain"
              aria-label="Cerrar aviso"
              onClick={close}
              style={{ width: 28, height: 28, marginRight: -8, marginTop: -4 }}
            >
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
          {p.kind === "recordatorio" && (
            <>
              <button className="btn btn-primary" onClick={done}>
                Hecho
              </button>
              <button className="btn btn-outline" onClick={() => snooze(30)}>
                En 30 min
              </button>
              <button className="btn btn-ghost" onClick={() => snooze(120)}>
                En 2 h
              </button>
            </>
          )}
          {p.kind === "reunion" && (
            <>
              {p.link ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    openUrl(p.link!);
                    close();
                  }}
                >
                  Unirme
                </button>
              ) : (
                <button className="btn btn-primary" onClick={openPanel}>
                  Ver mi agenda
                </button>
              )}
              <button className="btn btn-outline" onClick={close}>
                Entendido
              </button>
            </>
          )}
          {p.kind === "rutina" && (
            <>
              <button className="btn btn-primary" onClick={close}>
                Listo
              </button>
              <button className="btn btn-outline" onClick={() => snooze(15)}>
                En 15 min
              </button>
            </>
          )}
          {p.kind === "sugerencia" && (
            <>
              <button className="btn btn-dark" onClick={acceptSuggestion}>
                Sí, recuérdamelo
              </button>
              <button className="btn btn-outline" onClick={rejectSuggestion}>
                No, gracias
              </button>
            </>
          )}
          {p.kind === "hola" && (
            <>
              <button className="btn btn-primary" onClick={openPanel}>
                {p.cta ?? "Ver mi día"}
              </button>
              <button className="btn btn-outline" onClick={close}>
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
