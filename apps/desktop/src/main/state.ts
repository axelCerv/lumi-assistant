/**
 * Estado interno de Lumi que no pertenece al vault: qué avisos ya se mostraron,
 * pospuestos, propuestas de memoria pendientes, historial de completados…
 */
import { app } from "electron";
import path from "node:path";
import type { CardState, ChatMessage, FactProposal } from "@lumi/shared";
import { readJsonSync, writeFileAtomicSync, debounce } from "./util";

export interface LumiState {
  notified: Record<string, string>;
  snoozed: Record<string, string>;
  routinesFired: Record<string, string>;
  alertedMeetings: Record<string, string>;
  /** Para detectar hábitos: qué completaste y a qué hora. */
  completions: { text: string; at: string }[];
  pendingFacts: FactProposal[];
  granolaSynced: string[];
  granolaCount: number;
  /** Repaso espaciado: estado de cada tarjeta (por id). */
  srs: Record<string, CardState>;
  /** Entregas importadas de Moodle/Canvas: uid del evento → texto y fecha escritos. */
  deadlines: Record<string, { text: string; due: string }>;
  /** Sesiones de estudio terminadas (para «hoy estudiaste…»). */
  studyLog: { date: string; minutes: number; subject: string | null }[];
  /** Avisos que se muestran una sola vez (clase, pago, cumpleaños…): clave → cuándo. */
  alerts: Record<string, string>;
}

const empty = (): LumiState => ({
  notified: {},
  snoozed: {},
  routinesFired: {},
  alertedMeetings: {},
  completions: [],
  pendingFacts: [],
  granolaSynced: [],
  granolaCount: 0,
  srs: {},
  deadlines: {},
  studyLog: [],
  alerts: {},
});

let file = "";
let chatFile = "";
let state: LumiState = empty();
let chat: ChatMessage[] = [];

export function loadState(): void {
  const dir = app.getPath("userData");
  file = path.join(dir, "estado.json");
  chatFile = path.join(dir, "conversacion.json");
  state = { ...empty(), ...readJsonSync<Partial<LumiState>>(file, {}) };
  chat = readJsonSync<ChatMessage[]>(chatFile, []);
  prune();
}

const persist = debounce(() => file && writeFileAtomicSync(file, JSON.stringify(state, null, 1)), 300);
const persistChat = debounce(() => chatFile && writeFileAtomicSync(chatFile, JSON.stringify(chat, null, 1)), 300);

export function getState(): LumiState {
  return state;
}

export function mutateState(fn: (s: LumiState) => void): void {
  fn(state);
  persist();
}

export function getChat(): ChatMessage[] {
  return chat;
}

export function setChat(next: ChatMessage[]): void {
  chat = next.slice(-200);
  persistChat();
}

/** Limpia registros viejos para que el archivo no crezca para siempre. */
function prune(): void {
  const cutoff = Date.now() - 45 * 86400000;
  const old = (iso: string) => new Date(iso).getTime() < cutoff;
  for (const rec of [state.notified, state.snoozed, state.alertedMeetings, state.alerts]) {
    for (const [k, v] of Object.entries(rec)) if (old(v)) delete rec[k];
  }
  state.completions = state.completions.filter((c) => !old(c.at) || state.completions.length < 50).slice(-1000);
  state.granolaSynced = state.granolaSynced.slice(-5000);
  state.studyLog = state.studyLog.filter((x) => !old(x.date)).slice(-500);
}
