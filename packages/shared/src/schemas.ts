/** Esquemas zod: configuración de la app y frontmatter del vault. */
import { z } from "zod";
import { AvatarConfig, DEFAULT_AVATAR } from "./avatar.ts";
import { ModesConfig, defaultModesConfig } from "./modes.ts";

export const ProviderId = z.enum(["claude", "gemini"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const ModelProfiles = z.object({
  rapido: z.string(),
  inteligente: z.string(),
});

/** Modelos por defecto (editables en Ajustes; nunca fijos en el código que los usa). */
export const DEFAULT_MODELS = {
  claude: { rapido: "claude-haiku-5-5", inteligente: "claude-sonnet-5-5" },
  gemini: { rapido: "gemini-3.5-flash-lite", inteligente: "gemini-3.8-flash" },
} as const;

export const IcsSource = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  enabled: z.boolean().default(true),
  /** «entregas»: calendario de la plataforma de la escuela (Moodle, Canvas…); sus eventos se vuelven pendientes. */
  kind: z.enum(["calendario", "entregas"]).default("calendario"),
});
export type IcsSource = z.infer<typeof IcsSource>;

export const Settings = z.object({
  userName: z.string().default(""),
  onboarded: z.boolean().default(false),
  onboardingStep: z.number().default(0),
  vaultPath: z.string().nullable().default(null),

  ai: z
    .object({
      enabled: z.boolean().default(true),
      provider: ProviderId.default("claude"),
      models: z
        .object({
          claude: ModelProfiles.default({ ...DEFAULT_MODELS.claude }),
          gemini: ModelProfiles.default({ ...DEFAULT_MODELS.gemini }),
        })
        .default({ claude: { ...DEFAULT_MODELS.claude }, gemini: { ...DEFAULT_MODELS.gemini } }),
      geminiPrivacyAccepted: z.boolean().default(false),
      semanticSearch: z.boolean().default(true),
    })
    .default({
      enabled: true,
      provider: "claude",
      models: { claude: { ...DEFAULT_MODELS.claude }, gemini: { ...DEFAULT_MODELS.gemini } },
      geminiPrivacyAccepted: false,
      semanticSearch: true,
    }),

  learn: z.boolean().default(true),
  postProcessMeetings: z.boolean().default(true),

  meetingLeadMin: z.number().default(10),
  systemNotifications: z.boolean().default(true),
  askGranolaBeforeMeeting: z.boolean().default(true),
  openAtLogin: z.boolean().default(false),
  defaultReminderTime: z.string().default("09:00"),

  calendars: z
    .object({
      google: z.object({ connected: z.boolean().default(false), email: z.string().nullable().default(null) }).default({ connected: false, email: null }),
      microsoft: z.object({ connected: z.boolean().default(false), email: z.string().nullable().default(null) }).default({ connected: false, email: null }),
      ics: z.array(IcsSource).default([]),
      /** Credenciales OAuth propias (opcional; si no, se usan las del build). */
      googleClientId: z.string().default(""),
      googleClientSecret: z.string().default(""),
      microsoftClientId: z.string().default(""),
    })
    .default({
      google: { connected: false, email: null },
      microsoft: { connected: false, email: null },
      ics: [],
      googleClientId: "",
      googleClientSecret: "",
      microsoftClientId: "",
    }),

  granola: z
    .object({
      mode: z.enum(["none", "mcp", "api"]).default("none"),
      lastSync: z.string().nullable().default(null),
      consentAccepted: z.boolean().default(false),
    })
    .default({ mode: "none", lastSync: null, consentAccepted: false }),

  dismissedSuggestions: z.array(z.string()).default([]),
  lastGreeting: z.string().nullable().default(null),
  lastSuggestionCheck: z.string().nullable().default(null),
  lastWeeklySummary: z.string().nullable().default(null),
  lastMonthlySummary: z.string().nullable().default(null),
  avatarPos: z.object({ x: z.number(), y: z.number() }).nullable().default(null),
  /** Cómo se ve Lumi (ropa, cabello, lentes, accesorios). */
  avatar: AvatarConfig.default({ ...DEFAULT_AVATAR }),

  /**
   * «adulto»: Lumi completo. «menor»: Lumi sin IA (ningún proveedor se usa).
   * null: no se ha preguntado (instalaciones anteriores a los modos cuentan como adulto).
   */
  ageGroup: z.enum(["adulto", "menor"]).nullable().default(null),
  /** Modos (Trabajo, Escuela, Personal…), horario y calendarios asignados. */
  modes: ModesConfig.default(() => defaultModesConfig()),
  /** Ya se mostró el aviso de «ahora tengo modos» (instalaciones anteriores). */
  modesIntroduced: z.boolean().default(false),
  school: z
    .object({
      /** Minutos antes de cada clase para avisar. */
      classLeadMin: z.number().default(10),
      /** Avisar de semanas cargadas. */
      loadAlerts: z.boolean().default(true),
      /** Recordar el repaso de tarjetas una vez al día. */
      reviewNudge: z.boolean().default(true),
      /** Minutos de enfoque y de descanso de la sesión de estudio. */
      focusMin: z.number().default(25),
      breakMin: z.number().default(5),
    })
    .default({ classLeadMin: 10, loadAlerts: true, reviewNudge: true, focusMin: 25, breakMin: 5 }),
  personal: z
    .object({
      /** Cierre del día: qué hiciste y qué pasa a mañana. */
      closeDay: z.boolean().default(true),
      closeDayTime: z.string().default("20:30"),
      birthdayLeadDays: z.number().default(3),
    })
    .default({ closeDay: true, closeDayTime: "20:30", birthdayLeadDays: 3 }),
  /** Carpetas donde viven tus clientes y proyectos (relativas al vault o rutas completas). */
  catalog: z
    .object({
      clientsDir: z.string().nullable().default(null),
      projectsDir: z.string().nullable().default(null),
      /** Ya se buscaron solas una vez (para no volver a sugerir). */
      autoDetected: z.boolean().default(false),
      /** Proyecto (slug) → cliente, cuando tú lo asignas. */
      assign: z.record(z.string(), z.string()).default({}),
    })
    .default({ clientsDir: null, projectsDir: null, autoDetected: false, assign: {} }),
  lastDayClose: z.string().nullable().default(null),
  lastLoadAlert: z.string().nullable().default(null),
  lastReviewNudge: z.string().nullable().default(null),
});
export type Settings = z.infer<typeof Settings>;

