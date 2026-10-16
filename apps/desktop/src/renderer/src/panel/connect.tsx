/** Bloques de conexión reutilizados en el onboarding y en Ajustes. */
import { useState } from "react";
import type { AppSnapshot, ProviderId } from "@lumi/shared";
import { DEFAULT_MODELS } from "@lumi/shared";
import { IconTrash } from "../components/Icons";
import { lumi } from "../lib/api";
import { SwitchRow } from "./ui";

export function StatusDot({ ok, pending }: { ok: boolean; pending?: boolean }) {
  return <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, flex: "none", background: pending ? "var(--sun)" : ok ? "var(--ok)" : "#B9B6CF" }} />;
}

export function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <span className="hint" role="status" style={{ color: m.ok ? "var(--ok)" : "var(--danger)", overflowWrap: "anywhere" }}>
      {m.text}
    </span>
  );
}

/* --------------------------------- IA --------------------------------- */

const KEY_URL: Record<ProviderId, string> = {
  claude: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
};

export function AIForm({ snap, compact }: { snap: AppSnapshot; compact?: boolean }) {
  const ai = snap.settings.ai;
  const [provider, setProvider] = useState<ProviderId>(ai.provider);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const hasKey = provider === "claude" ? snap.keys.claude : snap.keys.gemini;
  const models = ai.models[provider];

  async function choose(p: ProviderId) {
    setProvider(p);
    setMsg(null);
    await lumi.updateSettings({ ai: { provider: p } });
  }

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    const r = await lumi.setApiKey(provider, key);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude guardar la clave" });
    setKey("");
    await test();
  }

  async function test() {
    setTesting(true);
    setMsg(null);
    const r = await lumi.testAI(provider);
    setTesting(false);
    setMsg(r.ok ? { ok: true, text: `Funciona. Dice: «${r.value}»` } : { ok: false, text: r.error ?? "No funcionó" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div role="radiogroup" aria-label="Proveedor de IA" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(["claude", "gemini"] as ProviderId[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={provider === p}
            onClick={() => choose(p)}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 14,
              border: provider === p ? "2px solid var(--indigo)" : "1px solid var(--line-strong)",
              background: provider === p ? "var(--lavender)" : "#fff",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 15 }}>{p === "claude" ? "Claude" : "Gemini"}</span>
            <span className="hint">{p === "claude" ? "Anthropic · recomendado para tu cerebro personal" : "Google · tiene nivel gratis"}</span>
            <span className="row" style={{ gap: 6, fontSize: 12, marginTop: 2 }}>
              <StatusDot ok={p === "claude" ? snap.keys.claude : snap.keys.gemini} />
              {(p === "claude" ? snap.keys.claude : snap.keys.gemini) ? "Clave guardada" : "Sin clave"}
            </span>
          </button>
        ))}
      </div>

      {provider === "gemini" && (
        <div style={{ padding: 12, borderRadius: 12, background: "var(--sun-soft)", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--sun-ink)" }}>
            <b>Aviso de privacidad:</b> en el plan gratuito de la API de Gemini, Google puede usar lo que envías y recibes para mejorar sus modelos, y personas pueden revisarlo. Para tu cerebro personal te recomendamos un plan de pago o Claude.
          </span>
          <label className="row" style={{ gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={ai.geminiPrivacyAccepted} onChange={(e) => lumi.updateSettings({ ai: { geminiPrivacyAccepted: e.target.checked } })} />
            Entiendo el aviso y quiero usar Gemini
          </label>
        </div>
      )}

      <form onSubmit={saveKey} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="apikey" className="field-label" style={{ marginBottom: 0 }}>
          {hasKey ? "Cambiar clave de API" : "Clave de API"} de {provider === "claude" ? "Claude" : "Gemini"}
        </label>
        <div className="row" style={{ gap: 6 }}>
          <input id="apikey" type="password" className="input" placeholder={provider === "claude" ? "sk-ant-…" : "AIza…"} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn btn-primary" disabled={!key.trim()}>
            Guardar
          </button>
        </div>
        <span className="hint">
          Créala en{" "}
          <a href="#" onClick={(e) => (e.preventDefault(), lumi.openExternal(KEY_URL[provider]))}>
            {provider === "claude" ? "console.anthropic.com" : "aistudio.google.com"}
          </a>
          . Se guarda cifrada con el llavero de tu sistema, nunca en el vault.
        </span>
      </form>
      {hasKey && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-soft" onClick={test} disabled={testing || (provider === "gemini" && !ai.geminiPrivacyAccepted)}>
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={async () => {
            await lumi.setApiKey(provider, null);
            setMsg(null);
          }}>
            Quitar clave
          </button>
        </div>
      )}
      <Msg m={msg} />

      {!compact && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--muted-strong)" }}>Modelos ({provider === "claude" ? "Claude" : "Gemini"})</summary>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            {(["rapido", "inteligente"] as const).map((p) => (
              <div key={p}>
                <label htmlFor={`m-${p}`} className="field-label">
                  {p === "rapido" ? "Rápido (notas, extracción)" : "Inteligente (chat, resúmenes)"}
                </label>
                <input
                  id={`m-${p}`}
                  className="input"
                  defaultValue={models[p]}
                  key={`${provider}-${p}-${models[p]}`}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== models[p] && lumi.updateSettings({ ai: { models: { [provider]: { ...models, [p]: e.target.value.trim() } } } })}
                />
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" style={{ paddingLeft: 0 }} onClick={() => lumi.updateSettings({ ai: { models: { [provider]: { ...DEFAULT_MODELS[provider] } } } })}>
            Restablecer modelos recomendados
          </button>
        </details>
      )}
    </div>
  );
}

