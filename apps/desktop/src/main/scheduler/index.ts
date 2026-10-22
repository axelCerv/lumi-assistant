/**
 * El reloj de Lumi (proceso principal): decide qué avisar y cuándo.
 * Orden: saludo del día → reuniones → recordatorios → rutinas → sugerencias →
 * resúmenes periódicos. Un aviso a la vez.
 */
import { Notification, powerMonitor, shell } from "electron";
import {
  addDays,
  classOccurrences,
  dayKey,
  enabledModes,
  fmtTime,
  greeting,
  inScope,
  modeById,
  relative,
  startOfDay,
  weekLoad,
  weekLoadText,
  withinHours,
  type BubbleAction,
  type BubblePayload,
  type Mode,
} from "@lumi/shared";
import { getBrain, scheduleSnapshot } from "../core";
import { getSettings, updateSettings } from "../settings";
import { getState, mutateState } from "../state";
import { deadlines, meetings, refreshCalendars } from "../calendar";
import { refreshMode, undoMode, type ModeChange } from "../modes";
import { schoolSnapshot, syncDeadlines } from "../school";
import { checkStudy, startBreak, startFocus, stopStudy } from "../school/study";
import { meetingMode } from "../memory/context-builder";
import type { Brain } from "../vault/brain";
import { syncGranola, openGranolaApp } from "../granola/sync";
import { suggestRoutines, suggestionText } from "../memory/habits";
import { generateSummary, periodFor } from "../memory/summaries";
import { activeProvider } from "../llm/provider";
import { bubbleBusy, getBubble, hideBubble, showBubble, showPanel, showPanelView } from "../windows";
import { bus, errorText, log } from "../util";
import { obsidianUrl } from "../memory/context-builder";

const TICK = 20_000;
let busy = false;
let welcomed = false;
let summarizing = false;

function lowerFirst(s: string) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Notificaciones vivas (si no se guardan, el sistema las puede soltar antes del clic). */
const liveNotifications = new Set<Notification>();

/**
 * Notificación del sistema solo si no estás frente a la computadora (2 min sin
 * mover el mouse ni teclear) o con la pantalla bloqueada. Si estás ahí, basta la
 * burbuja: así la notificación no tapa los botones del aviso.
 */
function notify(title: string, body: string) {
  if (!getSettings().systemNotifications || !Notification.isSupported()) return;
  try {
    const state = powerMonitor.getSystemIdleState(120);
    if (state === "active") return;
  } catch {
    /* sin dato de inactividad: se notifica */
  }
  const n = new Notification({ title, body, silent: false });
  liveNotifications.add(n);
  const drop = () => liveNotifications.delete(n);
  n.on("click", () => {
    drop();
    showPanel();
  });
  n.on("close", drop);
  setTimeout(drop, 10 * 60_000);
  n.show();
}

/** Avisos de una sola vez que esperan su turno (p. ej. «encontré tus clientes»). */
const news: BubblePayload[] = [];

// Se escucha desde que carga el módulo: el vault se abre antes de arrancar el reloj
bus.on("catalog-imported", (x: { clients: number; projects: number; dirs: string[] }) => {
  const parts = [x.clients ? `${x.clients} ${x.clients === 1 ? "cliente" : "clientes"}` : "", x.projects ? `${x.projects} ${x.projects === 1 ? "proyecto" : "proyectos"}` : ""].filter(Boolean);
  news.push({
    kind: "hola",
    text: `Encontré ${parts.join(" y ")} en tu carpeta «${x.dirs.join("» y «")}». Ya los conozco: los puedes elegir en tus pendientes y los uso para entender tus notas.`,
    time: "Clientes y proyectos",
    view: "clients",
    cta: "Revisarlos",
  });
});

function show(p: BubblePayload, systemTitle?: string) {
  showBubble(p);
  if (systemTitle) notify(systemTitle, p.text);
}

