import { useEffect, useRef, useState } from "react";
import type { AppSnapshot, Meeting, ModeWidget, Task } from "@lumi/shared";
import { addDays, dayKey, dayLabel, fmtTime, greeting, longDate, relative, startOfDay } from "@lumi/shared";
import { LumiFace } from "../components/LumiFace";
import { IconArrow, IconBrain, IconChat, IconClose, IconPin, IconRoutine, IconSettings, IconVideo } from "../components/Icons";
import { lumi } from "../lib/api";
import { modeInfo, useModeView } from "../lib/modes";
import { TaskItem } from "./TaskItem";
import { Card } from "./ui";
import { ModeBar } from "./ModeSwitcher";
import { BirthdaysCard, DayCard, DeadlinesCard, HabitsCard, ListsCard, NextClassCard, PaymentsCard, ReviewCard, StudyCard } from "./widgets";
import { SchoolBody } from "./School";
import { PersonalBody } from "./Personal";
import type { View } from "./main";

type Tab = "hoy" | "pend" | "modo";

const PLACEHOLDER: Record<string, string> = {
  trabajo: "Ej. mandar correo hoy a Laura para explicarle…",
  escuela: "Ej. estudiar para el parcial de Cálculo el jueves…",
  personal: "Ej. pagar la luz el viernes, comprar leche…",
};

