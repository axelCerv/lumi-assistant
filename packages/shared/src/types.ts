/** Tipos de dominio compartidos entre el proceso principal y la interfaz. */
import type { AvatarConfig } from "./avatar.ts";
import type { ModeSource } from "./modes.ts";
import type { CardState, ClassOccurrence, ClassSlot } from "./school.ts";

export type TagKind = "cliente" | "proyecto";

export interface Tag {
  name: string;
  kind: TagKind;
}

/** Un pendiente leído del vault (formato del plugin Tasks de Obsidian). */
export interface Task {
  /** Identificador estable: archivo + texto (sobrevive si la línea se mueve). */
  key: string;
  path: string;
  line: number;
  raw: string;
  text: string;
  done: boolean;
  /** AAAA-MM-DD (📅) */
  due: string | null;
  /** HH:MM (⏰, extensión de Lumi) */
  time: string | null;
  /** Fecha y hora efectiva del aviso (ISO) o null si no tiene fecha. */
  remindAt: string | null;
  doneDate: string | null;
  tags: Tag[];
  otherTags: string[];
  links: string[];
  /** Viene de una nota marcada como privada: nunca se envía a la IA. */
  private: boolean;
  /** El archivo es de Lumi (se puede borrar la línea sin tocar texto del usuario). */
  lumiFile: boolean;
  /** Modo al que pertenece (null = compartido, se ve en todos). */
  mode: string | null;
  /** Materia (modo Escuela), si la tiene. */
  subject: string | null;
  /** Categoría del modo (#personal/casa → «Casa»), si la tiene. */
  category: string | null;
  /** Prioridad alta (🔺/⏫ o #urgente): avisa aunque estés en otro modo. */
  urgent: boolean;
}

export interface TaskDraft {
  title: string;
  /** AAAA-MM-DD */
  date: string | null;
  /** HH:MM */
  time: string | null;
  tags: Tag[];
  contact: string | null;
  original?: string;
  reason?: string | null;
  /** Modo del pendiente (agrega #trabajo, #escuela…). undefined = el modo activo. */
  mode?: string | null;
  /** Etiquetas extra tal cual (p. ej. "escuela/calculo-i"). */
  extraTags?: string[];
  /** Materia (modo Escuela). undefined = no cambia; null = sin materia. */
  subject?: string | null;
  /** Categoría del modo (Personal, Escuela…). undefined = no cambia; null = sin categoría. */
  category?: string | null;
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
  source: "google" | "microsoft" | "ics";
  attendees: string[];
  /** Categorías del evento (Moodle pone ahí la materia). */
  categories?: string[];
  description?: string | null;
}

export interface Routine {
  path: string;
  title: string;
  /** 0 = domingo … 6 = sábado */
  days: number[];
  time: string;
  active: boolean;
  lumiFile: boolean;
  /** Modo de la rutina (encabezado `modo:`); null = todos. */
  mode: string | null;
}

export interface RoutineSuggestion {
  key: string;
  title: string;
  days: number[];
  time: string;
  reason: string;
}

export interface Entity {
  name: string;
  kind: "cliente" | "proyecto" | "persona";
  path: string;
  slug: string;
}

export interface MemoryFact {
  /** Tema = archivo dentro de 90-Lumi/memoria/ */
  topic: string;
  date: string;
  text: string;
  origin: string | null;
  /** Modo en el que nació el dato (null = global). */
  mode: string | null;
  path: string;
  line: number;
}

export interface FactProposal {
  id: string;
  text: string;
  topic: string;
  origin: string | null;
  mode?: string | null;
  createdAt: string;
}

export interface SummaryInfo {
  path: string;
  title: string;
  kind: "semanal" | "mensual";
  date: string;
}

export interface SearchHit {
  path: string;
  title: string;
  heading: string | null;
  snippet: string;
  score: number;
}

export interface ChatSource {
  path: string;
  title: string;
}

export interface ChatAction {
  kind: "pendiente" | "recuerdo" | "apariencia" | "modo" | "nota";
  label: string;
  detail?: string;
  /** Para pendientes: key de la tarea creada (para deshacer). */
  taskKey?: string;
  /** Para recuerdos: id de la propuesta. */
  proposalId?: string;
  /** Para apariencia: cómo se veía Lumi antes del cambio (para deshacer). */
  lookBefore?: AvatarConfig;
  /** Para pendientes creados en grupo (plan de estudio): todas sus keys. */
  taskKeys?: string[];
  /** Para notas: ruta en el vault. */
  path?: string;
  state?: "pendiente" | "hecho" | "descartado";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  sources?: ChatSource[];
  actions?: ChatAction[];
  error?: boolean;
}