/* ------------------------------ Modos ------------------------------ */

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function whenWord(date: string, now: Date): string {
  const [y, m, d] = date.split("-").map(Number);
  const diff = Math.round((new Date(y, m - 1, d).getTime() - startOfDay(now).getTime()) / 86400000);
  return diff <= 0 ? "hoy" : diff === 1 ? "mañana" : `el ${DAYS[new Date(y, m - 1, d).getDay()]}`;
}

/** Lo importante de un modo, en una frase: «Cálculo I a las 9:00 y la entrega de Química mañana». */
export function modeHighlights(mode: string, brain: Brain | null, now = new Date()): string {
  const end = addDays(startOfDay(now), 1);
  const parts: string[] = [];
  const tasks = (brain?.tasks() ?? []).filter((t) => !t.done && inScope(t.mode, mode));
  if (mode === "escuela" && brain) {
    const school = schoolSnapshot(brain, now);
    const next = school.classesToday.find((c) => new Date(c.end) > now);
    if (next) parts.push(`${next.subject} a las ${fmtTime(new Date(next.start))}`);
    // Entregas y exámenes de verdad (no los pasos de un plan)
    const soon = tasks
      .filter((t) => t.mode === "escuela" && t.due && t.due <= dayKey(addDays(end, 1)) && !/^Primer paso|«/.test(t.text))
      .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
    if (soon[0]) parts.push(`${soon.length === 1 ? "la entrega" : `${soon.length} entregas, la primera`} «${soon[0].text}» ${whenWord(soon[0].due!, now)}`);
    if (school.cards.due) parts.push(`${school.cards.due} tarjetas por repasar`);
  } else if (mode === "personal" && brain) {
    const pay = brain.payments(now).find((p) => p.daysLeft <= 3);
    if (pay) parts.push(`el pago de ${pay.name} ${whenWord(pay.next, now)}`);
    const b = brain.birthdays(now).find((x) => x.daysLeft <= 3);
    if (b) parts.push(`el cumpleaños de ${b.name} ${whenWord(b.date, now)}`);
  } else if (mode === "trabajo") {
    const m = meetings().find((x) => !x.allDay && new Date(x.start) > now && new Date(x.start) < end && inScope(meetingMode(x), mode));
    if (m) parts.push(`«${m.title}» a las ${fmtTime(new Date(m.start))}`);
  }
  const today = tasks.filter((t) => t.remindAt && new Date(t.remindAt) < end).length;
  if (today || !parts.length) parts.push(today === 0 ? "nada pendiente para hoy" : today === 1 ? "1 pendiente para hoy" : `${today} pendientes para hoy`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0];
}

const VIEW_FOR: Record<string, BubblePayload["view"]> = { escuela: "school", personal: "personal" };

function onModeChanged(c: ModeChange): void {
  const s = getSettings();
  scheduleSnapshot();
  if (c.manual || enabledModes(s.modes).length < 2 || !s.onboarded || bubbleBusy()) return;
  const m = modeById(s.modes, c.next.id);
  if (!m) return;
  show({
    kind: "modo",
    text: `Modo ${m.nombre} ${m.icono}: ${modeHighlights(m.id, getBrain())}.`,
    time: c.next.source === "calendario" && c.next.label ? c.next.label : c.next.source === "horario" ? "Por tu horario" : "Cambio de modo",
    view: VIEW_FOR[m.id] ?? "home",
  });
}

/** Confirma un cambio de modo hecho desde el menú, la bandeja o un atajo. */
function announceMode(): void {
  const s = getSettings();
  const cur = refreshMode();
  const m = modeById(s.modes, cur.id);
  if (!m) return;
  hideBubble();
  show({ kind: "modo", text: `Modo ${m.nombre} ${m.icono}: ${modeHighlights(m.id, getBrain())}.`, time: cur.source === "fijo" ? "Fijado" : "Hasta tu siguiente bloque", view: VIEW_FOR[m.id] ?? "home" });
}

