import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { IconRefresh, IconTrash } from "../components/Icons";
import { LumiFace } from "../components/LumiFace";
import { describeAvatar } from "../lib/avatar";
import { askClaude } from "../lib/claude";
import { CALENDAR_HELP } from "../lib/calendar";
import { loadData, uid, updateData } from "../lib/store";
import { relative } from "../lib/time";
import { MODELS, type CalendarProvider, type LumiData, type MeetingsCache } from "../lib/types";
import { SwitchRow, ViewHeader } from "./ui";
import type { View } from "./main";

const PROVIDER_LABEL: Record<CalendarProvider, string> = { google: "Google", outlook: "Outlook", otro: "Otro" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 className="section-title" style={{ marginTop: 10 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const set = (fn: (d: LumiData) => void) => updateData(fn);

export function Settings({ data, cache, go }: { data: LumiData; cache: MeetingsCache; go: (v: View) => void }) {
  const s = data.settings;
  const [name, setName] = useState(s.userName);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [folder, setFolder] = useState("");
  const [calOpen, setCalOpen] = useState(s.calendars.length === 0);
  const [provider, setProvider] = useState<CalendarProvider>("google");
  const [calName, setCalName] = useState("");
  const [calUrl, setCalUrl] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  useEffect(() => {
    invoke<boolean>("has_api_key").then(setHasKey).catch(() => setHasKey(false));
    autostartEnabled().then(setAutostart).catch(() => setAutostart(null));
    invoke<string>("data_folder").then(setFolder).catch(() => {});
  }, []);
  useEffect(() => setSyncing(false), [cache.updatedAt]);

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    try {
      await invoke("set_api_key", { key });
      setKey("");
      setHasKey(true);
      setKeyMsg({ ok: true, text: "Clave guardada en el llavero de tu sistema." });
    } catch (err) {
      setKeyMsg({ ok: false, text: String(err) });
    }
  }

  async function removeKey() {
    await invoke("delete_api_key");
    setHasKey(false);
    setKeyMsg(null);
  }

  async function test() {
    setTesting(true);
    setKeyMsg(null);
    try {
      const { data: fresh } = await loadData();
      const r = await askClaude(fresh, "Responde en una frase corta y amable, en español.", [{ role: "user", content: "Saluda a tu nuevo usuario." }], 60);
      setKeyMsg({ ok: true, text: `Funciona. Claude dice: «${r.trim()}»` });
    } catch (err) {
      setKeyMsg({ ok: false, text: String(err) });
    } finally {
      setTesting(false);
    }
  }

  async function addCalendar(e: React.FormEvent) {
    e.preventDefault();
    if (!calUrl.trim()) return;
    await set((d) => {
      d.settings.calendars.push({
        id: uid(),
        name: calName.trim() || `Calendario de ${PROVIDER_LABEL[provider]}`,
        url: calUrl.trim(),
        provider,
        enabled: true,
      });
    });
    setCalName("");
    setCalUrl("");
    setCalOpen(false);
    setSyncing(true);
  }

  function sync() {
    setSyncing(true);
    emit("lumi://refresh-calendars");
  }

  return (
    <>
      <ViewHeader title="Ajustes" onBack={() => go({ name: "home" })} />
      <div className="scroll" style={{ flex: 1, padding: "8px 18px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
        <Section title="Tú">
          <label htmlFor="nombre" className="field-label" style={{ marginBottom: 0 }}>
            ¿Cómo te llamo?
          </label>
          <input
            id="nombre"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== s.userName && set((d) => (d.settings.userName = name.trim()))}
          />
        </Section>

        <Section title="Apariencia">
          <button
            type="button"
            className="row"
            onClick={() => go({ name: "appearance" })}
            style={{ gap: 12, padding: "10px 14px 10px 10px", borderRadius: 14, border: "1px solid var(--line)", background: "#fff", textAlign: "left" }}
          >
            <span style={{ flex: "none", width: 52, height: 52, borderRadius: 14, background: "var(--lavender)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <LumiFace size={46} />
            </span>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>Personalizar a Lumi</span>
              <span className="hint">{describeAvatar(data.avatar)}</span>
            </span>
          </button>
        </Section>

        <Section title="Correo y calendario">
          {s.calendars.map((c) => {
            const st = cache.status.find((x) => x.id === c.id);
            return (
              <div key={c.id} className="row" style={{ gap: 10, padding: "10px 10px 10px 12px", borderRadius: 14, border: "1px solid var(--line)" }}>
                <span
                  aria-hidden="true"
                  style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flex: "none" }}
                >
                  {PROVIDER_LABEL[c.provider][0]}
                </span>
                <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{c.name}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: !c.enabled ? "var(--muted)" : st?.ok ? "var(--ok)" : st ? "var(--danger)" : "var(--muted)" }}>
                    {!c.enabled ? "Pausado" : st ? (st.ok ? `Conectado · ${st.count} eventos esta semana` : st.error) : "Conectando…"}
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="switch"
                  aria-label={`Usar ${c.name}`}
                  checked={c.enabled}
                  onChange={(e) =>
                    set((d) => {
                      const x = d.settings.calendars.find((y) => y.id === c.id);
                      if (x) x.enabled = e.target.checked;
                    })
                  }
                />
                <button
                  type="button"
                  className="icon-btn plain"
                  aria-label={`Quitar ${c.name}`}
                  onClick={() =>
                    set((d) => {
                      d.settings.calendars = d.settings.calendars.filter((y) => y.id !== c.id);
                    })
                  }
                >
                  <IconTrash size={16} />
                </button>
              </div>
            );
          })}

          {calOpen ? (
            <form onSubmit={addCalendar} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 16, background: "var(--surface)" }}>
              <div className="row" role="radiogroup" aria-label="Proveedor" style={{ gap: 6 }}>
                {(["google", "outlook", "otro"] as CalendarProvider[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={provider === p}
                    className={`btn ${provider === p ? "btn-primary" : "btn-outline"}`}
                    style={{ minHeight: 34 }}
                    onClick={() => setProvider(p)}
                  >
                    {PROVIDER_LABEL[p]}
                  </button>
                ))}
              </div>
              <span className="hint">{CALENDAR_HELP[provider]}</span>
              <div>
                <label htmlFor="cal-url" className="field-label">
                  Enlace iCal (.ics)
                </label>
                <input id="cal-url" className="input" style={{ background: "#fff" }} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={calUrl} onChange={(e) => setCalUrl(e.target.value)} />
              </div>
              <div>
                <label htmlFor="cal-name" className="field-label">
                  Nombre (opcional)
                </label>
                <input id="cal-name" className="input" style={{ background: "#fff" }} placeholder="Trabajo" value={calName} onChange={(e) => setCalName(e.target.value)} />
              </div>
              <span className="hint">El enlace es privado: trátalo como una contraseña. Lumi lo guarda solo en tu computadora.</span>
              <div className="row" style={{ gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={!calUrl.trim()}>
                  Conectar
                </button>
                {s.calendars.length > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setCalOpen(false)}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-soft" onClick={() => setCalOpen(true)}>
                + Agregar calendario
              </button>
              {s.calendars.length > 0 && (
                <button type="button" className="btn btn-ghost" onClick={sync} disabled={syncing}>
                  <IconRefresh size={15} /> {syncing ? "Actualizando…" : cache.updatedAt ? `Actualizado ${relative(new Date(cache.updatedAt))}` : "Actualizar"}
                </button>
              )}
            </div>
          )}
        </Section>

        <Section title="Avisos">
          <label className="row" style={{ gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
            <span className="grow" style={{ fontSize: 14.5, fontWeight: 600 }}>
              Avisar antes de reuniones
            </span>
            <select
              className="select"
              style={{ width: 100, height: 36, background: "#fff" }}
              value={s.meetingLeadMin}
              onChange={(e) => set((d) => (d.settings.meetingLeadMin = parseInt(e.target.value, 10)))}
            >
              {[2, 5, 10, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} min
                </option>
              ))}
            </select>
          </label>
          <SwitchRow
            label="Notificaciones del sistema"
            hint="Además de la burbuja, por si no estás viendo la pantalla"
            checked={s.systemNotifications}
            onChange={(v) => set((d) => (d.settings.systemNotifications = v))}
          />
        </Section>

        <Section title="Inteligencia (Claude)">
          <SwitchRow
            label="Usar Claude"
            hint="Entiende tus notas, responde preguntas y aprende de ti"
            checked={s.useAI}
            onChange={(v) => set((d) => (d.settings.useAI = v))}
          />
          <div style={{ padding: 14, borderRadius: 14, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
            {hasKey ? (
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Clave de API guardada</span>
                <span className="tag" style={{ background: "#DCF2E3", color: "#14532D" }}>
                  Activa
                </span>
              </div>
            ) : (
              <form onSubmit={saveKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label htmlFor="apikey" className="field-label" style={{ marginBottom: 0 }}>
                  Clave de API de Claude
                </label>
                <input id="apikey" type="password" className="input" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
                <span className="hint">Créala en console.anthropic.com → API Keys. Se guarda cifrada en el llavero de tu sistema, nunca en archivos.</span>
                <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={!key.trim()}>
                  Guardar clave
                </button>
              </form>
            )}
            <div>
              <label htmlFor="modelo" className="field-label">
                Modelo
              </label>
              <select id="modelo" className="select" value={s.model} onChange={(e) => set((d) => (d.settings.model = e.target.value))}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {!MODELS.some((m) => m.id === s.model) && <option value={s.model}>{s.model}</option>}
              </select>
            </div>
            {hasKey && (
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-soft" onClick={test} disabled={testing}>
                  {testing ? "Probando…" : "Probar conexión"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={removeKey}>
                  Quitar clave
                </button>
              </div>
            )}
            {keyMsg && (
              <span className="hint" style={{ color: keyMsg.ok ? "var(--ok)" : "var(--danger)" }}>
                {keyMsg.text}
              </span>
            )}
          </div>
        </Section>

        <Section title="Memoria">
          <SwitchRow
            label="Aprender de mí"
            hint="Lumi te propone guardar datos de tus clientes, proyectos y hábitos"
            checked={s.learn}
            onChange={(v) => set((d) => (d.settings.learn = v))}
          />
          <button type="button" className="btn btn-soft" style={{ alignSelf: "flex-start" }} onClick={() => go({ name: "memory" })}>
            Ver lo que sabe Lumi ({data.memories.length})
          </button>
        </Section>

        <Section title="Comportamiento">
          {autostart !== null && (
            <SwitchRow
              label="Abrir Lumi al iniciar sesión"
              checked={autostart}
              onChange={async (v) => {
                try {
                  if (v) await enableAutostart();
                  else await disableAutostart();
                  setAutostart(v);
                } catch (e) {
                  console.error(e);
                }
              }}
            />
          )}
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn btn-soft" onClick={() => invoke("set_avatar_visible", { visible: false })}>
              Esconder a Lumi
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (confirmQuit) invoke("quit_app");
                else {
                  setConfirmQuit(true);
                  setTimeout(() => setConfirmQuit(false), 3000);
                }
              }}
            >
              {confirmQuit ? "¿Salir? Clic otra vez" : "Salir de Lumi"}
            </button>
          </div>
          <span className="hint">
            Si escondes a Lumi, vuelve a mostrarlo desde su ícono en la barra de menú (Mac) o en la bandeja junto al reloj (Windows).
          </span>
          {folder && (
            <span className="hint" style={{ overflowWrap: "anywhere" }}>
              Tus datos se guardan en: {folder}
            </span>
          )}
        </Section>
      </div>
    </>
  );
}
