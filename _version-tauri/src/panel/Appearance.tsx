import { useState } from "react";
import { LumiFace } from "../components/LumiFace";
import {
  ACCESSORIES,
  BASES,
  BODIES,
  COLORS,
  FACIALS,
  FRAMES,
  GLASSES,
  HAIR_COLORS,
  HAIRS,
  OUTFITS,
  PRESETS,
  describeAvatar,
  randomAvatar,
  sameAvatar,
  type AvatarConfig,
} from "../lib/avatar";
import { updateData } from "../lib/store";
import type { LumiData } from "../lib/types";
import { SwitchRow, ViewHeader } from "./ui";
import type { View } from "./main";

type Tab = "cuerpo" | "cabello" | "ropa" | "lentes" | "extras";
const TABS: { id: Tab; label: string }[] = [
  { id: "cuerpo", label: "Cuerpo" },
  { id: "cabello", label: "Cabello" },
  { id: "ropa", label: "Ropa" },
  { id: "lentes", label: "Lentes" },
  { id: "extras", label: "Extras" },
];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 className="section-title" style={{ margin: 0 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Chips<T extends string>({ options, value, onPick }: { options: { id: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          className={`btn ${value === o.id ? "btn-dark" : "btn-outline"}`}
          style={{ minHeight: 40, padding: "0 6px", whiteSpace: "normal", lineHeight: 1.15 }}
          onClick={() => onPick(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatches<T extends string>({ options, value, onPick }: { options: { id: T; label: string; hex: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="row wrap" style={{ gap: 10 }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-label={o.label}
          title={o.label}
          aria-pressed={value === o.id}
          onClick={() => onPick(o.id)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            border: 0,
            padding: 0,
            background: o.hex,
            boxShadow: value === o.id ? "0 0 0 3px #fff, 0 0 0 5.5px var(--ink)" : "inset 0 0 0 1px rgba(0,0,0,0.12)",
          }}
        />
      ))}
    </div>
  );
}

export function Appearance({ data, go }: { data: LumiData; go: (v: View) => void }) {
  const [draft, setDraft] = useState<AvatarConfig>(data.avatar);
  const [tab, setTab] = useState<Tab>("cabello");
  const [saved, setSaved] = useState(false);
  const dirty = !sameAvatar(draft, data.avatar);
  const set = (patch: Partial<AvatarConfig>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };

  async function save() {
    await updateData((d) => {
      d.avatar = draft;
    });
    setSaved(true);
  }

  return (
    <>
      <ViewHeader title="Mi apariencia" onBack={() => go({ name: "settings" })} />

      <div className="scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            margin: "12px 16px 0",
            height: 176,
            flex: "none",
            borderRadius: 20,
            background: "var(--lavender)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <span aria-hidden="true" style={{ position: "absolute", width: 150, height: 150, borderRadius: 75, background: "var(--sun-soft)" }} />
          <span style={{ position: "relative", animation: "lumi-bob 3.2s ease-in-out infinite" }}>
            <LumiFace size={156} look={draft} shadow title={`Vista previa: ${describeAvatar(draft)}`} />
          </span>
        </div>
        <p style={{ margin: "8px 20px 0", fontSize: 13, color: "var(--muted)", textAlign: "center", minHeight: 18 }}>{describeAvatar(draft)}</p>

        <div style={{ padding: "12px 16px 0" }}>
          <h2 className="section-title" style={{ margin: "0 0 8px" }}>
            Personajes
          </h2>
          <div className="row scroll" style={{ gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {PRESETS.map((pr) => {
              const on = sameAvatar(pr.look, draft);
              return (
                <button
                  key={pr.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setDraft({ ...pr.look, reunion: draft.reunion });
                    setSaved(false);
                  }}
                  style={{
                    flex: "none",
                    width: 66,
                    padding: "6px 4px 6px",
                    borderRadius: 14,
                    border: on ? "2px solid var(--ink)" : "1px solid var(--line-strong)",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <LumiFace size={46} look={pr.look} />
                  {pr.name}
                </button>
              );
            })}
          </div>
        </div>

        <nav
          aria-label="Categorías"
          style={{ margin: "12px 16px 0", padding: 4, borderRadius: 14, background: "var(--surface)", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4 }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              style={{
                minHeight: 38,
                border: 0,
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 700,
                background: tab === t.id ? "#fff" : "transparent",
                color: tab === t.id ? "var(--ink)" : "var(--muted-strong)",
                boxShadow: tab === t.id ? "0 1px 3px rgba(30,32,51,0.15)" : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: "14px 16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
          {tab === "cuerpo" && (
            <>
              <Group title="Color">
                <Swatches options={BODIES} value={draft.cuerpo} onPick={(cuerpo) => set({ cuerpo })} />
              </Group>
              <Group title="Base">
                <Chips options={BASES} value={draft.base} onPick={(base) => set({ base })} />
                <span className="hint">Solo cambia pestañas y cejas. Cualquier ropa o peinado sirve en cualquier base.</span>
              </Group>
            </>
          )}
          {tab === "cabello" && (
            <>
              <Group title="Peinado">
                <Chips options={HAIRS} value={draft.cabello} onPick={(cabello) => set({ cabello })} />
              </Group>
              <Group title="Color de cabello">
                <Swatches options={HAIR_COLORS} value={draft.cabelloColor} onPick={(cabelloColor) => set({ cabelloColor })} />
              </Group>
              <Group title="Vello facial">
                <Chips options={FACIALS} value={draft.vello} onPick={(vello) => set({ vello })} />
              </Group>
            </>
          )}
          {tab === "ropa" && (
            <>
              <Group title="Prenda">
                <Chips options={OUTFITS} value={draft.prenda} onPick={(prenda) => set({ prenda })} />
              </Group>
              <Group title="Color">
                <Swatches options={COLORS} value={draft.prendaColor} onPick={(prendaColor) => set({ prendaColor })} />
              </Group>
              <SwitchRow
                label="Corbatín en reuniones"
                hint="Lumi se lo pone sola cuando una reunión está por empezar"
                checked={draft.reunion === "corbatin"}
                onChange={(v) => set({ reunion: v ? "corbatin" : null })}
              />
            </>
          )}
          {tab === "lentes" && (
            <>
              <Group title="Lentes">
                <Chips options={GLASSES} value={draft.lentes} onPick={(lentes) => set({ lentes })} />
              </Group>
              <Group title="Armazón">
                <Swatches options={FRAMES} value={draft.lentesColor} onPick={(lentesColor) => set({ lentesColor })} />
              </Group>
            </>
          )}
          {tab === "extras" && (
            <>
              <Group title="Accesorio">
                <Chips options={ACCESSORIES} value={draft.accesorio} onPick={(accesorio) => set({ accesorio })} />
              </Group>
              <Group title="Color">
                <Swatches options={COLORS} value={draft.accesorioColor} onPick={(accesorioColor) => set({ accesorioColor })} />
              </Group>
            </>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 8, padding: "10px 16px 14px", borderTop: "1px solid var(--line)" }}>
        <button type="button" className="btn btn-soft btn-lg" style={{ flex: 1 }} onClick={() => set(randomAvatar(draft))}>
          Sorpréndeme
        </button>
        <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1.3 }} onClick={save} disabled={!dirty}>
          {saved && !dirty ? "Guardado" : "Guardar look"}
        </button>
      </div>
    </>
  );
}