export function startScheduler(): void {
  bus.on("mode-changed", onModeChanged);
  bus.on("mode-announce", announceMode);
  bus.on("calendar-changed", () => {
    const b = getBrain();
    if (b && enabledModes(getSettings().modes).some((m) => m.id === "escuela")) void syncDeadlines(b, deadlines()).catch((e) => log.warn("entregas:", errorText(e)));
    refreshMode();
  });
  setTimeout(tick, 4000);
  setInterval(tick, TICK);
  void refreshCalendars();
  setInterval(() => void refreshCalendars(), 10 * 60_000);
  setTimeout(() => void syncGranola(getBrain()).catch(() => {}), 15_000);
  setInterval(() => void syncGranola(getBrain()).catch(() => {}), 15 * 60_000);
}

export async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const s = getSettings();
    const brain = getBrain();
    const now = new Date();
    const today = dayKey(now);

    if (!s.onboarded) {
      if (!welcomed && !bubbleBusy()) {
        welcomed = true;
        showPanel();
      }
      return;
    }

    const mode = refreshMode();
    maybeSummaries(now);

    // La sesión de estudio terminó (enfoque o descanso): se avisa aunque haya otra cosa en fila
    const ended = checkStudy(now);
    if (ended) {
      const focus = ended.phase === "enfoque";
      const mins = Math.round((new Date(ended.endsAt).getTime() - new Date(ended.startedAt).getTime()) / 60_000);
      show(
        {
          kind: "estudio",
          text: focus
            ? `¡${mins} minutos de estudio${ended.subject ? ` de ${ended.subject}` : ""}! Llevas ${ended.rounds} ${ended.rounds === 1 ? "bloque" : "bloques"}. Toma ${s.school.breakMin} minutos de descanso: estírate y toma agua.`
            : "Se acabó el descanso. ¿Otro bloque de estudio?",
          time: focus ? "Descanso" : "Sesión de estudio",
          studyPhase: ended.phase,
        },
        focus ? "¡Buen bloque de estudio!" : "Fin del descanso",
      );
      return;
    }
    if (bubbleBusy()) return;
    const st = getState();
    const name = s.userName.trim();
    const modes = enabledModes(s.modes);
    const multi = modes.length > 1;
    const modeDef: Mode | null = modeById(s.modes, mode.id);
    const has = (id: string) => modes.some((m) => m.id === id);
    const quiet = withinHours(now, modeDef?.notificaciones.horasSilencio);
    /** ¿Este aviso puede salir ahora? Los de otro modo esperan si el modo activo lo pide (salvo urgentes). */
    const allow = (itemMode: string | null | undefined, urgent = false) => !multi || urgent || !itemMode || itemMode === mode.id || !modeDef?.notificaciones.silenciarOtrosModos;
    /** Nombre del modo de un aviso que no es del modo activo («Trabajo 💼»), para marcarlo. */
    const fromMode = (itemMode: string | null | undefined) => {
      if (!multi || !itemMode || itemMode === mode.id) return null;
      const m = modeById(s.modes, itemMode);
      return m ? `${m.nombre} ${m.icono}` : null;
    };
    const once = (key: string) => {
      if (st.alerts[key]) return false;
      mutateState((x) => (x.alerts[key] = now.toISOString()));
      return true;
    };

    // 0a) Novedades de una sola vez
    const next = news.shift();
    if (next) {
      show(next);
      return;
    }

    // 0) Instalaciones anteriores: presentar los modos una vez
    if (!s.modesIntroduced) {
      updateSettings({ modesIntroduced: true });
      show({
        kind: "modo",
        text: "¡Novedad! Ahora tengo modos: Trabajo 💼, Escuela 📚 y Personal 🏡. Cambio solo según tu horario o cuando tú quieras. ¿Los configuramos?",
        time: "Nuevo",
        view: "modes",
        cta: "Configurar modos",
      });
      return;
    }

    // 1) Saludo del día
    if (s.lastGreeting !== today && now.getHours() >= 6) {
      updateSettings({ lastGreeting: today });
      const end = addDays(startOfDay(now), 1);
      if (multi && modeDef) {
        show({ kind: "hola", text: `¡${greeting(now)}${name ? `, ${name}` : ""}! Empiezo en modo ${modeDef.nombre} ${modeDef.icono}: ${modeHighlights(mode.id, brain, now)}.`, time: fmtTime(now), view: VIEW_FOR[mode.id] ?? "home" });
        return;
      }
      const pending = brain?.tasks().filter((t) => !t.done && t.remindAt && new Date(t.remindAt) < end).length ?? 0;
      const todays = meetings().filter((m) => !m.allDay && new Date(m.start) >= now && new Date(m.start) < end);
      const parts = [pending === 0 ? "no tienes pendientes para hoy" : pending === 1 ? "tienes 1 pendiente hoy" : `tienes ${pending} pendientes hoy`];
      if (todays.length) parts.push(`${todays.length === 1 ? "1 reunión" : `${todays.length} reuniones`}, la primera a las ${fmtTime(new Date(todays[0].start))}`);
      show({ kind: "hola", text: `¡${greeting(now)}${name ? `, ${name}` : ""}! Hoy ${parts.join(" y ")}.`, time: fmtTime(now) });
      return;
    }

    // 2) Reuniones por empezar (siempre avisan: si son de otro modo, se marca)
    for (const m of meetings()) {
      if (m.allDay || st.alertedMeetings[m.id]) continue;
      const start = new Date(m.start).getTime();
      if (now.getTime() >= start - s.meetingLeadMin * 60_000 && now.getTime() < start + 2 * 60_000) {
        mutateState((x) => (x.alertedMeetings[m.id] = now.toISOString()));
        const granola = s.granola.mode !== "none" && s.askGranolaBeforeMeeting;
        show(
          {
            kind: "reunion",
            text: `Tu reunión «${m.title}» empieza ${relative(new Date(start), now)}, a las ${fmtTime(new Date(start))}.${granola ? " ¿Abro Granola para grabarla?" : ""}`,
            time: relative(new Date(start), now),
            meetingId: m.id,
            link: m.link,
            granola,
            fromMode: fromMode(meetingMode(m)),
          },
          "Reunión en camino",
        );
        return;
      }
    }

    // 2b) Clases por empezar
    if (brain && has("escuela") && s.school.classLeadMin > 0) {
      const cycle = brain.cycle();
      const lead = s.school.classLeadMin * 60_000;
      for (const c of classOccurrences(brain.subjects(), now, new Date(now.getTime() + lead + 60_000), cycle ? { inicio: cycle.start, fin: cycle.end } : null)) {
        const start = new Date(c.start).getTime();
        if (now.getTime() < start - lead || now.getTime() > start + 60_000) continue;
        if (!once(`clase:${c.path}:${c.start}`)) continue;
        show(
          { kind: "clase", text: `Tu clase de ${c.subject} empieza ${relative(new Date(start), now)}${c.room ? `, en ${c.room}` : ""}.`, time: fmtTime(new Date(start)), view: "school", fromMode: fromMode("escuela") },
          "Clase en camino",
        );
        return;
      }
    }

    // 3) Recordatorios
    if (brain && !quiet) {
      // Los diarios se avisan una vez por día (la clave lleva la fecha)
      const notifiedKey = (t: { key: string; daily: boolean }) => (t.daily ? `${t.key}@${today}` : t.key);
      const due = brain
        .tasks()
        .filter((t) => {
          if (t.done || !t.remindAt) return false;
          if (!allow(t.mode, t.urgent)) return false;
          const snoozed = st.snoozed[t.key];
          if (snoozed) return new Date(snoozed) <= now;
          return !st.notified[notifiedKey(t)] && new Date(t.remindAt) <= now && now.getTime() - new Date(t.remindAt).getTime() < 3 * 86400000;
        })
        .sort((a, b) => (a.remindAt ?? "").localeCompare(b.remindAt ?? ""));
      if (due.length) {
        const t = due[0];
        mutateState((x) => {
          x.notified[notifiedKey(t)] = now.toISOString();
          delete x.snoozed[t.key];
        });
        const at = new Date(t.remindAt!);
        const late = now.getTime() - at.getTime() > 30 * 60_000;
        const lead = name ? `${name}, ` : "";
        const daysOld = t.daily && t.due ? Math.round((startOfDay(now).getTime() - new Date(`${t.due}T00:00`).getTime()) / 86400000) : 0;
        const text = t.daily
          ? `${lead}${daysOld >= 1 ? `sigue pendiente (${daysOld + 1}.º día)` : "tu recordatorio de cada día"}: ${lowerFirst(t.text)}. ¿Hoy sí?`
          : late
            ? `${lead}esto quedó pendiente desde las ${fmtTime(at)}: ${lowerFirst(t.text)}. ¿Lo hacemos ahora?`
            : `${lead}te recuerdo: ${lowerFirst(t.text)}. ¿Lo hacemos ahora?`;
        show(
          {
            kind: "recordatorio",
            text,
            time: t.daily ? "Cada día" : fmtTime(at),
            tags: t.tags,
            taskKey: t.key,
            notePath: t.path,
            fromMode: fromMode(t.mode),
            daily: t.daily || undefined,
          },
          "Lumi te recuerda",
        );
        return;
      }

      // 4) Rutinas
      for (const r of brain.routines()) {
        if (!allow(r.mode)) continue;
        const sk = `rutina:${r.path}`;
        if (st.snoozed[sk]) {
          if (new Date(st.snoozed[sk]) > now) continue;
          mutateState((x) => delete x.snoozed[sk]);
          show({ kind: "rutina", text: `Es hora de: ${lowerFirst(r.title)}.`, time: r.time, routinePath: r.path }, "Rutina");
          return;
        }
        if (!r.active || !r.days.includes(now.getDay()) || st.routinesFired[r.path] === today) continue;
        const [h, mi] = r.time.split(":").map(Number);
        const at = new Date(now);
        at.setHours(h, mi, 0, 0);
        const diff = now.getTime() - at.getTime();
        if (diff >= 0 && diff < 90 * 60_000) {
          mutateState((x) => (x.routinesFired[r.path] = today));
          show({ kind: "rutina", text: `Es hora de: ${lowerFirst(r.title)}.`, time: r.time, routinePath: r.path }, "Rutina");
          return;
        }
      }
    }

    if (brain && !quiet) {
      // 5) Pagos que se acercan
      if (has("personal") && now.getHours() >= 9 && allow("personal")) {
        for (const p of brain.payments(now)) {
          if (p.daysLeft > p.lead || !once(`pago:${p.name}:${p.next}`)) continue;
          const when = p.daysLeft === 0 ? "hoy" : p.daysLeft === 1 ? "mañana" : `en ${p.daysLeft} días`;
          show({ kind: "pago", text: `${name ? `${name}, ` : ""}${when} toca pagar ${p.name}${p.amount ? ` (${p.amount})` : ""}.`, time: when === "hoy" ? "Hoy" : p.next, view: "personal", fromMode: fromMode("personal") }, "Pago en camino");
          return;
        }
      }

      // 6) Cumpleaños
      if (has("personal") && now.getHours() >= 9) {
        for (const b of brain.birthdays(now)) {
          if (b.daysLeft !== 0 && b.daysLeft !== s.personal.birthdayLeadDays) continue;
          if (!once(`cumple:${b.path}:${b.date}`)) continue;
          show(
            {
              kind: "cumple",
              text: b.daysLeft === 0 ? `¡Hoy es el cumpleaños de ${b.name}${b.age ? ` (cumple ${b.age})` : ""}! 🎂 ¿Le escribes?` : `En ${b.daysLeft} días es el cumpleaños de ${b.name}. ¿Ya tienes regalo?`,
              time: b.daysLeft === 0 ? "Hoy" : b.date,
              view: "personal",
            },
            "Cumpleaños",
          );
          return;
        }
      }

      // 7) Semana cargada (una vez al día)
      if (has("escuela") && s.school.loadAlerts && s.lastLoadAlert !== today && now.getHours() >= 8 && (mode.id === "escuela" || now.getHours() >= 17)) {
        updateSettings({ lastLoadAlert: today });
        const items = brain
          .tasks()
          .filter((t) => !t.done && t.mode === "escuela" && t.due)
          .map((t) => ({ date: t.due!, title: t.text }));
        const text = weekLoadText(weekLoad(items, now), now);
        if (text) {
          show({ kind: "carga", text, time: "Esta semana", view: "school" });
          return;
        }
      }

      // 8) Repaso de tarjetas (una vez al día)
      if (has("escuela") && s.school.reviewNudge && s.lastReviewNudge !== today && (now.getHours() >= 17 || (mode.id === "escuela" && now.getHours() >= 10))) {
        const dueCards = schoolSnapshot(brain, now).cards.due;
        if (dueCards > 0) {
          updateSettings({ lastReviewNudge: today });
          show({ kind: "repaso", text: `Tienes ${dueCards} ${dueCards === 1 ? "tarjeta" : "tarjetas"} para repasar hoy. Son unos ${Math.max(2, Math.round(dueCards * 0.3))} minutos y te ayudan a no olvidar.`, time: "Repaso", view: "review" });
          return;
        }
      }

      // 9) Cierre del día
      if (has("personal") && s.personal.closeDay && s.lastDayClose !== today) {
        const [h, mi] = s.personal.closeDayTime.split(":").map(Number);
        const at = new Date(now);
        at.setHours(h, mi, 0, 0);
        if (now >= at && now.getTime() - at.getTime() < 3 * 3600_000) {
          updateSettings({ lastDayClose: today });
          const end = addDays(startOfDay(now), 1);
          const all = brain.tasks();
          const done = all.filter((t) => t.done && t.doneDate === today).length;
          const left = all.filter((t) => !t.done && !t.daily && t.due && t.remindAt && new Date(t.remindAt) < end).length;
          const parts = [done === 0 ? "hoy no marcaste pendientes, y está bien" : done === 1 ? "completaste 1 pendiente" : `completaste ${done} pendientes`];
          if (left) parts.push(`${left === 1 ? "queda 1" : `quedan ${left}`} para hoy`);
          show({ kind: "cierre", text: `Cierre del día: ${parts.join(" y ")}.${left ? " ¿Los paso a mañana?" : " ¡Descansa!"}`, time: "Cierre del día", movable: left, view: "home" });
          return;
        }
      }
    }

    // 10) Una vez al día: ¿algo que haces seguido?
    if (s.lastSuggestionCheck !== today && now.getHours() >= 10) {
      updateSettings({ lastSuggestionCheck: today });
      const sug = suggestRoutines(brain, now)[0];
      if (sug) show({ kind: "sugerencia", text: suggestionText(sug), time: "Hábito detectado", suggestion: sug });
    }
  } catch (e) {
    log.error("tick:", errorText(e));
  } finally {
    busy = false;
  }
}

