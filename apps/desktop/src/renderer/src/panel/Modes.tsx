/** Ajustes de modos: edad, qué modos usas, cómo es cada uno, horario semanal y calendarios. */
import { useState } from "react";
import {
  DAY_NAMES,
  DAY_SHORT,
  MODE_WIDGETS,
  Mode,
  enabledModes,
  modeCategories,
  modeIdFrom,
  modeLook,
  slugify,
  taskGrouping,
  type AppSnapshot,
  type ModeWidget,
  type ModesConfig,
  type ScheduleBlock,
} from "@lumi/shared";
import { IconTrash } from "../components/Icons";
import { LumiFace } from "../components/LumiFace";
import { lumi } from "../lib/api";
import { tint } from "../lib/modes";
import { Msg } from "./connect";
import { Platform } from "./School";
import { SwitchRow, ViewHeader } from "./ui";
import type { View } from "./main";

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const EMOJIS = ["💼", "📚", "🏡", "🎓", "🧪", "💪", "🎨", "🎸", "✈️", "🧘", "💻", "📝"];
const COLORS = ["#5B57D1", "#E0A01E", "#2BA58F", "#E0565B", "#5AA7E8", "#F08DB0", "#33375A", "#F0896B"];
const WIDGET_LABEL: Record<ModeWidget, string> = {
  reuniones: "Siguiente reunión",
  pendientes: "Pendientes de hoy",
  enfoque: "Sesión de enfoque",
  clase: "Siguiente clase",
  entregas: "Entregas de la semana",
  repaso: "Tarjetas de repaso",
  estudio: "Sesión de estudio",
  dia: "Tu día",
  habitos: "Hábitos de hoy",
  pagos: "Pagos próximos",
  cumpleanos: "Cumpleaños",
  listas: "Listas",
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 className="section-title" style={{ marginTop: 12 }}>
        {title}
      </h2>
      {hint && <span className="hint">{hint}</span>}
      {children}
    </section>
  );
}

