/**
 * Selector de cliente → proyecto. Un solo campo: primero el cliente, luego
 * (opcional) uno de sus proyectos. Con buscador, frecuentes arriba y teclado.
 * Un proyecto siempre queda dentro de un cliente.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { slugify, stripAccents, type Entity, type Task } from "@lumi/shared";
import { IconArrow, IconBack, IconClose, IconPlus, IconSearch } from "../components/Icons";
import { lumi } from "../lib/api";

export interface ClientProject {
  client: string | null;
  project: string | null;
}

type Option =
  | { type: "client"; name: string; projects: number; isNew?: boolean }
  | { type: "project"; name: string; client: string | null; isNew?: boolean }
  | { type: "only-client"; name: string };

const norm = (s: string) => stripAccents(s).toLowerCase().trim();

export function ClientPicker({
  entities,
  tasks,
  value,
  onChange,
  label = "Cliente y proyecto",
}: {
  entities: Entity[];
  tasks: Task[];
  value: ClientProject;
  onChange: (v: ClientProject) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  /** Paso 2: proyectos de este cliente. «assign» = el proyecto elegido no tenía cliente. */
  const [step, setStep] = useState<{ kind: "projects"; client: string } | { kind: "assign"; project: string } | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const field = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const clients = useMemo(() => entities.filter((e) => e.kind === "cliente").sort((a, b) => a.name.localeCompare(b.name, "es")), [entities]);
  const projects = useMemo(() => entities.filter((e) => e.kind === "proyecto").sort((a, b) => a.name.localeCompare(b.name, "es")), [entities]);
  const projectsOf = (client: string) => projects.filter((p) => p.client && slugify(p.client) === slugify(client));

  // Los que más usas (por tus pendientes) salen arriba
  const frequent = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of tasks) for (const g of t.tags) if (g.kind === "cliente") count.set(slugify(g.name), (count.get(slugify(g.name)) ?? 0) + 1);
    return clients
      .filter((c) => count.has(c.slug))
      .sort((a, b) => (count.get(b.slug) ?? 0) - (count.get(a.slug) ?? 0))
      .slice(0, 4);
  }, [clients, tasks]);

  const options: Option[] = useMemo(() => {
    const term = norm(q);
    if (step?.kind === "projects") {
      const ps = projectsOf(step.client).filter((p) => !term || norm(p.name).includes(term));
      const out: Option[] = [{ type: "only-client", name: step.client }, ...ps.map((p) => ({ type: "project" as const, name: p.name, client: step.client }))];
      if (term && !ps.some((p) => norm(p.name) === term)) out.push({ type: "project", name: q.trim(), client: step.client, isNew: true });
      return out;
    }
    if (step?.kind === "assign") {
      const cs = clients.filter((c) => !term || norm(c.name).includes(term));
      const out: Option[] = cs.map((c) => ({ type: "client", name: c.name, projects: projectsOf(c.name).length }));
      if (term && !cs.some((c) => norm(c.name) === term)) out.push({ type: "client", name: q.trim(), projects: 0, isNew: true });
      return out;
    }
    if (!term) {
      const rest = clients.filter((c) => !frequent.includes(c));
      return [...frequent, ...rest].map((c) => ({ type: "client" as const, name: c.name, projects: projectsOf(c.name).length }));
    }
    const cs = clients.filter((c) => norm(c.name).includes(term));
    const ps = projects.filter((p) => norm(p.name).includes(term) || (p.client && norm(p.client).includes(term) && !cs.length));
    const out: Option[] = [
      ...cs.map((c) => ({ type: "client" as const, name: c.name, projects: projectsOf(c.name).length })),
      ...ps.slice(0, 40).map((p) => ({ type: "project" as const, name: p.name, client: p.client ?? null })),
    ];
    if (!cs.some((c) => norm(c.name) === term)) out.push({ type: "client", name: q.trim(), projects: 0, isNew: true });
    return out;
  }, [q, step, clients, projects, frequent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setActive(0), [q, step]);
  // Clic fuera del selector: se cierra sin cambiar nada
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (pop.current && !pop.current.contains(e.target as Node)) {
        setOpen(false);
        setStep(null);
        setQ("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    // Que la lista se vea completa dentro del menú (no cortada abajo)
    requestAnimationFrame(() => pop.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [open, step]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function close() {
    setOpen(false);
    setStep(null);
    setQ("");
    field.current?.focus();
  }

  function choose(o: Option) {
    if (o.type === "only-client") {
      onChange({ client: o.name, project: null });
      return close();
    }
    if (o.type === "client") {
      if (step?.kind === "assign") {
        // El proyecto que no tenía cliente queda dentro de este (si ya existía, se recuerda)
        if (projects.some((p) => slugify(p.name) === slugify(step.project))) void lumi.catalogAssign(step.project, o.name);
        onChange({ client: o.name, project: step.project });
        return close();
      }
      // Cliente con proyectos: segundo paso; sin proyectos, listo (se puede crear uno)
      setQ("");
      setStep({ kind: "projects", client: o.name });
      return;
    }
    if (!o.client) {
      setQ("");
      setStep({ kind: "assign", project: o.name });
      return;
    }
    onChange({ client: o.client, project: o.name });
    close();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[active];
      if (o) choose(o);
    } else if (e.key === "Escape") {
      // Que Escape no cierre todo el menú: solo el selector (o regresa un paso)
      e.preventDefault();
      e.stopPropagation();
      if (step) {
        setStep(null);
        setQ("");
      } else close();
    } else if (e.key === "Backspace" && !q && step) {
      setStep(null);
    }
  }

  const listId = "cp-opciones";
  const summary = value.client ? (value.project ? `${value.client} › ${value.project}` : value.client) : null;
  const noClientProject = !value.client && value.project;

  return (
    <div>
      <span id="cp-label" className="field-label" style={{ color: "var(--muted-strong)" }}>
        {label}
      </span>
      {!open ? (
        <div className="row" style={{ gap: 6 }}>
          <button
            ref={field}
            type="button"
            className="cp-field grow"
            aria-labelledby="cp-label"
            aria-haspopup="listbox"
            aria-expanded={false}
            onClick={() => {
              setOpen(true);
              setStep(value.client ? { kind: "projects", client: value.client } : null);
            }}
          >
            {summary ? (
              <span className="row" style={{ gap: 6, minWidth: 0, flexWrap: "wrap" }}>
                <span className="tag cliente big">{value.client}</span>
                {value.project && (
                  <>
                    <span aria-hidden="true" style={{ color: "var(--muted)" }}>
                      ›
                    </span>
                    <span className="tag proyecto big">{value.project}</span>
                  </>
                )}
              </span>
            ) : noClientProject ? (
              <span style={{ color: "var(--sun-ink)", fontWeight: 600 }}>«{value.project}»: falta elegir su cliente</span>
            ) : (
              <span style={{ color: "var(--muted)" }}>{clients.length ? "Elegir cliente…" : "Sin cliente · escribe uno nuevo"}</span>
            )}
            <span aria-hidden="true" style={{ marginLeft: "auto", color: "var(--muted)", display: "flex" }}>
              <IconArrow size={16} />
            </span>
          </button>
          {(value.client || value.project) && (
            <button type="button" className="icon-btn plain" aria-label="Quitar cliente y proyecto" title="Quitar" onClick={() => onChange({ client: null, project: null })} style={{ width: 36, height: 36 }}>
              <IconClose size={14} />
            </button>
          )}
        </div>
      ) : (
        <div ref={pop} className="cp-pop" onKeyDown={onKey}>
          <div className="row" style={{ gap: 6, padding: 8, borderBottom: "1px solid var(--line)" }}>
            {step ? (
              <button type="button" className="icon-btn plain" aria-label="Volver a clientes" onClick={() => (setStep(null), setQ(""))} style={{ width: 32, height: 32, flex: "none" }}>
                <IconBack size={16} />
              </button>
            ) : (
              <span aria-hidden="true" style={{ display: "flex", padding: "0 4px 0 6px", color: "var(--muted)" }}>
                <IconSearch size={16} />
              </span>
            )}
            <input
              ref={input}
              className="cp-search grow"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={options[active] ? `cp-op-${active}` : undefined}
              aria-label={step?.kind === "projects" ? `Buscar o crear un proyecto de ${step.client}` : step?.kind === "assign" ? `¿De qué cliente es ${step.project}?` : "Buscar un cliente o proyecto"}
              placeholder={step?.kind === "projects" ? `Proyecto de ${step.client}…` : step?.kind === "assign" ? `¿De qué cliente es «${step.project}»?` : "Busca un cliente o proyecto…"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="button" className="btn btn-ghost" style={{ minHeight: 32, padding: "0 8px", fontSize: 12.5 }} onClick={close}>
              Listo
            </button>
          </div>
          {step && (
            <div className="hint" style={{ padding: "8px 12px 0" }}>
              {step.kind === "projects" ? (
                <>
                  Cliente: <strong style={{ color: "var(--cliente-fg)" }}>{step.client}</strong> · elige un proyecto o déjalo sin proyecto
                </>
              ) : (
                <>Un proyecto siempre va dentro de un cliente. ¿De cuál es «{step.project}»? Lo recordaré.</>
              )}
            </div>
          )}
          <ul ref={list} id={listId} role="listbox" aria-label="Opciones" className="cp-list">
            {!step && !q && frequent.length > 0 && <li className="cp-group" role="presentation">Los que más usas</li>}
            {options.map((o, i) => {
              const header = !step && !q && frequent.length > 0 && i === frequent.length ? <li key="todos" className="cp-group" role="presentation">Todos</li> : null;
              const selected =
                (o.type === "client" && !step && value.client === o.name) ||
                (o.type === "project" && value.project === o.name) ||
                (o.type === "only-client" && value.client === o.name && !value.project);
              return (
                <Fragment key={`${o.type}:${o.name}:${i}`}>
                  {header}
                  <li
                    id={`cp-op-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={selected}
                    className={`cp-option${i === active ? " active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                  >
                    {o.type === "only-client" ? (
                      <span className="grow" style={{ fontWeight: 600 }}>
                        Solo {o.name} <span style={{ color: "var(--muted)", fontWeight: 500 }}>(sin proyecto)</span>
                      </span>
                    ) : o.isNew ? (
                      <span className="grow row" style={{ gap: 8, color: "var(--indigo-deep)", fontWeight: 600 }}>
                        <IconPlus size={14} />
                        {o.type === "client" ? `Nuevo cliente «${o.name}»` : `Nuevo proyecto «${o.name}» en ${o.client}`}
                      </span>
                    ) : o.type === "client" ? (
                      <>
                        <span className="cp-dot cliente" aria-hidden="true" />
                        <span className="grow" style={{ fontWeight: 600 }}>
                          {o.name}
                        </span>
                        {step?.kind !== "assign" && (
                          <span className="hint">
                            {o.projects ? `${o.projects} ${o.projects === 1 ? "proyecto" : "proyectos"}` : "sin proyectos"} ›
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="cp-dot proyecto" aria-hidden="true" />
                        <span className="grow">{o.name}</span>
                        {!step && <span className="hint">{o.client ?? "sin cliente"}</span>}
                      </>
                    )}
                    {selected && (
                      <span aria-hidden="true" style={{ color: "var(--indigo)", fontWeight: 700 }}>
                        ✓
                      </span>
                    )}
                  </li>
                </Fragment>
              );
            })}
            {!options.length && (
              <li className="hint" style={{ padding: 12 }} role="presentation">
                Escribe el nombre para crear uno nuevo.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
