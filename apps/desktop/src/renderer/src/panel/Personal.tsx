/** Modo Personal: tu día, pagos y recibos, cumpleaños y listas. */
import { useState } from "react";
import { dayLabel, MONTHS, type AppSnapshot, type PaymentInfo } from "@lumi/shared";
import { IconCheck, IconOpen, IconTrash } from "../components/Icons";
import { lumi } from "../lib/api";
import { Msg } from "./connect";
import { ViewHeader } from "./ui";
import { DayCard, HabitsCard } from "./widgets";
import type { View } from "./main";

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const small = { minHeight: 28, padding: "0 4px", fontSize: 12.5 } as const;
const dateLabel = (key: string, now: Date) => dayLabel(new Date(`${key}T12:00`), now);

export function Personal({ snap, go, now, list }: { snap: AppSnapshot; go: (v: View) => void; now: Date; list?: string }) {
  return (
    <>
      <ViewHeader title="Personal 🏡" onBack={() => go({ name: "home" })} sub={<span className="hint">Vive en 20-Personal de tu vault</span>} />
      <div className="scroll" style={{ flex: 1, padding: "8px 16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <PersonalBody snap={snap} go={go} now={now} list={list} />
      </div>
    </>
  );
}

export function PersonalBody({ snap, go, now, list }: { snap: AppSnapshot; go: (v: View) => void; now: Date; list?: string }) {
  return (
    <>
      <DayCard snap={snap} now={now} />
      <HabitsCard snap={snap} now={now} go={go} />
      <Lists snap={snap} initial={list} />
      <Payments snap={snap} now={now} />
      <Birthdays snap={snap} now={now} />
    </>
  );
}

/* ------------------------------ Listas ------------------------------ */

function Lists({ snap, initial }: { snap: AppSnapshot; initial?: string }) {
  const lists = snap.personal.lists;
  const [sel, setSel] = useState<string | null>(initial ?? lists[0]?.path ?? null);
  const [item, setItem] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cur = lists.find((l) => l.path === sel) ?? lists[0] ?? null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!cur || !item.trim()) return;
    const r = await lumi.addListItem(cur.path, item);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude agregarlo" });
    setItem("");
    setMsg(null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await lumi.createList(newName);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude crearla" });
    setSel(r.value ?? null);
    setNewName("");
    setCreating(false);
  }

  return (
    <Section
      title="Listas"
      action={
        <button type="button" className="btn btn-ghost" style={small} onClick={() => setCreating(!creating)}>
          {creating ? "Cancelar" : "+ Nueva lista"}
        </button>
      }
    >
      {creating && (
        <form onSubmit={create} className="row" style={{ gap: 6 }}>
          <label htmlFor="lista-nombre" className="sr-only">
            Nombre de la lista
          </label>
          <input id="lista-nombre" className="input" placeholder="Súper, Casa, Regalos…" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>
            Crear
          </button>
        </form>
      )}
      {lists.length === 0 && !creating && <span className="hint">Aún no tienes listas. Crea la del súper o pídele a Lumi «agrega leche al súper».</span>}
      {lists.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }} role="tablist" aria-label="Listas">
          {lists.map((l) => (
            <button key={l.path} type="button" role="tab" aria-selected={cur?.path === l.path} className={`tag big ${cur?.path === l.path ? "selected-dark" : "neutral"}`} onClick={() => setSel(l.path)}>
              {l.name} · {l.items.filter((i) => !i.done).length}
            </button>
          ))}
        </div>
      )}
      {cur && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: 14, border: "1px solid var(--line)" }}>
          {cur.items.length === 0 && <span className="hint">Lista vacía.</span>}
          {cur.items.map((i) => (
            <div key={i.line} className="row" style={{ gap: 10 }}>
              <button
                type="button"
                className={`check${i.done ? " done" : ""}`}
                aria-pressed={i.done}
                aria-label={i.done ? `Desmarcar ${i.text}` : `Marcar ${i.text}`}
                onClick={async () => {
                  const r = await lumi.toggleListItem(cur.path, i.line);
                  if (!r.ok) setMsg({ ok: false, text: r.error ?? "" });
                }}
              >
                {i.done && <IconCheck size={13} />}
              </button>
              <span style={{ fontSize: 14.5, textDecoration: i.done ? "line-through" : "none", color: i.done ? "var(--muted)" : "var(--ink)" }}>{i.text}</span>
            </div>
          ))}
          <form onSubmit={add} className="row" style={{ gap: 6, marginTop: 4 }}>
            <label htmlFor="lista-item" className="sr-only">
              Agregar a {cur.name}
            </label>
            <input id="lista-item" className="input" placeholder="Agregar (separa con comas)" value={item} onChange={(e) => setItem(e.target.value)} />
            <button type="submit" className="btn btn-primary" disabled={!item.trim()}>
              Agregar
            </button>
          </form>
          <div className="row" style={{ gap: 6 }}>
            {cur.items.some((i) => i.done) && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ paddingLeft: 0 }}
                onClick={async () => {
                  const r = await lumi.clearList(cur.path);
                  setMsg(r.ok ? { ok: true, text: `Quité ${r.value} marcados.` } : { ok: false, text: r.error ?? "" });
                }}
              >
                Quitar lo marcado
              </button>
            )}
            <span className="grow" />
            <button type="button" className="icon-btn plain" aria-label={`Abrir ${cur.name} en Obsidian`} onClick={() => lumi.openInObsidian(cur.path)} style={{ width: 32, height: 32 }}>
              <IconOpen size={15} />
            </button>
          </div>
        </div>
      )}
      <Msg m={msg} />
    </Section>
  );
}

