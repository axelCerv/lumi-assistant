import { useState } from "react";
import { IconTrash } from "../components/Icons";
import { uid, updateData } from "../lib/store";
import { dayLabel } from "../lib/time";
import type { LumiData } from "../lib/types";
import { ViewHeader } from "./ui";
import type { View } from "./main";

export function Memory({ data, go }: { data: LumiData; go: (v: View) => void }) {
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const list = [...data.memories].reverse();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    await updateData((d) => {
      d.memories.push({ id: uid(), text: t, createdAt: new Date().toISOString() });
    });
    setText("");
  }

  async function clearAll() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    await updateData((d) => {
      d.memories = [];
    });
    setConfirm(false);
  }

  return (
    <>
      <ViewHeader title="Lo que sabe Lumi" onBack={() => go({ name: "settings" })} />
      <div className="scroll" style={{ flex: 1, padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="nuevo-recuerdo" className="field-label">
            Cuéntale algo a Lumi para que lo recuerde
          </label>
          <textarea
            id="nuevo-recuerdo"
            className="textarea"
            rows={3}
            placeholder="Ej. Laura es mi contacto en Grupo Norte y prefiere propuestas por correo."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="hint">Claude usa esta memoria para responderte y para entender tus notas. Todo se guarda solo en tu computadora.</span>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={!text.trim()}>
            Guardar en la memoria
          </button>
        </form>

        <p className="section-title">{list.length ? `${list.length} recuerdos` : "Aún no hay recuerdos"}</p>
        {list.map((m) => (
          <div key={m.id} className="row" style={{ alignItems: "flex-start", gap: 8, padding: "10px 8px 10px 14px", borderRadius: 14, border: "1px solid var(--line)" }}>
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, lineHeight: 1.45 }}>{m.text}</span>
              <span className="hint">{dayLabel(new Date(m.createdAt))}</span>
            </span>
            <button
              type="button"
              className="icon-btn plain"
              aria-label="Olvidar este recuerdo"
              title="Olvidar"
              onClick={() =>
                updateData((d) => {
                  d.memories = d.memories.filter((x) => x.id !== m.id);
                })
              }
            >
              <IconTrash size={16} />
            </button>
          </div>
        ))}
        {list.length > 0 && (
          <button type="button" className="btn btn-danger" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={clearAll}>
            {confirm ? "¿Seguro? Clic otra vez para borrar todo" : "Borrar toda la memoria"}
          </button>
        )}
      </div>
    </>
  );
}
