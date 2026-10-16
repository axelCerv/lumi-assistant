/**
 * Contrato entre la interfaz (renderer) y el proceso principal.
 * El preload expone `window.lumi` con estos métodos; cada uno es un
 * `ipcRenderer.invoke("lumi:<nombre>")` que el proceso principal atiende.
 */
import type {
  AppSnapshot,
  BubblePayload,
  CardInfo,
  ChatMessage,
  FactProposal,
  MemoryFact,
  RoutineSuggestion,
  SearchHit,
  SummaryInfo,
  TaskDraft,
} from "./types.ts";
import type { ProviderId, Settings } from "./schemas.ts";
import type { ManualDuration } from "./modes.ts";
import type { Grade } from "./school.ts";

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

export interface ProfileAnswers {
  name: string;
  work: string;
  clients: string;
  projects: string;
  routines: string;
  /** Una materia por línea: «Cálculo I · lun mie 9:00-10:30 A-204». */
  subjects?: string;
}

export interface SubjectInput {
  name: string;
  teacher: string;
  schedule: string[];
  platform: string;
  link: string;
  maxAbsences: number | null;
  aiAllowed: boolean;
}

export interface PaymentInput {
  name: string;
  day: number;
  month: number | null;
  amount: string;
  lead: number;
}

export type BubbleAction =
  | "done"
  | "snooze"
  | "close"
  | "open-link"
  | "open-panel"
  | "accept-suggestion"
  | "reject-suggestion"
  | "open-granola"
  | "open-note"
  | "undo-mode"
  | "study-focus"
  | "study-break"
  | "study-stop"
  | "move-to-tomorrow";

export interface Result<T = void> {
  ok: boolean;
  error?: string;
  value?: T;
}

/** Métodos que se llaman con invoke. */
export interface LumiInvoke {
  getSnapshot(): Promise<AppSnapshot>;

  // ventanas
  togglePanel(): Promise<void>;
  showPanel(): Promise<void>;
  hidePanel(): Promise<void>;
  setPanelPinned(pinned: boolean): Promise<void>;
  avatarPress(): Promise<void>;
  avatarDrag(active: boolean): Promise<void>;
  setAvatarVisible(visible: boolean): Promise<void>;
  /** Menú del clic derecho sobre el avatar flotante. */
  avatarMenu(): Promise<void>;
  bubbleReady(width: number, height: number): Promise<void>;
  getBubble(): Promise<BubblePayload | null>;
  bubbleAction(action: BubbleAction, minutes?: number): Promise<void>;
  quit(): Promise<void>;

  // configuración
  updateSettings(patch: DeepPartial<Settings>): Promise<AppSnapshot>;
  chooseFolder(title: string): Promise<string | null>;
  defaultVaultPath(): Promise<string>;
  setupVault(path: string, mode: "crear" | "existente"): Promise<Result<string>>;
  setApiKey(provider: ProviderId | "granola", key: string | null): Promise<Result>;
  testAI(provider: ProviderId): Promise<Result<string>>;
  setOpenAtLogin(open: boolean): Promise<void>;
  openExternal(url: string): Promise<void>;
  openInObsidian(path: string): Promise<void>;
  revealVault(): Promise<void>;
  reindex(): Promise<void>;
  checkForUpdates(): Promise<Result<string>>;
  installUpdate(): Promise<void>;

  // calendario
  connectCalendar(provider: "google" | "microsoft"): Promise<Result<string>>;
  disconnectCalendar(provider: "google" | "microsoft"): Promise<void>;
  addIcs(name: string, url: string, kind?: "calendario" | "entregas"): Promise<Result>;
  removeIcs(id: string): Promise<void>;
  refreshCalendars(): Promise<void>;

  // granola
  granolaConnect(): Promise<Result<string>>;
  granolaUseApiKey(key: string): Promise<Result<string>>;
  granolaDisconnect(): Promise<void>;
  granolaSync(): Promise<Result<number>>;
  granolaDiagnostics(): Promise<Result<string>>;
  openGranola(): Promise<void>;

  // notas y pendientes
  parseQuickNote(text: string): Promise<TaskDraft>;
  refineQuickNote(text: string): Promise<TaskDraft | null>;
  saveTask(draft: TaskDraft, existingKey?: string | null): Promise<Result<string>>;
  toggleTask(key: string): Promise<Result>;
  deleteTask(key: string): Promise<Result>;
  getTaskDraft(key: string): Promise<TaskDraft | null>;

  // chat
  chatHistory(): Promise<ChatMessage[]>;
  chatSend(text: string): Promise<ChatMessage>;
  chatClear(): Promise<void>;
  undoTask(key: string, messageId: string): Promise<void>;
  search(query: string): Promise<SearchHit[]>;

  // memoria
  listFacts(): Promise<MemoryFact[]>;
  confirmFact(id: string, keep: boolean): Promise<void>;
  addFact(text: string, topic: string): Promise<Result>;
  deleteFact(path: string, line: number): Promise<Result>;
  listSummaries(): Promise<SummaryInfo[]>;
  generateSummary(kind: "semanal" | "mensual"): Promise<Result<string>>;

