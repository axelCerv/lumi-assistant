import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import "../styles.css";
import { AvatarLook, LumiFace, type Mood } from "../components/LumiFace";
import { DEFAULT_AVATAR } from "../lib/avatar";
import { loadData, updateData, useLumiData } from "../lib/store";
import { loadCalendars } from "../lib/calendar";
import { suggestRoutines, suggestionText } from "../lib/routines";
import { addDays, dayKey, fmtTime, greeting, relative, startOfDay } from "../lib/time";
import type { BubblePayload, LumiData, Meeting, Task } from "../lib/types";

const TICK_MS = 20_000;
const CALENDAR_MS = 10 * 60_000;

function lowerFirst(s: string) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function reminderText(t: Task, data: LumiData, now: Date): string {
  const name = data.settings.userName.trim();
  const at = t.remindAt ? new Date(t.remindAt) : now;
  const late = now.getTime() - at.getTime() > 30 * 60_000;
  const lead = name ? `${name}, ` : "";
  if (late) return `${lead}esto quedó pendiente desde las ${fmtTime(at)}: ${lowerFirst(t.text)}. ¿Lo hacemos ahora?`;
  return `${lead}te recuerdo: ${lowerFirst(t.text)}. ¿Lo hacemos ahora?`;
}

let notifyAllowed: boolean | null = null;
async function notify(title: string, body: string) {
  try {
    if (notifyAllowed === null) {
      notifyAllowed = await isPermissionGranted();
      if (!notifyAllowed) notifyAllowed = (await requestPermission()) === "granted";
    }
    if (notifyAllowed) sendNotification({ title, body });
  } catch {
    /* sin notificaciones del sistema: la burbuja basta */
  }
}

