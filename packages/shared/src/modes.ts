/**
 * Modos de Lumi: Trabajo, Escuela, Personal (y los que el usuario cree).
 *
 * Un modo es un "sombrero": la misma Lumi y el mismo vault, pero cambia qué
 * ve (alcance), cómo habla (90-Lumi/modos/<id>.md), qué muestra, qué avisa,
 * cómo se ve y, si se quiere, qué IA usa.
 *
 * El modo activo se calcula (no se guarda) con esta precedencia:
 *   fijado a mano > manual temporal > evento de calendario asignado >
 *   horario semanal > modo por defecto.
 *
 * Días: 0 = domingo … 6 = sábado (igual que las rutinas).
 */
import { z } from "zod";
import { slugify, stripAccents } from "./slug.ts";
import { applyAvatarPatch, type AvatarConfig } from "./avatar.ts";

export const MODE_WIDGETS = [
  "reuniones",
  "pendientes",
  "enfoque",
  "clase",
  "entregas",
  "repaso",
  "estudio",
  "dia",
  "habitos",
  "pagos",
  "cumpleanos",
  "listas",
] as const;
export type ModeWidget = (typeof MODE_WIDGETS)[number];

const Hhmm = z.string().regex(/^\d{1,2}:\d{2}$/);

export const Mode = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nombre: z.string().min(1),
  icono: z.string().default("✨"),
  color: z.string().default("#5B57D1"),
  enabled: z.boolean().default(true),
  /** Qué notas son de este modo (además de `modo:` en el encabezado). */
  alcance: z
    .object({
      carpetas: z.array(z.string()).default([]),
      etiquetas: z.array(z.string()).default([]),
    })
    .default({ carpetas: [], etiquetas: [] }),
  /** Tarjetas de la pestaña «Hoy», en orden. */
  panel: z.array(z.enum(MODE_WIDGETS)).default(["pendientes"]),
  notificaciones: z
    .object({
      /** Mientras este modo está activo, los avisos de otros modos esperan (salvo los urgentes). */
      silenciarOtrosModos: z.boolean().default(false),
      /** Horas sin avisos de pendientes ni rutinas, p. ej. ["22:00", "07:00"]. */
      horasSilencio: z.tuple([Hhmm, Hhmm]).nullable().default(null),
    })
    .default({ silenciarOtrosModos: false, horasSilencio: null }),
  /** Parche sobre el look base de Lumi mientras el modo está activo. */
  apariencia: z.record(z.string(), z.unknown()).nullable().default(null),
  /**
   * Cómo se ordenan los pendientes: por cliente/proyecto o por categoría.
   * null = Trabajo usa clientes; los demás, categorías.
   */
  organizar: z.enum(["clientes", "categorias"]).nullable().default(null),
  /** Categorías de pendientes de este modo. null = las de siempre del modo. */
  categorias: z.array(z.string()).nullable().default(null),
  /** IA de este modo (opcional; si no, la de Ajustes). */
  ia: z
    .object({
      proveedor: z.enum(["claude", "gemini"]).nullable().default(null),
      perfil: z.enum(["rapido", "inteligente"]).nullable().default(null),
    })
    .default({ proveedor: null, perfil: null }),
});
export type Mode = z.infer<typeof Mode>;

export const ScheduleBlock = z.object({
  id: z.string(),
  /** 0 = domingo … 6 = sábado */
  dias: z.array(z.number().int().min(0).max(6)).min(1),
  inicio: Hhmm,
  fin: Hhmm,
  modo: z.string(),
});
export type ScheduleBlock = z.infer<typeof ScheduleBlock>;

export const DEFAULT_MODES: Mode[] = [
  Mode.parse({
    id: "trabajo",
    nombre: "Trabajo",
    icono: "💼",
    color: "#5B57D1",
    alcance: { carpetas: ["02-Reuniones", "04-Proyectos", "05-Clientes"], etiquetas: ["trabajo", "cliente", "proyecto"] },
    panel: ["reuniones", "enfoque", "pendientes"],
  }),
  Mode.parse({
    id: "escuela",
    nombre: "Escuela",
    icono: "📚",
    color: "#E0A01E",
    alcance: { carpetas: ["10-Escuela"], etiquetas: ["escuela", "materia"] },
    panel: ["clase", "estudio", "entregas", "repaso", "pendientes"],
    notificaciones: { silenciarOtrosModos: true, horasSilencio: null },
    apariencia: { lentes: "redondos", lentesColor: "negro", prenda: "playera" },
  }),
  Mode.parse({
    id: "personal",
    nombre: "Personal",
    icono: "🏡",
    color: "#2BA58F",
    alcance: { carpetas: ["20-Personal"], etiquetas: ["personal", "casa"] },
    panel: ["dia", "habitos", "pagos", "cumpleanos", "listas", "pendientes"],
  }),
];

