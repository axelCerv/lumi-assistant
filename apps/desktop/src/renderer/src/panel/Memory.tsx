import { useEffect, useState } from "react";
import type { AppSnapshot, MemoryFact, SearchHit, SummaryInfo } from "@lumi/shared";
import { IconOpen, IconSearch, IconTrash } from "../components/Icons";
import { lumi } from "../lib/api";
import { Card, Dots, ViewHeader } from "./ui";
import type { View } from "./main";

type Tab = "memoria" | "buscar" | "resumenes";

export function Memory({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const [tab, setTab] = useState<Tab>("memoria");
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [summaries, setSummaries] = useState<SummaryInfo[]>([]);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("General");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = () => {
    void lumi.listFacts().then(setFacts);
    void lumi.listSummaries().then(setSummaries);
  };
  useEffect(reload, [snap.index.notes, snap.proposals.length]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const r = await lumi.addFact(text.trim(), topic.trim() || "General");
    setMsg(r.ok ? "Guardado." : r.error ?? null);
    if (r.ok) setText("");
    reload();
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setHits(await lumi.search(query.trim()));
    setSearching(false);
  }

  async function generate(kind: "semanal" | "mensual") {
    setGenerating(kind);
    setMsg(null);
    const r = await lumi.generateSummary(kind);
    setGenerating(null);
    if (r.ok && r.value) void lumi.openInObsidian(r.value);
    else setMsg(r.error ?? "No pude generar el resumen");
    reload();
  }

  const topics = [...new Set(facts.map((f) => f.topic))];
  const semantic = snap.index.semantic;

  return (
    <>
      <ViewHeader title="Memoria de Lumi" onBack={() => go({ name: "home" })} sub={<span className="hint">{snap.index.notes} notas · {snap.index.chunks} fragmentos indexados</span>} />
      <div role="tablist" style={{ margin: "12px 18px 0", padding: 4, borderRadius: 14, background: "var(--surface)", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
        {(
          [
            ["memoria", "Lo que sé"],
            ["buscar", "Buscar"],
            ["resumenes", "Resúmenes"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} style={{ height: 34, border: 0, borderRadius: 10, fontWeight: 600, fontSize: 13, background: tab === id ? "#fff" : "transparent", color: tab === id ? "var(--ink)" : "var(--muted)", boxShadow: tab === id ? "0 1px 3px rgba(30,32,51,0.12)" : "none" }}>
            {label}
          </button>
        ))}
      </div>

      <div className="scroll" style={{ flex: 1, padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "memoria" && (
          <>
            {snap.proposals.length > 0 && (
              <>
                <p className="section-title">Por confirmar</p>
                {snap.proposals.map((p) => (
                  <Card key={p.id} tone="lavender">
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--indigo-deep)" }}>
                      {p.topic}
                      {p.origin ? ` · de ${p.origin.replace(/\[\[|\]\]/g, "")}` : ""}
                    </span>
                    <span style={{ fontSize: 14.5, lineHeight: 1.4 }}>«{p.text}»</span>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn btn-primary" onClick={() => lumi.confirmFact(p.id, true)}>
                        Guardar
                      </button>
                      <button className="btn btn-soft" style={{ background: "#fff" }} onClick={() => lumi.confirmFact(p.id, false)}>
                        Descartar
                      </button>
                    </div>
                  </Card>
                ))}
              </>
            )}

            <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="nuevo-recuerdo" className="field-label" style={{ marginBottom: 0 }}>
                Cuéntale algo a Lumi para que lo recuerde
              </label>
              <textarea id="nuevo-recuerdo" className="textarea" rows={2} placeholder="Ej. Laura es mi contacto en Grupo Norte y prefiere propuestas por correo." value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row" style={{ gap: 8 }}>
                <label htmlFor="tema" className="sr-only">
                  Tema
                </label>
                <input id="tema" className="input" style={{ height: 36 }} list="temas" placeholder="Tema (cliente, proyecto…)" value={topic} onChange={(e) => setTopic(e.target.value)} />
                <datalist id="temas">
                  {topics.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
                  Guardar
                </button>
              </div>
              <span className="hint">Se guarda en 90-Lumi/memoria/{topic.trim() || "General"}.md de tu vault.</span>
            </form>

            {topics.length === 0 && <span className="hint">Aún no hay recuerdos confirmados.</span>}
            {topics.map((t) => (
              <div key={t} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p className="section-title">{t}</p>
                {facts
                  .filter((f) => f.topic === t)
                  .reverse()
                  .map((f) => (
                    <div key={`${f.path}:${f.line}`} className="row" style={{ alignItems: "flex-start", gap: 6, padding: "9px 6px 9px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
                      <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 14, lineHeight: 1.45 }}>{f.text}</span>
                        <span className="hint">
                          {f.date}
                          {f.origin ? ` · ${f.origin.replace(/\[\[|\]\]/g, "")}` : ""}
                        </span>
                      </span>
                      <button type="button" className="icon-btn plain" style={{ width: 32, height: 32 }} aria-label="Olvidar este recuerdo" title="Olvidar" onClick={async () => {
                        const r = await lumi.deleteFact(f.path, f.line);
                        if (!r.ok) setMsg(r.error ?? null);
                        reload();
                      }}>
                        <IconTrash size={15} />
                      </button>
                    </div>
                  ))}
              </div>
            ))}
          </>
        )}

        {tab === "buscar" && (
          <>
            <form onSubmit={search} className="row" style={{ gap: 6, padding: "4px 4px 4px 12px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--line-strong)" }}>
              <IconSearch size={17} />
              <label htmlFor="buscar" className="sr-only">
                Buscar en tu vault
              </label>
              <input id="buscar" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="¿Qué quedé con Acme sobre el precio?" style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: "transparent", fontSize: 14, outline: "none" }} />
              <button type="submit" className="btn btn-primary" disabled={!query.trim()}>
                Buscar
              </button>
            </form>
            <span className="hint">
              Búsqueda por texto
              {semantic === "lista" ? " y por significado (modelo local listo)" : semantic === "cargando" ? " · el modelo por significado se está descargando" : semantic === "error" ? " · la búsqueda por significado no está disponible" : ""}.
            </span>
            {searching && <Dots />}
            {hits?.length === 0 && <span className="hint">Sin resultados.</span>}
            {hits?.map((h, i) => (
              <button key={i} type="button" onClick={() => lumi.openInObsidian(h.path)} style={{ all: "unset", cursor: "pointer", padding: 12, borderRadius: 14, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="row" style={{ gap: 6, fontSize: 14, fontWeight: 700 }}>
                  {h.title}
                  {h.heading ? <span style={{ fontWeight: 500, color: "var(--muted)" }}>› {h.heading}</span> : null}
                  <span style={{ marginLeft: "auto", color: "var(--muted)" }}>
                    <IconOpen size={14} />
                  </span>
                </span>
                <span style={{ fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{h.snippet}</span>
                <span className="hint">{h.path}</span>
              </button>
            ))}
          </>
        )}

        {tab === "resumenes" && (
          <>
            <span className="hint">Lumi escribe un resumen cada lunes (semana anterior) y cada inicio de mes en 90-Lumi/resumenes. También puedes generarlo ahora.</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" disabled={!!generating} onClick={() => generate("semanal")}>
                {generating === "semanal" ? "Escribiendo…" : "Resumen de la semana pasada"}
              </button>
              <button className="btn btn-soft" disabled={!!generating} onClick={() => generate("mensual")}>
                {generating === "mensual" ? "Escribiendo…" : "Del mes pasado"}
              </button>
            </div>
            {summaries.length === 0 && <span className="hint">Aún no hay resúmenes.</span>}
            {summaries.map((s) => (
              <button key={s.path} type="button" onClick={() => lumi.openInObsidian(s.path)} className="row" style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, border: "1px solid var(--line)" }}>
                <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{s.title}</span>
                  <span className="hint">{s.kind === "semanal" ? "Semanal" : "Mensual"} · {s.date}</span>
                </span>
                <IconOpen size={15} />
              </button>
            ))}
          </>
        )}
        {msg && <span className="hint">{msg}</span>}
      </div>
    </>
  );
}
