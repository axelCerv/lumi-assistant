/** Tarjetas de la pestaña «Hoy» que cambian según el modo. */
import { useState } from "react";
import { addDays, dayKey, dayLabel, daysText, fmtTime, relative, startOfDay, type AppSnapshot, type Task } from "@lumi/shared";
import { IconCards, IconGift, IconList, IconTimer, IconWallet } from "../components/Icons";
import { lumi } from "../lib/api";
import { countdown, modeInfo, useModeView } from "../lib/modes";
import { Card } from "./ui";
import type { View } from "./main";

function Title({ icon, children, action }: { icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
      <span className="row" style={{ gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--indigo-deep)" }}>
        {icon}
        {children}
      </span>
      {action}
    </div>
  );
}

const dateLabel = (key: string, now: Date) => dayLabel(new Date(`${key}T12:00`), now);

/* ------------------------------ Estudio / enfoque ------------------------------ */

export function StudyCard({ snap, now, focusLabel = "Sesión de estudio" }: { snap: AppSnapshot; now: Date; focusLabel?: string }) {
  const s = snap.school.study;
  const [subject, setSubject] = useState("");
  const min = snap.settings.school.focusMin;
  if (!s) {
    return (
      <Card tone="plain">
        <Title icon={<IconTimer size={15} />} action={snap.school.studiedTodayMin ? <span className="hint">Hoy: {snap.school.studiedTodayMin} min</span> : null}>
          {focusLabel}
        </Title>
        <div className="row" style={{ gap: 8 }}>
          {snap.school.subjects.length > 0 && focusLabel === "Sesión de estudio" && (
            <>
              <label htmlFor="estudio-materia" className="sr-only">
                Materia
              </label>
              <select id="estudio-materia" className="select" style={{ height: 38 }} value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Sin materia</option>
                {snap.school.subjects.map((x) => (
                  <option key={x.path} value={x.name}>
                    {x.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="button" className="btn btn-primary" style={{ flex: "none" }} onClick={() => lumi.studyAction("start", subject || null)}>
            Empezar {min} min
          </button>
        </div>
        <span className="hint">
          {min} minutos de enfoque y {snap.settings.school.breakMin} de descanso. Te aviso cuando toque.
        </span>
      </Card>
    );
  }
  const focus = s.phase === "enfoque";
  return (
    <Card tone={focus ? "lavender" : "sun"}>
      <Title icon={<IconTimer size={15} />}>{focus ? `${focusLabel}${s.subject ? ` · ${s.subject}` : ""}` : "Descanso"}</Title>
      <div className="row" style={{ gap: 12 }}>
        <span style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} aria-live="off">
          {countdown(s.endsAt, now)}
        </span>
        <span className="hint grow">{focus ? `Bloque ${s.rounds + 1}. Silencio los avisos que no son urgentes.` : "Estírate, toma agua, mira lejos."}</span>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {focus ? (
          <button type="button" className="btn btn-soft" style={{ background: "#fff" }} onClick={() => lumi.studyAction("break")}>
            Descansar ya
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => lumi.studyAction("focus")}>
            Otro bloque
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => lumi.studyAction("stop")}>
          Terminar
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------ Escuela ------------------------------ */

export function NextClassCard({ snap, now }: { snap: AppSnapshot; now: Date }) {
  const c = snap.school.nextClass;
  if (!c || dayKey(new Date(c.start)) !== dayKey(now)) {
    if (!snap.school.subjects.length) return null;
    return (
      <Card tone="plain">
        <Title>Clases</Title>
        <span className="hint">{snap.school.classesToday.length ? "Ya terminaron tus clases de hoy. ¡Bien!" : "Hoy no tienes clases."}</span>
      </Card>
    );
  }
  const start = new Date(c.start);
  const live = start <= now;
  return (
    <Card tone="lavender">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--indigo-deep)" }}>
          {fmtTime(start)} – {fmtTime(new Date(c.end))}
          {c.room ? ` · ${c.room}` : ""}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "var(--sun)", color: "var(--ink)" }}>{live ? "en clase" : relative(start, now)}</span>
      </div>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{live ? "En clase: " : "Siguiente clase: "}{c.subject}</span>
    </Card>
  );
}

export function DeadlineRow({ t, now }: { t: Task; now: Date }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const late = t.due! < dayKey(now);
  const planned = /^Primer paso|«/.test(t.text);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--line)", background: "#fff" }}>
      <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{t.text}</span>
          <span style={{ fontSize: 12, color: late ? "var(--sun-ink)" : "var(--muted)", fontWeight: 600 }}>
            {late ? "Atrasada · " : ""}
            {dateLabel(t.due!, now)}
            {t.time ? ` ${t.time}` : ""}
            {t.subject ? ` · ${t.subject}` : ""}
          </span>
        </span>
        {!planned && state !== "done" && (
          <button
            type="button"
            className="btn btn-lavender"
            style={{ minHeight: 32, fontSize: 12.5, padding: "0 10px", flex: "none" }}
            disabled={state === "busy"}
            onClick={async () => {
              setState("busy");
              const r = await lumi.createStudyPlan({ title: t.text, due: t.due!, subject: t.subject });
              setState(r.ok ? "done" : "error");
              setMsg(r.ok ? `Listo: ${r.value} pasos, el primero es para hoy.` : (r.error ?? "No pude crear el plan"));
            }}
          >
            {state === "busy" ? "Pensando…" : "Partir en pasos"}
          </button>
        )}
      </div>
      {msg && (
        <span className="hint" role="status" style={{ color: state === "error" ? "var(--danger)" : "var(--ok)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}

export function DeadlinesCard({ snap, now, go, days = 7 }: { snap: AppSnapshot; now: Date; go: (v: View) => void; days?: number }) {
  const limit = dayKey(addDays(startOfDay(now), days));
  const list = snap.tasks
    .filter((t) => !t.done && t.mode === "escuela" && t.due && t.due <= limit && !/^Primer paso/.test(t.text))
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
    .slice(0, 5);
  return (
    <Card tone="plain">
      <Title action={<button type="button" className="btn btn-ghost" style={{ minHeight: 28, padding: "0 4px", fontSize: 12.5 }} onClick={() => go({ name: "school" })}>Ver todo</button>}>
        Entregas y exámenes ({days} días)
      </Title>
      {list.length === 0 ? <span className="hint">Nada por entregar esta semana. ¡Buen momento para adelantar!</span> : list.map((t) => <DeadlineRow key={t.key} t={t} now={now} />)}
    </Card>
  );
}

export function ReviewCard({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const c = snap.school.cards;
  return (
    <Card tone={c.due ? "sun" : "plain"}>
      <Title icon={<IconCards size={15} />}>Repaso</Title>
      <span style={{ fontSize: 14, lineHeight: 1.4 }}>
        {c.total === 0 ? "Aún no tienes tarjetas. Créalas en Escuela o pídeselas a Lumi." : c.due ? `${c.due} ${c.due === 1 ? "tarjeta" : "tarjetas"} para hoy.` : `Al día: ${c.total} tarjetas, ninguna para hoy.`}
      </span>
      <div className="row" style={{ gap: 8 }}>
        {c.due > 0 && (
          <button type="button" className="btn btn-dark" onClick={() => go({ name: "review" })}>
            Repasar ahora
          </button>
        )}
        <button type="button" className="btn btn-soft" style={{ background: "#fff" }} onClick={() => go({ name: "school" })}>
          {c.total ? "Agregar tarjetas" : "Crear tarjetas"}
        </button>
      </div>
    </Card>
  );
}

/* ------------------------------ Personal ------------------------------ */

export function DayCard({ snap, now }: { snap: AppSnapshot; now: Date }) {
  const { all } = useModeView();
  const info = modeInfo(snap, all);
  const end = addDays(startOfDay(now), 1);
  const pending = snap.tasks.filter((t) => !t.done && info.visible(t.mode) && t.remindAt && new Date(t.remindAt) < end).length;
  const done = snap.tasks.filter((t) => t.done && t.doneDate === dayKey(now)).length;
  const routines = snap.routines.filter((r) => r.active && r.days.includes(now.getDay()) && info.visible(r.mode)).sort((a, b) => a.time.localeCompare(b.time));
  const next = routines.find((r) => r.time >= fmtTime(now));
  const [msg, setMsg] = useState("");
  return (
    <Card tone="lavender">
      <Title>Tu día</Title>
      <span style={{ fontSize: 14.5, lineHeight: 1.45 }}>
        {pending === 0 ? "Nada pendiente para hoy" : pending === 1 ? "1 pendiente para hoy" : `${pending} pendientes para hoy`}
        {done ? ` · ${done} hecho${done === 1 ? "" : "s"}` : ""}
        {routines.length ? ` · ${routines.length} rutina${routines.length === 1 ? "" : "s"}` : ""}
        {next ? `. Próxima: ${next.title.toLowerCase()} a las ${next.time}.` : "."}
      </span>
      {pending > 0 && now.getHours() >= 17 && (
        <button
          type="button"
          className="btn btn-soft"
          style={{ alignSelf: "flex-start", background: "#fff" }}
          onClick={async () => {
            const r = await lumi.moveTodayToTomorrow();
            setMsg(r.ok ? `Pasé ${r.value} a mañana. ¡Descansa!` : (r.error ?? ""));
          }}
        >
          Pasar lo de hoy a mañana
        </button>
      )}
      {msg && <span className="hint" role="status">{msg}</span>}
    </Card>
  );
}

export function HabitsCard({ snap, now, go }: { snap: AppSnapshot; now: Date; go: (v: View) => void }) {
  const { all } = useModeView();
  const info = modeInfo(snap, all);
  const list = snap.routines.filter((r) => r.active && r.days.includes(now.getDay()) && info.visible(r.mode)).sort((a, b) => a.time.localeCompare(b.time));
  return (
    <Card tone="plain">
      <Title action={<button type="button" className="btn btn-ghost" style={{ minHeight: 28, padding: "0 4px", fontSize: 12.5 }} onClick={() => go({ name: "routines" })}>Rutinas</button>}>Hábitos de hoy</Title>
      {list.length === 0 ? (
        <span className="hint">Sin rutinas para hoy. Agrega sueño, ejercicio, agua o lectura en Rutinas.</span>
      ) : (
        list.slice(0, 5).map((r) => (
          <div key={r.path} className="row" style={{ gap: 10, fontSize: 14 }}>
            <span style={{ width: 44, fontWeight: 700, color: r.time < fmtTime(now) ? "var(--muted)" : "var(--ink)" }}>{r.time}</span>
            <span className="grow">{r.title}</span>
            <span className="hint">{daysText(r.days) === "Todos los días" ? "diario" : ""}</span>
          </div>
        ))
      )}
    </Card>
  );
}

export function PaymentsCard({ snap, now, go }: { snap: AppSnapshot; now: Date; go: (v: View) => void }) {
  const list = snap.personal.payments.filter((p) => p.daysLeft <= 10);
  if (!list.length && snap.personal.payments.length) return null;
  return (
    <Card tone="plain">
      <Title icon={<IconWallet size={15} />} action={<button type="button" className="btn btn-ghost" style={{ minHeight: 28, padding: "0 4px", fontSize: 12.5 }} onClick={() => go({ name: "personal" })}>Pagos</button>}>
        Pagos próximos
      </Title>
      {list.length === 0 ? (
        <span className="hint">Registra renta, luz, tarjeta o suscripciones y te aviso unos días antes.</span>
      ) : (
        list.map((p) => (
          <div key={p.line} className="row" style={{ gap: 10, fontSize: 14 }}>
            <span className="grow">{p.name}</span>
            {p.amount && <span style={{ fontWeight: 600 }}>{p.amount}</span>}
            <span style={{ fontSize: 12, fontWeight: 700, color: p.daysLeft <= 1 ? "var(--sun-ink)" : "var(--muted)" }}>{dateLabel(p.next, now)}</span>
          </div>
        ))
      )}
    </Card>
  );
}

export function BirthdaysCard({ snap, now }: { snap: AppSnapshot; now: Date }) {
  const list = snap.personal.birthdays.filter((b) => b.daysLeft <= 30).slice(0, 4);
  if (!list.length) return null;
  return (
    <Card tone="plain">
      <Title icon={<IconGift size={15} />}>Cumpleaños</Title>
      {list.map((b) => (
        <div key={b.path} className="row" style={{ gap: 10, fontSize: 14 }}>
          <span className="grow">
            {b.name}
            {b.age ? <span className="hint"> · cumple {b.age}</span> : null}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: b.daysLeft === 0 ? "var(--sun-ink)" : "var(--muted)" }}>{b.daysLeft === 0 ? "¡Hoy! 🎂" : dateLabel(b.date, now)}</span>
        </div>
      ))}
    </Card>
  );
}

export function ListsCard({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const lists = snap.personal.lists;
  return (
    <Card tone="plain">
      <Title icon={<IconList size={15} />} action={<button type="button" className="btn btn-ghost" style={{ minHeight: 28, padding: "0 4px", fontSize: 12.5 }} onClick={() => go({ name: "personal" })}>Abrir</button>}>
        Listas
      </Title>
      {lists.length === 0 ? (
        <span className="hint">Crea tu lista del súper o de la casa. También puedes decirle a Lumi «agrega leche al súper».</span>
      ) : (
        <div className="row wrap" style={{ gap: 6 }}>
          {lists.map((l) => {
            const left = l.items.filter((i) => !i.done).length;
            return (
              <button key={l.path} type="button" className="tag big neutral" onClick={() => go({ name: "personal", list: l.path })}>
                {l.name} · {left}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
