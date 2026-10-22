import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import { DEFAULT_AVATAR } from "@lumi/shared";
import { AvatarLook } from "../components/LumiFace";
import { lumi, useNow, useSnapshot } from "../lib/api";
import { ModeViewContext, currentLook } from "../lib/modes";
import { Modes } from "./Modes";
import { Personal } from "./Personal";
import { Review } from "./Review";
import { School } from "./School";
import { Appearance } from "./Appearance";
import { Chat } from "./Chat";
import { Home } from "./Home";
import { Memory } from "./Memory";
import { NoteEditor } from "./NoteEditor";
import { Onboarding } from "./Onboarding";
import { Routines } from "./Routines";
import { Settings } from "./Settings";
import { Clients } from "./Clients";

export type View =
  | { name: "home" }
  | { name: "note"; text?: string; taskKey?: string }
  | { name: "chat" }
  | { name: "routines" }
  | { name: "settings" }
  | { name: "memory" }
  | { name: "appearance" }
  | { name: "modes" }
  | { name: "clients" }
  | { name: "school" }
  | { name: "personal"; list?: string }
  | { name: "review"; subject?: string | null };

function Panel() {
  const snap = useSnapshot();
  const now = useNow(snap?.school.study ? 1000 : 30_000);
  const [view, setView] = useState<View>({ name: "home" });
  const [all, setAll] = useState(false);

  // Clic derecho en el avatar o en la bandeja: abrir una vista concreta
  useEffect(() => lumi.on("panel-view", (name) => setView({ name } as View)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setView((v) => {
        if (v.name === "home") {
          void lumi.hidePanel();
          return v;
        }
        if (v.name === "review") return { name: "school" };
        return v.name === "appearance" || v.name === "modes" || v.name === "clients" ? { name: "settings" } : { name: "home" };
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const home = () => setView({ name: "home" });
  let content: React.ReactNode = null;
  if (snap && !snap.settings.onboarded) content = <Onboarding snap={snap} />;
  else if (snap) {
    if (view.name === "home") content = <Home snap={snap} go={setView} now={now} />;
    else if (view.name === "note") content = <NoteEditor key={view.taskKey ?? view.text} snap={snap} text={view.text} taskKey={view.taskKey} onDone={home} />;
    else if (view.name === "chat") content = <Chat snap={snap} go={setView} />;
    else if (view.name === "routines") content = <Routines snap={snap} go={setView} />;
    else if (view.name === "settings") content = <Settings snap={snap} go={setView} />;
    else if (view.name === "memory") content = <Memory snap={snap} go={setView} />;
    else if (view.name === "appearance") content = <Appearance snap={snap} go={setView} />;
    else if (view.name === "modes") content = <Modes snap={snap} go={setView} />;
    else if (view.name === "clients") content = <Clients snap={snap} go={setView} />;
    else if (view.name === "school") content = <School snap={snap} go={setView} now={now} />;
    else if (view.name === "personal") content = <Personal key={view.list} snap={snap} go={setView} now={now} list={view.list} />;
    else if (view.name === "review") content = <Review snap={snap} go={setView} subject={view.subject} />;
  }

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
        <ModeViewContext.Provider value={{ all, setAll }}>
          <AvatarLook.Provider value={currentLook(snap, snap?.settings.avatar ?? DEFAULT_AVATAR)}>{content}</AvatarLook.Provider>
        </ModeViewContext.Provider>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>,
);
