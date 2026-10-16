/** Modo Escuela: clases, sesión de estudio, entregas, repaso, materias, ciclo y plataforma. */
import { useState } from "react";
import { DAY_SHORT, addDays, dayKey, fmtTime, formatClassSlot, isExam, slugify, startOfDay, type AppSnapshot, type Subject, type SubjectInput } from "@lumi/shared";
import { IconCards, IconOpen, IconTrash } from "../components/Icons";
import { lumi } from "../lib/api";
import { aiReady } from "../lib/modes";
import { Msg, StatusDot } from "./connect";
import { Card, SwitchRow, ViewHeader } from "./ui";
import { DeadlineRow, StudyCard } from "./widgets";
import type { View } from "./main";

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function School({ snap, go, now }: { snap: AppSnapshot; go: (v: View) => void; now: Date }) {
  return (
    <>
      <ViewHeader title="Escuela 📚" onBack={() => go({ name: "home" })} sub={<span className="hint">Vive en 10-Escuela de tu vault</span>} />
      <div className="scroll" style={{ flex: 1, padding: "8px 16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <SchoolBody snap={snap} go={go} now={now} />
      </div>
    </>
  );
}

export function SchoolBody({ snap, go, now }: { snap: AppSnapshot; go: (v: View) => void; now: Date }) {
  const sc = snap.school;
  return (
    <>
      {sc.subjects.length === 0 && (
        <Card tone="lavender">
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>Empecemos con tus materias</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>Con tu horario te aviso antes de cada clase, cambio solo al modo Escuela y ordeno tus entregas y tarjetas por materia.</span>
        </Card>
      )}

      <Section title={`Hoy${sc.cycle ? ` · ${sc.cycle.name}` : ""}`}>
        {sc.classesToday.length === 0 ? (
          <span className="hint">{sc.subjects.length ? "Hoy no tienes clases." : "Agrega tus materias con su horario abajo."}</span>
        ) : (
          sc.classesToday.map((c) => {
            const live = new Date(c.start) <= now && new Date(c.end) > now;
            const past = new Date(c.end) <= now;
            return (
              <div key={c.start + c.path} className="row" style={{ gap: 12, padding: "9px 12px", borderRadius: 12, border: live ? "2px solid var(--indigo)" : "1px solid var(--line)", opacity: past ? 0.55 : 1 }}>
                <span style={{ width: 92, fontSize: 13, fontWeight: 700 }}>
                  {fmtTime(new Date(c.start))}–{fmtTime(new Date(c.end))}
                </span>
                <span className="grow" style={{ fontSize: 14, fontWeight: 600 }}>
                  {c.subject}
                </span>
                {c.room && <span className="hint">{c.room}</span>}
              </div>
            );
          })
        )}
      </Section>

      <StudyCard snap={snap} now={now} />

      <Deadlines snap={snap} now={now} />
      <Review snap={snap} go={go} />
      <Subjects snap={snap} />
      <CycleForm snap={snap} />
      <Platform snap={snap} />
    </>
  );
}

/* ------------------------------ Entregas ------------------------------ */

function Deadlines({ snap, now }: { snap: AppSnapshot; now: Date }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(dayKey(addDays(startOfDay(now), 7)));
  const [subject, setSubject] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const all = snap.tasks
    .filter((t) => !t.done && t.mode === "escuela" && t.due && !/^Primer paso/.test(t.text))
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  const today = dayKey(now);
  const week = dayKey(addDays(startOfDay(now), 7));
  const groups: [string, typeof all][] = [
    ["Atrasadas", all.filter((t) => t.due! < today)],
    ["Esta semana", all.filter((t) => t.due! >= today && t.due! <= week)],
    ["Después", all.filter((t) => t.due! > week).slice(0, 12)],
  ];

  async function add(plan: boolean) {
    if (!title.trim() || !due) return;
    setBusy(true);
    setMsg(null);
    const subj = snap.school.subjects.find((s) => s.name === subject);
    const r = plan
      ? await lumi.createStudyPlan({ title: title.trim(), due, subject: subj?.name ?? null })
      : await lumi.saveTask({ title: title.trim(), date: due, time: null, tags: [], contact: null, mode: "escuela", extraTags: subj ? [`escuela/${subj.slug}`] : [] });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude guardarla" });
    setMsg({ ok: true, text: plan ? `Listo: ${r.value} pasos, empezando hoy con 5 minutos.` : "Entrega guardada." });
    setTitle("");
    setAdding(false);
  }

  return (
    <Section
      title="Entregas y exámenes"
      action={
        !adding && (
          <button type="button" className="btn btn-ghost" style={{ minHeight: 28, padding: "0 4px", fontSize: 12.5 }} onClick={() => setAdding(true)}>
            + Agregar
          </button>
        )
      }
    >
      {adding && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 14, background: "var(--surface)" }}>
          <div>
            <label htmlFor="entrega-titulo" className="field-label">
              ¿Qué hay que entregar o presentar?
            </label>
            <input id="entrega-titulo" className="input" style={{ background: "#fff" }} placeholder="Ensayo de Ética, Parcial 2 de Cálculo…" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="grow">
              <label htmlFor="entrega-fecha" className="field-label">
                Fecha
              </label>
              <input id="entrega-fecha" type="date" className="input" style={{ background: "#fff" }} value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            {snap.school.subjects.length > 0 && (
              <div className="grow">
                <label htmlFor="entrega-materia" className="field-label">
                  Materia
                </label>
                <select id="entrega-materia" className="select" style={{ background: "#fff" }} value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="">—</option>
                  {snap.school.subjects.map((s) => (
                    <option key={s.path} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={!title.trim() || busy} onClick={() => add(true)}>
              {busy ? "Pensando…" : "Agregar y partir en pasos"}
            </button>
            <button type="button" className="btn btn-soft" style={{ background: "#fff" }} disabled={!title.trim() || busy} onClick={() => add(false)}>
              Solo agregar
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              Cancelar
            </button>
          </div>
          <span className="hint">Partir en pasos crea pendientes con fechas intermedias y un primer paso de 5 minutos para hoy{title && isExam(title) ? " (como es examen: temas, tarjetas, práctica y repaso final)" : ""}.</span>
        </div>
      )}
      <Msg m={msg} />
      {all.length === 0 && !adding && <span className="hint">Sin entregas. Agrégalas aquí, conecta Moodle o Canvas abajo, o díselo a Lumi.</span>}
      {groups.map(([label, list]) =>
        list.length ? (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: label === "Atrasadas" ? "var(--sun-ink)" : "var(--muted)" }}>{label}</span>
            {list.map((t) => (
              <DeadlineRow key={t.key} t={t} now={now} />
            ))}
          </div>
        ) : null,
      )}
    </Section>
  );
}

/* ------------------------------ Repaso ------------------------------ */

function Review({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const c = snap.school.cards;
  const [subject, setSubject] = useState(snap.school.subjects[0]?.path ?? "");
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canAI = aiReady(snap);

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || !q.trim() || !a.trim()) return;
    const r = await lumi.addCards(subject, [{ question: q.trim(), answer: a.trim() }]);
    setMsg(r.ok ? { ok: true, text: "Tarjeta guardada." } : { ok: false, text: r.error ?? "No pude guardarla" });
    if (r.ok) {
      setQ("");
      setA("");
    }
  }

  return (
    <Section
      title="Repaso con tarjetas"
      action={
        c.due > 0 && (
          <button type="button" className="btn btn-dark" style={{ minHeight: 30, fontSize: 12.5 }} onClick={() => go({ name: "review" })}>
            Repasar {c.due}
          </button>
        )
      }
    >
      <span className="hint">Releer apuntes engaña: preguntarte funciona mejor. Te pregunto cada tarjeta justo antes de que la olvides (repaso espaciado).</span>
      {snap.school.subjects.map((s) => {
        const st = c.bySubject[s.name] ?? { total: 0, due: 0 };
        return (
          <div key={s.path} className="row" style={{ gap: 8, padding: "8px 8px 8px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
            <IconCards size={16} />
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
              <span className="hint">
                {st.total} tarjetas{st.due ? ` · ${st.due} para hoy` : ""}
              </span>
            </span>
            {st.due > 0 && (
              <button type="button" className="btn btn-soft" style={{ minHeight: 32 }} onClick={() => go({ name: "review", subject: s.name })}>
                Repasar
              </button>
            )}
            {canAI && (
              <button
                type="button"
                className="btn btn-lavender"
                style={{ minHeight: 32 }}
                disabled={busy === s.path}
                title="Lumi lee tus apuntes de esta materia y te hace preguntas"
                onClick={async () => {
                  setBusy(s.path);
                  const r = await lumi.generateCards(s.path);
                  setBusy(null);
                  setMsg(r.ok ? { ok: true, text: `Agregué ${r.value} preguntas de ${s.name}.` } : { ok: false, text: r.error ?? "No pude generarlas" });
                }}
              >
                {busy === s.path ? "Leyendo…" : "Preguntas de mis apuntes"}
              </button>
            )}
          </div>
        );
      })}
      {snap.school.subjects.length > 0 && (
        <form onSubmit={addCard} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "var(--surface)" }}>
          <span className="field-label" style={{ marginBottom: 0 }}>
            Escribir una tarjeta
          </span>
          <label htmlFor="tarjeta-materia" className="sr-only">
            Materia
          </label>
          <select id="tarjeta-materia" className="select" style={{ background: "#fff" }} value={subject} onChange={(e) => setSubject(e.target.value)}>
            {snap.school.subjects.map((s) => (
              <option key={s.path} value={s.path}>
                {s.name}
              </option>
            ))}
          </select>
          <label htmlFor="tarjeta-pregunta" className="sr-only">
            Pregunta
          </label>
          <input id="tarjeta-pregunta" className="input" style={{ background: "#fff" }} placeholder="Pregunta: ¿Derivada de x²?" value={q} onChange={(e) => setQ(e.target.value)} />
          <label htmlFor="tarjeta-respuesta" className="sr-only">
            Respuesta
          </label>
          <input id="tarjeta-respuesta" className="input" style={{ background: "#fff" }} placeholder="Respuesta: 2x" value={a} onChange={(e) => setA(e.target.value)} />
          <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={!q.trim() || !a.trim()}>
            Guardar tarjeta
          </button>
        </form>
      )}
      <Msg m={msg} />
    </Section>
  );
}

/* ------------------------------ Materias ------------------------------ */

const PLATFORMS = ["", "Moodle", "Canvas", "Classroom", "Teams", "Otra"];

function emptySubject(): SubjectInput {
  return { name: "", teacher: "", schedule: [""], platform: "", link: "", maxAbsences: null, aiAllowed: false };
}

function Subjects({ snap }: { snap: AppSnapshot }) {
  const [editing, setEditing] = useState<{ path: string | null; input: SubjectInput } | null>(null);
  const edit = (s: Subject) =>
    setEditing({
      path: s.path,
      input: { name: s.name, teacher: s.teacher ?? "", schedule: s.schedule.length ? s.schedule : [""], platform: s.platform ?? "", link: s.link ?? "", maxAbsences: s.maxAbsences, aiAllowed: s.aiAllowed },
    });
  return (
    <Section
      title="Materias"
      action={
        !editing && (
          <button type="button" className="btn btn-ghost" style={{ minHeight: 28, padding: "0 4px", fontSize: 12.5 }} onClick={() => setEditing({ path: null, input: emptySubject() })}>
            + Nueva materia
          </button>
        )
      }
    >
      {editing ? (
        <SubjectForm key={editing.path ?? "nueva"} path={editing.path} initial={editing.input} onDone={() => setEditing(null)} />
      ) : (
        snap.school.subjects.map((s) => (
          <div key={s.path} className="row" style={{ gap: 8, alignItems: "flex-start", padding: "10px 8px 10px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>{s.name}</span>
              <span className="hint">{s.slots.length ? s.slots.map(formatClassSlot).join(" · ") : "Sin horario"}</span>
              <span className="row wrap" style={{ gap: 6 }}>
                {s.teacher && <span className="tag neutral">{s.teacher}</span>}
                {s.platform && <span className="tag neutral">{s.platform}</span>}
                {s.maxAbsences && <span className="tag neutral">{s.maxAbsences} faltas máx.</span>}
                <span className={`tag ${s.aiAllowed ? "cliente" : "neutral"}`}>{s.aiAllowed ? "IA permitida" : "Modo tutor"}</span>
              </span>
            </span>
            <button type="button" className="btn btn-soft" style={{ minHeight: 32 }} onClick={() => edit(s)}>
              Editar
            </button>
            <button type="button" className="icon-btn plain" aria-label={`Abrir ${s.name} en Obsidian`} onClick={() => lumi.openInObsidian(s.path)} style={{ width: 32, height: 32 }}>
              <IconOpen size={15} />
            </button>
          </div>
        ))
      )}
    </Section>
  );
}

function SubjectForm({ path, initial, onDone }: { path: string | null; initial: SubjectInput; onDone: () => void }) {
  const [v, setV] = useState<SubjectInput>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof SubjectInput>(k: K, val: SubjectInput[K]) => setV({ ...v, [k]: val });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await lumi.saveSubject({ ...v, schedule: v.schedule.filter((x) => x.trim()) }, path);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude guardarla" });
    onDone();
  }

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 14, background: "var(--surface)" }}>
      <div>
        <label htmlFor="materia-nombre" className="field-label">
          Nombre
        </label>
        <input id="materia-nombre" className="input" style={{ background: "#fff" }} placeholder="Cálculo I" value={v.name} onChange={(e) => set("name", e.target.value)} disabled={!!path} autoFocus={!path} />
      </div>
      <div>
        <label htmlFor="materia-profe" className="field-label">
          Profesor(a)
        </label>
        <input id="materia-profe" className="input" style={{ background: "#fff" }} placeholder="Dra. Pérez" value={v.teacher} onChange={(e) => set("teacher", e.target.value)} />
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <legend className="field-label">Horario (una línea por grupo de días)</legend>
        {v.schedule.map((line, i) => (
          <div key={i} className="row" style={{ gap: 6 }}>
            <label htmlFor={`horario-${i}`} className="sr-only">
              Horario {i + 1}
            </label>
            <input
              id={`horario-${i}`}
              className="input"
              style={{ background: "#fff" }}
              placeholder="lun mie 9:00-10:30 A-204"
              value={line}
              onChange={(e) => set("schedule", v.schedule.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {v.schedule.length > 1 && (
              <button type="button" className="icon-btn plain" aria-label="Quitar este horario" onClick={() => set("schedule", v.schedule.filter((_, j) => j !== i))}>
                <IconTrash size={15} />
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => set("schedule", [...v.schedule, ""])}>
          + Otro horario
        </button>
        <span className="hint">
          Días: {DAY_SHORT.join(" ")} o «lun», «martes y jueves», «lun-vie». Ejemplo: «mar jue 16:00-18:00 Lab 3».
        </span>
      </fieldset>
      <div className="row" style={{ gap: 8 }}>
        <div className="grow">
          <label htmlFor="materia-plataforma" className="field-label">
            Plataforma
          </label>
          <select id="materia-plataforma" className="select" style={{ background: "#fff" }} value={v.platform} onChange={(e) => set("platform", e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p || "—"}
              </option>
            ))}
          </select>
        </div>
        <div style={{ width: 120 }}>
          <label htmlFor="materia-faltas" className="field-label">
            Faltas máximas
          </label>
          <input
            id="materia-faltas"
            type="number"
            min={0}
            className="input"
            style={{ background: "#fff" }}
            value={v.maxAbsences ?? ""}
            onChange={(e) => set("maxAbsences", e.target.value ? Math.max(0, parseInt(e.target.value, 10)) : null)}
          />
        </div>
      </div>
      <div>
        <label htmlFor="materia-enlace" className="field-label">
          Enlace de la clase (opcional)
        </label>
        <input id="materia-enlace" className="input" style={{ background: "#fff" }} placeholder="https://…" value={v.link} onChange={(e) => set("link", e.target.value)} />
      </div>
      <SwitchRow label="Mi profesor permite usar IA" hint="Si no, Lumi solo explica, pregunta y revisa (modo tutor); no hace el trabajo por ti." checked={v.aiAllowed} onChange={(x) => set("aiAllowed", x)} />
      <Msg m={msg} />
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={!v.name.trim()}>
          {path ? "Guardar cambios" : "Crear materia"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
      {!path && v.name.trim() && <span className="hint">Se crea 10-Escuela/Materias/{v.name.trim()}/ con su nota; ahí guarda tus apuntes.</span>}
    </form>
  );
}

/* ------------------------------ Ciclo ------------------------------ */

function CycleForm({ snap }: { snap: AppSnapshot }) {
  const c = snap.school.cycle;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(c?.name ?? "");
  const [start, setStart] = useState(c?.start ?? "");
  const [end, setEnd] = useState(c?.end ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Section
      title="Ciclo escolar"
      action={
        <button type="button" className="btn btn-ghost" style={{ minHeight: 28, padding: "0 4px", fontSize: 12.5 }} onClick={() => setOpen(!open)}>
          {open ? "Cerrar" : c ? "Editar" : "Definir"}
        </button>
      }
    >
      <span className="hint">{c ? `${c.name}${c.start && c.end ? `: del ${c.start} al ${c.end}` : ""}. Fuera de estas fechas no cuento clases.` : "Opcional: con las fechas del semestre, las clases solo cuentan dentro del ciclo."}</span>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await lumi.saveCycle({ name, start, end });
            setMsg(r.ok ? { ok: true, text: "Ciclo guardado." } : { ok: false, text: r.error ?? "No pude guardarlo" });
            if (r.ok) setOpen(false);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "var(--surface)" }}
        >
          <label htmlFor="ciclo-nombre" className="field-label" style={{ marginBottom: 0 }}>
            Nombre
          </label>
          <input id="ciclo-nombre" className="input" style={{ background: "#fff" }} placeholder="Semestre 2026-2" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <div className="grow">
              <label htmlFor="ciclo-inicio" className="field-label">
                Inicio
              </label>
              <input id="ciclo-inicio" type="date" className="input" style={{ background: "#fff" }} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grow">
              <label htmlFor="ciclo-fin" className="field-label">
                Fin
              </label>
              <input id="ciclo-fin" type="date" className="input" style={{ background: "#fff" }} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
            Guardar ciclo
          </button>
        </form>
      )}
      <Msg m={msg} />
    </Section>
  );
}