/** Resumen semanal (lunes) y mensual (día 1), en segundo plano. */
function maybeSummaries(now: Date): void {
  const brain = getBrain();
  if (summarizing || !brain || !activeProvider() || now.getHours() < 9) return;
  const s = getSettings();
  const weekly = periodFor("semanal", now);
  const monthly = periodFor("mensual", now);
  let kind: "semanal" | "mensual" | null = null;
  if (now.getDate() <= 3 && s.lastMonthlySummary !== monthly.rel) kind = "mensual";
  else if (s.lastWeeklySummary !== weekly.rel && now.getDay() >= 1) kind = "semanal";
  if (!kind) return;
  summarizing = true;
  const rel = kind === "semanal" ? weekly.rel : monthly.rel;
  generateSummary(brain, kind, now)
    .then((path) => {
      updateSettings(kind === "semanal" ? { lastWeeklySummary: rel } : { lastMonthlySummary: rel });
      if (!bubbleBusy()) show({ kind: "resumen", text: `Te dejé tu resumen ${kind} en el vault.`, time: kind === "semanal" ? "Semana" : "Mes", notePath: path });
    })
    .catch((e) => {
      log.warn("resumen:", errorText(e));
      // no reintenta hasta el próximo periodo si falla por falta de material
      updateSettings(kind === "semanal" ? { lastWeeklySummary: rel } : { lastMonthlySummary: rel });
    })
    .finally(() => (summarizing = false));
}