export function Home({ snap, go, now }: { snap: AppSnapshot; go: (v: View) => void; now: Date }) {
  const { all } = useModeView();
  const info = modeInfo(snap, all);
  const mode = info.active;
  const [tab, setTab] = useState<Tab>("hoy");
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    return lumi.on("panel-opened", () => input.current?.focus());
  }, []);

  const endToday = addDays(startOfDay(now), 1);
  const pending = snap.tasks.filter((t) => !t.done && info.visible(t.mode));
  const today = pending.filter((t) => t.remindAt && new Date(t.remindAt) < endToday).sort((a, b) => (a.remindAt ?? "").localeCompare(b.remindAt ?? ""));
  const doneToday = snap.tasks.filter((t) => t.done && t.doneDate === dayKey(now) && info.visible(t.mode));
  const nextMeeting = snap.meetings.find((m) => !m.allDay && new Date(m.end) > now && new Date(m.start) < endToday && info.visible(info.meetingMode(m)));
  // Pestaña del modo: Escuela, Personal o Reuniones
  const modeTab = mode?.id === "escuela" ? "Escuela" : mode?.id === "personal" ? "Personal" : "Reuniones";
  const widgets: ModeWidget[] = mode?.panel ?? ["reuniones", "pendientes"];
  const showWidget = (w: ModeWidget) => widgets.includes(w) && (!["clase", "entregas", "repaso", "estudio"].includes(w) || info.has("escuela") || w === "estudio");
  const name = snap.settings.userName.trim();
  const open = (t: Task) => go({ name: "note", taskKey: t.key });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = note.trim();
    if (!text) return;
    setNote("");
    go({ name: "note", text });
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
          <LumiFace size={46} mood={snap.school.study?.phase === "enfoque" ? "concentrada" : snap.index.indexing ? "pensando" : today.length ? "pendientes" : "reposo"} />
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
          onClick={() => {
            setPinned(!pinned);
            void lumi.setPanelPinned(!pinned);
          }}
        >
          <IconPin size={18} />
        </button>
        <button type="button" className="icon-btn plain" aria-label="Cerrar menú" onClick={() => lumi.hidePanel()}>
          <IconClose size={18} />
        </button>
      </div>

      <ModeBar snap={snap} go={go} />

      <form onSubmit={submit} style={{ padding: "0 16px 12px" }}>
        <label htmlFor="nota-rapida" className="field-label">
          Nota rápida
        </label>
        <div className="row" style={{ gap: 6, padding: "4px 4px 4px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--line-strong)" }}>
          <input
            id="nota-rapida"
            ref={input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={PLACEHOLDER[mode?.id ?? "trabajo"] ?? PLACEHOLDER.trabajo}
            autoComplete="off"
            style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: "transparent", fontSize: 14, outline: "none" }}
          />
          <button type="submit" className="icon-btn" aria-label="Crear pendiente" disabled={!note.trim()} style={{ background: "var(--indigo)", color: "#fff", opacity: note.trim() ? 1 : 0.5 }}>
            <IconArrow size={18} />
          </button>
        </div>
        <span className="hint" style={{ display: "block", marginTop: 6 }}>
          {info.multi && mode ? (
            <>
              Se guarda en modo <b>{mode.nombre}</b> (o escribe <b>#{info.modes.find((m) => m.id !== mode.id)?.id}</b>). Etiqueta con <b>@Cliente</b> y <b>#Proyecto</b>.
            </>
          ) : (
            <>
              Etiqueta con <b>@Cliente</b> y <b>#Proyecto</b>. Se guarda en tu vault, en <i>00-Inbox</i> y <i>03-Pendientes</i>.
            </>
          )}
        </span>
      </form>

      {snap.index.indexing && (
        <div style={{ margin: "0 16px 10px", padding: "8px 12px", borderRadius: 12, background: "var(--lavender)", fontSize: 12.5, color: "var(--indigo-deep)", fontWeight: 600 }}>
          Leyendo tu vault… {Math.round(snap.index.progress * 100)}%
        </div>
      )}

      <div
        role="tablist"
        aria-label="Vistas"
        style={{ margin: "0 16px", padding: 4, borderRadius: 14, background: "var(--surface)", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}
      >
        {(
          [
            ["hoy", "Hoy"],
            ["pend", "Pendientes"],
            ["modo", modeTab],
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
            {widgets.map((w) => {
              if (!showWidget(w)) return null;
              if (w === "reuniones") return nextMeeting ? <MeetingCard key={w} m={nextMeeting} now={now} granola={snap.settings.granola.mode !== "none"} /> : null;
              if (w === "clase") return <NextClassCard key={w} snap={snap} now={now} />;
              if (w === "estudio") return <StudyCard key={w} snap={snap} now={now} />;
              if (w === "enfoque") return <StudyCard key={w} snap={snap} now={now} focusLabel="Sesión de enfoque" />;
              if (w === "entregas") return <DeadlinesCard key={w} snap={snap} now={now} go={go} />;
              if (w === "repaso") return <ReviewCard key={w} snap={snap} go={go} />;
              if (w === "dia") return <DayCard key={w} snap={snap} now={now} />;
              if (w === "habitos") return <HabitsCard key={w} snap={snap} now={now} go={go} />;
              if (w === "pagos") return <PaymentsCard key={w} snap={snap} now={now} go={go} />;
              if (w === "cumpleanos") return <BirthdaysCard key={w} snap={snap} now={now} />;
              if (w === "listas") return <ListsCard key={w} snap={snap} go={go} />;
              return null;
            })}
            {/* Una reunión en curso o próxima siempre se ve, aunque el modo no la muestre arriba */}
            {!widgets.includes("reuniones") && nextMeeting && new Date(nextMeeting.start).getTime() - now.getTime() < 60 * 60_000 && (
              <MeetingCard m={nextMeeting} now={now} granola={snap.settings.granola.mode !== "none"} />
            )}
            <p className="section-title">Pendientes de hoy</p>
            {today.length === 0 ? (
              <Empty text={doneToday.length ? `¡Listo por hoy! Completaste ${doneToday.length}.` : "Nada pendiente para hoy. Escribe una nota arriba cuando se te ocurra algo."} />
            ) : (
              today.map((t) => <TaskItem key={t.key} task={t} onOpen={open} now={now} />)
            )}
            {snap.proposals.length > 0 && (
              <button type="button" className="btn btn-lavender" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => go({ name: "memory" })}>
                <IconBrain size={16} /> {snap.proposals.length === 1 ? "1 dato por confirmar" : `${snap.proposals.length} datos por confirmar`}
              </button>
            )}
          </>
        )}
        {tab === "pend" && <PendingList snap={snap} filter={filter} setFilter={setFilter} showDone={showDone} setShowDone={setShowDone} open={open} now={now} />}
        {tab === "modo" && (mode?.id === "escuela" ? <SchoolBody snap={snap} go={go} now={now} /> : mode?.id === "personal" ? <PersonalBody snap={snap} go={go} now={now} /> : <MeetingList snap={snap} now={now} go={go} />)}
      </div>

      <nav aria-label="Más de Lumi" style={{ borderTop: "1px solid var(--line)", padding: "6px 10px", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 4 }}>
        <NavButton label="Pregúntale" onClick={() => go({ name: "chat" })} active>
          <IconChat size={20} />
        </NavButton>
        <NavButton label="Memoria" onClick={() => go({ name: "memory" })} badge={snap.proposals.length}>
          <IconBrain size={20} />
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

function NavButton({ label, onClick, children, active, badge }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="nav-btn"
      style={{
        position: "relative",
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
    >
      {children}
      {label}
      {!!badge && (
        <span style={{ position: "absolute", top: 4, right: "calc(50% - 20px)", minWidth: 16, height: 16, borderRadius: 8, background: "var(--sun)", color: "var(--ink)", fontSize: 10.5, lineHeight: "16px", fontWeight: 700 }}>
          {badge}
        </span>
      )}
    </button>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: "18px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
      <LumiFace size={56} />
      <span style={{ fontSize: 13.5, color: "var(--muted)", maxWidth: 280, lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}

function MeetingCard({ m, now, granola }: { m: Meeting; now: Date; granola: boolean }) {
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
          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--sun)", color: "var(--ink)" }}>{live ? "ahora" : relative(start, now)}</span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{m.title}</span>
        <span style={{ fontSize: 12.5, color: "var(--muted-strong)" }}>
          {m.calendar}
          {m.attendees.length ? ` · ${m.attendees.slice(0, 3).join(", ")}${m.attendees.length > 3 ? "…" : ""}` : ""}
        </span>
        <div className="row wrap" style={{ gap: 8 }}>
          {m.link && (
            <button className="btn btn-primary" onClick={() => lumi.openExternal(m.link!)}>
              <IconVideo size={16} /> Unirme
            </button>
          )}
          {granola && (
            <button className="btn btn-soft" style={{ background: "#fff" }} onClick={() => lumi.openGranola()}>
              Abrir Granola
            </button>
          )}
        </div>
      </Card>
    </>
  );
}

function PendingList({
  snap,
  filter,
  setFilter,
  showDone,
  setShowDone,
  open,
  now,
}: {
  snap: AppSnapshot;
  filter: string | null;
  setFilter: (f: string | null) => void;
  showDone: boolean;
  setShowDone: (v: boolean) => void;
  open: (t: Task) => void;
  now: Date;
}) {
  const { all } = useModeView();
  const info = modeInfo(snap, all);
  const match = (t: Task) => info.visible(t.mode) && (!filter || t.tags.some((g) => `${g.kind}:${g.name}` === filter) || (filter.startsWith("materia:") && t.subject === filter.slice(8)));
  const pending = snap.tasks.filter((t) => !t.done && match(t)).sort((a, b) => (a.remindAt ?? "9999").localeCompare(b.remindAt ?? "9999"));
  const done = snap.tasks
    .filter((t) => t.done && match(t))
    .sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""))
    .slice(0, 20);
  const badgeFor = (t: Task) => {
    if (!info.multi || !all || !t.mode || t.mode === snap.mode.id) return null;
    const m = info.modes.find((x) => x.id === t.mode);
    return m ? `${m.icono} ${m.nombre}` : null;
  };
  const used = new Map<string, { kind: string; name: string }>();
  for (const t of snap.tasks) {
    if (!info.visible(t.mode)) continue;
    for (const g of t.tags) used.set(`${g.kind}:${g.name}`, g);
    if (t.subject) used.set(`materia:${t.subject}`, { kind: "materia", name: t.subject });
  }

  return (
    <>
      {used.size > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <button type="button" className={`tag big ${filter === null ? "selected-dark" : "neutral"}`} onClick={() => setFilter(null)}>
            Todos
          </button>
          {[...used.entries()].map(([key, g]) => (
            <button key={key} type="button" className={`tag big ${filter === key ? "selected-dark" : g.kind === "materia" ? "neutral" : g.kind}`} aria-pressed={filter === key} onClick={() => setFilter(filter === key ? null : key)}>
              {g.name}
            </button>
          ))}
        </div>
      )}
      {pending.length === 0 ? (
        <Empty text={filter ? "No hay pendientes con esta etiqueta." : info.multi && !all && info.active ? `No tienes pendientes de ${info.active.nombre}. Toca «Todo» para ver los de otros modos.` : "No tienes pendientes. ¡Qué tranquilidad!"} />
      ) : (
        pending.map((t) => <TaskItem key={t.key} task={t} onOpen={open} now={now} badge={badgeFor(t)} />)
      )}
      {done.length > 0 && (
        <>
          <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            {showDone ? "Ocultar completados" : `Ver completados (${done.length})`}
          </button>
          {showDone && done.map((t) => <TaskItem key={t.key} task={t} onOpen={open} now={now} />)}
        </>
      )}
    </>
  );
}

function MeetingList({ snap, now, go }: { snap: AppSnapshot; now: Date; go: (v: View) => void }) {
  const { all } = useModeView();
  const info = modeInfo(snap, all);
  const c = snap.settings.calendars;
  const hasCalendars = c.google.connected || c.microsoft.connected || c.ics.length > 0;
  if (!hasCalendars) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 8px", textAlign: "center" }}>
        <LumiFace size={56} mood="reunion" />
        <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45 }}>Conecta tu calendario de Google o de Outlook para que te avise antes de cada reunión.</span>
        <button className="btn btn-primary" onClick={() => go({ name: "settings" })}>
          Conectar calendario
        </button>
      </div>
    );
  }
  const upcoming = snap.meetings.filter((m) => new Date(m.end) > now && info.visible(info.meetingMode(m)));
  const groups = new Map<string, Meeting[]>();
  for (const m of upcoming) {
    const label = dayLabel(new Date(m.start), now);
    groups.set(label, [...(groups.get(label) ?? []), m]);
  }
  const errors = [
    ...(c.google.connected && !snap.calendars.google.ok ? [{ id: "g", name: "Google", detail: snap.calendars.google.detail }] : []),
    ...(c.microsoft.connected && !snap.calendars.microsoft.ok ? [{ id: "m", name: "Outlook", detail: snap.calendars.microsoft.detail }] : []),
    ...snap.calendars.ics.filter((x) => !x.ok).map((x) => ({ id: x.id, name: x.label, detail: x.detail })),
  ];
  return (
    <>
      {errors.map((e) => (
        <Card key={e.id} tone="sun">
          <span style={{ fontSize: 13, color: "var(--sun-ink)", fontWeight: 600 }}>No pude leer «{e.name}»</span>
          <span className="hint">{e.detail}</span>
        </Card>
      ))}
      {upcoming.length === 0 && <Empty text={snap.calendars.updatedAt ? "Sin reuniones en los próximos 7 días." : "Leyendo tus calendarios…"} />}
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
                  <button type="button" className="icon-btn" aria-label={`Unirme a ${m.title}`} title="Unirme" onClick={() => lumi.openExternal(m.link!)}>
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