/* ------------------------------ Pagos ------------------------------ */

function Payments({ snap, now }: { snap: AppSnapshot; now: Date }) {
  const list = snap.personal.payments;
  const [editing, setEditing] = useState<{ line: number | null; name: string; day: string; annual: boolean; month: string; amount: string; lead: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const start = (p?: PaymentInfo) =>
    setEditing({
      line: p?.line ?? null,
      name: p?.name ?? "",
      day: String(p?.day ?? ""),
      annual: !!p?.month,
      month: String(p?.month ?? now.getMonth() + 1),
      amount: p?.amount ?? "",
      lead: String(p?.lead ?? 2),
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const r = await lumi.savePayment(
      { name: editing.name, day: parseInt(editing.day, 10), month: editing.annual ? parseInt(editing.month, 10) : null, amount: editing.amount, lead: parseInt(editing.lead, 10) || 0 },
      editing.line,
    );
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude guardarlo" });
    setEditing(null);
    setMsg(null);
  }

  return (
    <Section
      title="Pagos y recibos"
      action={
        !editing && (
          <button type="button" className="btn btn-ghost" style={small} onClick={() => start()}>
            + Agregar
          </button>
        )
      }
    >
      {editing && (
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "var(--surface)" }}>
          <div>
            <label htmlFor="pago-nombre" className="field-label">
              ¿Qué se paga?
            </label>
            <input id="pago-nombre" className="input" style={{ background: "#fff" }} placeholder="Renta, luz, tarjeta (fecha de pago), Netflix…" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
          </div>
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 84 }}>
              <label htmlFor="pago-dia" className="field-label">
                Día
              </label>
              <input id="pago-dia" type="number" min={1} max={31} className="input" style={{ background: "#fff" }} value={editing.day} onChange={(e) => setEditing({ ...editing, day: e.target.value })} />
            </div>
            <label className="row" style={{ gap: 6, fontSize: 13, fontWeight: 600, height: 40 }}>
              <input type="checkbox" checked={editing.annual} onChange={(e) => setEditing({ ...editing, annual: e.target.checked })} />
              Cada año
            </label>
            {editing.annual && (
              <div className="grow">
                <label htmlFor="pago-mes" className="field-label">
                  Mes
                </label>
                <select id="pago-mes" className="select" style={{ background: "#fff" }} value={editing.month} onChange={(e) => setEditing({ ...editing, month: e.target.value })}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="grow">
              <label htmlFor="pago-monto" className="field-label">
                Monto (opcional)
              </label>
              <input id="pago-monto" className="input" style={{ background: "#fff" }} placeholder="$8,500" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
            </div>
            <div style={{ width: 120 }}>
              <label htmlFor="pago-aviso" className="field-label">
                Avisar días antes
              </label>
              <input id="pago-aviso" type="number" min={0} max={15} className="input" style={{ background: "#fff" }} value={editing.lead} onChange={(e) => setEditing({ ...editing, lead: e.target.value })} />
            </div>
          </div>
          <span className="hint">Nunca escribas números de tarjeta o de cuenta: si se cuelan, Lumi los tapa.</span>
          <Msg m={msg} />
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={!editing.name.trim() || !editing.day}>
              Guardar
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {list.length === 0 && !editing && <span className="hint">Registra renta, luz, internet, tarjeta o suscripciones y te aviso unos días antes.</span>}
      {list.map((p) => (
        <div key={p.line} className="row" style={{ gap: 8, padding: "8px 6px 8px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
          <button type="button" onClick={() => start(p)} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }} title="Editar">
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>
              {p.name}
              {p.amount ? <span style={{ fontWeight: 500, color: "var(--muted-strong)" }}> · {p.amount}</span> : null}
            </span>
            <span className="hint">
              {p.month ? `Cada año, ${p.day} de ${MONTHS[p.month - 1]}` : `Cada mes, el día ${p.day}`} · {p.daysLeft === 0 ? "hoy" : `${dateLabel(p.next, now)} (${p.daysLeft} d)`}
            </span>
          </button>
          <button type="button" className="icon-btn plain" aria-label={`Quitar ${p.name}`} onClick={() => lumi.deletePayment(p.line)} style={{ width: 32, height: 32 }}>
            <IconTrash size={15} />
          </button>
        </div>
      ))}
      {list.length > 0 && (
        <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => lumi.openInObsidian(snap.personal.paymentsPath)}>
          Abrir Pagos.md en Obsidian
        </button>
      )}
    </Section>
  );
}

/* ------------------------------ Cumpleaños ------------------------------ */

function Birthdays({ snap, now }: { snap: AppSnapshot; now: Date }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Section
      title="Cumpleaños"
      action={
        <button type="button" className="btn btn-ghost" style={small} onClick={() => setAdding(!adding)}>
          {adding ? "Cancelar" : "+ Agregar"}
        </button>
      }
    >
      {adding && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await lumi.setBirthday(name, date);
            if (!r.ok) return setMsg({ ok: false, text: r.error ?? "No pude guardarlo" });
            setName("");
            setDate("");
            setAdding(false);
            setMsg({ ok: true, text: "Guardado en su nota de 06-Personas." });
          }}
          className="row wrap"
          style={{ gap: 6, padding: 12, borderRadius: 14, background: "var(--surface)" }}
        >
          <label htmlFor="cumple-nombre" className="sr-only">
            Nombre
          </label>
          <input id="cumple-nombre" className="input grow" style={{ background: "#fff", minWidth: 140 }} placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <label htmlFor="cumple-fecha" className="sr-only">
            Fecha
          </label>
          <input id="cumple-fecha" className="input" style={{ background: "#fff", width: 130 }} placeholder="15/03" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || !date.trim()}>
            Guardar
          </button>
        </form>
      )}
      <Msg m={msg} />
      {snap.personal.birthdays.length === 0 && !adding && <span className="hint">Te aviso unos días antes y el mismo día. Se guardan en la nota de cada persona (campo «cumple»).</span>}
      {snap.personal.birthdays.map((b) => (
        <div key={b.path} className="row" style={{ gap: 8, padding: "8px 6px 8px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
          <span className="grow" style={{ fontSize: 14.5, fontWeight: 600 }}>
            {b.name}
            {b.age ? <span className="hint"> · cumple {b.age}</span> : null}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: b.daysLeft <= 3 ? "var(--sun-ink)" : "var(--muted)" }}>{b.daysLeft === 0 ? "¡Hoy! 🎂" : `${dateLabel(b.date, now)} · ${b.daysLeft} d`}</span>
          <button type="button" className="icon-btn plain" aria-label={`Abrir la nota de ${b.name}`} onClick={() => lumi.openInObsidian(b.path)} style={{ width: 32, height: 32 }}>
            <IconOpen size={15} />
          </button>
        </div>
      ))}
    </Section>
  );
}