/* ------------------------------ Calendario ------------------------------ */

export function CalendarForm({ snap, compact }: { snap: AppSnapshot; compact?: boolean }) {
  const c = snap.settings.calendars;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [icsUrl, setIcsUrl] = useState("");
  const [icsName, setIcsName] = useState("");
  const [showIcs, setShowIcs] = useState(false);

  async function connect(p: "google" | "microsoft") {
    setBusy(p);
    setMsg({ ok: true, text: "Se abrió tu navegador: autoriza a Lumi y vuelve aquí." });
    const r = await lumi.connectCalendar(p);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: `Conectado: ${r.value}` } : { ok: false, text: r.error ?? "No se pudo conectar" });
  }

  async function addIcs(e: React.FormEvent) {
    e.preventDefault();
    setBusy("ics");
    const r = await lumi.addIcs(icsName, icsUrl);
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude leer ese enlace" });
    setIcsUrl("");
    setIcsName("");
    setShowIcs(false);
    setMsg({ ok: true, text: "Calendario agregado." });
  }

  const row = (p: "google" | "microsoft") => {
    const conn = c[p].connected;
    const st = snap.calendars[p];
    const configured = snap.oauthConfigured[p];
    return (
      <div key={p} className="row" style={{ gap: 10, padding: "10px 10px 10px 12px", borderRadius: 14, border: "1px solid var(--line)" }}>
        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--surface)", display: "grid", placeItems: "center", fontWeight: 700 }}>
          {p === "google" ? "G" : "O"}
        </span>
        <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{p === "google" ? "Google Calendar" : "Outlook / Microsoft 365"}</span>
          <span className="row" style={{ gap: 6, fontSize: 12.5, color: "var(--muted-strong)" }}>
            <StatusDot ok={conn && st.ok} pending={conn && !st.ok} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conn ? (st.ok ? `${st.label} · ${st.detail ?? ""}` : st.detail ?? "Conectando…") : configured ? "Sin conectar" : "Requiere configurar OAuth"}</span>
          </span>
        </span>
        {conn ? (
          <button className="btn btn-ghost" onClick={() => lumi.disconnectCalendar(p)}>
            Desconectar
          </button>
        ) : (
          <button className="btn btn-primary" disabled={!configured || !!busy} onClick={() => connect(p)}>
            {busy === p ? "Esperando…" : "Conectar"}
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {row("google")}
      {row("microsoft")}
      {c.ics.map((s) => {
        const st = snap.calendars.ics.find((x) => x.id === s.id);
        return (
          <div key={s.id} className="row" style={{ gap: 10, padding: "10px 8px 10px 12px", borderRadius: 14, border: "1px solid var(--line)" }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--surface)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>
              iCal
            </span>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{s.name}</span>
              <span className="row" style={{ gap: 6, fontSize: 12.5, color: "var(--muted-strong)" }}>
                <StatusDot ok={!!st?.ok} pending={!st} />
                {st ? st.detail : "Leyendo…"}
              </span>
            </span>
            <button className="icon-btn plain" aria-label={`Quitar ${s.name}`} onClick={() => lumi.removeIcs(s.id)}>
              <IconTrash size={16} />
            </button>
          </div>
        );
      })}

      {(!snap.oauthConfigured.google || !snap.oauthConfigured.microsoft) && (
        <span className="hint">
          Para conectar con un clic, Lumi necesita un ID de cliente de Google o de Microsoft (ver README). Mientras tanto, puedes usar el enlace iCal privado de tu calendario.
        </span>
      )}

      {showIcs || (!snap.oauthConfigured.google && !snap.oauthConfigured.microsoft && compact) ? (
        <form onSubmit={addIcs} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "var(--surface)" }}>
          <span className="hint">
            <b>Google:</b> Configuración → tu calendario → «Dirección secreta en formato iCal». <b>Outlook:</b> Configuración → Calendario → Calendarios compartidos → Publicar → enlace ICS.
          </span>
          <label htmlFor="ics-url" className="sr-only">
            Enlace iCal
          </label>
          <input id="ics-url" className="input" style={{ background: "#fff" }} placeholder="https://…/basic.ics" value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} />
          <label htmlFor="ics-name" className="sr-only">
            Nombre
          </label>
          <input id="ics-name" className="input" style={{ background: "#fff" }} placeholder="Nombre (Trabajo, Personal…)" value={icsName} onChange={(e) => setIcsName(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={!icsUrl.trim() || busy === "ics"}>
              {busy === "ics" ? "Leyendo…" : "Agregar"}
            </button>
            {!compact && (
              <button type="button" className="btn btn-ghost" onClick={() => setShowIcs(false)}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-soft" onClick={() => setShowIcs(true)}>
            + Enlace iCal
          </button>
          {!compact && (
            <button type="button" className="btn btn-ghost" onClick={() => lumi.refreshCalendars()}>
              Actualizar ahora
            </button>
          )}
        </div>
      )}

      {!compact && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--muted-strong)" }}>Credenciales OAuth propias (avanzado)</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {(
              [
                ["googleClientId", "ID de cliente de Google (app de escritorio)"],
                ["googleClientSecret", "Secreto de cliente de Google"],
                ["microsoftClientId", "ID de aplicación de Microsoft (cliente público)"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label htmlFor={k} className="field-label">
                  {label}
                </label>
                <input id={k} className="input" type={k === "googleClientSecret" ? "password" : "text"} defaultValue={c[k]} onBlur={(e) => e.target.value.trim() !== c[k] && lumi.updateSettings({ calendars: { [k]: e.target.value.trim() } })} />
              </div>
            ))}
          </div>
        </details>
      )}
      <Msg m={msg} />
    </div>
  );
}