export function Modes({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const s = snap.settings;
  const cfg = s.modes;
  const save = (patch: Partial<ModesConfig>) => lumi.updateSettings({ modes: patch });
  const enabled = enabledModes(cfg);

  return (
    <>
      <ViewHeader title="Modos" onBack={() => go({ name: "settings" })} sub={<span className="hint">{snap.mode.text}</span>} />
      <div className="scroll" style={{ flex: 1, padding: "4px 18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
        <AgeSection snap={snap} />

        <Section title="Tus modos" hint="Cada modo ve sus propias notas y pendientes; lo que no tiene modo (diario, personas, inbox) se ve en todos. Con un solo modo, Lumi esconde todo esto.">
          {cfg.lista.map((m) => (
            <ModeCard key={m.id} snap={snap} mode={m} />
          ))}
          <NewMode cfg={cfg} />
        </Section>

        {enabled.length > 1 && (
          <>
            <Section title="Modo por defecto" hint="El que uso cuando tu horario no dice nada.">
              <div className="row wrap" style={{ gap: 6 }}>
                {enabled.map((m) => (
                  <button key={m.id} type="button" className={`tag big ${cfg.porDefecto === m.id ? "selected-dark" : "neutral"}`} aria-pressed={cfg.porDefecto === m.id} onClick={() => save({ porDefecto: m.id })}>
                    {m.icono} {m.nombre}
                  </button>
                ))}
              </div>
            </Section>

            <ScheduleEditor snap={snap} />
            <CalendarMap snap={snap} />
          </>
        )}

        {enabled.some((m) => m.id === "escuela") && <SchoolSettings snap={snap} />}
        {enabled.some((m) => m.id === "personal") && <PersonalSettings snap={snap} />}
      </div>
    </>
  );
}

/* ------------------------------ Edad ------------------------------ */

function AgeSection({ snap }: { snap: AppSnapshot }) {
  const age = snap.settings.ageGroup;
  return (
    <Section title="Tu edad">
      <div role="radiogroup" aria-label="Edad" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(
          [
            ["adulto", "Tengo 18 o más", "Lumi completo, con IA"],
            ["menor", "Tengo menos de 18", "Lumi sin IA"],
          ] as const
        ).map(([id, label, hint]) => {
          const on = (age ?? "adulto") === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => lumi.updateSettings({ ageGroup: id })}
              style={{ textAlign: "left", padding: "10px 12px", borderRadius: 14, border: on ? "2px solid var(--indigo)" : "1px solid var(--line-strong)", background: on ? "var(--lavender)" : "#fff", display: "flex", flexDirection: "column", gap: 2 }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
              <span className="hint">{hint}</span>
            </button>
          );
        })}
      </div>
      {age === "menor" && (
        <span className="hint">
          Los servicios de IA que usa Lumi piden ser mayor de edad, así que no los uso. Todo lo demás funciona: horario, recordatorios, entregas, tarjetas, sesiones de estudio y modos.
        </span>
      )}
    </Section>
  );
}

/* ---------------------- Cómo se ordenan los pendientes ---------------------- */

function TaskGroupingEditor({ mode, update }: { mode: Mode; update: (patch: Partial<Mode>) => unknown }) {
  const [name, setName] = useState("");
  const grouping = taskGrouping(mode);
  const cats = modeCategories(mode);
  const school = mode.id === "escuela";
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().replace(/^#/, "");
    if (n && !cats.some((c) => slugify(c) === slugify(n))) update({ categorias: [...cats, n] });
    setName("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span id={`orden-${mode.id}`} className="field-label" style={{ margin: 0 }}>
        Sus pendientes se ordenan por
      </span>
      <div role="radiogroup" aria-labelledby={`orden-${mode.id}`} className="row wrap" style={{ gap: 6 }}>
        {(
          [
            ["clientes", "Cliente y proyecto"],
            ["categorias", school ? "Materia y categoría" : "Categoría"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={grouping === id} className={`tag big ${grouping === id ? "selected-dark" : "neutral"}`} onClick={() => update({ organizar: id })}>
            {label}
          </button>
        ))}
      </div>
      {grouping === "categorias" && (
        <>
          <div className="row wrap" style={{ gap: 6 }}>
            {cats.map((c) => (
              <button key={c} type="button" className="tag big neutral" aria-label={`Quitar la categoría ${c}`} title="Quitar" onClick={() => update({ categorias: cats.filter((x) => x !== c) })}>
                {c}
                <span aria-hidden="true" style={{ opacity: 0.6, marginLeft: 2 }}>
                  ×
                </span>
              </button>
            ))}
            {!cats.length && <span className="hint">Sin categorías</span>}
          </div>
          <form onSubmit={add} className="row" style={{ gap: 6 }}>
            <label htmlFor={`categoria-${mode.id}`} className="sr-only">
              Nueva categoría
            </label>
            <input id={`categoria-${mode.id}`} className="input" style={{ height: 36 }} placeholder="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn btn-soft" style={{ minHeight: 36 }} disabled={!name.trim()}>
              Añadir
            </button>
          </form>
          <span className="hint">
            En Obsidian quedan como etiqueta: #{mode.id}/{slugify(cats[0] ?? "casa")}.{school ? " Tus materias salen de Escuela → Materias." : ""}
          </span>
        </>
      )}
    </div>
  );
}

/* ------------------------------ Un modo ------------------------------ */

function ModeCard({ snap, mode }: { snap: AppSnapshot; mode: Mode }) {
  const cfg = snap.settings.modes;
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const builtin = ["trabajo", "escuela", "personal"].includes(mode.id);
  const others = cfg.lista.filter((x) => x.id !== mode.id && x.enabled);

  const update = (patch: Partial<Mode>) => {
    const lista = cfg.lista.map((x) => (x.id === mode.id ? { ...x, ...patch } : x));
    const enabled = lista.filter((x) => x.enabled);
    const porDefecto = enabled.some((x) => x.id === cfg.porDefecto) ? cfg.porDefecto : (enabled[0]?.id ?? cfg.porDefecto);
    return lumi.updateSettings({ modes: { lista, porDefecto } });
  };
  const list = (v: string) =>
    v
      .split(",")
      .map((x) => x.trim().replace(/^#/, ""))
      .filter(Boolean);
  const look = modeLook(snap.settings.avatar, cfg, mode.id);

  return (
    <div style={{ borderRadius: 14, border: "1px solid var(--line)", overflow: "hidden" }}>
      <div className="row" style={{ gap: 10, padding: "10px 12px", background: mode.enabled ? tint(mode.color, 0.1) : "#fff" }}>
        <span aria-hidden="true" style={{ fontSize: 20 }}>
          {mode.icono}
        </span>
        <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>{mode.nombre}</span>
          <span className="hint">{mode.alcance.carpetas.length ? mode.alcance.carpetas.join(", ") : "Por etiqueta"}</span>
        </span>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 30, padding: "0 6px" }} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Cerrar" : "Ajustar"}
        </button>
        <input
          type="checkbox"
          className="switch"
          aria-label={`Usar el modo ${mode.nombre}`}
          checked={mode.enabled}
          disabled={mode.enabled && !others.length}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
      </div>
      {open && (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)" }}>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-soft"
              onClick={async () => {
                const r = await lumi.openModeFile(mode.id);
                if (!r.ok) setMsg({ ok: false, text: r.error ?? "" });
              }}
            >
              Editar su personalidad
            </button>
            <span className="hint grow">Cómo te habla y qué cuida (90-Lumi/modos/{mode.id}.md)</span>
          </div>

          {!builtin && (
            <div className="row" style={{ gap: 8 }}>
              <label htmlFor={`nombre-${mode.id}`} className="sr-only">
                Nombre
              </label>
              <input id={`nombre-${mode.id}`} className="input" defaultValue={mode.nombre} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== mode.nombre && update({ nombre: e.target.value.trim() })} />
            </div>
          )}

          <div>
            <label htmlFor={`carpetas-${mode.id}`} className="field-label">
              Carpetas de este modo (separadas por coma)
            </label>
            <input id={`carpetas-${mode.id}`} className="input" defaultValue={mode.alcance.carpetas.join(", ")} placeholder="10-Escuela" onBlur={(e) => update({ alcance: { ...mode.alcance, carpetas: list(e.target.value) } })} />
          </div>
          <div>
            <label htmlFor={`etiquetas-${mode.id}`} className="field-label">
              Etiquetas extra (además de #{mode.id})
            </label>
            <input id={`etiquetas-${mode.id}`} className="input" defaultValue={mode.alcance.etiquetas.filter((t) => t !== mode.id).join(", ")} placeholder="tesis, gym" onBlur={(e) => update({ alcance: { ...mode.alcance, etiquetas: list(e.target.value) } })} />
          </div>

          <TaskGroupingEditor mode={mode} update={update} />

          <div className="row" style={{ gap: 10 }}>
            <span style={{ width: 56, height: 56, borderRadius: 14, background: "var(--lavender)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <LumiFace size={50} look={look} />
            </span>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{mode.apariencia ? "Look propio en este modo" : "Usa tu look de siempre"}</span>
              <span className="row wrap" style={{ gap: 6 }}>
                <button type="button" className="btn btn-soft" style={{ minHeight: 32 }} onClick={() => update({ apariencia: { ...snap.settings.avatar } as Record<string, unknown> })} title="Guarda cómo se ve Lumi ahora como el look de este modo">
                  Usar mi look actual
                </button>
                {mode.apariencia && (
                  <button type="button" className="btn btn-ghost" style={{ minHeight: 32 }} onClick={() => update({ apariencia: null })}>
                    Quitar
                  </button>
                )}
              </span>
            </span>
          </div>

          <SwitchRow label="Silenciar avisos de otros modos" hint="Mientras estés aquí, los avisos de otros modos esperan (salvo urgentes y reuniones)." checked={mode.notificaciones.silenciarOtrosModos} onChange={(v) => update({ notificaciones: { ...mode.notificaciones, silenciarOtrosModos: v } })} />
          <div className="row wrap" style={{ gap: 8, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
            <label className="row grow" style={{ gap: 8, fontSize: 14, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={!!mode.notificaciones.horasSilencio}
                onChange={(e) => update({ notificaciones: { ...mode.notificaciones, horasSilencio: e.target.checked ? ["22:00", "07:00"] : null } })}
              />
              Horas sin avisos
            </label>
            {mode.notificaciones.horasSilencio && (
              <>
                <label htmlFor={`silencio-a-${mode.id}`} className="sr-only">
                  Desde
                </label>
                <input id={`silencio-a-${mode.id}`} type="time" className="input" style={{ width: 104, height: 34 }} defaultValue={mode.notificaciones.horasSilencio[0]} onBlur={(e) => e.target.value && update({ notificaciones: { ...mode.notificaciones, horasSilencio: [e.target.value, mode.notificaciones.horasSilencio![1]] } })} />
                <span className="hint">a</span>
                <label htmlFor={`silencio-b-${mode.id}`} className="sr-only">
                  Hasta
                </label>
                <input id={`silencio-b-${mode.id}`} type="time" className="input" style={{ width: 104, height: 34 }} defaultValue={mode.notificaciones.horasSilencio[1]} onBlur={(e) => e.target.value && update({ notificaciones: { ...mode.notificaciones, horasSilencio: [mode.notificaciones.horasSilencio![0], e.target.value] } })} />
              </>
            )}
          </div>

          {snap.settings.ageGroup !== "menor" && (
            <div className="row" style={{ gap: 8 }}>
              <label htmlFor={`ia-${mode.id}`} className="field-label grow" style={{ marginBottom: 0 }}>
                IA en este modo
              </label>
              <select
                id={`ia-${mode.id}`}
                className="select"
                style={{ width: 180, height: 36 }}
                value={`${mode.ia.proveedor ?? ""}|${mode.ia.perfil ?? ""}`}
                onChange={(e) => {
                  const [p, f] = e.target.value.split("|");
                  update({ ia: { proveedor: (p || null) as Mode["ia"]["proveedor"], perfil: (f || null) as Mode["ia"]["perfil"] } });
                }}
              >
                <option value="|">La de Ajustes</option>
                <option value="claude|">Claude</option>
                <option value="claude|rapido">Claude (rápida)</option>
                <option value="gemini|">Gemini</option>
                <option value="gemini|rapido">Gemini (rápida)</option>
              </select>
            </div>
          )}

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">Tarjetas en «Hoy»</legend>
            <div className="row wrap" style={{ gap: 6 }}>
              {MODE_WIDGETS.map((w) => {
                const on = mode.panel.includes(w);
                return (
                  <button key={w} type="button" className={`tag big ${on ? "selected-dark" : "off"}`} aria-pressed={on} onClick={() => update({ panel: on ? mode.panel.filter((x) => x !== w) : [...mode.panel, w] })}>
                    {WIDGET_LABEL[w]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {!builtin && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ alignSelf: "flex-start" }}
              onClick={() =>
                lumi.updateSettings({
                  modes: {
                    lista: cfg.lista.filter((x) => x.id !== mode.id),
                    horario: cfg.horario.filter((b) => b.modo !== mode.id),
                    porDefecto: cfg.porDefecto === mode.id ? (others[0]?.id ?? "trabajo") : cfg.porDefecto,
                    fijado: cfg.fijado?.modo === mode.id ? null : cfg.fijado,
                  },
                })
              }
            >
              Eliminar este modo
            </button>
          )}
          <Msg m={msg} />
        </div>
      )}
    </div>
  );
}

function NewMode({ cfg }: { cfg: ModesConfig }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(EMOJIS[3]);
  const [color, setColor] = useState(COLORS[4]);
  if (!open) {
    return (
      <button type="button" className="btn btn-lavender btn-lg" style={{ border: "1px dashed #8F8BC9", background: "transparent" }} onClick={() => setOpen(true)}>
        + Nuevo modo (Tesis, Freelance, Gym…)
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const id = modeIdFrom(name, cfg.lista.map((m) => m.id));
        const m = Mode.parse({ id, nombre: name.trim(), icono: icon, color, alcance: { carpetas: [], etiquetas: [] }, panel: ["pendientes"] });
        await lumi.updateSettings({ modes: { lista: [...cfg.lista, m] } });
        setOpen(false);
        setName("");
      }}
      style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 14, background: "var(--surface)" }}
    >
      <label htmlFor="modo-nuevo" className="field-label" style={{ marginBottom: 0 }}>
        Nombre del modo
      </label>
      <input id="modo-nuevo" className="input" style={{ background: "#fff" }} placeholder="Tesis" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div role="group" aria-label="Ícono" className="row wrap" style={{ gap: 4 }}>
        {EMOJIS.map((x) => (
          <button key={x} type="button" aria-pressed={icon === x} onClick={() => setIcon(x)} style={{ width: 36, height: 36, borderRadius: 10, border: icon === x ? "2px solid var(--indigo)" : "1px solid var(--line-strong)", background: "#fff", fontSize: 18 }}>
            {x}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Color" className="row wrap" style={{ gap: 6 }}>
        {COLORS.map((c) => (
          <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: 14, background: c, border: color === c ? "3px solid var(--ink)" : "2px solid #fff", boxShadow: "0 0 0 1px var(--line-strong)" }} />
        ))}
      </div>
      <span className="hint">Sus notas: las que tengan «modo: {name.trim() ? modeIdFrom(name, cfg.lista.map((m) => m.id)) : "…"}» en el encabezado o la etiqueta #{name.trim() ? modeIdFrom(name, cfg.lista.map((m) => m.id)) : "…"}. Luego puedes asignarle carpetas.</span>
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          Crear modo
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* ------------------------------ Horario ------------------------------ */

const H0 = 6;
const H1 = 24;
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

function WeekGrid({ blocks, modes }: { blocks: ScheduleBlock[]; modes: Mode[] }) {
  const height = 150;
  const y = (min: number) => ((Math.min(Math.max(min, H0 * 60), H1 * 60) - H0 * 60) / ((H1 - H0) * 60)) * height;
  return (
    <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "26px repeat(7, minmax(0, 1fr))", gap: 3 }}>
      <div style={{ position: "relative", height }}>
        {[6, 12, 18].map((h) => (
          <span key={h} style={{ position: "absolute", top: y(h * 60) - 6, fontSize: 9.5, color: "var(--muted)" }}>
            {h}h
          </span>
        ))}
      </div>
      {ORDER.map((d) => (
        <div key={d} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ position: "relative", height, borderRadius: 6, background: "var(--surface)" }}>
            {blocks
              .filter((b) => b.dias.includes(d))
              .map((b) => {
                const m = modes.find((x) => x.id === b.modo);
                const a = toMin(b.inicio);
                let z = toMin(b.fin);
                if (z <= a) z = 24 * 60;
                return <span key={b.id} title={`${m?.nombre ?? b.modo} ${b.inicio}–${b.fin}`} style={{ position: "absolute", left: 1, right: 1, top: y(a), height: Math.max(3, y(z) - y(a)), borderRadius: 4, background: m?.color ?? "#999", opacity: 0.85 }} />;
              })}
          </div>
          <span style={{ fontSize: 10.5, textAlign: "center", fontWeight: 700, color: "var(--muted)" }}>{DAY_SHORT[d]}</span>
        </div>
      ))}
    </div>
  );
}

function ScheduleEditor({ snap }: { snap: AppSnapshot }) {
  const cfg = snap.settings.modes;
  const modes = enabledModes(cfg);
  const save = (horario: ScheduleBlock[]) => lumi.updateSettings({ modes: { horario } });
  const set = (id: string, patch: Partial<ScheduleBlock>) => save(cfg.horario.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const classes = cfg.clasesActivan && modes.some((m) => m.id === "escuela") && snap.school.subjects.some((s) => s.slots.length);
  return (
    <Section title="Horario semanal" hint="Lumi cambia sola de modo según estos bloques. Un cambio manual o un evento de calendario asignado gana sobre el horario.">
      <WeekGrid blocks={cfg.horario} modes={modes} />
      <div className="row wrap" style={{ gap: 8 }}>
        {modes.map((m) => (
          <span key={m.id} className="row" style={{ gap: 4, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: m.color }} />
            {m.nombre}
          </span>
        ))}
        <span className="hint">Fuera de los bloques: {modes.find((m) => m.id === cfg.porDefecto)?.nombre ?? "—"}</span>
      </div>
      {classes && <span className="hint">Además, tus clases activan el modo Escuela mientras duran.</span>}
      {cfg.horario.map((b) => (
        <div key={b.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 14, border: "1px solid var(--line)" }}>
          <div className="row" style={{ gap: 6 }}>
            <label htmlFor={`bloque-modo-${b.id}`} className="sr-only">
              Modo
            </label>
            <select id={`bloque-modo-${b.id}`} className="select" style={{ height: 36 }} value={b.modo} onChange={(e) => set(b.id, { modo: e.target.value })}>
              {modes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.icono} {m.nombre}
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn plain" aria-label="Quitar este bloque" onClick={() => save(cfg.horario.filter((x) => x.id !== b.id))}>
              <IconTrash size={15} />
            </button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="hint">De</span>
            <label htmlFor={`bloque-ini-${b.id}`} className="sr-only">
              Desde
            </label>
            <input id={`bloque-ini-${b.id}`} type="time" className="input" style={{ width: 132, height: 36 }} defaultValue={b.inicio} onBlur={(e) => e.target.value && e.target.value !== b.inicio && set(b.id, { inicio: e.target.value })} />
            <span className="hint">a</span>
            <label htmlFor={`bloque-fin-${b.id}`} className="sr-only">
              Hasta
            </label>
            <input id={`bloque-fin-${b.id}`} type="time" className="input" style={{ width: 132, height: 36 }} defaultValue={b.fin} onBlur={(e) => e.target.value && e.target.value !== b.fin && set(b.id, { fin: e.target.value })} />
          </div>
          <div className="row" style={{ gap: 4 }} role="group" aria-label="Días">
            {ORDER.map((d) => {
              const on = b.dias.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_NAMES[d]}
                  onClick={() => {
                    const dias = on ? b.dias.filter((x) => x !== d) : [...b.dias, d];
                    if (dias.length) void set(b.id, { dias });
                  }}
                  style={{ width: 32, height: 32, borderRadius: 9, border: 0, fontWeight: 700, fontSize: 12.5, background: on ? "var(--indigo)" : "var(--surface)", color: on ? "#fff" : "var(--muted)" }}
                >
                  {DAY_SHORT[d]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-lavender btn-lg"
        style={{ border: "1px dashed #8F8BC9", background: "transparent" }}
        onClick={() =>
          save([
            ...cfg.horario,
            { id: Date.now().toString(36), dias: [1, 2, 3, 4, 5], inicio: "09:00", fin: "14:00", modo: modes.find((m) => m.id !== cfg.porDefecto)?.id ?? modes[0].id },
          ])
        }
      >
        + Agregar bloque
      </button>
    </Section>
  );
}

/* ------------------------------ Calendarios ------------------------------ */

function CalendarMap({ snap }: { snap: AppSnapshot }) {
  const cfg = snap.settings.modes;
  const modes = enabledModes(cfg);
  const names = [...new Set([...snap.meetings.map((m) => m.calendar), ...snap.settings.calendars.ics.filter((x) => x.kind !== "entregas").map((x) => x.name), ...Object.keys(cfg.calendarios)])].sort();
  return (
    <Section title="Calendarios" hint="Asigna un calendario a un modo: sus eventos activan ese modo mientras duran y sus reuniones solo se ven ahí. «Compartido» se ve en todos.">
      {names.length === 0 && <span className="hint">Conecta tu calendario en Ajustes para asignarlo a un modo.</span>}
      {names.map((n) => (
        <label key={n} className="row" style={{ gap: 10, padding: "8px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
          <span className="grow" style={{ fontSize: 14, fontWeight: 600 }}>
            {n}
          </span>
          <select
            className="select"
            style={{ width: 160, height: 34 }}
            value={cfg.calendarios[n] ?? ""}
            onChange={(e) => {
              const next = { ...cfg.calendarios };
              if (e.target.value) next[n] = e.target.value;
              else delete next[n];
              void lumi.updateSettings({ modes: { calendarios: next } });
            }}
          >
            <option value="">Compartido</option>
            {modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.icono} {m.nombre}
              </option>
            ))}
          </select>
        </label>
      ))}
    </Section>
  );
}

/* ------------------------------ Escuela y Personal ------------------------------ */

function SchoolSettings({ snap }: { snap: AppSnapshot }) {
  const sc = snap.settings.school;
  return (
    <Section title="Escuela">
      <SwitchRow label="Mis clases activan el modo Escuela" hint="Según el horario de tus materias" checked={snap.settings.modes.clasesActivan} onChange={(v) => lumi.updateSettings({ modes: { clasesActivan: v } })} />
      <label className="row" style={{ gap: 12, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
        <span className="grow" style={{ fontSize: 14.5, fontWeight: 600 }}>
          Avisar antes de clase
        </span>
        <select className="select" style={{ width: 100, height: 36, background: "#fff" }} value={sc.classLeadMin} onChange={(e) => lumi.updateSettings({ school: { classLeadMin: parseInt(e.target.value, 10) } })}>
          {[0, 5, 10, 15, 30].map((n) => (
            <option key={n} value={n}>
              {n ? `${n} min` : "No"}
            </option>
          ))}
        </select>
      </label>
      <label className="row" style={{ gap: 12, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
        <span className="grow" style={{ fontSize: 14.5, fontWeight: 600 }}>
          Sesión de estudio
        </span>
        <select className="select" style={{ width: 150, height: 36, background: "#fff" }} value={`${sc.focusMin}/${sc.breakMin}`} onChange={(e) => {
          const [f, b] = e.target.value.split("/").map(Number);
          void lumi.updateSettings({ school: { focusMin: f, breakMin: b } });
        }}>
          {["25/5", "15/3", "45/10", "50/10"].map((x) => (
            <option key={x} value={x}>
              {x.replace("/", " + ")} min
            </option>
          ))}
        </select>
      </label>
      <SwitchRow label="Avisarme de semanas cargadas" hint="Si un día junta 3 entregas o 2 y un examen, te aviso antes" checked={sc.loadAlerts} onChange={(v) => lumi.updateSettings({ school: { loadAlerts: v } })} />
      <SwitchRow label="Recordarme repasar" hint="Una vez al día, si hay tarjetas para hoy" checked={sc.reviewNudge} onChange={(v) => lumi.updateSettings({ school: { reviewNudge: v } })} />
      <Platform snap={snap} />
    </Section>
  );
}

function PersonalSettings({ snap }: { snap: AppSnapshot }) {
  const p = snap.settings.personal;
  return (
    <Section title="Personal">
      <SwitchRow label="Cierre del día" hint="Qué hiciste y qué pasa a mañana" checked={p.closeDay} onChange={(v) => lumi.updateSettings({ personal: { closeDay: v } })} />
      {p.closeDay && (
        <label className="row" style={{ gap: 12, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
          <span className="grow" style={{ fontSize: 14.5, fontWeight: 600 }}>
            Hora del cierre
          </span>
          <input type="time" className="input" style={{ width: 110, height: 36 }} defaultValue={p.closeDayTime} onBlur={(e) => e.target.value && lumi.updateSettings({ personal: { closeDayTime: e.target.value } })} />
        </label>
      )}
      <label className="row" style={{ gap: 12, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
        <span className="grow" style={{ fontSize: 14.5, fontWeight: 600 }}>
          Avisar cumpleaños antes
        </span>
        <select className="select" style={{ width: 100, height: 36, background: "#fff" }} value={p.birthdayLeadDays} onChange={(e) => lumi.updateSettings({ personal: { birthdayLeadDays: parseInt(e.target.value, 10) } })}>
          {[1, 3, 7].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "día" : "días"}
            </option>
          ))}
        </select>
      </label>
    </Section>
  );
}
