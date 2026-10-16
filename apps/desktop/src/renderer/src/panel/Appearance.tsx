import { useState } from "react";
import { LumiFace } from "../components/LumiFace";
import {
  ACCESSORIES,
  BASES,
  BODIES,
  COLORS,
  EYE_COLORS,
  FACIALS,
  FRAMES,
  GLASSES,
  GROUP_LABELS,
  HAIR_COLORS,
  HAIRS,
  OUTFITS,
  PRESETS,
  describeAvatar,
  formalFor,
  randomAvatar,
  sameAvatar,
  type AppSnapshot,
  type AvatarConfig,
  type BaseId,
  type StyleGroup,
} from "@lumi/shared";
import { lumi } from "../lib/api";
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

const GROUP_DOT: Record<StyleGroup, string> = { ella: "#E9719E", el: "#4C9BE0", trabajo: "#F08A24", todos: "#A9ADC4" };

/** Orden de los grupos: primero el de la base elegida, luego el otro, trabajo y para todos. */
function groupOrder(base: BaseId): StyleGroup[] {
  if (base === "masculina") return ["el", "ella", "trabajo", "todos"];
  return ["ella", "el", "trabajo", "todos"];
}

/** Chips separados por grupo (ella / él / trabajo / para todos) para notar la diferencia. */
function GroupedChips<T extends string>({
  options,
  value,
  onPick,
  base,
}: {
  options: { id: T; label: string; group?: StyleGroup }[];
  value: T;
  onPick: (v: T) => void;
  base: BaseId;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {groupOrder(base).map((g) => {
        const list = options.filter((o) => (o.group ?? "todos") === g);
        if (!list.length) return null;
        return (
          <div key={g} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="row" style={{ gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted-strong)" }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: GROUP_DOT[g] }} />
              {GROUP_LABELS[g]}
            </span>
            <Chips options={list} value={value} onPick={onPick} />
          </div>
        );
      })}
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

export function Appearance({ snap, go }: { snap: AppSnapshot; go: (v: View) => void }) {
  const current = snap.settings.avatar;
  const [draft, setDraft] = useState<AvatarConfig>(current);
  const [tab, setTab] = useState<Tab>("cabello");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameAvatar(draft, current);
  const set = (patch: Partial<AvatarConfig>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
    setError(null);
  };

  async function save() {
    try {
      const after = await lumi.updateSettings({ avatar: draft });
      // Si el proceso principal no reconoce alguna pieza (p. ej. sigue corriendo una versión
      // anterior de Lumi), la descarta en silencio: aquí lo detectamos y avisamos.
      if (!sameAvatar(after.settings.avatar, draft)) {
        setError("Lumi no pudo aplicar todo el look. Cierra Lumi (icono de la barra → Salir) y vuelve a abrirla para cargar la versión nueva.");
        return;
      }
      setSaved(true);
      setError(null);
    } catch (e) {
      setError(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
    }
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
        <ModeLookNote snap={snap} />

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
              <Group title="Colores Lumi">
                <Swatches options={BODIES.filter((b) => b.kind === "lumi")} value={draft.cuerpo} onPick={(cuerpo) => set({ cuerpo })} />
              </Group>
              <Group title="Tonos de piel">
                <Swatches options={BODIES.filter((b) => b.kind === "piel")} value={draft.cuerpo} onPick={(cuerpo) => set({ cuerpo })} />
              </Group>
              <Group title="Ojos">
                <Swatches options={EYE_COLORS} value={draft.ojos} onPick={(ojos) => set({ ojos })} />
              </Group>
              <Group title="Base">
                <Chips options={BASES} value={draft.base} onPick={(base) => set({ base, reunion: draft.reunion ? formalFor(base) : null })} />
                <span className="hint">Solo cambia pestañas y cejas. Cualquier ropa o peinado sirve en cualquier base.</span>
              </Group>
            </>
          )}
          {tab === "cabello" && (
            <>
              <Group title="Peinado">
                <GroupedChips options={HAIRS} value={draft.cabello} onPick={(cabello) => set({ cabello })} base={draft.base} />
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
                <GroupedChips options={OUTFITS} value={draft.prenda} onPick={(prenda) => set({ prenda })} base={draft.base} />
              </Group>
              <Group title="Color">
                <Swatches options={COLORS} value={draft.prendaColor} onPick={(prendaColor) => set({ prendaColor })} />
              </Group>
              <SwitchRow
                label="Ropa formal en reuniones"
                hint={`Lumi se pone ${OUTFITS.find((o) => o.id === formalFor(draft.base))?.label.toLowerCase()} sola cuando una reunión está por empezar`}
                checked={draft.reunion !== null}
                onChange={(v) => set({ reunion: v ? formalFor(draft.base) : null })}
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
              <SwitchRow
                label="Antena de Lumi"
                hint="Se esconde sola con gorra, gorro o boina"
                checked={draft.antena}
                onChange={(antena) => set({ antena })}
              />
              <Group title="Accesorio">
                <GroupedChips options={ACCESSORIES} value={draft.accesorio} onPick={(accesorio) => set({ accesorio })} base={draft.base} />
              </Group>
              <Group title="Color">
                <Swatches options={COLORS} value={draft.accesorioColor} onPick={(accesorioColor) => set({ accesorioColor })} />
              </Group>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, padding: "10px 16px 0", fontSize: 12.5, lineHeight: 1.4, color: "var(--danger)", borderTop: "1px solid var(--line)" }}>
          {error}
        </p>
      )}
      <div className="row" style={{ gap: 8, padding: "10px 16px 14px", borderTop: error ? undefined : "1px solid var(--line)" }}>
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

/** Si el modo activo tiene su propio look, se avisa: lo que se edita aquí es el look de siempre. */
function ModeLookNote({ snap }: { snap: AppSnapshot }) {
  const cfg = snap.settings.modes;
  const m = cfg.lista.find((x) => x.id === snap.mode.id);
  if (!m?.apariencia || cfg.lista.filter((x) => x.enabled).length < 2) return null;
  return (
    <div className="row" style={{ margin: "8px 16px 0", gap: 8, padding: "8px 10px", borderRadius: 12, background: "var(--sun-soft)" }}>
      <span className="grow" style={{ fontSize: 12.5, color: "var(--sun-ink)", lineHeight: 1.4 }}>
        Aquí editas tu look de siempre. En modo {m.nombre} {m.icono} me pongo encima un look propio.
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ minHeight: 30, padding: "0 6px", fontSize: 12.5 }}
        onClick={() => lumi.updateSettings({ modes: { lista: cfg.lista.map((x) => (x.id === m.id ? { ...x, apariencia: null } : x)) } })}
      >
        Quitar el de {m.nombre}
      </button>
    </div>
  );
}
