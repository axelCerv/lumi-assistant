import { useEffect, useMemo, useRef, useState } from "react";
import { LumiFace } from "../components/LumiFace";
import { hasApiKey, parseNoteWithClaude } from "../lib/claude";
import { parseNote } from "../lib/parse";
import { rememberTags, sameTag, uid, updateData } from "../lib/store";
import { addDays, fromLocalInput, roundUpQuarter, startOfDay, toLocalInput, whenLabel } from "../lib/time";
import type { LumiData, Tag, TagKind } from "../lib/types";
import { Dots, TagChip, ViewHeader } from "./ui";

export function NoteEditor({
  data,
  text,
  taskId,
  onDone,
}: {
  data: LumiData;
  text?: string;
  taskId?: string;
  onDone: () => void;
}) {
  const existing = taskId ? data.tasks.find((t) => t.id === taskId) : undefined;
  const initial = useMemo(() => (existing ? null : parseNote(text ?? "", data.tags)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [original, setOriginal] = useState(existing?.original ?? text ?? "");
  const [title, setTitle] = useState(existing?.text ?? initial?.title ?? "");
  const [when, setWhen] = useState(toLocalInput(existing ? existing.remindAt : initial?.remindAt ?? null));
  const [tags, setTags] = useState<Tag[]>(existing?.tags ?? initial?.tags ?? []);
  const [contact, setContact] = useState(existing?.contact ?? initial?.contact ?? "");
  const [reason, setReason] = useState<string | null>(initial?.reason ?? null);
  const [ai, setAi] = useState<"off" | "thinking" | "done" | "fail">("off");
  const [touched, setTouchedState] = useState(false);
  const touchedRef = useRef(false);
  const setTouched = (v: boolean) => {
    touchedRef.current = v;
    setTouchedState(v);
  };
  const [newTag, setNewTag] = useState("");
  const [newKind, setNewKind] = useState<TagKind>("cliente");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Si Claude está conectado, que lea la nota (sin pisar lo que ya editaste).
  async function readWithClaude(note: string, force = false) {
    if (!data.settings.useAI || !note.trim() || !(await hasApiKey())) return;
    setAi("thinking");
    const r = await parseNoteWithClaude(data, note);
    if (!r) {
      setAi("fail");
      return;
    }
    setAi("done");
    if (touchedRef.current && !force) return;
    setTitle(r.title);
    setWhen(toLocalInput(r.remindAt));
    setTags(r.tags.map((t) => data.tags.find((k) => sameTag(k, t)) ?? t));
    setContact(r.contact ?? "");
    setReason(r.reason);
  }

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!existing && text) readWithClaude(text);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function reread() {
    const p = parseNote(original, data.tags);
    setTitle(p.title);
    setWhen(toLocalInput(p.remindAt));
    setTags(p.tags);
    setContact(p.contact ?? "");
    setReason(p.reason);
    setTouched(false);
    readWithClaude(original, true);
  }

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    setTouched(true);
    set(v);
  };

  function toggleTag(t: Tag) {
    setTouched(true);
    setTags((cur) => (cur.some((x) => sameTag(x, t)) ? cur.filter((x) => !sameTag(x, t)) : [...cur, t]));
  }

  function addTag(e?: React.FormEvent) {
    e?.preventDefault();
    const name = newTag.trim().replace(/^[@#]/, "");
    if (!name) return;
    const tag = data.tags.find((k) => k.kind === newKind && k.name.toLowerCase() === name.toLowerCase()) ?? { name, kind: newKind };
    if (!tags.some((x) => sameTag(x, tag))) toggleTag(tag);
    setNewTag("");
  }

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const remindAt = fromLocalInput(when);
    await updateData((d) => {
      if (existing) {
        const t = d.tasks.find((x) => x.id === existing.id);
        if (t) {
          if (t.remindAt !== remindAt) t.notified = false;
          t.text = title.trim();
          t.remindAt = remindAt;
          t.tags = tags;
          t.contact = contact.trim() || null;
        }
      } else {
        d.tasks.push({
          id: uid(),
          text: title.trim(),
          original: original.trim(),
          createdAt: new Date().toISOString(),
          remindAt,
          done: false,
          doneAt: null,
          notified: false,
          tags,
          contact: contact.trim() || null,
        });
      }
      rememberTags(d, tags);
    });
    onDone();
  }

  async function remove() {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await updateData((d) => {
      d.tasks = d.tasks.filter((t) => t.id !== existing.id);
    });
    onDone();
  }

  const now = new Date();
  const quick: [string, string | null][] = [
    ["En 1 h", roundUpQuarter(new Date(now.getTime() + 3600000)).toISOString()],
    ["Hoy 18:00", (() => {
      const d = new Date(now);
      d.setHours(18, 0, 0, 0);
      return d > now ? d.toISOString() : null;
    })()],
    ["Mañana 9:00", (() => {
      const d = addDays(startOfDay(now), 1);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    })()],
  ];
  const unusedKnown = data.tags.filter((k) => !tags.some((t) => sameTag(t, k))).slice(0, 10);

  return (
    <>
      <ViewHeader title={existing ? "Editar recordatorio" : "Nota rápida"} onBack={onDone} />
      <div className="scroll" style={{ flex: 1, padding: "14px 18px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {!existing && (
          <div>
            <label htmlFor="original" className="field-label">
              Lo que escribiste
            </label>
            <textarea id="original" className="textarea" rows={2} value={original} onChange={(e) => setOriginal(e.target.value)} />
            {original.trim() !== (text ?? "").trim() && (
              <button type="button" className="btn btn-lavender" style={{ marginTop: 8 }} onClick={reread}>
                Volver a leer la nota
              </button>
            )}
          </div>
        )}

        <div style={{ borderRadius: 18, background: existing ? "var(--surface)" : "var(--lavender)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {!existing && (
            <div className="row" style={{ gap: 10 }}>
              <LumiFace size={32} mood={ai === "thinking" ? "pensando" : "reposo"} />
              <span className="grow" style={{ fontSize: 14.5, fontWeight: 700, color: "var(--indigo-deep)" }}>
                {ai === "thinking" ? "Lo estoy pensando con Claude…" : "Lumi entendió esto"}
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
            <label htmlFor="cuando" className="field-label" style={{ color: "var(--muted-strong)" }}>
              Cuándo te aviso
            </label>
            <input
              id="cuando"
              type="datetime-local"
              className="input"
              style={{ background: "#fff" }}
              value={when}
              onChange={(e) => edit(setWhen)(e.target.value)}
            />
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              {quick
                .filter(([, iso]) => iso)
                .map(([label, iso]) => (
                  <button key={label} type="button" className="btn btn-outline" style={{ minHeight: 32, fontSize: 12.5, padding: "0 10px" }} onClick={() => edit(setWhen)(toLocalInput(iso))}>
                    {label}
                  </button>
                ))}
              <button type="button" className="btn btn-ghost" style={{ minHeight: 32, fontSize: 12.5, padding: "0 8px" }} onClick={() => edit(setWhen)("")}>
                Sin aviso
              </button>
            </div>
            <span className="hint" style={{ display: "block", marginTop: 6 }}>
              {when ? whenLabel(fromLocalInput(when)) : "No te avisaré; quedará en Pendientes."}
              {reason && !touched ? ` · ${reason}` : ""}
            </span>
          </div>

          <div>
            <span className="field-label" style={{ color: "var(--muted-strong)" }}>
              Etiquetas
            </span>
            <div className="row wrap" style={{ gap: 6 }}>
              {tags.length === 0 && <span className="hint">Sin etiquetas</span>}
              {tags.map((t) => (
                <TagChip key={t.kind + t.name} tag={t} big onRemove={() => toggleTag(t)} />
              ))}
            </div>
            {unusedKnown.length > 0 && (
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                {unusedKnown.map((t) => (
                  <button key={t.kind + t.name} type="button" className={`tag off`} onClick={() => toggleTag(t)} title={t.kind === "cliente" ? "Cliente" : "Proyecto"}>
                    + {t.name}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={addTag} className="row" style={{ gap: 6, marginTop: 8 }}>
              <label htmlFor="nueva-etiqueta" className="sr-only">
                Nueva etiqueta
              </label>
              <input
                id="nueva-etiqueta"
                className="input"
                style={{ background: "#fff", height: 36 }}
                placeholder="Nuevo cliente o proyecto"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
              />
              <label htmlFor="tipo-etiqueta" className="sr-only">
                Tipo
              </label>
              <select id="tipo-etiqueta" className="select" style={{ width: 112, height: 36, background: "#fff" }} value={newKind} onChange={(e) => setNewKind(e.target.value as TagKind)}>
                <option value="cliente">Cliente</option>
                <option value="proyecto">Proyecto</option>
              </select>
              <button type="submit" className="btn btn-soft" style={{ minHeight: 36 }} disabled={!newTag.trim()}>
                Añadir
              </button>
            </form>
          </div>

          <div>
            <label htmlFor="contacto" className="field-label" style={{ color: "var(--muted-strong)" }}>
              Contacto (opcional)
            </label>
            <input id="contacto" className="input" style={{ background: "#fff" }} placeholder="¿Con quién?" value={contact} onChange={(e) => edit(setContact)(e.target.value)} />
          </div>
        </div>
        {ai === "fail" && <span className="hint">No pude consultar a Claude; usé mi lectura básica. Revisa tu clave en Ajustes.</span>}
      </div>

      <div className="row" style={{ padding: "12px 18px 16px", gap: 10, borderTop: "1px solid var(--line)" }}>
        <button type="button" className="btn btn-primary btn-lg grow" onClick={save} disabled={!title.trim() || saving}>
          {existing ? "Guardar cambios" : "Guardar recordatorio"}
        </button>
        {existing ? (
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