export type BubbleKind =
  | "recordatorio"
  | "reunion"
  | "rutina"
  | "sugerencia"
  | "hola"
  | "resumen"
  | "granola"
  | "modo"
  | "clase"
  | "estudio"
  | "carga"
  | "repaso"
  | "pago"
  | "cumple"
  | "cierre";

export interface BubblePayload {
  kind: BubbleKind;
  text: string;
  time: string;
  tags?: Tag[];
  taskKey?: string;
  routinePath?: string;
  meetingId?: string;
  link?: string | null;
  notePath?: string;
  suggestion?: RoutineSuggestion;
  cta?: string;
  granola?: boolean;
  side?: "left" | "right";
  /** Vista del menú que abre el botón principal. */
  view?: import("./ipc.ts").PanelView;
  /** El aviso es de otro modo (cruzó por ser urgente): «Aviso de Trabajo». */
  fromMode?: string | null;
  /** Sesión de estudio: en qué fase terminó. */
  studyPhase?: "enfoque" | "descanso";
  /** Cierre del día: cuántos pendientes de hoy se pueden pasar a mañana. */
  movable?: number;
}

/* ------------------------------ Modos ------------------------------ */

export interface ActiveMode {
  id: string;
  source: ModeSource;
  until: string | null;
  label: string | null;
  /** Se quedó en este modo porque hay una sesión, reunión o chat en curso. */
  held: boolean;
  /** Texto listo para mostrar: «Escuela 📚 (por tu horario, hasta 14:00)». */
  text: string;
}

/* ------------------------------ Escuela ------------------------------ */

export interface Subject {
  path: string;
  name: string;
  slug: string;
  teacher: string | null;
  slots: ClassSlot[];
  /** Texto original del horario (para editar). */
  schedule: string[];
  platform: string | null;
  link: string | null;
  maxAbsences: number | null;
  aiAllowed: boolean;
  color: string | null;
}

export interface Cycle {
  path: string;
  name: string;
  start: string | null;
  end: string | null;
}

export interface CardInfo {
  id: string;
  question: string;
  answer: string;
  path: string;
  subject: string | null;
  state?: CardState;
}

export interface StudySession {
  phase: "enfoque" | "descanso";
  startedAt: string;
  endsAt: string;
  subject: string | null;
  rounds: number;
}

export interface SchoolSnapshot {
  subjects: Subject[];
  cycle: Cycle | null;
  classesToday: ClassOccurrence[];
  nextClass: ClassOccurrence | null;
  cards: { total: number; due: number; bySubject: Record<string, { total: number; due: number }> };
  study: StudySession | null;
  studiedTodayMin: number;
}

/* ------------------------------ Personal ------------------------------ */

export interface PaymentInfo {
  name: string;
  day: number;
  month: number | null;
  amount: string | null;
  lead: number;
  line: number;
  next: string;
  daysLeft: number;
}

export interface BirthdayInfo {
  name: string;
  path: string;
  date: string;
  daysLeft: number;
  age: number | null;
}

export interface ListItem {
  text: string;
  done: boolean;
  line: number;
  raw: string;
}

export interface ListInfo {
  path: string;
  name: string;
  items: ListItem[];
}

export interface PersonalSnapshot {
  payments: PaymentInfo[];
  paymentsPath: string;
  birthdays: BirthdayInfo[];
  lists: ListInfo[];
}

export interface ServiceStatus {
  ok: boolean;
  label: string;
  detail?: string | null;
}

export interface IndexStatus {
  notes: number;
  chunks: number;
  embedded: number;
  indexing: boolean;
  progress: number;
  semantic: "apagada" | "cargando" | "lista" | "error";
  semanticDetail?: string | null;
}

/** Lo que la interfaz necesita para dibujarse. Se envía completo cada vez que cambia algo. */
export interface AppSnapshot {
  settings: import("./schemas.ts").Settings;
  vaultName: string | null;
  keys: { claude: boolean; gemini: boolean; granola: boolean };
  tasks: Task[];
  meetings: Meeting[];
  routines: Routine[];
  entities: Entity[];
  proposals: FactProposal[];
  index: IndexStatus;
  calendars: { google: ServiceStatus; microsoft: ServiceStatus; ics: (ServiceStatus & { id: string })[]; updatedAt: string | null };
  granola: ServiceStatus & { lastSync: string | null; count: number };
  oauthConfigured: { google: boolean; microsoft: boolean };
  update: { available: boolean; version: string | null; downloaded: boolean };
  bubbleOpen: boolean;
  appVersion: string;
  mode: ActiveMode;
  school: SchoolSnapshot;
  personal: PersonalSnapshot;
}
