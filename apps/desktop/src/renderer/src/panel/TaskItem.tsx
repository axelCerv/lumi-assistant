import { useState } from "react";
import type { Task } from "@lumi/shared";
import { whenLabel } from "@lumi/shared";
import { IconCheck, IconOpen } from "../components/Icons";
import { lumi } from "../lib/api";
import { TagChip } from "./ui";

/** «Acme › Sitio web» en una sola etiqueta (el proyecto va dentro de su cliente). */
function ClientChip({ task }: { task: Task }) {
  const client = task.tags.find((t) => t.kind === "cliente");
  const project = task.tags.find((t) => t.kind === "proyecto");
  if (!client && !project) return null;
  if (client && project) {
    return (
      <span className="tag cliente" title={`Cliente ${client.name} · proyecto ${project.name}`}>
        {client.name}
        <span aria-hidden="true" style={{ opacity: 0.55 }}>
          ›
        </span>
        <span style={{ color: "var(--proyecto-fg)" }}>{project.name}</span>
      </span>
    );
  }
  return <TagChip tag={(client ?? project)!} />;
}

export function TaskItem({ task, onOpen, now, badge }: { task: Task; onOpen: (t: Task) => void; now: Date; badge?: string | null }) {
  const [busy, setBusy] = useState(false);
  const late = !task.done && !task.daily && task.remindAt && new Date(task.remindAt) < now;
  const where = task.path.split("/").pop()?.replace(/\.md$/, "");
  return (
    <div className="row task-row" style={{ alignItems: "flex-start", gap: 12, padding: "11px 8px 11px 12px", borderRadius: 14, border: "1px solid var(--line)", background: "#fff" }}>
      <button
        type="button"
        className={`check${task.done ? " done" : ""}`}
        aria-pressed={task.done}
        aria-label={task.done ? `Marcar «${task.text}» como pendiente` : `Marcar «${task.text}» como hecho`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await lumi.toggleTask(task.key);
          setBusy(false);
        }}
        style={{ marginTop: 1 }}
      >
        {task.done && <IconCheck size={13} />}
      </button>
      <button
        type="button"
        onClick={() => onOpen(task)}
        title="Editar"
        style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}
      >
        <span
          style={{
            fontSize: 14.5,
            fontWeight: 500,
            lineHeight: 1.35,
            textDecoration: task.done ? "line-through" : "none",
            color: task.done ? "var(--muted)" : "var(--ink)",
            overflowWrap: "anywhere",
          }}
        >
          {task.text}
        </span>
        <span className="row wrap" style={{ gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: late ? "var(--sun-ink)" : "var(--muted)" }}>
            {task.daily && !task.done
              ? `🔔 Cada día${task.time ? ` · ${task.time}` : ""}`
              : late
                ? `Atrasado · ${whenLabel(task.remindAt, now)}`
                : task.done
                  ? `Hecho${task.doneDate ? ` · ${task.doneDate}` : ""}`
                  : task.remindAt
                    ? whenLabel(task.remindAt, now)
                    : "Sin fecha"}
          </span>
          {badge && (
            <span className="tag neutral" title="De otro modo">
              {badge}
            </span>
          )}
          {task.subject && <span className="tag neutral">📘 {task.subject}</span>}
          {task.category && <span className="tag neutral">{task.category}</span>}
          <ClientChip task={task} />
          {!task.lumiFile && where && <span className="tag neutral">{where}</span>}
        </span>
      </button>
      <button type="button" className="icon-btn plain" aria-label={`Abrir «${where}» en Obsidian`} title="Abrir en Obsidian" onClick={() => lumi.openInObsidian(task.path)} style={{ width: 32, height: 32 }}>
        <IconOpen size={15} />
      </button>
    </div>
  );
}