/* -------------------------------- Granola ------------------------------- */

export function GranolaForm({ snap, compact }: { snap: AppSnapshot; compact?: boolean }) {
  const g = snap.settings.granola;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const run = async (label: string, fn: () => Promise<{ ok: boolean; error?: string; value?: unknown }>, okText?: (v: unknown) => string) => {
    setBusy(label);
    setMsg(null);
    const r = await fn();
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: okText ? okText(r.value) : String(r.value ?? "Listo") } : { ok: false, text: r.error ?? "No funcionó" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label className="row" style={{ gap: 8, fontSize: 13, lineHeight: 1.4, alignItems: "flex-start" }}>
        <input type="checkbox" style={{ marginTop: 3 }} checked={g.consentAccepted} onChange={(e) => lumi.updateSettings({ granola: { consentAccepted: e.target.checked } })} />
        <span>Entiendo que soy responsable de avisar a las personas cuando grabe una reunión y de tener su consentimiento.</span>
      </label>

      <div className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: 14, border: "1px solid var(--line)" }}>
        <StatusDot ok={g.mode !== "none" && snap.granola.ok} pending={g.mode !== "none" && !snap.granola.ok} />
        <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{g.mode === "none" ? "Granola sin conectar" : snap.granola.label}</span>
          <span className="hint">
            {g.mode === "none"
              ? "Lumi guardará cada reunión grabada en 02-Reuniones de tu vault."
              : `${snap.granola.detail ?? ""}${g.lastSync ? ` · última vez ${new Date(g.lastSync).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}` : ""}`}
          </span>
        </span>
      </div>

      {g.mode === "none" ? (
        <>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={!g.consentAccepted || !!busy} onClick={() => run("mcp", () => lumi.granolaConnect())}>
              {busy === "mcp" ? "Esperando al navegador…" : "Conectar con Granola"}
            </button>
            <button className="btn btn-soft" onClick={() => setShowKey(!showKey)} disabled={!g.consentAccepted}>
              Tengo plan Business (API key)
            </button>
            <button className="btn btn-ghost" onClick={() => lumi.openExternal("https://www.granola.ai/download")}>
              Descargar Granola
            </button>
          </div>
          {showKey && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run("api", () => lumi.granolaUseApiKey(key));
              }}
              className="row"
              style={{ gap: 6 }}
            >
              <label htmlFor="grn" className="sr-only">
                API key de Granola
              </label>
              <input id="grn" type="password" className="input" placeholder="grn_…" value={key} onChange={(e) => setKey(e.target.value)} />
              <button type="submit" className="btn btn-primary" disabled={!key.trim() || !!busy}>
                {busy === "api" ? "Probando…" : "Usar clave"}
              </button>
            </form>
          )}
          <span className="hint">«Conectar» abre tu navegador para autorizar a Lumi (funciona también con el plan gratis, que solo guarda ~30 días: por eso Lumi copia todo a tu vault).</span>
        </>
      ) : (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-primary" disabled={!!busy} onClick={() => run("sync", () => lumi.granolaSync(), (v) => (v ? `${v} reuniones nuevas en tu vault.` : "Todo al día."))}>
            {busy === "sync" ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
          {!compact && (
            <>
              <button className="btn btn-soft" disabled={!!busy} onClick={() => run("diag", () => lumi.granolaDiagnostics())}>
                Probar conexión
              </button>
              <button className="btn btn-ghost" onClick={() => lumi.granolaDisconnect()}>
                Desconectar
              </button>
            </>
          )}
        </div>
      )}
      <Msg m={msg} />
      {!compact && (
        <>
          <SwitchRow label="Procesar reuniones con IA" hint="Extrae pendientes, decisiones, personas y cliente/proyecto" checked={snap.settings.postProcessMeetings} onChange={(v) => lumi.updateSettings({ postProcessMeetings: v })} />
          <SwitchRow label="Preguntar si abro Granola antes de cada reunión" checked={snap.settings.askGranolaBeforeMeeting} onChange={(v) => lumi.updateSettings({ askGranolaBeforeMeeting: v })} />
        </>
      )}
    </div>
  );
}
