import { useState } from "react";
import { describeAvatar, enabledModes, type AppSnapshot } from "@lumi/shared";
import { IconFolder } from "../components/Icons";
import { LumiFace } from "../components/LumiFace";
import { lumi } from "../lib/api";
import { SwitchRow, ViewHeader } from "./ui";
import { AIForm, CalendarForm, GranolaForm, Msg, StatusDot } from "./connect";
import type { View } from "./main";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 className="section-title" style={{ marginTop: 12 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Settings({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const s = snap.settings;
  const [name, setName] = useState(s.userName);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const ix = snap.index;

  async function changeVault() {
    const p = await lumi.chooseFolder("Elige la carpeta de tu vault de Obsidian");
    if (!p) return;
    const r = await lumi.setupVault(p, "existente");
    setMsg(r.ok ? { ok: true, text: `Ahora uso el vault «${r.value}».` } : { ok: false, text: r.error ?? "No pude abrirlo" });
  }

  return (
    <>
      <ViewHeader title="Ajustes" onBack={() => go({ name: "home" })} />
      <div className="scroll" style={{ flex: 1, padding: "4px 18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
        <Section title="Tú">
          <label htmlFor="nombre" className="field-label" style={{ marginBottom: 0 }}>
            ¿Cómo te llamo?
          </label>
          <input id="nombre" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== s.userName && lumi.updateSettings({ userName: name.trim() })} />
        </Section>

        <Section title="Modos">
          <button
            type="button"
            className="row"
            onClick={() => go({ name: "modes" })}
            style={{ gap: 12, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)", background: "#fff", textAlign: "left" }}
          >
            <span aria-hidden="true" style={{ fontSize: 22 }}>
              {enabledModes(s.modes)
                .map((m) => m.icono)
                .join("")}
            </span>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>Trabajo, Escuela, Personal…</span>
              <span className="hint">{enabledModes(s.modes).length > 1 ? `Ahora: ${snap.mode.text}` : "Activa más modos, tu horario y tus calendarios"}</span>
            </span>
          </button>
          {s.ageGroup === "menor" && <span className="hint">Lumi sin IA (menos de 18 años). Puedes cambiarlo en Modos → Tu edad.</span>}
        </Section>

        <Section title="Clientes y proyectos">
          <button
            type="button"
            className="row"
            onClick={() => go({ name: "clients" })}
            style={{ gap: 12, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)", background: "#fff", textAlign: "left" }}
          >
            <IconFolder size={22} />
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>
                {snap.catalog.clients} clientes · {snap.catalog.projects} proyectos
              </span>
              <span className="hint">
                {snap.catalog.unassigned
                  ? `${snap.catalog.unassigned} ${snap.catalog.unassigned === 1 ? "proyecto necesita" : "proyectos necesitan"} su cliente`
                  : snap.catalog.clientsDir
                    ? `Los aprendo de «${snap.catalog.clientsDir}»`
                    : "Dime en qué carpeta tienes a tus clientes"}
              </span>
            </span>
          </button>
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
              <span className="hint">{describeAvatar(s.avatar)}</span>
            </span>
          </button>
        </Section>

        <Section title="Tu cerebro (vault de Obsidian)">
          <div className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: 14, border: "1px solid var(--line)" }}>
            <IconFolder size={20} />
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{snap.vaultName ?? "Sin vault"}</span>
              <span className="hint" style={{ overflowWrap: "anywhere" }}>{s.vaultPath ?? "Elige o crea uno"}</span>
            </span>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-soft" onClick={() => lumi.revealVault()} disabled={!s.vaultPath}>
              Abrir carpeta
            </button>
            <button className="btn btn-soft" onClick={changeVault}>
              Cambiar de vault
            </button>
            <button className="btn btn-ghost" onClick={() => lumi.openExternal("https://obsidian.md/download")}>
              Descargar Obsidian
            </button>
          </div>
          <div style={{ padding: "10px 12px", borderRadius: 14, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <span className="row" style={{ gap: 8 }}>
              <StatusDot ok={!ix.indexing} pending={ix.indexing} />
              {ix.indexing ? `Indexando… ${Math.round(ix.progress * 100)}%` : `${ix.notes} notas · ${ix.chunks} fragmentos`}
            </span>
            <span className="row" style={{ gap: 8 }}>
              <StatusDot ok={ix.semantic === "lista"} pending={ix.semantic === "cargando"} />
              Búsqueda por significado:{" "}
              {ix.semantic === "lista" ? `lista (${ix.embedded}/${ix.chunks})` : ix.semantic === "cargando" ? "descargando modelo…" : ix.semantic === "error" ? "no disponible" : "apagada"}
            </span>
            {ix.semantic === "error" && ix.semanticDetail && <span className="hint">{ix.semanticDetail}</span>}
            <button className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => lumi.reindex()} disabled={ix.indexing}>
              Volver a indexar
            </button>
          </div>
          <SwitchRow label="Búsqueda por significado" hint="Modelo local y gratuito (~120 MB, se descarga una vez)" checked={s.ai.semanticSearch} onChange={(v) => lumi.updateSettings({ ai: { semanticSearch: v } })} />
          <Msg m={msg} />
        </Section>

        <Section title="Inteligencia">
          {s.ageGroup === "menor" ? (
            <span className="hint" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--surface)" }}>
              Lumi sin IA: como tienes menos de 18 años, no uso ningún servicio de IA. Todo lo demás funciona igual.
            </span>
          ) : (
            <>
              <SwitchRow label="Usar IA" hint="Entender notas, chat, reuniones y resúmenes" checked={s.ai.enabled} onChange={(v) => lumi.updateSettings({ ai: { enabled: v } })} />
              <AIForm snap={snap} />
            </>
          )}
        </Section>

        <Section title="Calendario">
          <CalendarForm snap={snap} />
        </Section>

        {s.ageGroup !== "menor" && (
          <Section title="Granola (reuniones grabadas)">
            <GranolaForm snap={snap} />
          </Section>
        )}

        <Section title="Avisos">
          <label className="row" style={{ gap: 12, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
            <span className="grow" style={{ fontSize: 14.5, fontWeight: 600 }}>
              Avisar antes de reuniones
            </span>
            <select className="select" style={{ width: 100, height: 36, background: "#fff" }} value={s.meetingLeadMin} onChange={(e) => lumi.updateSettings({ meetingLeadMin: parseInt(e.target.value, 10) })}>
              {[2, 5, 10, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} min
                </option>
              ))}
            </select>
          </label>
          <label className="row" style={{ gap: 12, padding: "10px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>Hora de aviso por defecto</span>
              <span className="hint">Para pendientes con fecha pero sin hora</span>
            </span>
            <input type="time" className="input" style={{ width: 110, height: 36 }} defaultValue={s.defaultReminderTime} onBlur={(e) => e.target.value && lumi.updateSettings({ defaultReminderTime: e.target.value })} />
          </label>
          <SwitchRow label="Notificaciones del sistema" hint="Además de la burbuja, por si no estás viendo la pantalla" checked={s.systemNotifications} onChange={(v) => lumi.updateSettings({ systemNotifications: v })} />
        </Section>

        <Section title="Memoria">
          <SwitchRow label="Aprender de mí" hint="Lumi propone datos para recordar; tú confirmas cada uno" checked={s.learn} onChange={(v) => lumi.updateSettings({ learn: v })} />
          <button className="btn btn-soft" style={{ alignSelf: "flex-start" }} onClick={() => go({ name: "memory" })}>
            Ver lo que sabe Lumi
          </button>
        </Section>

        <Section title="Comportamiento">
          <SwitchRow label="Abrir Lumi al iniciar sesión" checked={s.openAtLogin} onChange={(v) => lumi.setOpenAtLogin(v)} />
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-soft" onClick={() => lumi.setAvatarVisible(false)}>
              Esconder a Lumi
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (confirmQuit) void lumi.quit();
                else {
                  setConfirmQuit(true);
                  setTimeout(() => setConfirmQuit(false), 3000);
                }
              }}
            >
              {confirmQuit ? "¿Salir? Clic otra vez" : "Salir de Lumi"}
            </button>
          </div>
          <span className="hint">Si escondes a Lumi, vuelve a mostrarlo desde su ícono en la barra de menú (Mac) o en la bandeja junto al reloj (Windows).</span>
          <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
            <span className="hint">Versión {snap.appVersion}</span>
            {snap.update.downloaded ? (
              <button className="btn btn-primary" onClick={() => lumi.installUpdate()}>
                Reiniciar y actualizar a {snap.update.version}
              </button>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  const r = await lumi.checkForUpdates();
                  setMsg(r.ok ? { ok: true, text: r.value ?? "" } : { ok: false, text: r.error ?? "" });
                }}
              >
                Buscar actualizaciones
              </button>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}