export const ModesConfig = z.object({
  porDefecto: z.string().default("trabajo"),
  /** Cambio manual: hasta una hora (ISO) o fijo (null). */
  fijado: z.object({ modo: z.string(), hasta: z.string().nullable() }).nullable().default(null),
  /** Si viene vacía (configuración incompleta), se usan los tres modos de siempre. */
  lista: z
    .array(Mode)
    .default([])
    .transform((l) => (l.length ? l : DEFAULT_MODES.map((m) => ({ ...m })))),
  horario: z.array(ScheduleBlock).default([]),
  /** Nombre del calendario → modo. Sus eventos activan ese modo mientras duran. */
  calendarios: z.record(z.string(), z.string()).default({}),
  /** El horario de clases de tus materias activa el modo Escuela. */
  clasesActivan: z.boolean().default(true),
});
export type ModesConfig = z.infer<typeof ModesConfig>;

/* --------------------------- Categorías de pendientes --------------------------- */

/** Las categorías con las que arranca cada modo (se pueden cambiar en Ajustes → Modos). */
export const DEFAULT_CATEGORIES: Record<string, string[]> = {
  escuela: ["Trámites", "Extracurricular", "Servicio social"],
  personal: ["Casa", "Compras", "Finanzas", "Salud", "Familia", "Trámites"],
};

export type TaskGrouping = "clientes" | "categorias";

/** ¿Los pendientes de este modo van por cliente/proyecto o por categoría? Sin modo (compartido) = clientes. */
export function taskGrouping(mode: Pick<Mode, "id" | "organizar"> | null | undefined): TaskGrouping {
  if (!mode) return "clientes";
  return mode.organizar ?? (mode.id === "trabajo" ? "clientes" : "categorias");
}

export function modeCategories(mode: Pick<Mode, "id" | "categorias"> | null | undefined): string[] {
  if (!mode) return [];
  return mode.categorias ?? DEFAULT_CATEGORIES[mode.id] ?? [];
}

/** Etiqueta de una categoría: «Casa» en Personal → «personal/casa». */
export function categoryTag(modeId: string, name: string): string {
  return `${modeId}/${slugify(name)}`;
}

