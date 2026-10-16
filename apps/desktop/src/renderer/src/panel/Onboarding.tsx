/**
 * Onboarding: bienvenida, edad y modos, vault, IA, calendario, Granola, entrevista e indexado.
 * Para menores de 18 se saltan la IA y Granola («Lumi sin IA»).
 */
import { useEffect, useState } from "react";
import { DEFAULT_MODES, PRESETS, enabledModes, sameAvatar, type AppSnapshot } from "@lumi/shared";
import { LumiFace } from "../components/LumiFace";
import { IconClose, IconFolder } from "../components/Icons";
import { lumi } from "../lib/api";
import { tint } from "../lib/modes";
import { AIForm, CalendarForm, GranolaForm, Msg } from "./connect";
import { Platform } from "./School";

type StepId = "bienvenida" | "uso" | "vault" | "ia" | "calendario" | "granola" | "conoceme" | "listo";
const ALL_STEPS: [StepId, string][] = [
  ["bienvenida", "Bienvenida"],
  ["uso", "Para qué"],
  ["vault", "Tu vault"],
  ["ia", "Inteligencia"],
  ["calendario", "Calendario"],
  ["granola", "Granola"],
  ["conoceme", "Conóceme"],
  ["listo", "Listo"],
];

export function Onboarding({ snap }: { snap: AppSnapshot }) {
  const minor = snap.settings.ageGroup === "menor";
  const STEPS = ALL_STEPS.filter(([id]) => !(minor && (id === "ia" || id === "granola")));
  const step = Math.min(snap.settings.onboardingStep, STEPS.length - 1);
  const id = STEPS[step][0];
  const goTo = (n: number) => lumi.updateSettings({ onboardingStep: n });
  const next = () => goTo(step + 1);
  const back = () => goTo(Math.max(0, step - 1));
  const school = enabledModes(snap.settings.modes).some((m) => m.id === "escuela");

  return (
    <>
      <div className="row" style={{ padding: "14px 14px 0 18px", gap: 10 }}>
        <div className="grow" style={{ display: "flex", gap: 4 }} aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
          {STEPS.map(([sid, label], i) => (
            <span key={sid} title={label} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? "var(--indigo)" : "var(--line-strong)" }} />
          ))}
        </div>
        <button type="button" className="icon-btn plain" aria-label="Cerrar (sigues después)" onClick={() => lumi.hidePanel()}>
          <IconClose size={18} />
        </button>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "16px 22px 12px", display: "flex", flexDirection: "column", gap: 14 }}>
        {id === "bienvenida" && <Welcome snap={snap} />}
        {id === "uso" && <UsageStep snap={snap} onDone={next} onBack={back} />}
        {id === "vault" && <VaultStep snap={snap} onDone={next} onBack={back} />}
        {id === "ia" && (
          <>
            <StepTitle title="Elige tu IA" text="Lumi usa tu propia clave: tú eliges el proveedor y pagas solo lo que usas. Solo se envían los fragmentos necesarios para responder." />
            <AIForm snap={snap} compact />
          </>
        )}
        {id === "calendario" && (
          <>
            <StepTitle title="Conecta tu calendario" text={school ? "Para saber qué reuniones y clases vienen, y traer tus entregas de la escuela." : "Para saber qué reuniones vienen y avisarte unos minutos antes."} />
            <CalendarForm snap={snap} compact />
            {school && <Platform snap={snap} />}
          </>
        )}
        {id === "granola" && (
          <>
            <StepTitle title="Conecta Granola" text="Granola graba tus reuniones sin bot. Lumi guarda cada una en tu vault con resumen, pendientes y decisiones, para siempre." />
            <GranolaForm snap={snap} compact />
          </>
        )}
        {id === "conoceme" && <Interview snap={snap} onDone={next} onBack={back} />}
        {id === "listo" && <Indexing snap={snap} />}
      </div>
      {id !== "uso" && id !== "vault" && id !== "conoceme" && (
        <div className="row" style={{ padding: "12px 18px 16px", gap: 10, borderTop: "1px solid var(--line)" }}>
          {step > 0 && (
            <button type="button" className="btn btn-ghost btn-lg" onClick={back}>
              Atrás
            </button>
          )}
          <span className="grow" />
          {id === "listo" ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => lumi.finishOnboarding()}>
              ¡Empezar a usar Lumi!
            </button>
          ) : (
            <>
              {(id === "ia" || id === "calendario" || id === "granola") && (
                <button type="button" className="btn btn-soft btn-lg" onClick={next}>
                  Más tarde
                </button>
              )}
              <button type="button" className="btn btn-primary btn-lg" onClick={next}>
                {id === "bienvenida" ? "Empezar" : "Siguiente"}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h1 style={{ margin: 0, fontFamily: "var(--display)", fontSize: 24, fontWeight: 700 }}>{title}</h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--muted-strong)" }}>{text}</p>
    </div>
  );
}

