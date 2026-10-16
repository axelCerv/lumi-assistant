import { IconCheck } from "../components/Icons";
import { updateData } from "../lib/store";
import { whenLabel } from "../lib/time";
import type { Task } from "../lib/types";
import { TagChip } from "./ui";

export function toggleTask(id: string) {
  return updateData((d) => {
    const t = d.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
  });
}

export function TaskItem({ task, onOpen, now }: { task: Task; onOpen: (t: Task) => void; now: Date }) {
  const late = !task.done && task.remindAt && new Date(task.remindAt) < now;
  return (
    <div
      className="row"
      style={{
        alignItems: "flex-start",
        gap: 12,
        padding: "11px 12px",
        borderRadius: 14,
        border: "1px solid var(--line)",
        background: "#fff",
      }}
    >
      <button
        type="button"
        className={`check${task.done ? " done" : ""}`}
        aria-pressed={task.done}
        aria-label={task.done ? `Marcar «${task.text}» como pendiente` : `Marcar «${task.text}» como hecho`}
        onClick={() => toggleTask(task.id)}
        style={{ marginTop: 1 }}
      >
        {task.done && <IconCheck size={13} />}
      </button>
      <button
        type="button"
        onClick={() => onOpen(task)}
        title="Editar"
        style={{
          all: "unset",
          cursor: "pointer",
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
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
            {late ? `Atrasado · ${whenLabel(task.remindAt, now)}` : task.done ? `Hecho · ${whenLabel(task.doneAt, now)}` : whenLabel(task.remindAt, now)}
          </span>
          {task.contact && <span className="tag neutral">{task.contact}</span>}
          {task.tags.map((t) => (
            <TagChip key={t.kind + t.name} tag={t} />
          ))}
        </span>
      </button>
    </div>
  );
}