function Avatar() {
  const data = useLumiData();
  const [now, setNow] = useState(() => new Date());
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const meetingsRef = useRef<Meeting[]>([]);
  const alerted = useRef<Set<string>>(new Set());
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const busy = useRef(false);
  const welcomed = useRef(false);
  const calendarsKey = useRef<string>("");

  // ---------- burbuja ----------
  async function show(payload: BubblePayload, systemTitle?: string) {
    await invoke("show_bubble", { payload });
    setBubbleOpen(true);
    const d = (await loadData()).data;
    if (systemTitle && d.settings.systemNotifications) notify(systemTitle, payload.text);
  }

  // ---------- el reloj de Lumi: revisa qué toca avisar ----------
  async function tick() {
    if (busy.current) return;
    busy.current = true;
    try {
      const current = await invoke<BubblePayload | null>("get_bubble");
      if (current) return; // un aviso a la vez
      const { data } = await loadData();
      const now = new Date();
      const today = dayKey(now);
      const s = data.settings;

      // 0) Primera vez: presentarse
      if (!s.onboarded) {
        if (!welcomed.current) {
          welcomed.current = true;
          await show({
            kind: "hola",
            text: "¡Hola! Soy Lumi, tu asistente. Haz clic en mí cuando quieras anotar algo o ver tu día.",
            time: "",
            cta: "Empezar",
          });
        }
        return;
      }

      // 1) Saludo del día
      if (s.onboarded && s.lastGreeting !== today && now.getHours() >= 6) {
        await updateData((d) => {
          d.settings.lastGreeting = today;
        });
        const end = addDays(startOfDay(now), 1);
        const pending = data.tasks.filter((t) => !t.done && t.remindAt && new Date(t.remindAt) < end).length;
        const todays = meetingsRef.current.filter((m) => !m.allDay && new Date(m.start) >= now && new Date(m.start) < end);
        const parts: string[] = [];
        parts.push(pending === 0 ? "no tienes pendientes para hoy" : pending === 1 ? "tienes 1 pendiente hoy" : `tienes ${pending} pendientes hoy`);
        if (todays.length) parts.push(`${todays.length === 1 ? "1 reunión" : `${todays.length} reuniones`}, la primera a las ${fmtTime(new Date(todays[0].start))}`);
        const name = s.userName.trim();
        await show({
          kind: "hola",
          text: `¡${greeting(now)}${name ? `, ${name}` : ""}! Hoy ${parts.join(" y ")}.`,
          time: fmtTime(now),
        });
        return;
      }

      // 2) Reuniones que están por empezar
      for (const m of meetingsRef.current) {
        if (m.allDay || alerted.current.has(m.id)) continue;
        const start = new Date(m.start);
        const lead = s.meetingLeadMin * 60_000;
        if (now.getTime() >= start.getTime() - lead && now.getTime() < start.getTime() + 2 * 60_000) {
          alerted.current.add(m.id);
          await show(
            {
              kind: "reunion",
              text: `Tu reunión «${m.title}» empieza ${relative(start, now)}, a las ${fmtTime(start)}.`,
              time: relative(start, now),
              meetingId: m.id,
              link: m.link,
            },
            "Reunión en camino",
          );
          return;
        }
      }

      // 3) Recordatorios vencidos
      const due = data.tasks
        .filter((t) => !t.done && !t.notified && t.remindAt && new Date(t.remindAt) <= now)
        .sort((a, b) => (a.remindAt ?? "").localeCompare(b.remindAt ?? ""));
      if (due.length) {
        const t = due[0];
        await updateData((d) => {
          const x = d.tasks.find((y) => y.id === t.id);
          if (x) x.notified = true;
        });
        await show(
          {
            kind: "recordatorio",
            text: reminderText(t, data, now),
            time: fmtTime(new Date(t.remindAt!)),
            tags: t.tags,
            taskId: t.id,
          },
          "Lumi te recuerda",
        );
        return;
      }

      // 4) Rutinas
      for (const r of data.routines) {
        if (!r.enabled || !r.days.includes(now.getDay()) || r.lastFired === today) continue;
        const [h, mi] = r.time.split(":").map((n) => parseInt(n, 10));
        const at = new Date(now);
        at.setHours(h, mi, 0, 0);
        const diff = now.getTime() - at.getTime();
        if (diff >= 0 && diff < 90 * 60_000) {
          await updateData((d) => {
            const x = d.routines.find((y) => y.id === r.id);
            if (x) x.lastFired = today;
          });
          await show({ kind: "rutina", text: `Es hora de: ${lowerFirst(r.title)}.`, time: r.time, routineId: r.id }, "Rutina");
          return;
        }
      }

      // 5) Una vez al día: ¿hay algo que haces seguido?
      if (s.lastSuggestionCheck !== today && now.getHours() >= 10) {
        await updateData((d) => {
          d.settings.lastSuggestionCheck = today;
        });
        const sug = suggestRoutines(data, now)[0];
        if (sug) {
          await show({
            kind: "sugerencia",
            text: suggestionText(sug),
            time: "Rutina detectada",
            suggestion: { key: sug.key, title: sug.title, days: sug.days, time: sug.time },
          });
        }
      }
    } catch (e) {
      console.error("tick", e);
    } finally {
      busy.current = false;
    }
  }

  // ---------- calendarios ----------
  async function refreshCalendars() {
    try {
      const { data } = await loadData();
      calendarsKey.current = JSON.stringify(data.settings.calendars);
      const cache = await loadCalendars(data.settings.calendars);
      meetingsRef.current = cache.meetings;
      setMeetings(cache.meetings);
      await invoke("set_meetings", { meetings: cache });
    } catch (e) {
      console.error("calendarios", e);
    }
  }

  useEffect(() => {
    refreshCalendars().then(() => setTimeout(tick, 2500));
    const t1 = setInterval(tick, TICK_MS);
    const t2 = setInterval(refreshCalendars, CALENDAR_MS);
    const t3 = setInterval(() => setNow(new Date()), 30_000);
    const unRefresh = listen("lumi://refresh-calendars", refreshCalendars);
    const unClosed = listen("lumi://bubble-closed", () => {
      setBubbleOpen(false);
      setTimeout(tick, 1500); // si hay otro aviso en fila, que salga
    });
    const unData = listen("lumi://data", async () => {
      const { data } = await loadData();
      if (JSON.stringify(data.settings.calendars) !== calendarsKey.current) refreshCalendars();
    });
    let moveTimer: number | undefined;
    const unMoved = getCurrentWindow().onMoved(() => {
      setDragging(true);
      window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(() => setDragging(false), 250);
    });
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
      [unRefresh, unClosed, unData, unMoved].forEach((u) => u.then((f) => f()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- estado visible ----------
  const endOfToday = addDays(startOfDay(now), 1);
  const badge = data ? data.tasks.filter((t) => !t.done && t.remindAt && new Date(t.remindAt) < endOfToday).length : 0;
  const meetingSoon = meetings.some((m) => {
    if (m.allDay) return false;
    const diff = new Date(m.start).getTime() - now.getTime();
    return diff > -60_000 && diff < (data?.settings.meetingLeadMin ?? 10) * 60_000;
  });
  const mood: Mood = dragging ? "arrastrando" : bubbleOpen ? "hablando" : meetingSoon ? "reunion" : badge > 0 ? "pendientes" : "reposo";
  // En reuniones, Lumi se pone sola la prenda que elegiste (si elegiste una).
  const saved = data?.avatar ?? DEFAULT_AVATAR;
  const look = meetingSoon && saved.reunion ? { ...saved, prenda: saved.reunion } : saved;

  return (
    <button
      type="button"
      aria-label={`Lumi, tu asistente${badge ? `: ${badge} pendientes hoy` : ""}. Clic para abrir el menú, arrastra para moverlo`}
      title="Clic: abrir menú · Arrastra: mover"
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
        if (e.button !== 0) return;
        press.current = { x: e.screenX, y: e.screenY, dragging: false };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.dragging || !(e.buttons & 1)) return;
        if (Math.hypot(e.screenX - p.x, e.screenY - p.y) > 4) {
          p.dragging = true;
          getCurrentWindow().startDragging().catch(console.error);
        }
      }}
      onPointerUp={() => {
        const p = press.current;
        press.current = null;
        if (p && !p.dragging) invoke("toggle_panel");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          invoke("toggle_panel");
        }
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 6,
          top: 10,
          display: "block",
          animation: dragging ? "none" : "lumi-bob 3.2s ease-in-out infinite",
        }}
      >
        <AvatarLook.Provider value={look}>
          <LumiFace size={84} mood={mood} shadow />
        </AvatarLook.Provider>
      </span>
      {badge > 0 && !bubbleOpen && (
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

// Sin StrictMode: el reloj de avisos no debe arrancar dos veces.
ReactDOM.createRoot(document.getElementById("root")!).render(<Avatar />);
