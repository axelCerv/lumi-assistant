import { useEffect, useRef, useState } from "react";
import type { AppSnapshot, Tag, TaskDraft } from "@lumi/shared";
import { addDays, dayKey, fmtTime, modeCategories, roundUpQuarter, slugify, startOfDay, taskGrouping, whenLabel } from "@lumi/shared";
import { LumiFace } from "../components/LumiFace";
import { lumi } from "../lib/api";
import { aiReady, modeInfo, tint } from "../lib/modes";
import { Dots, ViewHeader } from "./ui";
import { ClientPicker, type ClientProject } from "./ClientPicker";

/** Materia o categoría elegida (en modos que no usan cliente/proyecto). */
type Group = { kind: "materia" | "categoria"; name: string } | null;

export function NoteEditor({ snap, text, taskKey, onDone }: { snap: AppSnapshot; text?: string; taskKey?: string; onDone: () => void }) {
  const editing = !!taskKey;
  const [loaded, setLoaded] = useState(false);
  const [original, setOriginal] = useState(text ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [cp, setCp] = useState<ClientProject>({ client: null, project: null });
  const [daily, setDaily] = useState(false);
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [ai, setAi] = useState<"off" | "thinking" | "done" | "fail">("off");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const info = modeInfo(snap);
  // Modo del pendiente: el que diga la nota (#escuela…) o el activo
  const [mode, setMode] = useState<string | null>(info.multi ? snap.mode.id : null);
  const [group, setGroup] = useState<Group>(null);
  const [newCat, setNewCat] = useState("");
  const [extraCats, setExtraCats] = useState<string[]>([]);
  const modeTouched = useRef(false);
  const touched = useRef(false);

  function apply(d: TaskDraft) {
    setTitle(d.title);
    setDate(d.date ?? "");
    setTime(d.time ?? "");
    setCp(toClientProject(d.tags));
    setDaily(!!d.daily);
    setContact(d.contact ?? "");
    setReason(d.reason ?? null);
    setGroup(d.subject ? { kind: "materia", name: d.subject } : d.category ? { kind: "categoria", name: d.category } : null);
    if (d.category) setExtraCats((c) => (c.includes(d.category!) ? c : [...c, d.category!]));
    if (info.multi && !modeTouched.current) {
      if (d.mode !== undefined) setMode(d.mode);
      // Con cliente o proyecto, es de Trabajo
      else if (d.tags.length && info.has("trabajo")) setMode("trabajo");
    }
  }

  async function read(note: string, force = false) {
    apply(await lumi.parseQuickNote(note));
    setLoaded(true);
    if (!aiReady(snap)) return;
    setAi("thinking");
    const r = await lumi.refineQuickNote(note);
    if (!r) return setAi("fail");
    setAi("done");
    if (!touched.current || force) apply(r);
  }

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (taskKey) {
      lumi.getTaskDraft(taskKey).then((d) => {
        if (d) apply(d);
        setLoaded(true);
      });
    } else if (text) void read(text);
    else setLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      touched.current = true;
      set(v);
    };

  /** Etiquetas del borrador → cliente y proyecto (el cliente sale del proyecto si falta). */
  function toClientProject(tags: Tag[]): ClientProject {
    const project = tags.find((t) => t.kind === "proyecto")?.name ?? null;
    let client = tags.find((t) => t.kind === "cliente")?.name ?? null;
    if (project && !client) client = snap.entities.find((e) => e.kind === "proyecto" && e.name.toLowerCase() === project.toLowerCase())?.client ?? null;
    return { client, project };
  }

  const tags: Tag[] = [
    ...(cp.client ? [{ kind: "cliente" as const, name: cp.client }] : []),
    ...(cp.project ? [{ kind: "proyecto" as const, name: cp.project }] : []),
  ];

  async function save() {
    if (!title.trim()) return;
    if (!byCategory && cp.project && !cp.client) return setError(`Elige de qué cliente es «${cp.project}»: un proyecto siempre va dentro de un cliente.`);
    setSaving(true);
    setError(null);
    const draft: TaskDraft = {
      title: title.trim(),
      date: date || null,
      time: (date || daily) && time ? time : null,
      daily,
      // En Personal, Escuela… no hay cliente ni proyecto: se ordena por materia o categoría
      tags: byCategory ? [] : tags,
      contact: contact.trim() || null,
      original: editing ? undefined : original,
      mode: info.multi ? mode : undefined,
      subject: byCategory ? (group?.kind === "materia" ? group.name : null) : undefined,
      category: byCategory ? (group?.kind === "categoria" ? group.name : null) : undefined,
    };
    const r = await lumi.saveTask(draft, taskKey ?? null);
    setSaving(false);
    if (!r.ok) return setError(r.error ?? "No pude guardar");
    onDone();
  }

  async function remove() {
    if (!taskKey) return;
    if (!confirmDelete) return setConfirmDelete(true);
    const r = await lumi.deleteTask(taskKey);
    if (!r.ok) return setError(r.error ?? "No pude borrarlo");
    onDone();
  }

  const now = new Date();
  const setWhen = (d: Date | null) => {
    touched.current = true;
    setDate(d ? dayKey(d) : "");
    setTime(d ? fmtTime(d) : "");
  };
  const quick: [string, Date | null][] = [
    ["En 1 h", roundUpQuarter(new Date(now.getTime() + 3600000))],
    ["Hoy 18:00", (() => {
      const d = new Date(now);
      d.setHours(18, 0, 0, 0);
      return d > now ? d : null;
    })()],
    ["Mañana 9:00", (() => {
      const d = addDays(startOfDay(now), 1);
      d.setHours(9, 0, 0, 0);
      return d;
    })()],
  ];
  // Modo del pendiente (con un solo modo, ese) y cómo se ordena: cliente/proyecto o categoría
  const effMode = info.multi ? mode : (info.active?.id ?? info.modes[0]?.id ?? null);
  const modeObj = info.modes.find((m) => m.id === effMode) ?? null;
  const byCategory = taskGrouping(modeObj) === "categorias";
  const isSchool = effMode === "escuela";
  const subjects = isSchool ? snap.school.subjects : [];
  const cats = [...modeCategories(modeObj)];
  for (const c of extraCats) if (!cats.some((x) => slugify(x) === slugify(c)) && !subjects.some((x) => x.slug === slugify(c))) cats.push(c);

  function pick(g: Group) {
    touched.current = true;
    setGroup((cur) => (cur && g && cur.kind === g.kind && cur.name === g.name ? null : g));
  }

  function addCategory(e?: React.FormEvent) {
    e?.preventDefault();
    const name = newCat.trim().replace(/^#/, "");
    if (!name) return;
    const subj = subjects.find((x) => x.slug === slugify(name));
    const cat = cats.find((c) => slugify(c) === slugify(name));
    touched.current = true;
    if (subj) setGroup({ kind: "materia", name: subj.name });
    else {
      const n = cat ?? name.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
      if (!cat) setExtraCats((c) => [...c, n]);
      setGroup({ kind: "categoria", name: n });
    }
    setNewCat("");
  }

  const whenIso = date ? new Date(`${date}T${time || snap.settings.defaultReminderTime}`).toISOString() : null;
  const todayKey = dayKey(now);

  return (
    <>
      <ViewHeader title={editing ? "Editar pendiente" : "Nota rápida"} onBack={onDone} />
      <div className="scroll" style={{ flex: 1, padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {!editing && (
          <div>
            <label htmlFor="original" className="field-label">
              Lo que escribiste
            </label>
            <textarea id="original" className="textarea" rows={2} value={original} onChange={(e) => setOriginal(e.target.value)} />
            {original.trim() !== (text ?? "").trim() && (
              <button
                type="button"
                className="btn btn-lavender"
                style={{ marginTop: 8 }}
                onClick={() => {
                  touched.current = false;
                  void read(original, true);
                }}
              >
                Volver a leer la nota
              </button>
            )}
          </div>
        )}

        <div style={{ borderRadius: 18, background: editing ? "var(--surface)" : "var(--lavender)", padding: 16, display: "flex", flexDirection: "column", gap: 14, opacity: loaded ? 1 : 0.6 }}>
          {!editing && (
            <div className="row" style={{ gap: 10 }}>
              <LumiFace size={32} mood={ai === "thinking" ? "pensando" : "reposo"} />
              <span className="grow" style={{ fontSize: 14.5, fontWeight: 700, color: "var(--indigo-deep)" }}>
                {ai === "thinking" ? "Lo estoy pensando con la IA…" : "Lumi entendió esto"}
              </span>
              {ai === "thinking" && <Dots />}
            </div>
          )}

          <div>
            <label htmlFor="titulo" className="field-label" style={{ color: "var(--muted-strong)" }}>
              Qué
            </label>
            <input id="titulo" className="input" style={{ background: "#fff" }} value={title} onChange={(e) => edit(setTitle)(e.target.value)} />
          </div>

          <div>
            <div className="row" style={{ justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <span id="cuando" className="field-label" style={{ color: "var(--muted-strong)", marginBottom: 0 }}>
                Cuándo te aviso
              </span>
              <span role="radiogroup" aria-labelledby="cuando" className="seg">
                <button type="button" role="radio" aria-checked={!daily} onClick={() => edit(setDaily)(false)}>
                  Una vez
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={daily}
                  title="Te lo recuerdo todos los días hasta que lo marques como hecho"
                  onClick={() => {
                    touched.current = true;
                    setDaily(true);
                  }}
                >
                  🔔 Cada día
                </button>
              </span>
            </div>
            {daily ? (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <label htmlFor="hora-diaria" className="hint" style={{ flex: "none" }}>
                    A las
                  </label>
                  <input id="hora-diaria" type="time" className="input" style={{ background: "#fff", width: 120 }} value={time} onChange={(e) => edit(setTime)(e.target.value)} />
                  {time && (
                    <button type="button" className="btn btn-ghost" style={{ minHeight: 32, fontSize: 12.5, padding: "0 8px" }} onClick={() => edit(setTime)("")}>
                      Sin hora fija
                    </button>
                  )}
                </div>
                <span className="hint" style={{ display: "block", marginTop: 6 }}>
                  Te lo recuerdo todos los días{time ? ` a las ${time}` : ` a tu hora de siempre (${snap.settings.defaultReminderTime})`}
                  {date && date > todayKey ? `, desde el ${new Date(`${date}T12:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}` : ""} hasta que lo marques como hecho. Si un día no puedes, eliges «Mañana».
                </span>
              </>
            ) : (
              <>
                <div className="row" style={{ gap: 8 }}>
                  <label htmlFor="fecha" className="sr-only">
                    Fecha
                  </label>
                  <input id="fecha" type="date" className="input" style={{ background: "#fff" }} value={date} onChange={(e) => edit(setDate)(e.target.value)} />
                  <label htmlFor="hora" className="sr-only">
                    Hora
                  </label>
                  <input id="hora" type="time" className="input" style={{ background: "#fff", width: 120 }} value={time} disabled={!date} onChange={(e) => edit(setTime)(e.target.value)} />
                </div>
                <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                  {quick
                    .filter(([, d]) => d)
                    .map(([label, d]) => (
                      <button key={label} type="button" className="btn btn-outline" style={{ minHeight: 32, fontSize: 12.5, padding: "0 10px" }} onClick={() => setWhen(d)}>
                        {label}
                      </button>
                    ))}
                  <button type="button" className="btn btn-ghost" style={{ minHeight: 32, fontSize: 12.5, padding: "0 8px" }} onClick={() => setWhen(null)}>
                    Sin fecha
                  </button>
                </div>
                <span className="hint" style={{ display: "block", marginTop: 6 }}>
                  {whenIso ? `${whenLabel(whenIso)}${time ? "" : ` (sin hora: te aviso a las ${snap.settings.defaultReminderTime})`}` : "Sin aviso; quedará en Pendientes."}
                  {reason && !touched.current ? ` · ${reason}` : ""}
                </span>
              </>
            )}
          </div>

          {info.multi && (
            <div>
              <span id="modo-pendiente" className="field-label" style={{ color: "var(--muted-strong)" }}>
                Modo
              </span>
              <div role="radiogroup" aria-labelledby="modo-pendiente" className="row wrap" style={{ gap: 6 }}>
                {[...info.modes.map((m) => ({ id: m.id as string | null, label: `${m.icono} ${m.nombre}`, color: m.color })), { id: null, label: "Todos los modos", color: "#8F8BC9" }].map((o) => {
                  const on = mode === o.id;
                  return (
                    <button
                      key={o.id ?? "compartido"}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className="tag big"
                      onClick={() => {
                        modeTouched.current = true;
                        if (o.id !== mode) setGroup(null);
                        setMode(o.id);
                      }}
                      style={{ background: on ? tint(o.color, 0.22) : "#fff", color: "var(--ink)", boxShadow: on ? `inset 0 0 0 2px ${o.color}` : "inset 0 0 0 1px var(--line-strong)" }}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {byCategory ? (
            <div>
              <span id="grupo-pendiente" className="field-label" style={{ color: "var(--muted-strong)" }}>
                {isSchool ? "Materia o categoría" : "Categoría"}
              </span>
              <div role="radiogroup" aria-labelledby="grupo-pendiente" className="row wrap" style={{ gap: 6 }}>
                {subjects.map((x) => {
                  const on = group?.kind === "materia" && group.name === x.name;
                  return (
                    <button key={x.path} type="button" role="radio" aria-checked={on} className="tag big" title="Materia" onClick={() => pick({ kind: "materia", name: x.name })} style={chip(on, modeObj?.color)}>
                      📘 {x.name}
                    </button>
                  );
                })}
                {cats.map((c) => {
                  const on = group?.kind === "categoria" && group.name === c;
                  return (
                    <button key={c} type="button" role="radio" aria-checked={on} className="tag big" onClick={() => pick({ kind: "categoria", name: c })} style={chip(on, modeObj?.color)}>
                      {c}
                    </button>
                  );
                })}
                {!subjects.length && !cats.length && <span className="hint">Aún no hay categorías</span>}
              </div>
              <form onSubmit={addCategory} className="row" style={{ gap: 6, marginTop: 8 }}>
                <label htmlFor="nueva-categoria" className="sr-only">
                  Nueva categoría
                </label>
                <input id="nueva-categoria" className="input" style={{ background: "#fff", height: 36 }} placeholder="Nueva categoría" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
                <button type="submit" className="btn btn-soft" style={{ minHeight: 36 }} disabled={!newCat.trim()}>
                  Añadir
                </button>
              </form>
              <span className="hint" style={{ display: "block", marginTop: 6 }}>
                {isSchool && !subjects.length ? "Tus materias aparecen aquí cuando las agregas en Escuela. " : ""}
                Las categorías nuevas se quedan en {modeObj ? `el modo ${modeObj.nombre}` : "el modo"}; las cambias en Ajustes → Modos.
              </span>
            </div>
          ) : (
            <div>
              <ClientPicker
                entities={snap.entities}
                tasks={snap.tasks}
                value={cp}
                onChange={(v) => {
                  touched.current = true;
                  setCp(v);
                }}
              />
              <span className="hint" style={{ display: "block", marginTop: 6 }}>
                {snap.catalog.clients
                  ? `${snap.catalog.clients} clientes y ${snap.catalog.projects} proyectos conocidos.`
                  : "Aún no tengo clientes: escribe uno nuevo o dime en Ajustes dónde están tus carpetas."}
              </span>
            </div>
          )}

          <div>
            <label htmlFor="contacto" className="field-label" style={{ color: "var(--muted-strong)" }}>
              Persona (opcional)
            </label>
            <input id="contacto" className="input" style={{ background: "#fff" }} placeholder="¿Con quién?" value={contact} onChange={(e) => edit(setContact)(e.target.value)} />
          </div>
        </div>
        {ai === "fail" && <span className="hint">No pude consultar a la IA; usé mi lectura básica.</span>}
        {error && (
          <span className="hint" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        )}
      </div>

      <div className="row" style={{ padding: "12px 18px 16px", gap: 10, borderTop: "1px solid var(--line)" }}>
        <button type="button" className="btn btn-primary btn-lg grow" onClick={save} disabled={!title.trim() || saving}>
          {editing ? "Guardar cambios" : "Guardar pendiente"}
        </button>
        {editing ? (
          <button type="button" className="btn btn-danger btn-lg" onClick={remove}>
            {confirmDelete ? "¿Seguro?" : "Eliminar"}
          </button>
        ) : (
          <button type="button" className="btn btn-soft btn-lg" onClick={onDone}>
            Cancelar
          </button>
        )}
      </div>
    </>
  );
}

function chip(on: boolean, color = "#8F8BC9"): React.CSSProperties {
  return { background: on ? tint(color, 0.22) : "#fff", color: "var(--ink)", boxShadow: on ? `inset 0 0 0 2px ${color}` : "inset 0 0 0 1px var(--line-strong)" };
}