export function defaultSettings(): Settings {
  return Settings.parse({});
}

/* ----------------------------- Frontmatter ----------------------------- */

const linkOrString = z.string();

export const ReunionFrontmatter = z.object({
  type: z.literal("reunion"),
  source: z.string(),
  granola_id: z.string().optional(),
  title: z.string(),
  date: z.string(),
  start: z.string().optional(),
  duration_min: z.number().optional(),
  attendees: z.array(linkOrString).default([]),
  cliente: linkOrString.optional(),
  proyecto: linkOrString.optional(),
  tags: z.array(z.string()).default(["reunion"]),
  lumi_procesada: z.boolean().default(false),
  updated: z.string().optional(),
});
export type ReunionFrontmatter = z.infer<typeof ReunionFrontmatter>;

export const EntidadFrontmatter = z.object({
  type: z.enum(["persona", "cliente", "proyecto"]),
  aliases: z.array(z.string()).default([]),
  relacion: z.string().optional(),
  estado: z.string().optional(),
  tags: z.array(z.string()).default([]),
  source: z.string().optional(),
  updated: z.string().optional(),
});

export const RutinaFrontmatter = z.object({
  type: z.literal("rutina"),
  modo: z.string().optional(),
  dias: z.array(z.string()).default(["lunes", "martes", "miércoles", "jueves", "viernes"]),
  hora: z.string().default("09:00"),
  activa: z.boolean().default(true),
  source: z.string().optional(),
  updated: z.string().optional(),
});
export type RutinaFrontmatter = z.infer<typeof RutinaFrontmatter>;
