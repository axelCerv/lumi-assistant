/**
 * Clientes y proyectos: de qué carpetas los aprende Lumi, cuáles conoce y a qué
 * cliente pertenece cada proyecto.
 */
import { useMemo, useState } from "react";
import { slugify, stripAccents, type AppSnapshot, type Entity } from "@lumi/shared";
import { IconFolder, IconRefresh } from "../components/Icons";
import { lumi } from "../lib/api";
import { Card, ViewHeader } from "./ui";
import { Msg } from "./connect";
import type { View } from "./main";

const norm = (s: string) => stripAccents(s).toLowerCase();

function FolderRow({ label, value, kind, suggestions, onMsg }: { label: string; value: string | null; kind: "clientes" | "proyectos"; suggestions: string[]; onMsg: (m: { ok: boolean; text: string }) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (p: Promise<{ ok: boolean; value?: string; error?: string }>) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok && r.value) onMsg({ ok: true, text: r.value });
    else if (!r.ok && r.error) onMsg({ ok: false, text: r.error });
  };
  const other = suggestions.filter((x) => x !== value).slice(0, 3);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="row" style={{ gap: 10, padding: "10px 12px", borderRadius: 14, border: "1px solid var(--line)", background: "#fff" }}>
        <IconFolder size={20} />
        <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
          <span className="hint" style={{ overflowWrap: "anywhere" }}>
            {value ?? "Sin elegir"}
          </span>
        </span>
        <button type="button" className="btn btn-soft" style={{ minHeight: 34 }} disabled={busy} onClick={() => run(lumi.catalogChooseFolder(kind))}>
          {value ? "Cambiar" : "Elegir…"}
        </button>
        {value && (
          <button type="button" className="btn btn-ghost" style={{ minHeight: 34, padding: "0 6px" }} disabled={busy} onClick={() => run(lumi.catalogSetFolder(kind, null))}>
            Quitar
          </button>
        )}
      </div>
      {other.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="hint">Encontré:</span>
          {other.map((s) => (
            <button key={s} type="button" className="tag big neutral" disabled={busy} onClick={() => run(lumi.catalogSetFolder(kind, s))} title={`Usar «${s}» como carpeta de ${kind}`}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Clients({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const c = snap.catalog;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [openClient, setOpenClient] = useState<string | null>(null);
  const [newClient, setNewClient] = useState("");
  const [newProject, setNewProject] = useState("");
  const [busy, setBusy] = useState(false);

  const clients = useMemo(() => snap.entities.filter((e) => e.kind === "cliente").sort((a, b) => a.name.localeCompare(b.name, "es")), [snap.entities]);
  const projects = useMemo(() => snap.entities.filter((e) => e.kind === "proyecto").sort((a, b) => a.name.localeCompare(b.name, "es")), [snap.entities]);
  const projectsOf = (name: string) => projects.filter((p) => p.client && slugify(p.client) === slugify(name));
  const unassigned = projects.filter((p) => !p.client);
  const term = norm(q.trim());
  const shown = term ? clients.filter((x) => norm(x.name).includes(term) || projectsOf(x.name).some((p) => norm(p.name).includes(term))) : clients;

  async function create(kind: "cliente" | "proyecto", name: string, client?: string) {
    setBusy(true);
    const r = await lumi.createEntity(kind, name, client ?? null);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: kind === "cliente" ? `Agregué a ${r.value}.` : `Agregué «${r.value}» a ${client}.` } : { ok: false, text: r.error ?? "No pude crearlo" });
    if (r.ok) {
      if (kind === "cliente") {
        setNewClient("");
        setOpenClient(r.value ?? null);
      } else setNewProject("");
    }
  }

  const assignSelect = (p: Entity, compact = false) => (
    <>
      <label htmlFor={`asignar-${p.slug}`} className="sr-only">
        Cliente de {p.name}
      </label>
      <select
        id={`asignar-${p.slug}`}
        className="select"
        style={{ height: 32, width: compact ? 130 : 150, background: "#fff", fontSize: 13 }}
        value={p.client ?? ""}
        onChange={(e) => void lumi.catalogAssign(p.name, e.target.value || null)}
      >
        <option value="">{compact ? "Mover a…" : "Elegir cliente…"}</option>
        {clients.map((x) => (
          <option key={x.slug} value={x.name}>
            {x.name}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <>
      <ViewHeader title="Clientes y proyectos" onBack={() => go({ name: "settings" })} sub={<span className="hint">{`${c.clients} clientes · ${c.projects} proyectos`}</span>} />
      <div className="scroll" style={{ flex: 1, padding: "12px 18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="section-title">De dónde los aprendo</h2>
          <span className="hint">
            Dime en qué carpetas tienes a tus clientes y proyectos (de tu vault o de cualquier lado). Solo las leo, nunca las cambio. Cada subcarpeta (o nota) es un cliente; dentro, sus
            subcarpetas o su carpeta «Proyectos» son sus proyectos.
          </span>
          <FolderRow label="Carpeta de clientes" value={c.clientsDir} kind="clientes" suggestions={c.suggestions.clients} onMsg={setMsg} />
          <FolderRow label="Carpeta de proyectos (opcional)" value={c.projectsDir} kind="proyectos" suggestions={c.suggestions.projects} onMsg={setMsg} />
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ paddingLeft: 0 }}
              onClick={async () => {
                const r = await lumi.catalogRescan();
                setMsg(r.ok ? { ok: true, text: `Listo: ${r.value}` } : { ok: false, text: r.error ?? "No pude leerlas" });
              }}
            >
              <IconRefresh size={15} /> Volver a leer
            </button>
            {c.lastScan && <span className="hint">Leídas a las {new Date(c.lastScan).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
          {c.error && <Msg m={{ ok: false, text: c.error }} />}
          <Msg m={msg} />
        </section>

        {unassigned.length > 0 && (
          <Card tone="sun">
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--sun-ink)" }}>
              {unassigned.length === 1 ? "1 proyecto no tiene cliente" : `${unassigned.length} proyectos no tienen cliente`}
            </span>
            <span className="hint">Un proyecto siempre va dentro de un cliente. Dime de cuál es cada uno y lo recuerdo.</span>
            {unassigned.slice(0, 30).map((p) => (
              <div key={p.slug} className="row" style={{ gap: 8 }}>
                <span className="grow" style={{ fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>
                  {p.name}
                </span>
                {assignSelect(p)}
              </div>
            ))}
          </Card>
        )}

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="section-title">Los que conozco</h2>
          {clients.length > 6 && (
            <>
              <label htmlFor="buscar-clientes" className="sr-only">
                Buscar cliente o proyecto
              </label>
              <input id="buscar-clientes" className="input" placeholder="Buscar cliente o proyecto…" value={q} onChange={(e) => setQ(e.target.value)} />
            </>
          )}
          {shown.length === 0 && <span className="hint">{clients.length ? "Nada coincide." : "Aún no conozco clientes. Elige tu carpeta arriba o agrega uno aquí."}</span>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shown.map((cl) => {
              const ps = projectsOf(cl.name);
              const isOpen = openClient === cl.name || (!!term && ps.some((p) => norm(p.name).includes(term)));
              return (
                <div key={cl.slug} style={{ borderRadius: 14, border: "1px solid var(--line)", background: "#fff", overflow: "hidden" }}>
                  <button
                    type="button"
                    className="row"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setOpenClient(isOpen ? null : cl.name);
                      setNewProject("");
                    }}
                    style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}
                  >
                    <span className="cp-dot cliente" aria-hidden="true" />
                    <span className="grow" style={{ fontSize: 14.5, fontWeight: 600 }}>
                      {cl.name}
                    </span>
                    <span className="hint">
                      {ps.length ? `${ps.length} ${ps.length === 1 ? "proyecto" : "proyectos"}` : "sin proyectos"}
                      {cl.origin === "carpeta" ? " · carpeta" : ""}
                    </span>
                    <span aria-hidden="true" style={{ color: "var(--muted)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                      ›
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "0 12px 12px 31px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {ps.map((p) => (
                        <div key={p.slug} className="row" style={{ gap: 8, minHeight: 32 }}>
                          <span className="cp-dot proyecto" aria-hidden="true" />
                          <span className="grow" style={{ fontSize: 14, overflowWrap: "anywhere" }}>
                            {p.name}
                          </span>
                          {assignSelect(p, true)}
                        </div>
                      ))}
                      <form
                        className="row"
                        style={{ gap: 6, marginTop: 2 }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (newProject.trim()) void create("proyecto", newProject, cl.name);
                        }}
                      >
                        <label htmlFor={`nuevo-proyecto-${cl.slug}`} className="sr-only">
                          Nuevo proyecto de {cl.name}
                        </label>
                        <input id={`nuevo-proyecto-${cl.slug}`} className="input" style={{ height: 34 }} placeholder={`Nuevo proyecto de ${cl.name}`} value={newProject} onChange={(e) => setNewProject(e.target.value)} />
                        <button type="submit" className="btn btn-soft" style={{ minHeight: 34 }} disabled={!newProject.trim() || busy}>
                          Añadir
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <form
            className="row"
            style={{ gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (newClient.trim()) void create("cliente", newClient);
            }}
          >
            <label htmlFor="nuevo-cliente" className="sr-only">
              Nuevo cliente
            </label>
            <input id="nuevo-cliente" className="input" placeholder="Nuevo cliente" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
            <button type="submit" className="btn btn-soft" disabled={!newClient.trim() || busy}>
              Añadir
            </button>
          </form>
          <span className="hint">Los clientes y proyectos nuevos se guardan como notas en 05-Clientes y 04-Proyectos de tu vault.</span>
        </section>
      </div>
    </>
  );
}
