import { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { DEFAULT_AVATAR, addDays, startOfDay } from "@lumi/shared";
import "../styles.css";
import { AvatarLook, LumiFace, type Mood } from "../components/LumiFace";
import { lumi, useNow, useSnapshot } from "../lib/api";
import { countdown, currentLook, modeInfo } from "../lib/modes";

function Avatar() {
  const snap = useSnapshot();
  // Con una sesión de estudio, el reloj avanza cada segundo
  const now = useNow(snap?.school.study ? 1000 : 30_000);
  const [dragging, setDragging] = useState(false);
  const press = useRef<{ x: number; y: number; dragging: boolean; beat: number } | null>(null);

  const endOfToday = addDays(startOfDay(now), 1);
  const info = snap ? modeInfo(snap) : null;
  // El número cuenta solo lo del modo activo (y lo compartido)
  const badge = snap && info ? snap.tasks.filter((t) => !t.done && t.remindAt && new Date(t.remindAt) < endOfToday && info.visible(t.mode)).length : 0;
  const meetingSoon = !!snap?.meetings.some((m) => {
    if (m.allDay) return false;
    const diff = new Date(m.start).getTime() - now.getTime();
    return diff > -60_000 && diff < (snap.settings.meetingLeadMin ?? 10) * 60_000;
  });
  const study = snap?.school.study ?? null;
  const focusing = study?.phase === "enfoque" && new Date(study.endsAt) > now;
  const thinking = !!snap?.index.indexing;
  const mood: Mood = dragging
    ? "arrastrando"
    : snap?.bubbleOpen
      ? "hablando"
      : meetingSoon
        ? "reunion"
        : focusing
          ? "concentrada"
          : thinking
            ? "pensando"
            : badge > 0
              ? "pendientes"
              : "reposo";
  // Look base → look del modo → ropa de reunión (si elegiste una)
  const saved = snap?.settings.avatar ?? DEFAULT_AVATAR;
  const look = currentLook(snap, saved, meetingSoon);
  const modeIcon = info?.multi ? info.active?.icono : null;

  return (
    <button
      type="button"
      aria-label={`Lumi, tu asistente${info?.multi && info.active ? `, en modo ${info.active.nombre}` : ""}${badge ? `: ${badge} pendientes hoy` : ""}${focusing ? `, estudiando (${countdown(study!.endsAt, now)})` : ""}. Clic para abrir el menú, arrastra para moverlo, clic derecho para más opciones`}
      title="Clic: abrir menú · Arrastra: mover · Clic derecho: cambiar look y más"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        padding: 0,
        border: 0,
        background: "transparent",
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
        outline: "none",
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.ctrlKey) return; // ctrl+clic en Mac = clic derecho
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current = { x: e.screenX, y: e.screenY, dragging: false, beat: 0 };
        void lumi.avatarPress();
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p) return;
        if (p.dragging) {
          // «Sigo arrastrando»: si esta señal se corta, Lumi deja de seguir al mouse
          if (e.timeStamp - p.beat > 200) {
            p.beat = e.timeStamp;
            void lumi.avatarDrag(true);
          }
          return;
        }
        if (Math.hypot(e.screenX - p.x, e.screenY - p.y) > 4) {
          p.dragging = true;
          p.beat = e.timeStamp;
          setDragging(true);
          void lumi.avatarDrag(true);
        }
      }}
      onLostPointerCapture={() => {
        const p = press.current;
        if (!p?.dragging) return;
        press.current = null;
        setDragging(false);
        void lumi.avatarDrag(false);
      }}
      onPointerUp={() => {
        const p = press.current;
        press.current = null;
        if (!p) return;
        if (p.dragging) {
          setDragging(false);
          void lumi.avatarDrag(false);
        } else void lumi.togglePanel();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        press.current = null;
        void lumi.avatarMenu();
      }}
      onPointerCancel={() => {
        if (press.current?.dragging) void lumi.avatarDrag(false);
        press.current = null;
        setDragging(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void lumi.togglePanel();
        }
      }}
    >
      <span style={{ position: "absolute", left: 6, top: 10, display: "block", animation: dragging ? "none" : "lumi-bob 3.2s ease-in-out infinite" }}>
        <AvatarLook.Provider value={look}>
          <LumiFace size={84} mood={mood} shadow />
        </AvatarLook.Provider>
      </span>
      {focusing && !snap?.bubbleOpen && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 0,
            transform: "translateX(-50%)",
            padding: "0 7px",
            height: 20,
            borderRadius: 10,
            background: "#2BA58F",
            color: "#fff",
            font: "700 11.5px/20px var(--font)",
            fontVariantNumeric: "tabular-nums",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.9)",
          }}
        >
          {countdown(study!.endsAt, now)}
        </span>
      )}
      {modeIcon && !focusing && (
        <span aria-hidden="true" title={info?.active?.nombre} style={{ position: "absolute", left: 4, bottom: 6, width: 24, height: 24, borderRadius: 12, background: "#fff", boxShadow: "0 1px 3px rgba(10,11,30,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
          {modeIcon}
        </span>
      )}
      {badge > 0 && !snap?.bubbleOpen && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 6,
            top: 14,
            minWidth: 22,
            height: 22,
            padding: "0 6px",
            borderRadius: 11,
            background: "var(--sun)",
            color: "var(--ink)",
            font: "700 12px/22px var(--font)",
            textAlign: "center",
            boxShadow: "0 0 0 3px rgba(51,55,90,0.9)",
          }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Avatar />);
