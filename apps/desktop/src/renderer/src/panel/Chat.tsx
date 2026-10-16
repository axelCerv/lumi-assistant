import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppSnapshot, AvatarConfig, ChatMessage, ChatSource } from "@lumi/shared";
import { LumiFace } from "../components/LumiFace";
import { IconSend, IconTrash } from "../components/Icons";
import { lumi } from "../lib/api";
import { aiReady, modeInfo } from "../lib/modes";
import { Dots, ViewHeader } from "./ui";
import type { View } from "./main";

const SUGGESTIONS: Record<string, string[]> = {
  trabajo: ["¿Qué debería hacer primero hoy?", "¿Qué tengo esta semana?", "¿Qué quedé con mis clientes la semana pasada?", "Recuérdame mañana revisar el correo", "Ponte lentes de sol"],
  escuela: ["¿Qué entrego esta semana?", "Tengo examen el viernes, ayúdame a planearlo", "Hazme preguntas de mis apuntes", "Explícame paso a paso lo que no entendí", "Empieza una sesión de estudio"],
  personal: ["¿Qué tengo hoy?", "Agrega leche y pan al súper", "Recuérdame pagar la luz el día 15", "¿Quién cumple años pronto?", "Ayúdame a cerrar el día"],
};

/** Texto con **negritas** y [[enlaces]] a notas (abren en Obsidian si se conocen). */
function RichText({ text, sources }: { text: string; sources: ChatSource[] }) {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<b key={i++}>{m[1]}</b>);
    else {
      const name = m[2].trim();
      const src = sources.find((s) => s.title.toLowerCase() === name.toLowerCase() || s.path.toLowerCase().endsWith(`${name.toLowerCase()}.md`));
      parts.push(
        src ? (
          <button key={i++} type="button" className="note-link" onClick={() => lumi.openInObsidian(src.path)}>
            {m[3] ?? name}
          </button>
        ) : (
          <span key={i++} className="note-ref">
            {m[3] ?? name}
          </span>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Aviso de que Lumi se cambió el look, con opción de volver al anterior. */
function LookChange({ label, detail, before }: { label: string; detail?: string; before?: AvatarConfig }) {
  const [undone, setUndone] = useState(false);
  return (
    <div className="row" style={{ gap: 10, padding: "8px 10px 8px 8px", borderRadius: 14, background: undone ? "var(--surface)" : "var(--lavender)" }}>
      <LumiFace size={40} look={undone ? before : undefined} />
      <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--indigo-deep)" }}>{undone ? "Volví a mi look anterior" : label}</span>
        {!undone && detail && <span className="hint">{detail}</span>}
      </span>
      {!undone && before && (
        <button
          className="btn btn-ghost"
          style={{ minHeight: 30, padding: "0 8px" }}
          onClick={async () => {
            await lumi.updateSettings({ avatar: before });
            setUndone(true);
          }}
        >
          Deshacer
        </button>
      )}
    </div>
  );
}

export function Chat({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const provider = snap.settings.ai.provider;
  const ready = aiReady(snap);
  const minor = snap.settings.ageGroup === "menor";
  const info = modeInfo(snap);
  const suggestions = [...(SUGGESTIONS[info.multi ? snap.mode.id : "trabajo"] ?? SUGGESTIONS.trabajo), ...(info.multi ? ["Cambia de modo"] : [])];

  useEffect(() => {
    lumi.chatHistory().then(setMessages);
    return lumi.on("chat-delta", (d) => setDraft(d));
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, thinking, draft?.text.length]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    setInput("");
    setThinking(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content, at: new Date().toISOString() }]);
    await lumi.chatSend(content);
    setDraft(null);
    setMessages(await lumi.chatHistory());
    setThinking(false);
  }

  async function clear() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    await lumi.chatClear();
    setMessages([]);
    setConfirmClear(false);
  }

  const status = (
    <span className="row" style={{ gap: 6, fontSize: 12, color: "var(--muted-strong)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: ready ? "var(--ok)" : "#B9B6CF" }} />
      {ready
        ? `Conectado a ${provider === "claude" ? "Claude" : "Gemini"}${info.multi && info.active ? ` · modo ${info.active.nombre} ${info.active.icono}` : snap.vaultName ? ` · vault «${snap.vaultName}»` : ""}`
        : minor
          ? "Lumi sin IA"
          : "Sin conectar a la IA"}
    </span>
  );

  return (
    <>
      <ViewHeader
        title="Pregúntale a Lumi"
        onBack={() => go({ name: "home" })}
        sub={status}
        right={
          messages.length > 0 && (
            <button type="button" className={`icon-btn plain${confirmClear ? " on" : ""}`} aria-label={confirmClear ? "Confirmar: borrar conversación" : "Borrar conversación"} title={confirmClear ? "Clic otra vez para borrar" : "Borrar conversación"} onClick={clear}>
              <IconTrash size={18} />
            </button>
          )
        }
      />

      <div className="scroll" style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 14, background: "var(--surface-2)" }}>
        {!ready && minor && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "12px 6px" }}>
            <LumiFace size={56} mood="hablando" />
            <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45 }}>
              Estás usando <b>Lumi sin IA</b>, así que no converso. Pero sí te ayudo con tu horario, recordatorios, entregas, tarjetas de repaso y sesiones de estudio.
            </span>
            <button className="btn btn-primary" onClick={() => go({ name: "school" })}>
              Ir a Escuela
            </button>
          </div>
        )}
        {!ready && !minor && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "12px 6px" }}>
            <LumiFace size={56} mood="pensando" />
            <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45 }}>Para conversar necesito tu clave de Claude o de Gemini. Pégala en Ajustes → Inteligencia.</span>
            <button className="btn btn-primary" onClick={() => go({ name: "settings" })}>
              Ir a Ajustes
            </button>
          </div>
        )}
        {ready && messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", padding: "16px 6px" }}>
            <LumiFace size={56} mood="hablando" />
            <span style={{ fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.45, maxWidth: 300 }}>
              {snap.mode.id === "escuela" && info.multi
                ? "Soy tu tutora: te explico paso a paso, te hago preguntas de tus apuntes y te ayudo a partir las entregas en pasos pequeños."
                : snap.mode.id === "personal" && info.multi
                  ? "Te ayudo con tu día: pagos, listas, cumpleaños, hábitos y lo que tengas pendiente."
                  : "Conozco tu vault: pregúntame por reuniones, clientes o qué hacer primero. También puedo anotarte pendientes."}
            </span>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "82%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px", background: "var(--indigo)", color: "#fff", fontSize: 14.5, lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="row" style={{ alignItems: "flex-start", gap: 8 }}>
              <span style={{ flex: "none" }}>
                <LumiFace size={28} />
              </span>
              <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <div
                  style={{
                    padding: "11px 14px",
                    borderRadius: "4px 16px 16px 16px",
                    background: m.error ? "var(--danger-bg)" : "#fff",
                    color: m.error ? "var(--danger)" : "var(--ink)",
                    border: m.error ? 0 : "1px solid var(--line)",
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  <RichText text={m.content} sources={m.sources ?? []} />
                </div>

                {m.actions?.map((a, i) =>
                  a.kind === "apariencia" ? (
                    <LookChange key={i} label={a.label} detail={a.detail} before={a.lookBefore} />
                  ) : a.kind === "pendiente" ? (
                    <div key={i} className="row" style={{ gap: 8, padding: "10px 12px", borderRadius: 12, background: a.state === "descartado" ? "var(--surface)" : "var(--lavender)" }}>
                      <span className="grow" style={{ fontSize: 13, lineHeight: 1.4, textDecoration: a.state === "descartado" ? "line-through" : "none" }}>
                        <b>{a.taskKeys && a.taskKeys.length > 1 ? (a.state === "descartado" ? "Plan quitado" : "Plan creado") : a.state === "descartado" ? "Pendiente quitado" : "Pendiente creado"}:</b> {a.label} · {a.detail}
                      </span>
                      {a.state !== "descartado" && a.taskKey && (
                        <button className="btn btn-ghost" style={{ minHeight: 30, padding: "0 8px" }} onClick={async () => {
                          await lumi.undoTask(a.taskKey!, m.id);
                          setMessages(await lumi.chatHistory());
                        }}>
                          Deshacer
                        </button>
                      )}
                    </div>
                  ) : a.state === "pendiente" && snap.proposals.some((p) => p.id === a.proposalId) ? (
                    <div key={i} style={{ padding: "12px 14px", borderRadius: 14, border: "1px dashed #B9B6CF", display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--indigo-deep)" }}>¿Guardo esto en mi memoria? · {a.detail}</span>
                      <span style={{ fontSize: 14, lineHeight: 1.4 }}>«{a.label}»</span>
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn btn-primary" onClick={async () => {
                          await lumi.confirmFact(a.proposalId!, true);
                          setMessages(await lumi.chatHistory());
                        }}>
                          Guardar
                        </button>
                        <button className="btn btn-soft" onClick={async () => {
                          await lumi.confirmFact(a.proposalId!, false);
                          setMessages(await lumi.chatHistory());
                        }}>
                          No
                        </button>
                      </div>
                    </div>
                  ) : a.state === "hecho" ? (
                    <span key={i} className="hint">
                      ✓ Guardado en la memoria
                    </span>
                  ) : null,
                )}

                {!!m.sources?.length && (
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="hint">Fuentes:</span>
                    {m.sources.map((s) => (
                      <button key={s.path} type="button" className="tag neutral" style={{ cursor: "pointer" }} title={s.path} onClick={() => lumi.openInObsidian(s.path)}>
                        {s.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {thinking && (
          <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
            <LumiFace size={28} mood="pensando" />
            <span style={{ padding: "11px 14px", borderRadius: "4px 16px 16px 16px", background: "#fff", border: "1px solid var(--line)", fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap", maxWidth: "85%" }}>
              {draft?.text ? draft.text : <Dots />}
            </span>
          </div>
        )}
        <div ref={end} />
      </div>

      {!minor && (
      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row scroll" style={{ gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {suggestions.map((s) => (
            <button key={s} type="button" className="btn btn-outline" style={{ flex: "none", minHeight: 30, fontSize: 12.5, fontWeight: 500, borderRadius: 999 }} onClick={() => send(s)} disabled={thinking || !ready}>
              {s}
            </button>
          ))}
        </div>
        <form
          className="row"
          style={{ gap: 6, padding: "4px 4px 4px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--line-strong)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="pregunta" className="sr-only">
            Pregunta para Lumi
          </label>
          <input
            id="pregunta"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta o cuéntale algo a Lumi…"
            autoComplete="off"
            disabled={!ready}
            style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: "transparent", fontSize: 14, outline: "none" }}
          />
          <button type="submit" className="icon-btn" aria-label="Enviar" disabled={!input.trim() || thinking} style={{ background: "var(--indigo)", color: "#fff", opacity: input.trim() && !thinking ? 1 : 0.5 }}>
            <IconSend size={18} />
          </button>
        </form>
      </div>
      )}
    </>
  );
}
