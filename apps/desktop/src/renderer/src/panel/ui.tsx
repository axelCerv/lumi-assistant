import type { ReactNode } from "react";
import { IconBack } from "../components/Icons";
import type { Tag } from "@lumi/shared";

export function ViewHeader({ title, onBack, right, sub }: { title: string; onBack: () => void; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="row" style={{ padding: "14px 14px 10px", gap: 6, borderBottom: "1px solid var(--line)" }}>
      <button type="button" className="icon-btn plain" aria-label="Volver" onClick={onBack} style={{ width: 44, height: 44 }}>
        <IconBack size={20} />
      </button>
      <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--display)", fontSize: 20, fontWeight: 700 }}>{title}</h1>
        {sub}
      </div>
      {right}
    </div>
  );
}

export function TagChip({ tag, onRemove, big }: { tag: Tag; onRemove?: () => void; big?: boolean }) {
  if (onRemove) {
    return (
      <button
        type="button"
        className={`tag ${tag.kind}${big ? " big" : ""}`}
        onClick={onRemove}
        aria-label={`Quitar etiqueta ${tag.name}`}
        title="Quitar"
      >
        {tag.kind === "cliente" ? "Cliente" : "Proyecto"} · {tag.name}
        <span aria-hidden="true" style={{ opacity: 0.6, marginLeft: 2 }}>
          ×
        </span>
      </button>
    );
  }
  return <span className={`tag ${tag.kind}${big ? " big" : ""}`}>{tag.name}</span>;
}

export function Card({ children, tone = "plain", style }: { children: ReactNode; tone?: "plain" | "lavender" | "sun"; style?: React.CSSProperties }) {
  const tones = {
    plain: { background: "#fff", border: "1px solid var(--line)" },
    lavender: { background: "var(--lavender)", border: "0" },
    sun: { background: "var(--sun-soft)", border: "0" },
  } as const;
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="row" style={{ gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid var(--line)", cursor: "pointer" }}>
      <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Dots() {
  return (
    <span className="row" style={{ gap: 4 }} aria-label="Pensando">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            background: "var(--indigo)",
            animation: `lumi-dots 1.2s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
    </span>
  );
}
