/**
 * Arma el contexto que se envía a la IA, con un presupuesto fijo:
 * perfil + preferencias + nota diaria de hoy + agenda 48 h + pendientes +
 * último resumen + memoria + fragmentos recuperados para la pregunta.
 * Nunca incluye notas privadas ni carpetas de .lumiignore.
 */
import type { ActiveMode, ChatSource, Meeting, SearchHit, Task } from "@lumi/shared";
import {
  addDays,
  dayLabel,
  daysText,
  describeAvatar,
  enabledModes,
  fmtTime,
  formatClassSlot,
  inScope,
  longDate,
  modeById,
  modeFile,
  modeLook,
  startOfDay,
  whenLabel,
} from "@lumi/shared";
import type { Brain } from "../vault/brain";
import { FILES, FOLDERS } from "../vault/structure";
import { today } from "../vault/vault";
import { getSettings } from "../settings";

const BUDGET = 48_000; // ~12k tokens

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function tagText(t: Task): string {
  const tags = t.tags.map((g) => `${g.kind}: ${g.name}`);
  return tags.length ? ` [${tags.join(", ")}]` : "";
}

export function obsidianUrl(vaultName: string, rel: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(rel.replace(/\.md$/, ""))}`;
}

export interface BuiltContext {
  text: string;
  sources: ChatSource[];
  hits: SearchHit[];
}

/** El modo de una reunión: el de su calendario (si lo asignaste) o compartida. */
export function meetingMode(m: Meeting): string | null {
  return getSettings().modes.calendarios[m.calendar] ?? null;
}

export interface ContextScope {
  /** Modo activo; sin él, todo cuenta (comportamiento de siempre). */
  mode?: ActiveMode | null;
  /** Vista «Todo»: no filtra por modo. */
  all?: boolean;
}

export async function buildContext(brain: Brain | null, meetings: Meeting[], query: string | null, scope: ContextScope = {}): Promise<BuiltContext> {
  const s = getSettings();
  const now = new Date();
  const sections: { title: string; body: string; max: number }[] = [];
  const sources: ChatSource[] = [];
  const modes = enabledModes(s.modes);
  const active = scope.mode && modes.length > 1 ? scope.mode : null;
  const all = !active || !!scope.all;
  const visible = (m: string | null | undefined) => (active ? inScope(m, active.id, all) : true);
  const modeDef = active ? modeById(s.modes, active.id) : null;

  sections.push({
    title: "Ahora",
    body: `${longDate(now)} de ${now.getFullYear()}, ${fmtTime(now)} (hora local).${s.userName ? ` El usuario se llama ${s.userName}.` : ""} Tu apariencia actual (Lumi): ${describeAvatar(modeLook(s.avatar, s.modes, active?.id))}.${
      active
        ? ` Modo actual: ${active.text}. Modos que usa: ${modes.map((m) => `${m.nombre} ${m.icono}`).join(", ")}.${all ? " Vista «Todo»: ves lo de todos los modos." : " Solo ves lo de este modo y lo compartido (diario, personas, inbox)."}`
        : ""
    }`,
    max: 600,
  });

  if (brain) {
    if (modeDef) {
      const file = await brain.readForAI(modeFile(modeDef.id));
      if (file) sections.push({ title: `Cómo ser en el modo ${modeDef.nombre} (${modeFile(modeDef.id)})`, body: file.text, max: 3000 });
    }
    const perfil = await brain.readForAI(FILES.perfil);
    if (perfil) sections.push({ title: "Perfil del usuario (90-Lumi/perfil.md)", body: perfil.text, max: 3500 });
    const prefs = await brain.readForAI(FILES.preferencias);
    if (prefs) sections.push({ title: "Preferencias (90-Lumi/preferencias.md)", body: prefs.text, max: 1500 });
    const daily = await brain.readForAI(`${FOLDERS.diario}/${today()}.md`);
    if (daily) sections.push({ title: "Nota diaria de hoy", body: daily.text, max: 2500 });
  }

  const end48 = now.getTime() + 48 * 3600_000;
  const agenda = meetings.filter((m) => new Date(m.end).getTime() > now.getTime() && new Date(m.start).getTime() < end48 && visible(meetingMode(m)));
  sections.push({
    title: "Agenda de las próximas 48 horas",
    body: agenda.length
      ? agenda
          .map((m) => `- ${m.allDay ? `${dayLabel(new Date(m.start), now)} (todo el día)` : whenLabel(m.start, now)}: ${m.title}${m.attendees.length ? ` · con ${m.attendees.slice(0, 6).join(", ")}` : ""}`)
          .join("\n")
      : "(sin reuniones o calendario sin conectar)",
    max: 3000,
  });

  if (brain) {
    const horizon = addDays(startOfDay(now), 8).getTime();
    const tasks = brain
      .tasks()
      .filter((t) => !t.done && !t.private && visible(t.mode))
      .sort((a, b) => (a.remindAt ?? "9").localeCompare(b.remindAt ?? "9"));
    const relevant = tasks.filter((t) => !t.remindAt || new Date(t.remindAt).getTime() < horizon).slice(0, 50);
    sections.push({
      title: "Pendientes (atrasados, próximos y sin fecha)",
      body: relevant.length
        ? relevant
            .map((t) => {
              const late = t.remindAt && new Date(t.remindAt) < now ? " (ATRASADO)" : "";
              return `- ${t.text} — ${t.remindAt ? whenLabel(t.remindAt, now) : "sin fecha"}${late}${tagText(t)}${t.subject ? ` [materia: ${t.subject}]` : ""}${t.category ? ` [categoría: ${t.category}]` : ""}${all && t.mode ? ` [modo: ${t.mode}]` : ""} · nota: ${t.path}`;
            })
            .join("\n")
        : "(ninguno)",
      max: 6000,
    });

    const routines = brain.routines().filter((r) => r.active && visible(r.mode));
    if (routines.length) sections.push({ title: "Rutinas", body: routines.map((r) => `- ${r.title}: ${daysText(r.days)} a las ${r.time}`).join("\n"), max: 1500 });

    const summary = brain.summaries().find((x) => x.kind === "semanal");
    if (summary) {
      const sm = await brain.readForAI(summary.path);
      if (sm) sections.push({ title: `Último resumen semanal (${summary.path})`, body: sm.text, max: 3000 });
    }

    const facts = brain
      .facts()
      .filter((f) => visible(f.mode))
      .slice(-120);
    if (facts.length) sections.push({ title: "Memoria confirmada (90-Lumi/memoria)", body: facts.map((f) => `- [${f.topic}] ${f.text}`).join("\n"), max: 6000 });

    if (modes.some((m) => m.id === "escuela") && visible("escuela")) {
      const subjects = brain.subjects();
      if (subjects.length) {
        const cycle = brain.cycle();
        sections.push({
          title: `Materias${cycle ? ` (${cycle.name}${cycle.start && cycle.end ? `, del ${cycle.start} al ${cycle.end}` : ""})` : ""}`,
          body: subjects
            .map((x) => `- ${x.name}${x.teacher ? ` · profesor: ${x.teacher}` : ""}${x.slots.length ? ` · ${x.slots.map(formatClassSlot).join(", ")}` : ""} · IA permitida por el profesor: ${x.aiAllowed ? "sí" : "no (solo explicar, guiar y revisar)"} · nota: ${x.path}`)
            .join("\n"),
          max: 2500,
        });
      }
    }

    if (modes.some((m) => m.id === "personal") && visible("personal")) {
      const pays = brain.payments(now).filter((p) => p.daysLeft <= 10);
      const bdays = brain.birthdays(now).filter((b) => b.daysLeft <= 14);
      const lists = brain.lists();
      const lines = [
        ...pays.map((p) => `- Pago: ${p.name}${p.amount ? ` (${p.amount})` : ""} — ${dayLabel(new Date(`${p.next}T12:00`), now)}`),
        ...bdays.map((b) => `- Cumpleaños de ${b.name} — ${dayLabel(new Date(`${b.date}T12:00`), now)}${b.age ? ` (cumple ${b.age})` : ""}`),
        ...(lists.length ? [`- Listas: ${lists.map((l) => `${l.name} (${l.items.filter((i) => !i.done).length} por comprar/hacer)`).join(", ")}`] : []),
      ];
      if (lines.length) sections.push({ title: "Vida personal (próximos días)", body: lines.join("\n"), max: 2000 });
    }

    const ents = brain.entities().filter((e) => visible(brain.modeOfPath(e.path)));
    if (ents.length) {
      sections.push({
        title: "Clientes, proyectos y personas conocidos",
        body: ["cliente", "proyecto", "persona"]
          .map((k) => {
            const names = ents.filter((e) => e.kind === k).map((e) => e.name);
            return names.length ? `${k}s: ${names.slice(0, 80).join(", ")}` : "";
          })
          .filter(Boolean)
          .join("\n"),
        max: 2500,
      });
    }
  }

  let hits: SearchHit[] = [];
  if (brain && query) {
    hits = await brain.searcher.search(query, { k: 8, filter: active && !all ? (n) => visible(brain.modeOf(n.path, n.fm, n.tags)) : undefined });
    if (hits.length) {
      sections.push({
        title: "Fragmentos del vault relacionados con la pregunta",
        body: hits.map((h) => `### ${h.title}${h.heading ? ` › ${h.heading}` : ""} (${h.path})\n${h.snippet}`).join("\n\n"),
        max: 9000,
      });
      for (const h of hits) if (!sources.some((x) => x.path === h.path)) sources.push({ path: h.path, title: h.title });
    }
  }

  // Aplica el presupuesto total en el orden de prioridad de arriba
  let used = 0;
  const parts: string[] = [];
  for (const sec of sections) {
    const room = Math.max(0, Math.min(sec.max, BUDGET - used));
    if (room < 200) break;
    const body = clip(sec.body, room);
    used += body.length;
    parts.push(`## ${sec.title}\n${body}`);
  }
  return { text: parts.join("\n\n"), sources, hits };
}
