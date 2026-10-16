import type { AvatarConfig } from "./avatar";

export type TagKind = "cliente" | "proyecto";

export interface Tag {
  name: string;
  kind: TagKind;
}

export interface Task {
  id: string;
  text: string;
  /** Lo que escribiste originalmente en la nota rápida. */
  original?: string;
  createdAt: string;
  /** Fecha y hora del aviso (ISO). null = sin aviso. */
  remindAt: string | null;
  done: boolean;
  doneAt: string | null;
  /** Ya se mostró el aviso de este recordatorio. */
  notified: boolean;
  tags: Tag[];
  contact: string | null;
}

export interface Routine {
  id: string;
  title: string;
  /** 0 = domingo … 6 = sábado */
  days: number[];
  /** "HH:MM" */
  time: string;
  enabled: boolean;
  /** Último día (AAAA-MM-DD) en que avisó. */
  lastFired: string | null;
}

export interface Memory {
  id: string;
  text: string;
  createdAt: string;
}

export interface PendingReminder {
  titulo: string;
  fecha_hora: string | null;
  etiquetas?: { nombre: string; tipo: string }[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  memory?: string | null;
  memoryState?: "pendiente" | "guardado" | "descartado";
  reminder?: PendingReminder | null;
  reminderState?: "pendiente" | "creado" | "descartado";
  /** Cambio de apariencia que Claude aplicó en esta respuesta. */
  lookChange?: string | null;
  /** Cómo se veía Lumi antes del cambio, para poder deshacerlo. */
  lookBefore?: AvatarConfig | null;
  error?: boolean;
}

export type CalendarProvider = "google" | "outlook" | "otro";

export interface CalendarSource {
  id: string;
  name: string;
  url: string;
  provider: CalendarProvider;
  enabled: boolean;
}

export interface Settings {
  userName: string;
  onboarded: boolean;
  useAI: boolean;
  model: string;
  learn: boolean;
  meetingLeadMin: number;
  calendars: CalendarSource[];
  dismissedSuggestions: string[];
  lastGreeting: string | null;
  lastSuggestionCheck: string | null;
  systemNotifications: boolean;
}

export interface LumiData {
  version: 1;
  tasks: Task[];
  routines: Routine[];
  memories: Memory[];
  chat: ChatMessage[];
  tags: Tag[];
  /** Cómo se ve Lumi. */
  avatar: AvatarConfig;
  settings: Settings;
}

export interface Meeting {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  link: string | null;
  calendar: string;
}

export interface CalendarStatus {
  id: string;
  name: string;
  ok: boolean;
  error: string | null;
  count: number;
}

export interface MeetingsCache {
  meetings: Meeting[];
  status: CalendarStatus[];
  updatedAt: string | null;
}

export type BubbleKind = "recordatorio" | "reunion" | "rutina" | "sugerencia" | "hola";

export interface BubblePayload {
  kind: BubbleKind;
  text: string;
  time: string;
  tags?: Tag[];
  taskId?: string;
  routineId?: string;
  meetingId?: string;
  link?: string | null;
  suggestion?: { key: string; title: string; days: number[]; time: string };
  /** Texto del botón principal (para el saludo). */
  cta?: string;
  side?: "left" | "right";
}

export const MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (recomendado)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (rápido y económico)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (el más capaz)" },
];