/* ------------------------------ Plataforma ------------------------------ */

export function Platform({ snap }: { snap: AppSnapshot }) {
  const feeds = snap.settings.calendars.ics.filter((x) => x.kind === "entregas");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Section title="Moodle, Canvas o Classroom">
      <span className="hint">
        Pega el enlace del calendario de tu plataforma y tus entregas llegan solas a <i>10-Escuela/Entregas.md</i> como pendientes.
        <br />• <b>Moodle:</b> Calendario → Exportar calendario → Obtener URL.
        <br />• <b>Canvas:</b> Calendario → Calendar Feed.
        <br />• <b>Classroom:</b> conecta tu Google Calendar en Ajustes y asigna el calendario de la clase al modo Escuela.
      </span>
      {feeds.map((f) => {
        const st = snap.calendars.ics.find((x) => x.id === f.id);
        return (
          <div key={f.id} className="row" style={{ gap: 8, padding: "8px 8px 8px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
            <StatusDot ok={!!st?.ok} pending={!st} />
            <span className="grow" style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{f.name}</span>
              <span className="hint">{st?.detail ?? "Leyendo…"}</span>
            </span>
            <button type="button" className="icon-btn plain" aria-label={`Quitar ${f.name}`} onClick={() => lumi.removeIcs(f.id)}>
              <IconTrash size={15} />
            </button>
          </div>
        );
      })}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await lumi.addIcs(name, url, "entregas");
          setBusy(false);
          setMsg(r.ok ? { ok: true, text: "Conectado. Tus entregas aparecerán en unos segundos." } : { ok: false, text: r.error ?? "No pude leer ese enlace" });
          if (r.ok) {
            setName("");
            setUrl("");
          }
        }}
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        <label htmlFor="feed-url" className="sr-only">
          Enlace iCal de la plataforma
        </label>
        <input id="feed-url" className="input" placeholder="https://…/calendar/export_execute.php?…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="row" style={{ gap: 6 }}>
          <label htmlFor="feed-nombre" className="sr-only">
            Nombre
          </label>
          <input id="feed-nombre" className="input" placeholder="Nombre (p. ej. Moodle UNAM)" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!url.trim() || busy}>
            {busy ? "Probando…" : "Conectar"}
          </button>
        </div>
      </form>
      <Msg m={msg} />
    </Section>
  );
}

/** Para enlazar una materia desde otros lados. */
export function subjectTag(name: string): string {
  return `escuela/${slugify(name)}`;
}
