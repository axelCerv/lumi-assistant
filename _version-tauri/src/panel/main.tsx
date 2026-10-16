import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "../styles.css";
import { AvatarLook, LumiFace } from "../components/LumiFace";
import { DEFAULT_AVATAR, PRESETS } from "../lib/avatar";
import { updateData, useLumiData, useMeetings } from "../lib/store";
import type { LumiData } from "../lib/types";
import { Appearance } from "./Appearance";
import { Chat } from "./Chat";
import { Home } from "./Home";
import { Memory } from "./Memory";
import { NoteEditor } from "./NoteEditor";
import { Routines } from "./Routines";
import { Settings } from "./Settings";

export type View =
  | { name: "home" }
  | { name: "note"; text?: string; taskId?: string }
  | { name: "chat" }
  | { name: "routines" }
  | { name: "settings" }
  | { name: "memory" }
  | { name: "appearance" };

function Welcome({ data }: { data: LumiData }) {
  const [name, setName] = useState(data.settings.userName);
  const [look, setLook] = useState(data.avatar);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateData((d) => {
          d.settings.userName = name.trim();
          d.settings.onboarded = true;
          d.avatar = look;
        });
      }}
      style={{ flex: 1, padding: "26px 28px 24px", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ alignSelf: "center", animation: "lumi-bob 3.2s ease-in-out infinite" }}>
        <LumiFace size={108} mood="hablando" shadow look={look} />
      </div>
      <h1 style={{ margin: 0, fontFamily: "var(--display)", fontSize: 28, fontWeight: 700, textAlign: "center" }}>¡Hola! Soy Lumi</h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--muted-strong)", textAlign: "center" }}>
        Voy a flotar en tu pantalla para recordarte tus pendientes, avisarte de tus reuniones y ayudarte con tus rutinas. Arrástrame a donde no estorbe.
      </p>
      <div style={{ marginTop: 8 }}>
        <label htmlFor="bienvenida-nombre" className="field-label">
          ¿Cómo te llamo?
        </label>
        <input id="bienvenida-nombre" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" autoFocus />
      </div>
      <div>
        <span id="elige-lumi" className="field-label">
          Elige tu Lumi
        </span>
        <div role="group" aria-labelledby="elige-lumi" style={{ display: "grid", gridTemplateColumns: `repeat(${PRESETS.length}, minmax(0, 1fr))`, gap: 4 }}>
          {PRESETS.map((pr) => {
            const on = pr.look === look;
            return (
              <button
                key={pr.id}
                type="button"
                aria-pressed={on}
                aria-label={pr.name}
                title={pr.name}
                onClick={() => setLook(pr.look)}
                style={{
                  aspectRatio: "1",
                  padding: 0,
                  borderRadius: 12,
                  background: on ? "var(--lavender)" : "#fff",
                  border: on ? "2px solid var(--indigo)" : "1px solid var(--line-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LumiFace size={36} look={pr.look} />
              </button>
            );
          })}
        </div>
        <span className="hint">Después puedes cambiarle ropa, cabello y lentes en Ajustes.</span>
      </div>
      <div style={{ flex: 1 }} />
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--muted-strong)", lineHeight: 1.6 }}>
        <li>Escribe notas como «llamar a Ana mañana a las 5 @Cliente».</li>
        <li>Conecta tu calendario y tu clave de Claude en Ajustes.</li>
      </ul>
      <button type="submit" className="btn btn-primary btn-lg btn-block">
        Empezar
      </button>
    </form>
  );
}

function Panel() {
  const data = useLumiData();
  const cache = useMeetings();
  const [view, setView] = useState<View>({ name: "home" });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setView((v) => {
        if (v.name === "home") {
          invoke("hide_panel");
          return v;
        }
        return v.name === "memory" || v.name === "appearance" ? { name: "settings" } : { name: "home" };
      });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const home = () => setView({ name: "home" });

  let content: React.ReactNode = null;
  if (!data) content = null;
  else if (!data.settings.onboarded) content = <Welcome data={data} />;
  else if (view.name === "home") content = <Home data={data} cache={cache} go={setView} now={now} />;
  else if (view.name === "note") content = <NoteEditor key={view.taskId ?? view.text} data={data} text={view.text} taskId={view.taskId} onDone={home} />;
  else if (view.name === "chat") content = <Chat data={data} meetings={cache.meetings} go={setView} />;
  else if (view.name === "routines") content = <Routines data={data} go={setView} />;
  else if (view.name === "settings") content = <Settings data={data} cache={cache} go={setView} />;
  else if (view.name === "memory") content = <Memory data={data} go={setView} />;
  else if (view.name === "appearance") content = <Appearance data={data} go={setView} />;

  return (
    <div style={{ padding: 12, width: "100vw", height: "100vh" }}>
      <main
        style={{
          width: "100%",
          height: "100%",
          background: "#fff",
          borderRadius: 24,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 24px rgba(10, 11, 30, 0.28), 0 0 0 1px rgba(30,32,51,0.08)",
          animation: "lumi-pop 0.16s ease-out",
        }}
      >
        <AvatarLook.Provider value={data?.avatar ?? DEFAULT_AVATAR}>{content}</AvatarLook.Provider>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>,
);