/** «personal/super-mercado» → «Super mercado» (si no está en la lista del modo). */
export function prettySlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Nombre de la categoría que dicen las etiquetas de un pendiente (#personal/casa → «Casa»). */
export function categoryFromTags(tags: string[], mode: Pick<Mode, "id" | "categorias"> | null | undefined): string | null {
  if (!mode) return null;
  const pre = `${mode.id}/`;
  const tag = tags.map((t) => t.replace(/^#/, "")).find((t) => t.toLowerCase().startsWith(pre));
  if (!tag) return null;
  const slug = tag.slice(pre.length).toLowerCase();
  return modeCategories(mode).find((c) => slugify(c) === slug) ?? prettySlug(slug);
}

export const BUILTIN_MODE_IDS = DEFAULT_MODES.map((m) => m.id);

/** Configuración por defecto: los tres modos activos y Trabajo como base. */
export function defaultModesConfig(enabled: string[] = BUILTIN_MODE_IDS): ModesConfig {
  return ModesConfig.parse({
    porDefecto: enabled[0] ?? "trabajo",
    lista: DEFAULT_MODES.map((m) => ({ ...m, enabled: enabled.includes(m.id) })),
  });
}

export function enabledModes(cfg: ModesConfig): Mode[] {
  const list = cfg.lista.filter((m) => m.enabled);
  return list.length ? list : cfg.lista.slice(0, 1);
}

export function modeById(cfg: ModesConfig, id: string | null | undefined): Mode | null {
  return cfg.lista.find((m) => m.id === id) ?? null;
}

/** Ruta del archivo de personalidad de un modo. */
export function modeFile(id: string): string {
  return `90-Lumi/modos/${id}.md`;
}

/* ------------------------------ Resolución ------------------------------ */

export type ModeSource = "fijo" | "manual" | "calendario" | "horario" | "defecto";

export interface ModeEvent {
  start: string | Date;
  end: string | Date;
  mode: string;
  label?: string;
}

export interface ResolvedMode {
  mode: string;
  source: ModeSource;
  /** Hasta cuándo dura esta razón (ISO) o null si no se sabe / es fijo. */
  until: string | null;
  /** Qué lo activó: el nombre del bloque, evento o clase. */
  label: string | null;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function at(day: Date, hhmm: string, plusDays = 0): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + plusDays);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Intervalos concretos de un bloque del horario alrededor de `now` (ayer, hoy y los próximos días). */
export function blockIntervals(b: ScheduleBlock, now: Date, daysAhead = 7): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  const overnight = toMin(b.fin) <= toMin(b.inicio);
  for (let i = -1; i <= daysAhead; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (!b.dias.includes(day.getDay())) continue;
    out.push({ start: at(day, b.inicio), end: at(day, b.fin, overnight ? 1 : 0) });
  }
  return out;
}

const time = (v: string | Date) => (v instanceof Date ? v : new Date(v)).getTime();

/** Calcula el modo activo. Es una función pura: fácil de probar. */
export function resolveMode(now: Date, cfg: ModesConfig, events: ModeEvent[] = []): ResolvedMode {
  const enabled = new Set(enabledModes(cfg).map((m) => m.id));
  const t = now.getTime();

  const f = cfg.fijado;
  if (f && enabled.has(f.modo)) {
    if (f.hasta === null) return { mode: f.modo, source: "fijo", until: null, label: null };
    if (time(f.hasta) > t) return { mode: f.modo, source: "manual", until: new Date(f.hasta).toISOString(), label: null };
  }

  // Calendario y clases: gana el que empezó más recientemente (el más concreto)
  const live = events
    .filter((e) => enabled.has(e.mode) && time(e.start) <= t && time(e.end) > t)
    .sort((a, b) => time(b.start) - time(a.start));
  if (live.length) {
    const e = live[0];
    return { mode: e.mode, source: "calendario", until: new Date(e.end).toISOString(), label: e.label ?? null };
  }

  const blocks = cfg.horario
    .filter((b) => enabled.has(b.modo))
    .flatMap((b) => blockIntervals(b, now, 0).map((iv) => ({ ...iv, b })))
    .filter((x) => x.start.getTime() <= t && x.end.getTime() > t)
    .sort((a, b) => b.start.getTime() - a.start.getTime());
  if (blocks.length) {
    const x = blocks[0];
    return { mode: x.b.modo, source: "horario", until: x.end.toISOString(), label: `${x.b.inicio}–${x.b.fin}` };
  }

  const def = enabled.has(cfg.porDefecto) ? cfg.porDefecto : [...enabled][0] ?? "trabajo";
  const next = nextBoundary(now, cfg, events);
  return { mode: def, source: "defecto", until: next ? next.toISOString() : null, label: null };
}

/** Próximo momento en que empieza o termina un bloque o evento (para «hasta el siguiente bloque»). */
export function nextBoundary(now: Date, cfg: ModesConfig, events: ModeEvent[] = []): Date | null {
  const enabled = new Set(enabledModes(cfg).map((m) => m.id));
  const t = now.getTime();
  const limit = t + 7 * 86400000;
  let best: number | null = null;
  const consider = (ms: number) => {
    if (ms > t + 30_000 && ms < limit && (best === null || ms < best)) best = ms;
  };
  for (const b of cfg.horario) {
    if (!enabled.has(b.modo)) continue;
    for (const iv of blockIntervals(b, now)) {
      consider(iv.start.getTime());
      consider(iv.end.getTime());
    }
  }
  for (const e of events) {
    if (!enabled.has(e.mode)) continue;
    consider(time(e.start));
    consider(time(e.end));
  }
  return best === null ? null : new Date(best);
}

export type ManualDuration = "bloque" | "hora" | "hoy" | "fijo";

/** Hasta cuándo dura un cambio manual. */
export function manualUntil(choice: ManualDuration, now: Date, cfg: ModesConfig, events: ModeEvent[] = []): string | null {
  if (choice === "fijo") return null;
  if (choice === "hora") return new Date(now.getTime() + 3600_000).toISOString();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 6, 0, 0, 0);
  if (choice === "hoy") return tomorrow.toISOString();
  const next = nextBoundary(now, cfg, events);
  return (next ?? tomorrow).toISOString();
}

export const SOURCE_LABEL: Record<ModeSource, string> = {
  fijo: "fijado a mano",
  manual: "elegido a mano",
  calendario: "por tu calendario",
  horario: "por tu horario",
  defecto: "modo por defecto",
};

const hhmmOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** «Escuela 📚 (por tu horario, hasta 14:00)» */
export function describeMode(r: ResolvedMode, cfg: ModesConfig, now = new Date()): string {
  const m = modeById(cfg, r.mode);
  const name = m ? `${m.nombre} ${m.icono}` : r.mode;
  let until = "";
  if (r.until) {
    const d = new Date(r.until);
    const sameDay = d.toDateString() === now.toDateString();
    until = sameDay ? `, hasta ${hhmmOf(r.until)}` : `, hasta ${["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getDay()]} ${hhmmOf(r.until)}`;
  }
  return `${name} (${SOURCE_LABEL[r.source]}${r.label && r.source === "calendario" ? `: ${r.label}` : ""}${until})`;
}

/* ------------------------------- Alcance ------------------------------- */

const norm = (s: string) => stripAccents(s).toLowerCase().trim();

function tagMatches(tag: string, m: Mode): boolean {
  const t = norm(tag.replace(/^#/, ""));
  const keys = [m.id, ...m.alcance.etiquetas].map(norm);
  return keys.some((k) => t === k || t.startsWith(`${k}/`));
}

/** Modo de una etiqueta suelta (#escuela/calculo → escuela) o null. */
export function modeOfTag(tag: string, modes: Mode[]): string | null {
  return modes.find((m) => tagMatches(tag, m))?.id ?? null;
}

/**
 * ¿A qué modo pertenece una nota? En orden: `modo:` del encabezado, carpeta
 * del modo, etiqueta (#trabajo, #escuela/…, #personal). Sin modo = compartida.
 * Solo cuentan los modos activos.
 */
export function modeOfNote(rel: string, fm: Record<string, unknown>, tags: string[], modes: Mode[]): string | null {
  if (typeof fm.modo === "string" && fm.modo.trim()) {
    const v = norm(fm.modo);
    const hit = modes.find((m) => m.id === v || norm(m.nombre) === v);
    if (hit) return hit.id;
  }
  const lower = rel.toLowerCase();
  for (const m of modes) {
    if (m.alcance.carpetas.some((c) => c && lower.startsWith(`${c.replace(/\/+$/, "").toLowerCase()}/`))) return m.id;
  }
  for (const t of tags) {
    const hit = modeOfTag(t, modes);
    if (hit) return hit;
  }
  return null;
}

/** Un pendiente: su propia etiqueta manda; si no, el modo de su nota. */
export function modeOfTask(lineTags: string[], noteMode: string | null, modes: Mode[]): string | null {
  for (const t of lineTags) {
    const hit = modeOfTag(t, modes);
    if (hit) return hit;
  }
  return noteMode;
}

/** ¿Se ve en el modo activo? Lo compartido (null) se ve siempre; «Todo» lo muestra todo. */
export function inScope(itemMode: string | null | undefined, active: string, all = false): boolean {
  return all || !itemMode || itemMode === active;
}

/** Saca #trabajo, #escuela, #personal (o de modos propios) de una nota rápida. */
export function extractModeTag(text: string, modes: Mode[]): { text: string; mode: string | null } {
  let mode: string | null = null;
  const out = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)(?=\s|$)/gu, (whole, pre: string, word: string) => {
    const hit = modes.find((m) => norm(m.id) === norm(word) || norm(m.nombre) === norm(word));
    if (!hit) return whole;
    mode ??= hit.id;
    return pre;
  });
  return { text: out.replace(/\s{2,}/g, " ").trim(), mode };
}

/** ¿`now` cae dentro de un rango "HH:MM"–"HH:MM" (que puede cruzar medianoche)? */
export function withinHours(now: Date, range: [string, string] | null | undefined): boolean {
  if (!range) return false;
  const n = now.getHours() * 60 + now.getMinutes();
  const a = toMin(range[0]);
  const b = toMin(range[1]);
  return a <= b ? n >= a && n < b : n >= a || n < b;
}

/** Id para un modo nuevo a partir de su nombre. */
export function modeIdFrom(name: string, taken: string[]): string {
  const base = norm(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "modo";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

/** El look de Lumi en un modo: el look base con el parche del modo encima. */
export function modeLook(base: AvatarConfig, cfg: ModesConfig, modeId: string | null | undefined): AvatarConfig {
  const m = modeById(cfg, modeId);
  return m?.apariencia ? applyAvatarPatch(base, m.apariencia).next : base;
}
