/**
 * Sesión de estudio (Pomodoro) con el avatar: enfoque → descanso → enfoque…
 * Vive en memoria; al terminar cada bloque de enfoque se registra en el estado.
 */
import { dayKey, type StudySession } from "@lumi/shared";
import { getState, mutateState } from "../state";
import { emitChanged } from "../util";

let session: StudySession | null = null;
/** Ya se avisó que terminó la fase actual. */
let announced = false;

export function studySession(): StudySession | null {
  return session;
}

function log(minutes: number, subject: string | null) {
  if (minutes < 1) return;
  mutateState((s) => s.studyLog.push({ date: dayKey(), minutes: Math.round(minutes), subject }));
}

export function startFocus(focusMin: number, subject: string | null = session?.subject ?? null): StudySession {
  const now = Date.now();
  session = {
    phase: "enfoque",
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + focusMin * 60_000).toISOString(),
    subject,
    rounds: session?.rounds ?? 0,
  };
  announced = false;
  emitChanged();
  return session;
}

export function startBreak(breakMin: number): StudySession | null {
  if (!session) return null;
  if (session.phase === "enfoque" && !announced) logElapsed();
  const now = Date.now();
  session = { ...session, phase: "descanso", startedAt: new Date(now).toISOString(), endsAt: new Date(now + breakMin * 60_000).toISOString() };
  announced = false;
  emitChanged();
  return session;
}

function logElapsed() {
  if (!session || session.phase !== "enfoque") return;
  const planned = new Date(session.endsAt).getTime() - new Date(session.startedAt).getTime();
  const elapsed = Math.min(planned, Date.now() - new Date(session.startedAt).getTime());
  log(elapsed / 60_000, session.subject);
}

export function stopStudy(): void {
  if (session?.phase === "enfoque" && !announced) logElapsed();
  session = null;
  announced = false;
  emitChanged();
}

/** Si la fase actual ya terminó (y no se ha avisado), la devuelve una sola vez. */
export function checkStudy(now = new Date()): StudySession | null {
  if (!session || announced || new Date(session.endsAt) > now) return null;
  announced = true;
  if (session.phase === "enfoque") {
    const planned = (new Date(session.endsAt).getTime() - new Date(session.startedAt).getTime()) / 60_000;
    log(planned, session.subject);
    session = { ...session, rounds: session.rounds + 1 };
  }
  emitChanged();
  return session;
}

/** Minutos de estudio de hoy (incluye el bloque en curso). */
export function studiedTodayMin(now = new Date()): number {
  const today = dayKey(now);
  let min = getState()
    .studyLog.filter((x) => x.date === today)
    .reduce((a, x) => a + x.minutes, 0);
  if (session?.phase === "enfoque" && !announced) min += Math.max(0, (Math.min(now.getTime(), new Date(session.endsAt).getTime()) - new Date(session.startedAt).getTime()) / 60_000);
  return Math.round(min);
}