/** Botones de la burbuja. */
export async function bubbleAction(action: BubbleAction, minutes?: number): Promise<void> {
  const p = getBubble();
  const brain = getBrain();
  hideBubble();
  if (!p) return;
  try {
    switch (action) {
      case "done":
        if (p.taskKey && brain) {
          const t = await brain.toggleTask(p.taskKey);
          if (t) mutateState((x) => x.completions.push({ text: t.text, at: new Date().toISOString() }));
        } else if (p.routinePath) {
          const r = brain?.routines().find((x) => x.path === p.routinePath);
          if (r) mutateState((x) => x.completions.push({ text: r.title, at: new Date().toISOString() }));
        }
        break;
      case "snooze":
        if (p.taskKey) {
          const until = new Date(Date.now() + (minutes ?? 30) * 60_000).toISOString();
          mutateState((x) => (x.snoozed[p.taskKey!] = until));
        } else if (p.routinePath) {
          const until = new Date(Date.now() + (minutes ?? 15) * 60_000).toISOString();
          mutateState((x) => (x.snoozed[`rutina:${p.routinePath}`] = until));
        }
        break;
      case "open-link":
        if (p.link) await shell.openExternal(p.link);
        break;
      case "open-granola":
        openGranolaApp();
        break;
      case "open-panel":
        if (p.view && p.view !== "home") showPanelView(p.view);
        else showPanel();
        break;
      case "undo-mode":
        undoMode();
        break;
      case "study-focus":
        startFocus(getSettings().school.focusMin);
        break;
      case "study-break":
        startBreak(getSettings().school.breakMin);
        break;
      case "study-stop":
        stopStudy();
        break;
      case "move-to-tomorrow":
        if (brain) {
          const end = addDays(startOfDay(new Date()), 1);
          const keys = brain
            .tasks()
            .filter((t) => !t.done && !t.daily && t.due && t.remindAt && new Date(t.remindAt) < end)
            .map((t) => t.key);
          await brain.moveDueToTomorrow(keys, dayKey(end));
        }
        break;
      case "open-note":
        if (p.notePath && brain) await shell.openExternal(obsidianUrl(brain.vault.name, p.notePath));
        break;
      case "accept-suggestion":
        if (p.suggestion && brain) await brain.createRoutine(p.suggestion);
        break;
      case "reject-suggestion":
        if (p.suggestion) updateSettings({ dismissedSuggestions: [...getSettings().dismissedSuggestions, p.suggestion.key] });
        break;
      case "close":
        break;
    }
  } catch (e) {
    log.warn("bubbleAction:", errorText(e));
  }
  scheduleSnapshot();
  setTimeout(tick, 1500); // si hay otro aviso en fila, que salga
}
