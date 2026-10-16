import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LumiFace } from "../components/LumiFace";
import { IconArrow, IconChat, IconClose, IconPin, IconRoutine, IconSettings, IconVideo } from "../components/Icons";
import { addDays, dayLabel, fmtTime, greeting, longDate, relative, startOfDay } from "../lib/time";
import type { LumiData, Meeting, MeetingsCache, Task } from "../lib/types";
import { TaskItem } from "./TaskItem";
import { Card } from "./ui";
import type { View } from "./main";

type Tab = "hoy" | "pend" | "reu";

export function Home({
  data,
  cache,
  go,
  now,
}: {
  data: LumiData;
  cache: MeetingsCache;
  go: (v: View) => void;
  now: Date;
}) {
  const [tab, setTab] = useState<Tab>("hoy");
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const un = listen("lumi://panel-opened", () => input.current?.focus());
    return () => {
      un.then((f) => f());
    };
  }, []);

  const endToday = addDays(startOfDay(now), 1);
  const pending = data.tasks.filter((t) => !t.done);
  const today = pending
    .filter((t) => t.remindAt && new Date(t.remindAt) < endToday)
    .sort((a, b) => (a.remindAt ?? "").localeCompare(b.remindAt ?? ""));
  const doneToday = data.tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt) >= startOfDay(now));
  const nextMeeting = cache.meetings.find(
    (m) => !m.allDay && new Date(m.end) > now && new Date(m.start) < endToday,
  );
  const name = data.settings.userName.trim();
  const open = (t: Task) => go({ name: "note", taskId: t.id });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = note.trim();
    if (!text) return;
    setNote("");
    go({ name: "note", text });
  }

  function togglePin() {
    const v = !pinned;
    setPinned(v);
    invoke("set_panel_pinned", { pinned: v });
  }

  return (
    <>
      <div className="row" style={{ padding: "18px 16px 12px 18px", gap: 12 }}>
        <button
          type="button"
          aria-label="Cambiar la apariencia de Lumi"
          title="Cambiar mi look"
          onClick={() => go({ name: "appearance" })}
          style={{ flex: "none", width: 48, height: 48, padding: 0, border: 0, borderRadius: 14, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <LumiFace size={46} mood={today.length ? "pendientes" : "reposo"} />
        </button>
        <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 700, lineHeight: 1.15 }}>
            {greeting(now)}
            {name ? `, ${name}` : ""}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {longDate(now)} · {today.length === 0 ? "todo al día" : today.length === 1 ? "1 para hoy" : `${today.length} para hoy`}
          </span>
        </div>
        <button
          type="button"
          className={`icon-btn${pinned ? " on" : ""}`}
          aria-pressed={pinned}
          aria-label={pinned ? "Dejar de fijar el menú" : "Fijar el menú abierto"}
          title={pinned ? "Fijado: no se cierra solo" : "Fijar abierto"}
          onClick={togglePin}
        >
          <IconPin size={18} />
        </button>
        <button type="button" className="icon-btn plain" aria-label="Cerrar menú" onClick={() => invoke("hide_panel")}>
          <IconClose size={18} />
        </button>
      </div>

      <form onSubmit={submit} style={{ padding: "0 16px 12px" }}>
        <label htmlFor="nota-rapida" className="field-label">
          Nota rápida
        </label>
        <div
          className="row"
          style={{ gap: 6, padding: "4px 4px 4px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--line-strong)" }}
        >
          <input
            id="nota-rapida"
            ref={input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej. mandar correo hoy a Laura para explicarle…"
            autoComplete="off"
            style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: "transparent", fontSize: 14, outline: "none" }}
          />
          <button type="submit" className="icon-btn" aria-label="Crear recordatorio" disabled={!note.trim()} style={{ background: "var(--indigo)", color: "#fff", opacity: note.trim() ? 1 : 0.5 }}>
            <IconArrow size={18} />
          </button>
        </div>
        <span className="hint" style={{ display: "block", marginTop: 6 }}>
          Etiqueta con <b>@Cliente</b> y <b>#Proyecto</b>. Lumi entiende «mañana a las 5», «antes de comer», «el jueves»…
        </span>
      </form>

      <div
        role="tablist"
        aria-label="Vistas"
        style={{ margin: "0 16px", padding: 4, borderRadius: 14, background: "var(--surface)", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}
      >
        {(
          [
            ["hoy", "Hoy"],
            ["pend", "Pendientes"],
            ["reu", "Reuniones"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              height: 36,
              border: 0,
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 13.5,
              background: tab === id ? "#fff" : "transparent",
              color: tab === id ? "var(--ink)" : "var(--muted)",
              boxShadow: tab === id ? "0 1px 3px rgba(30,32,51,0.12)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="scroll" style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "hoy" && (
          <>
            {nextMeeting && <MeetingCard m={nextMeeting} now={now} />}
            <p className="section-title">Pendientes de hoy</p>
            {today.length === 0 ? (
              <Empty
                text={doneToday.length ? `¡Listo por hoy! Completaste ${doneToday.length}.` : "Nada pendiente para hoy. Escribe una nota arriba cuando se te ocurra algo."}
              />
            ) : (
              today.map((t) => <TaskItem key={t.id} task={t} onOpen={open} now={now} />)
            )}
            {today.length > 0 && doneToday.length > 0 && (
              <span className="hint">Ya completaste {doneToday.length} hoy.</span>
            )}
          </>
        )}

        {tab === "pend" && (
          <PendingList data={data} filter={filter} setFilter={setFilter} showDone={showDone} setShowDone={setShowDone} open={open} now={now} />
        )}

        {tab === "reu" && <MeetingList cache={cache} now={now} hasCalendars={data.settings.calendars.length > 0} go={go} />}
      </div>

      <nav aria-label="Más de Lumi" style={{ borderTop: "1px solid var(--line)", padding: "6px 10px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
        <NavButton label="Pregúntale" onClick={() => go({ name: "chat" })} active>
          <IconChat size={20} />
        </NavButton>
        <NavButton label="Rutinas" onClick={() => go({ name: "routines" })}>
          <IconRoutine size={20} />
        </NavButton>
        <NavButton label="Ajustes" onClick={() => go({ name: "settings" })}>
          <IconSettings size={20} />
        </NavButton>
      </nav>
    </>
  );
}

function NavButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 50,
        border: 0,
        borderRadius: 12,
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        color: active ? "var(--indigo-strong)" : "var(--muted-strong)",
        fontSize: 12,
        fontWeight: 600,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: "18px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
      <LumiFace size={56} />
      <span style={{ fontSize: 13.5, color: "var(--muted)", maxWidth: 280, lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}

function MeetingCard({ m, now }: { m: Meeting; now: Date }) {
  const start = new Date(m.start);
  const end = new Date(m.end);
  const live = start <= now;
  return (
    <>
      <p className="section-title">{live ? "En curso" : "Siguiente reunión"}</p>
      <Card tone="lavender">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--indigo-deep)" }}>
            {fmtTime(start)} – {fmtTime(end)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--sun)", color: "var(--ink)" }}>
            {live ? "ahora" : relative(start, now)}
          </span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{m.title}</span>
        <span style={{ fontSize: 12.5, color: "var(--muted-strong)" }}>
          {m.calendar}
          {m.location && !m.location.startsWith("http") ? ` · ${m.location}` : ""}
        </span>
        {m.link && (
          <div className="row">
            <button className="btn btn-primary" onClick={() => openUrl(m.link!)}>
              <IconVideo size={16} /> Unirme
            </button>
          </div>
        )}
      </Card>
    </>
  );
}

function PendingList({
  data,
  filter,
  setFilter,
  showDone,
  setShowDone,
  open,
  now,
}: {
  data: LumiData;
  filter: string | null;
  setFilter: (f: string | null) => void;
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  open: (t: Task) => void;
  now: Date;
}) {
  const match = (t: Task) => !filter || t.tags.some((g) => `${g.kind}:${g.name}` === filter);
  const pending = data.tasks
    .filter((t) => !t.done && match(t))
    .sort((a, b) => (a.remindAt ?? "9999").localeCompare(b.remindAt ?? "9999"));
  const done = data.tasks
    .filter((t) => t.done && match(t))
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""))
    .slice(0, 20);
  const usedTags = data.tags.filter((g) => data.tasks.some((t) => t.tags.some((x) => x.kind === g.kind && x.name === g.name)));

  return (
    <>
      {usedTags.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <button type="button" className={`tag big ${filter === null ? "selected-dark" : "neutral"}`} onClick={() => setFilter(null)}>
            Todos
          </button>
          {usedTags.map((g) => {
            const key = `${g.kind}:${g.name}`;
            return (
              <button
                key={key}
                type="button"
                className={`tag big ${filter === key ? "selected-dark" : g.kind}`}
                aria-pressed={filter === key}
                onClick={() => setFilter(filter === key ? null : key)}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}
      {pending.length === 0 ? (
        <Empty text={filter ? "No hay pendientes con esta etiqueta." : "No tienes pendientes. ¡Qué tranquilidad!"} />
      ) : (
        pending.map((t) => <TaskItem key={t.id} task={t} onOpen={open} now={now} />)
      )}
      {done.length > 0 && (
        <>
          <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            {showDone ? "Ocultar completados" : `Ver completados (${done.length})`}
          </button>
          {showDone && done.map((t) => <TaskItem key={t.id} task={t} onOpen={open} now={now} />)}
        </>
      )}
    </>
  );
}

function MeetingList({ cache, now, hasCalendars, go }: { cache: MeetingsCache; now: Date; hasCalendars: boolean; go: (v: View) => void }) {
  if (!hasCalendars) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 8px", textAlign: "center" }}>
        <LumiFace size={56} mood="reunion" />
        <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45 }}>
          Conecta tu calendario de Google o de Outlook para que te avise antes de cada reunión.
        </span>
        <button className="btn btn-primary" onClick={() => go({ name: "settings" })}>
          Conectar calendario
        </button>
      </div>
    );
  }
  const upcoming = cache.meetings.filter((m) => new Date(m.end) > now);
  const groups = new Map<string, Meeting[]>();
  for (const m of upcoming) {
    const label = dayLabel(new Date(m.start), now);
    groups.set(label, [...(groups.get(label) ?? []), m]);
  }
  const errors = cache.status.filter((s) => !s.ok);
  return (
    <>
      {errors.map((e) => (
        <Card key={e.id} tone="sun">
          <span style={{ fontSize: 13, color: "var(--sun-ink)", fontWeight: 600 }}>No pude leer «{e.name}»</span>
          <span className="hint">{e.error}</span>
        </Card>
      ))}
      {upcoming.length === 0 && <Empty text={cache.updatedAt ? "Sin reuniones en los próximos 7 días." : "Leyendo tus calendarios…"} />}
      {[...groups.entries()].map(([label, list]) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p className="section-title">{label}</p>
          {list.map((m) => {
            const s = new Date(m.start);
            const mins = Math.round((new Date(m.end).getTime() - s.getTime()) / 60000);
            return (
              <div key={m.id} className="row" style={{ alignItems: "flex-start", gap: 14, padding: 12, borderRadius: 14, border: "1px solid var(--line)" }}>
                <div style={{ width: 54, flex: "none", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700 }}>{m.allDay ? "Todo el día" : fmtTime(s)}</span>
                  {!m.allDay && <span style={{ fontSize: 12, color: "var(--muted)" }}>{mins >= 60 ? `${Math.round((mins / 60) * 10) / 10} h` : `${mins} min`}</span>}
                </div>
                <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>{m.title}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{m.calendar}</span>
                </div>
                {m.link && (
                  <button type="button" className="icon-btn" aria-label={`Unirme a ${m.title}`} title="Unirme" onClick={() => openUrl(m.link!)}>
                    <IconVideo size={17} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