  // rutinas
  routineSuggestions(): Promise<RoutineSuggestion[]>;
  acceptSuggestion(s: RoutineSuggestion): Promise<void>;
  dismissSuggestion(key: string): Promise<void>;
  saveRoutine(r: { title: string; days: number[]; time: string }): Promise<Result>;
  setRoutineActive(path: string, active: boolean): Promise<Result>;
  deleteRoutine(path: string): Promise<Result>;

  // onboarding
  saveProfile(answers: ProfileAnswers): Promise<Result>;
  finishOnboarding(): Promise<void>;

  // modos
  /** Cambia de modo a mano. `null` o "automatico" vuelve al horario. */
  setMode(mode: string | null, duration: ManualDuration | "automatico"): Promise<void>;
  undoMode(): Promise<void>;
  openModeFile(mode: string): Promise<Result>;

  // escuela
  saveSubject(input: SubjectInput, existingPath?: string | null): Promise<Result<string>>;
  saveCycle(cycle: { name: string; start: string; end: string }): Promise<Result>;
  createStudyPlan(input: { title: string; due: string; subject: string | null }): Promise<Result<number>>;
  dueCards(subject?: string | null): Promise<CardInfo[]>;
  gradeCard(id: string, grade: Grade): Promise<void>;
  addCards(subjectPath: string, cards: { question: string; answer: string }[]): Promise<Result<number>>;
  generateCards(subjectPath: string): Promise<Result<number>>;
  studyAction(action: "start" | "break" | "focus" | "stop", subject?: string | null): Promise<void>;

  // personal
  savePayment(p: PaymentInput, replaceLine?: number | null): Promise<Result>;
  deletePayment(line: number): Promise<Result>;
  setBirthday(name: string, date: string): Promise<Result>;
  createList(name: string): Promise<Result<string>>;
  addListItem(path: string, text: string): Promise<Result>;
  toggleListItem(path: string, line: number): Promise<Result>;
  clearList(path: string): Promise<Result<number>>;
  moveTodayToTomorrow(): Promise<Result<number>>;

  // cerebro (ventana oculta de embeddings)
  brainResult(id: string, vectors: number[][] | null, error: string | null): Promise<void>;
  brainStatus(status: "cargando" | "lista" | "error", detail?: string): Promise<void>;
}

export const INVOKE_METHODS: (keyof LumiInvoke)[] = [
  "getSnapshot",
  "togglePanel",
  "showPanel",
  "hidePanel",
  "setPanelPinned",
  "avatarPress",
  "avatarDrag",
  "setAvatarVisible",
  "avatarMenu",
  "bubbleReady",
  "getBubble",
  "bubbleAction",
  "quit",
  "updateSettings",
  "chooseFolder",
  "defaultVaultPath",
  "setupVault",
  "setApiKey",
  "testAI",
  "setOpenAtLogin",
  "openExternal",
  "openInObsidian",
  "revealVault",
  "reindex",
  "checkForUpdates",
  "installUpdate",
  "connectCalendar",
  "disconnectCalendar",
  "addIcs",
  "removeIcs",
  "refreshCalendars",
  "granolaConnect",
  "granolaUseApiKey",
  "granolaDisconnect",
  "granolaSync",
  "granolaDiagnostics",
  "openGranola",
  "parseQuickNote",
  "refineQuickNote",
  "saveTask",
  "toggleTask",
  "deleteTask",
  "getTaskDraft",
  "chatHistory",
  "chatSend",
  "chatClear",
  "undoTask",
  "search",
  "listFacts",
  "confirmFact",
  "addFact",
  "deleteFact",
  "listSummaries",
  "generateSummary",
  "routineSuggestions",
  "acceptSuggestion",
  "dismissSuggestion",
  "saveRoutine",
  "setRoutineActive",
  "deleteRoutine",
  "saveProfile",
  "finishOnboarding",
  "setMode",
  "undoMode",
  "openModeFile",
  "saveSubject",
  "saveCycle",
  "createStudyPlan",
  "dueCards",
  "gradeCard",
  "addCards",
  "generateCards",
  "studyAction",
  "savePayment",
  "deletePayment",
  "setBirthday",
  "createList",
  "addListItem",
  "toggleListItem",
  "clearList",
  "moveTodayToTomorrow",
  "brainResult",
  "brainStatus",
];

/** Vistas del menú que se pueden abrir desde fuera (clic derecho, bandeja). */
export type PanelView = "home" | "appearance" | "chat" | "school" | "personal" | "modes" | "review";

/** Eventos que el proceso principal envía a las ventanas. */
export interface LumiEvents {
  snapshot: AppSnapshot;
  bubble: BubblePayload;
  "panel-opened": null;
  "panel-view": PanelView;
  "chat-delta": { id: string; text: string };
  "brain-task": { id: string; texts: string[] };
  "facts-changed": FactProposal[];
}

export type LumiApi = LumiInvoke & {
  on<K extends keyof LumiEvents>(event: K, cb: (payload: LumiEvents[K]) => void): () => void;
  platform: string;
};
