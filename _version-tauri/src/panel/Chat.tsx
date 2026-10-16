import { useEffect, useRef, useState } from "react";
import { LumiFace } from "../components/LumiFace";
import { IconSend, IconTrash } from "../components/Icons";
import { askClaude, chatSystemPrompt, hasApiKey, localToIso, parseAssistant, tagsFromClaude, type Turn } from "../lib/claude";
import { applyAvatarPatch, describeAvatar } from "../lib/avatar";
import { loadData, rememberTags, uid, updateData } from "../lib/store";
import { whenLabel } from "../lib/time";
import type { ChatMessage, LumiData, Meeting } from "../lib/types";
import { Dots, ViewHeader } from "./ui";
import type { View } from "./main";

const SUGGESTIONS = ["¿Qué debería hacer primero hoy?", "¿Qué tengo esta semana?", "Resume mis pendientes por cliente", "Recuérdame mañana revisar el correo", "Ponte lentes de sol"];

/** La API necesita turnos alternados que empiecen por el usuario. */
function toTurns(chat: ChatMessage[]): Turn[] {
  const out: Turn[] = [];
  for (const m of chat.filter((x) => !x.error).slice(-16)) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export function Chat({ data, meetings, go }: { data: LumiData; meetings: Meeting[]; go: (v: View) => void }) {
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hasApiKey().then(setKeyOk);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [data.chat.length, thinking]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    setInput("");
    setThinking(true);
    await updateData((d) => {
      d.chat.push({ id: uid(), role: "user", content, at: new Date().toISOString() });
    });
    try {
      const { data: fresh } = await loadData();
      const raw = await askClaude(fresh, chatSystemPrompt(fresh, meetings), toTurns(fresh.chat), 1200);
      const { clean, memory, reminder, look } = parseAssistant(raw);
      await updateData((d) => {
        // Cambio de look pedido por el usuario: se aplica de una vez y se puede deshacer.
        const before = d.avatar;
        const { next, changed } = applyAvatarPatch(before, look);
        if (changed.length) d.avatar = next;
        d.chat.push({
          id: uid(),
          role: "assistant",
          content: clean || "Listo.",
          at: new Date().toISOString(),
          memory: d.settings.learn ? memory : null,
          memoryState: memory && d.settings.learn ? "pendiente" : undefined,
          reminder,
          reminderState: reminder ? "pendiente" : undefined,
          lookChange: changed.length ? describeAvatar(next) : null,
          lookBefore: changed.length ? before : null,
        });
        if (d.chat.length > 200) d.chat = d.chat.slice(-200);
      });
    } catch (e) {
      await updateData((d) => {
        d.chat.push({ id: uid(), role: "assistant", content: String(e), at: new Date().toISOString(), error: true });
      });
    } finally {
      setThinking(false);
    }
  }

  async function saveMemory(m: ChatMessage, keep: boolean) {
    await updateData((d) => {
      const x = d.chat.find((y) => y.id === m.id);
      if (!x) return;
      x.memoryState = keep ? "guardado" : "descartado";
      if (keep && x.memory) d.memories.push({ id: uid(), text: x.memory, createdAt: new Date().toISOString() });
    });
  }

  async function createReminder(m: ChatMessage, keep: boolean) {
    await updateData((d) => {
      const x = d.chat.find((y) => y.id === m.id);
      if (!x || !x.reminder) return;
      x.reminderState = keep ? "creado" : "descartado";
      if (keep) {
        const tags = tagsFromClaude(x.reminder.etiquetas);
        d.tasks.push({
          id: uid(),
          text: x.reminder.titulo,
          createdAt: new Date().toISOString(),
          remindAt: localToIso(x.reminder.fecha_hora),
          done: false,
          doneAt: null,
          notified: false,
          tags,
          contact: null,
        });
        rememberTags(d, tags);
      }
    });
  }

  async function undoLook(m: ChatMessage) {
    await updateData((d) => {
      const x = d.chat.find((y) => y.id === m.id);
      if (!x || !x.lookBefore) return;
      d.avatar = x.lookBefore;
      x.lookBefore = null;
      x.lookChange = null;
    });
  }

  async function clear() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    await updateData((d) => {
      d.chat = [];
    });
    setConfirmClear(false);
  }

  const status =
    keyOk === false || !data.settings.useAI ? (
      <span className="row" style={{ gap: 6, fontSize: 12, color: "var(--muted-strong)" }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: "#B9B6CF" }} />
        Sin conectar a Claude
      </span>
    ) : (
      <span className="row" style={{ gap: 6, fontSize: 12, color: "var(--muted-strong)" }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--ok)" }} />
        Conectado a Claude{data.settings.learn ? " · memoria activa" : ""}
      </span>
    );

  return (
    <>
      <ViewHeader
        title="Pregúntale a Lumi"
        onBack={() => go({ name: "home" })}
        sub={status}
        right={
          data.chat.length > 0 && (
            <button type="button" className={`icon-btn plain${confirmClear ? " on" : ""}`} aria-label={confirmClear ? "Confirmar: borrar conversación" : "Borrar conversación"} title={confirmClear ? "Clic otra vez para borrar" : "Borrar conversación"} onClick={clear}>
              <IconTrash size={18} />
            </button>
          )
        }
      />

      <div className="scroll" style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 14, background: "var(--surface-2)" }}>
        {(keyOk === false || !data.settings.useAI) && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "12px 6px" }}>
            <LumiFace size={56} mood="pensando" />
            <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45 }}>
              Para conversar conmigo necesito tu clave de API de Claude. Es rápido: pégala en Ajustes y listo.
            </span>
            <button className="btn btn-primary" onClick={() => go({ name: "settings" })}>
              Ir a Ajustes
            </button>
          </div>
        )}

        {keyOk && data.settings.useAI && data.chat.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", padding: "16px 6px" }}>
            <LumiFace size={56} mood="hablando" />
            <span style={{ fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.45, maxWidth: 300 }}>
              Pregúntame qué hacer primero, pídeme que te recuerde algo o cuéntame cosas de tus clientes para que las recuerde.
            </span>
          </div>
        )}

        {data.chat.map((m) =>
          m.role === "user" ? (
            <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "82%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px", background: "var(--indigo)", color: "#fff", fontSize: 14.5, lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="row" style={{ alignItems: "flex-start", gap: 8 }}>
              <span style={{ flex: "none" }}>
                <LumiFace size={28} />
              </span>
              <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                  {m.content.replace(/\*\*(.+?)\*\*/g, "$1")}
                </div>

                {m.reminder && m.reminderState === "pendiente" && (
                  <div style={{ padding: "12px 14px", borderRadius: 14, background: "var(--lavender)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--indigo-deep)" }}>¿Creo este recordatorio?</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{m.reminder.titulo}</span>
                    <span className="hint">{whenLabel(localToIso(m.reminder.fecha_hora))}</span>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn btn-primary" onClick={() => createReminder(m, true)}>
                        Crear
                      </button>
                      <button className="btn btn-soft" style={{ background: "#fff" }} onClick={() => createReminder(m, false)}>
                        No
                      </button>
                    </div>
                  </div>
                )}
                {m.reminder && m.reminderState === "creado" && <span className="hint">✓ Recordatorio creado</span>}

                {m.lookChange && (
                  <div className="row" style={{ gap: 10, padding: "8px 10px 8px 8px", borderRadius: 14, background: "var(--lavender)" }}>
                    <LumiFace size={40} />
                    <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--indigo-deep)" }}>Me cambié el look</span>
                      <span className="hint">{m.lookChange}</span>
                    </span>
                    {m.lookBefore && (
                      <button className="btn btn-soft" style={{ background: "#fff" }} onClick={() => undoLook(m)}>
                        Deshacer
                      </button>
                    )}
                  </div>
                )}

                {m.memory && m.memoryState === "pendiente" && (
                  <div style={{ padding: "12px 14px", borderRadius: 14, border: "1px dashed #B9B6CF", display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--indigo-deep)" }}>¿Guardo esto en mi memoria?</span>
                    <span style={{ fontSize: 14, lineHeight: 1.4 }}>«{m.memory}»</span>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn btn-primary" onClick={() => saveMemory(m, true)}>
                        Guardar
                      </button>
                      <button className="btn btn-soft" onClick={() => saveMemory(m, false)}>
                        No
                      </button>
                    </div>
                  </div>
                )}
                {m.memory && m.memoryState === "guardado" && <span className="hint">✓ Lo recordaré</span>}
              </div>
            </div>
          ),
        )}
        {thinking && (
          <div className="row" style={{ gap: 8 }}>
            <LumiFace size={28} mood="pensando" />
            <span style={{ padding: "12px 14px", borderRadius: 14, background: "#fff", border: "1px solid var(--line)" }}>
              <Dots />
            </span>
          </div>
        )}
        <div ref={end} />
      </div>

      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row scroll" style={{ gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="btn btn-outline" style={{ flex: "none", minHeight: 30, fontSize: 12.5, fontWeight: 500, borderRadius: 999 }} onClick={() => send(s)} disabled={thinking || !keyOk}>
              {s}
            </button>
          ))}
        </div>
        <form
          className="row"
          style={{ gap: 6, padding: "4px 4px 4px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--line-strong)" }}
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
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
            disabled={!keyOk || !data.settings.useAI}
            style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: "transparent", fontSize: 14, outline: "none" }}
          />
          <button type="submit" className="icon-btn" aria-label="Enviar" disabled={!input.trim() || thinking} style={{ background: "var(--indigo)", color: "#fff", opacity: input.trim() && !thinking ? 1 : 0.5 }}>
            <IconSend size={18} />
          </button>
        </form>
      </div>
    </>
  );
}