function Welcome({ snap }: { snap: AppSnapshot }) {
  const look = snap.settings.avatar;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, paddingTop: 10 }}>
      <div style={{ animation: "lumi-bob 3.2s ease-in-out infinite" }}>
        <LumiFace size={108} mood="hablando" shadow />
      </div>
      <h1 style={{ margin: 0, fontFamily: "var(--display)", fontSize: 28, fontWeight: 700 }}>¡Hola! Soy Lumi</h1>
      <div style={{ width: "100%", textAlign: "left" }}>
        <span id="elige-lumi" className="field-label">
          Elige tu Lumi
        </span>
        <div role="group" aria-labelledby="elige-lumi" style={{ display: "grid", gridTemplateColumns: `repeat(${PRESETS.length}, minmax(0, 1fr))`, gap: 4 }}>
          {PRESETS.map((pr) => {
            const on = sameAvatar(pr.look, look);
            return (
              <button
                key={pr.id}
                type="button"
                aria-pressed={on}
                aria-label={pr.name}
                title={pr.name}
                onClick={() => lumi.updateSettings({ avatar: pr.look })}
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
        <span className="hint">Luego le cambias ropa, cabello y lentes en Ajustes → Apariencia.</span>
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--muted-strong)" }}>
        Voy a flotar en tu pantalla para recordarte pendientes, avisarte de reuniones y ayudarte con tus rutinas.
      </p>
      <div style={{ padding: 14, borderRadius: 16, background: "var(--lavender)", textAlign: "left", fontSize: 14, lineHeight: 1.5 }}>
        <b>Tu información se queda en tu computadora.</b> Guardo todo en un vault de Obsidian: archivos Markdown que puedes leer y editar. Si un día dejas de usarme, conservas todo.
      </div>
    </div>
  );
}


/* ------------------------------ Edad y modos ------------------------------ */

function UsageStep({ snap, onDone, onBack }: { snap: AppSnapshot; onDone: () => void; onBack: () => void }) {
  const cfg = snap.settings.modes;
  const [age, setAge] = useState<"adulto" | "menor" | null>(snap.settings.ageGroup);
  const [chosen, setChosen] = useState<string[]>(snap.settings.ageGroup !== null ? enabledModes(cfg).map((m) => m.id) : []);
  const [quick, setQuick] = useState(true);
  const [from, setFrom] = useState("07:00");
  const [to, setTo] = useState("14:00");
  const [blockMode, setBlockMode] = useState<string>("");
  const [rest, setRest] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const multi = chosen.length > 1;
  const pickBlock = blockMode && chosen.includes(blockMode) ? blockMode : (chosen.includes("escuela") ? "escuela" : chosen.includes("trabajo") ? "trabajo" : chosen[0]) ?? "";
  const pickRest = rest && chosen.includes(rest) ? rest : (chosen.includes("personal") ? "personal" : chosen.find((x) => x !== pickBlock)) ?? chosen[0] ?? "";

  async function save() {
    if (!age || !chosen.length) return;
    setBusy(true);
    await lumi.updateSettings({
      ageGroup: age,
      ...(age === "menor" ? { ai: { enabled: false } } : {}),
      modes: {
        lista: cfg.lista.map((m) => ({ ...m, enabled: chosen.includes(m.id) })),
        porDefecto: multi ? pickRest : chosen[0],
        horario: multi && quick && pickBlock !== pickRest ? [{ id: "inicial", dias: [1, 2, 3, 4, 5], inicio: from, fin: to, modo: pickBlock }] : [],
        fijado: null,
      },
    });
    setBusy(false);
    onDone();
  }

  const names = Object.fromEntries(DEFAULT_MODES.map((m) => [m.id, m]));
  const HINTS: Record<string, string> = {
    trabajo: "Clientes, proyectos y reuniones",
    escuela: "Materias, entregas, repaso y sesiones de estudio",
    personal: "Tu día, pagos, cumpleaños, listas y hábitos",
  };

  return (
    <>
      <StepTitle title="Para qué me vas a usar" text="Puedo ser tu asistente de trabajo, de la escuela y de tu vida diaria. Cada modo ve sus propias cosas y cambio solo según tu horario." />
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <legend className="field-label">¿Cuántos años tienes?</legend>
        <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(
            [
              ["adulto", "18 o más"],
              ["menor", "Menos de 18"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={age === id} onClick={() => setAge(id)} style={{ minHeight: 44, borderRadius: 12, fontWeight: 700, border: age === id ? "2px solid var(--indigo)" : "1px solid var(--line-strong)", background: age === id ? "var(--lavender)" : "#fff" }}>
              {label}
            </button>
          ))}
        </div>
        {age === "menor" && (
          <span className="hint" style={{ padding: "8px 10px", borderRadius: 10, background: "var(--sun-soft)", color: "var(--sun-ink)" }}>
            Te armo <b>Lumi sin IA</b>: los servicios de IA piden ser mayor de edad, así que no los uso. Tendrás horario, recordatorios, entregas, tarjetas de repaso, sesiones de estudio y modos. Todo se queda en tu computadora.
          </span>
        )}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <legend className="field-label">Elige uno o varios</legend>
        {["trabajo", "escuela", "personal"].map((id) => {
          const m = names[id];
          const on = chosen.includes(id);
          return (
            <button
              key={id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => setChosen(on ? chosen.filter((x) => x !== id) : [...chosen, id])}
              className="row"
              style={{ gap: 12, textAlign: "left", padding: "10px 14px", borderRadius: 14, border: on ? `2px solid ${m.color}` : "1px solid var(--line-strong)", background: on ? tint(m.color, 0.12) : "#fff" }}
            >
              <span aria-hidden="true" style={{ fontSize: 24 }}>
                {m.icono}
              </span>
              <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{m.nombre}</span>
                <span className="hint">{HINTS[id]}</span>
              </span>
              <span aria-hidden="true" className={`check${on ? " done" : ""}`}>
                {on ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </fieldset>

      {multi && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "var(--surface)" }}>
          <label className="row" style={{ gap: 8, fontSize: 13.5, fontWeight: 700 }}>
            <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} />
            Horario rápido (luego lo afinas en Ajustes → Modos)
          </label>
          {quick && (
            <div className="row wrap" style={{ gap: 6, fontSize: 13.5 }}>
              <span>Entre semana de</span>
              <label htmlFor="rapido-desde" className="sr-only">
                Desde
              </label>
              <input id="rapido-desde" type="time" className="input" style={{ width: 100, height: 34, background: "#fff" }} value={from} onChange={(e) => setFrom(e.target.value)} />
              <span>a</span>
              <label htmlFor="rapido-hasta" className="sr-only">
                Hasta
              </label>
              <input id="rapido-hasta" type="time" className="input" style={{ width: 100, height: 34, background: "#fff" }} value={to} onChange={(e) => setTo(e.target.value)} />
              <label htmlFor="rapido-modo" className="sr-only">
                Modo
              </label>
              <select id="rapido-modo" className="select" style={{ width: 130, height: 34, background: "#fff" }} value={pickBlock} onChange={(e) => setBlockMode(e.target.value)}>
                {chosen.map((id) => (
                  <option key={id} value={id}>
                    {names[id].icono} {names[id].nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="row wrap" style={{ gap: 6, fontSize: 13.5 }}>
            <span>El resto del tiempo:</span>
            <label htmlFor="rapido-resto" className="sr-only">
              Modo por defecto
            </label>
            <select id="rapido-resto" className="select" style={{ width: 130, height: 34, background: "#fff" }} value={pickRest} onChange={(e) => setRest(e.target.value)}>
              {chosen.map((id) => (
                <option key={id} value={id}>
                  {names[id].icono} {names[id].nombre}
                </option>
              ))}
            </select>
          </div>
          <span className="hint">También cambias cuando quieras: clic derecho sobre mí → Modo, o pídemelo en el chat.</span>
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: "auto" }}>
        <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>
          Atrás
        </button>
        <span className="grow" />
        <button type="button" className="btn btn-primary btn-lg" disabled={!age || !chosen.length || busy} onClick={save}>
          Siguiente
        </button>
      </div>
    </>
  );
}

function VaultStep({ snap, onDone, onBack }: { snap: AppSnapshot; onDone: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<"crear" | "existente">("crear");
  const [path, setPath] = useState(snap.settings.vaultPath ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!path) lumi.defaultVaultPath().then(setPath);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick() {
    const p = await lumi.chooseFolder(mode === "crear" ? "¿Dónde creo tu vault?" : "Elige tu vault de Obsidian");
    if (p) setPath(mode === "crear" && !/LumiVault$/i.test(p) ? `${p}/LumiVault` : p);
  }

  async function confirm() {
    setBusy(true);
    const r = await lumi.setupVault(path, mode);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude preparar el vault" });
    onDone();
  }

  return (
    <>
      <StepTitle title="Tu cerebro" text={`Elige dónde vivirá tu información. Lumi crea sus carpetas (00-Inbox, 01-Diario${school(snap) ? ", 10-Escuela" : ""}${personal(snap) ? ", 20-Personal" : ""}…) sin tocar lo que ya tengas.`} />
      <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(
          [
            ["crear", "Crear un vault nuevo", "Recomendado si aún no usas Obsidian"],
            ["existente", "Usar mi vault de Obsidian", "Lumi solo agrega sus carpetas"],
          ] as const
        ).map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            onClick={() => {
              setMode(id);
              if (id === "existente") setPath("");
              else lumi.defaultVaultPath().then(setPath);
            }}
            style={{ textAlign: "left", padding: "12px 14px", borderRadius: 14, border: mode === id ? "2px solid var(--indigo)" : "1px solid var(--line-strong)", background: mode === id ? "var(--lavender)" : "#fff", display: "flex", flexDirection: "column", gap: 2 }}
          >
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>{label}</span>
            <span className="hint">{hint}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8, padding: "10px 12px", borderRadius: 14, background: "var(--surface)" }}>
        <IconFolder size={18} />
        <span className="grow" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{path || "Sin carpeta elegida"}</span>
        <button type="button" className="btn btn-soft" style={{ background: "#fff" }} onClick={pick}>
          Cambiar
        </button>
      </div>
      <span className="hint">
        ¿No tienes Obsidian? No es obligatorio, pero es la mejor forma de ver tu cerebro.{" "}
        <a href="#" onClick={(e) => (e.preventDefault(), lumi.openExternal("https://obsidian.md/download"))}>
          Descargar Obsidian
        </a>
      </span>
      <Msg m={msg} />
      <div className="row" style={{ gap: 10, marginTop: "auto" }}>
        <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>
          Atrás
        </button>
        <span className="grow" />
        <button type="button" className="btn btn-primary btn-lg" disabled={!path || busy} onClick={confirm}>
          {busy ? "Preparando…" : mode === "crear" ? "Crear vault" : "Usar este vault"}
        </button>
      </div>
    </>
  );
}

const school = (snap: AppSnapshot) => enabledModes(snap.settings.modes).some((m) => m.id === "escuela");
const personal = (snap: AppSnapshot) => enabledModes(snap.settings.modes).some((m) => m.id === "personal");
const work = (snap: AppSnapshot) => enabledModes(snap.settings.modes).some((m) => m.id === "trabajo");

function Interview({ snap, onDone, onBack }: { snap: AppSnapshot; onDone: () => void; onBack: () => void }) {
  const [a, setA] = useState({ name: snap.settings.userName, work: "", clients: "", projects: "", subjects: "", routines: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setA({ ...a, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await lumi.saveProfile(a);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude guardar" });
    onDone();
  }

  const isWork = work(snap);
  const isSchool = school(snap);
  const fields: [keyof typeof a, string, string, boolean][] = [
    ["name", "¿Cómo te llamo?", "Axel", false],
    ["work", isWork ? "¿A qué te dedicas?" : isSchool ? "¿Qué estudias y dónde?" : "Cuéntame un poco de ti", isWork ? "Desarrollo web freelance y asesoría fiscal…" : isSchool ? "Derecho en la UNAM, 3er semestre…" : "Me gusta correr, cocinar…", true],
    ...(isWork
      ? ([
          ["clients", "Tus clientes (separados por coma)", "Grupo Norte, Despacho Ruiz", false],
          ["projects", "Tus proyectos", "Rediseño web, Propuesta Q4", false],
        ] as [keyof typeof a, string, string, boolean][])
      : []),
    ...(isSchool ? ([["subjects", "Tus materias (una por línea, con su horario si quieres)", "Cálculo I · lun mie 9:00-10:30 A-204\nÉtica · mar jue 12:00-13:30", true]] as [keyof typeof a, string, string, boolean][]) : []),
    ["routines", "Rutinas que quieres cuidar (una por línea)", isSchool && !isWork ? "Estudiar 18:00\nDormir 23:00" : "Revisar correo 9:00\nCierre del día 18:30", true],
  ];

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
      <StepTitle title="Conóceme" text={`Con esto escribo tu perfil en 90-Lumi/perfil.md${isWork ? ", creo las notas de tus clientes y proyectos" : ""}${isSchool ? ", tus materias con su horario" : ""} y tus rutinas. Todo es editable.`} />
      {fields.map(([k, label, ph, multi]) => (
        <div key={k}>
          <label htmlFor={`p-${k}`} className="field-label">
            {label}
          </label>
          {multi ? (
            <textarea id={`p-${k}`} className="textarea" rows={k === "subjects" ? 3 : 2} placeholder={ph} value={a[k]} onChange={set(k)} />
          ) : (
            <input id={`p-${k}`} className="input" placeholder={ph} value={a[k]} onChange={set(k)} autoFocus={k === "name"} />
          )}
        </div>
      ))}
      <Msg m={msg} />
      <div className="row" style={{ gap: 10, marginTop: "auto", paddingTop: 6 }}>
        <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>
          Atrás
        </button>
        <span className="grow" />
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? "Guardando…" : "Siguiente"}
        </button>
      </div>
    </form>
  );
}

function Indexing({ snap }: { snap: AppSnapshot }) {
  const ix = snap.index;
  const pct = ix.indexing ? Math.round(ix.progress * 100) : 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", paddingTop: 10 }}>
      <LumiFace size={96} mood={ix.indexing ? "pensando" : "hablando"} shadow />
      <h1 style={{ margin: 0, fontFamily: "var(--display)", fontSize: 24, fontWeight: 700 }}>{ix.indexing ? "Leyendo tu vault…" : "¡Listo!"}</h1>
      <div style={{ width: "100%", height: 10, borderRadius: 5, background: "var(--line-strong)", overflow: "hidden" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--indigo)", transition: "width 0.3s" }} />
      </div>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.5 }}>
        {ix.notes} notas · {ix.chunks} fragmentos indexados
        {snap.settings.ai.semanticSearch && <><br />Búsqueda por significado: {ix.semantic === "lista" ? `${ix.embedded} de ${ix.chunks}` : ix.semantic === "cargando" ? "descargando el modelo (solo la primera vez)" : ix.semantic === "error" ? "no disponible; uso búsqueda por texto" : "en espera"}</>}
      </p>
      <div style={{ padding: 14, borderRadius: 16, background: "var(--lavender)", textAlign: "left", fontSize: 13.5, lineHeight: 1.5 }}>
        Arrástrame a donde no estorbe. Haz clic en mí para anotar algo o preguntarme. Te aviso de pendientes y reuniones con una burbuja.
      </div>
    </div>
  );
}
