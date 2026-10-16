/**
 * Apariencia de Lumi: catálogo de piezas, personajes base y utilidades.
 *
 * Lumi es una esferita que flota. La silueta redonda siempre manda: el
 * cabello vive arriba, la ropa abajo y la cara queda libre (salvo lentes).
 * Todos los personajes comparten los ojos grandes con brillo, los cachetes
 * redondos y (si se quiere) la antena de la Lumi clásica.
 * Todo se dibuja en un lienzo de 200×200 con la esfera en (100,112) r 62.
 * Se guarda en la configuración de la app (`settings.avatar`).
 */
import { z } from "zod";

export type BodyId =
  | "clasica" | "lila" | "rosa" | "rojo" | "coral" | "sol" | "menta" | "cielo" | "noche"
  | "clara" | "media" | "morena" | "oscura";
export type BaseId = "femenina" | "masculina" | "neutral";
export type EyeColorId = "negro" | "cafe" | "miel" | "verde" | "azul" | "violeta";
export type HairId =
  | "ninguno" | "mechon"
  | "fleco" | "coletas" | "chongo" | "rizos" | "cola" | "trenzas" | "bob"
  | "corto" | "lateral" | "picos" | "rapado" | "copete" | "rizado" | "mohicano";
export type HairColorId = "negro" | "castano" | "rubio" | "pelirrojo" | "lila";
export type FacialId = "ninguno" | "barba" | "bigote";
export type OutfitId =
  | "ninguna" | "playera" | "rayas" | "bufanda" | "capa"
  | "blusa" | "vestido" | "overol"
  | "camisa" | "corbata" | "corbatin" | "jersey"
  | "bata" | "delantal" | "chaleco";
export type ColorId =
  | "indigo" | "lila" | "cielo" | "verde" | "menta" | "rosa" | "rojo" | "coral" | "naranja" | "mostaza"
  | "blanco" | "grafito" | "negro";
export type GlassesId = "ninguno" | "redondos" | "cuadrados" | "gato" | "sol";
export type FrameId = "negro" | "carey" | "indigo" | "dorado";
export type AccessoryId = "ninguno" | "gorra" | "gorro" | "audifonos" | "mono" | "boina" | "casco" | "chef";
/** Para separar en el editor lo pensado para ella, para él, para trabajar o para todos. */
export type StyleGroup = "ella" | "el" | "trabajo" | "todos";

interface Option<T extends string> {
  id: T;
  label: string;
  /** Solo es una guía visual: cualquier pieza sirve en cualquier base. */
  group?: StyleGroup;
}

export const GROUP_LABELS: Record<StyleGroup, string> = {
  ella: "Para ella",
  el: "Para él",
  trabajo: "Trabajo",
  todos: "Para todos",
};
interface Swatch<T extends string> extends Option<T> {
  hex: string;
}
export interface Body extends Swatch<BodyId> {
  /** "lumi": colores de la marca · "piel": tonos de piel. */
  kind: "lumi" | "piel";
  /** Cuerpo claro: boca y cejas oscuras (en los oscuros van blancas). */
  light: boolean;
  /** Color de los cachetes. */
  cheek: string;
}

/** Colores de la marca primero (la clásica es la Lumi de siempre) y luego tonos de piel. */
export const BODIES: Body[] = [
  { id: "clasica", label: "Morada clásica", hex: "#5B57D1", kind: "lumi", light: false, cheek: "#F4B740" },
  { id: "lila", label: "Lila", hex: "#8C88EC", kind: "lumi", light: true, cheek: "#F4B740" },
  { id: "rosa", label: "Rosa", hex: "#F08DB0", kind: "lumi", light: true, cheek: "#E0567F" },
  { id: "rojo", label: "Rojo", hex: "#E0565B", kind: "lumi", light: false, cheek: "#F4B740" },
  { id: "coral", label: "Coral", hex: "#F0896B", kind: "lumi", light: true, cheek: "#D9534A" },
  { id: "sol", label: "Sol", hex: "#F4B740", kind: "lumi", light: true, cheek: "#EF7D5E" },
  { id: "menta", label: "Menta", hex: "#4CC2AE", kind: "lumi", light: true, cheek: "#F4B740" },
  { id: "cielo", label: "Cielo", hex: "#5AA7E8", kind: "lumi", light: true, cheek: "#F4B740" },
  { id: "noche", label: "Noche", hex: "#33375A", kind: "lumi", light: false, cheek: "#F4B740" },
  { id: "clara", label: "Piel clara", hex: "#F6D3B8", kind: "piel", light: true, cheek: "#F28B8B" },
  { id: "media", label: "Piel media", hex: "#E8B48F", kind: "piel", light: true, cheek: "#F28B8B" },
  { id: "morena", label: "Piel morena", hex: "#C68A5E", kind: "piel", light: true, cheek: "#F28B8B" },
  { id: "oscura", label: "Piel morena oscura", hex: "#8D5A3B", kind: "piel", light: true, cheek: "#F28B8B" },
];

export const BASES: Option<BaseId>[] = [
  { id: "femenina", label: "Femenina" },
  { id: "masculina", label: "Masculina" },
  { id: "neutral", label: "Neutral" },
];

export const EYE_COLORS: Swatch<EyeColorId>[] = [
  { id: "negro", label: "negros", hex: "#1B1D33" },
  { id: "cafe", label: "cafés", hex: "#7A4A2A" },
  { id: "miel", label: "miel", hex: "#C98A2E" },
  { id: "verde", label: "verdes", hex: "#2F9466" },
  { id: "azul", label: "azules", hex: "#3B7FD6" },
  { id: "violeta", label: "violeta", hex: "#7B6CF6" },
];

export const HAIRS: Option<HairId>[] = [
  { id: "ninguno", label: "Sin cabello", group: "todos" },
  { id: "mechon", label: "Mechón", group: "todos" },
  { id: "fleco", label: "Fleco", group: "ella" },
  { id: "bob", label: "Bob", group: "ella" },
  { id: "cola", label: "Cola de caballo", group: "ella" },
  { id: "coletas", label: "Coletas", group: "ella" },
  { id: "trenzas", label: "Trenzas", group: "ella" },
  { id: "chongo", label: "Chongo", group: "ella" },
  { id: "rizos", label: "Rizos", group: "ella" },
  { id: "corto", label: "Corto", group: "el" },
  { id: "lateral", label: "Raya de lado", group: "el" },
  { id: "picos", label: "Picos", group: "el" },
  { id: "copete", label: "Copete", group: "el" },
  { id: "rizado", label: "Rizado corto", group: "el" },
  { id: "rapado", label: "Rapado", group: "el" },
  { id: "mohicano", label: "Mohicano", group: "el" },
];

export const HAIR_COLORS: Swatch<HairColorId>[] = [
  { id: "negro", label: "negro", hex: "#2B2321" },
  { id: "castano", label: "castaño", hex: "#6B4226" },
  { id: "rubio", label: "rubio", hex: "#D9A441" },
  { id: "pelirrojo", label: "pelirrojo", hex: "#B5523B" },
  { id: "lila", label: "lila", hex: "#7B6CF6" },
];

export const FACIALS: Option<FacialId>[] = [
  { id: "ninguno", label: "Sin vello" },
  { id: "barba", label: "Barba" },
  { id: "bigote", label: "Bigote" },
];

export const OUTFITS: Option<OutfitId>[] = [
  { id: "ninguna", label: "Sin ropa", group: "todos" },
  { id: "playera", label: "Playera", group: "todos" },
  { id: "rayas", label: "Rayas", group: "todos" },
  { id: "bufanda", label: "Bufanda", group: "todos" },
  { id: "capa", label: "Capa", group: "todos" },
  { id: "blusa", label: "Blusa", group: "ella" },
  { id: "vestido", label: "Vestido", group: "ella" },
  { id: "overol", label: "Overol", group: "ella" },
  { id: "camisa", label: "Camisa", group: "el" },
  { id: "corbata", label: "Camisa y corbata", group: "el" },
  { id: "corbatin", label: "Corbatín", group: "el" },
  { id: "jersey", label: "Jersey", group: "el" },
  { id: "bata", label: "Bata", group: "trabajo" },
  { id: "delantal", label: "Delantal", group: "trabajo" },
  { id: "chaleco", label: "Chaleco reflejante", group: "trabajo" },
];

/** Colores de ropa y accesorios (tonos de la marca, más blanco y negro). */
export const COLORS: Swatch<ColorId>[] = [
  { id: "indigo", label: "índigo", hex: "#4B4BD8" },
  { id: "lila", label: "lila", hex: "#8C7CF0" },
  { id: "cielo", label: "cielo", hex: "#4C9BE0" },
  { id: "verde", label: "verde azulado", hex: "#2E9C8F" },
  { id: "menta", label: "menta", hex: "#5CCDB5" },
  { id: "rosa", label: "rosa", hex: "#E9719E" },
  { id: "rojo", label: "rojo", hex: "#D6454B" },
  { id: "coral", label: "coral", hex: "#E86F5A" },
  { id: "naranja", label: "naranja", hex: "#F08A24" },
  { id: "mostaza", label: "mostaza", hex: "#E2A33B" },
  { id: "blanco", label: "blanco", hex: "#F7F6FC" },
  { id: "grafito", label: "grafito", hex: "#3B3F55" },
  { id: "negro", label: "negro", hex: "#23263A" },
];

export const GLASSES: Option<GlassesId>[] = [
  { id: "ninguno", label: "Sin lentes" },
  { id: "redondos", label: "Redondos" },
  { id: "cuadrados", label: "Cuadrados" },
  { id: "gato", label: "Ojo de gato" },
  { id: "sol", label: "De sol" },
];

export const FRAMES: Swatch<FrameId>[] = [
  { id: "negro", label: "negro", hex: "#1B1D33" },
  { id: "carey", label: "carey", hex: "#B5523B" },
  { id: "indigo", label: "índigo", hex: "#4B4BD8" },
  { id: "dorado", label: "dorado", hex: "#D9A441" },
];

export const ACCESSORIES: Option<AccessoryId>[] = [
  { id: "ninguno", label: "Ninguno" },
  { id: "gorra", label: "Gorra" },
  { id: "gorro", label: "Gorro" },
  { id: "audifonos", label: "Audífonos" },
  { id: "mono", label: "Moño" },
  { id: "boina", label: "Boina" },
  { id: "casco", label: "Casco de obra", group: "trabajo" },
  { id: "chef", label: "Gorro de chef", group: "trabajo" },
];

/** Gorros que tapan la antena: con ellos no se dibuja. */
const HATS: AccessoryId[] = ["gorra", "gorro", "boina", "casco", "chef"];

// ---------- esquema (se valida al guardar la configuración) ----------

const ids = <T extends string>(list: { id: T }[]) => list.map((x) => x.id) as [T, ...T[]];

export const AvatarConfig = z.object({
  /** Punto de partida: cambia pestañas y grosor de cejas, nada más. */
  base: z.enum(ids(BASES)).catch("neutral"),
  cuerpo: z.enum(ids(BODIES)).catch("clasica"),
  ojos: z.enum(ids(EYE_COLORS)).catch("negro"),
  /** La antena de la Lumi clásica (se esconde sola con gorra, gorro o boina). */
  antena: z.boolean().catch(true),
  cabello: z.enum(ids(HAIRS)).catch("ninguno"),
  cabelloColor: z.enum(ids(HAIR_COLORS)).catch("castano"),
  vello: z.enum(ids(FACIALS)).catch("ninguno"),
  prenda: z.enum(ids(OUTFITS)).catch("ninguna"),
  prendaColor: z.enum(ids(COLORS)).catch("indigo"),
  lentes: z.enum(ids(GLASSES)).catch("ninguno"),
  lentesColor: z.enum(ids(FRAMES)).catch("negro"),
  accesorio: z.enum(ids(ACCESSORIES)).catch("ninguno"),
  accesorioColor: z.enum(ids(COLORS)).catch("mostaza"),
  /** Prenda que Lumi se pone sola cuando hay una reunión por empezar (ver `formalFor`). */
  reunion: z.enum(ids(OUTFITS)).nullable().catch(null),
});
export type AvatarConfig = z.infer<typeof AvatarConfig>;

/** La Lumi de siempre: morada, con antena y sin ropa. */
export const DEFAULT_AVATAR: AvatarConfig = {
  base: "neutral",
  cuerpo: "clasica",
  ojos: "negro",
  antena: true,
  cabello: "ninguno",
  cabelloColor: "castano",
  vello: "ninguno",
  prenda: "ninguna",
  prendaColor: "indigo",
  lentes: "ninguno",
  lentesColor: "negro",
  accesorio: "ninguno",
  accesorioColor: "mostaza",
  reunion: null,
};

export interface Preset {
  id: string;
  name: string;
  base: BaseId | "clasica";
  look: AvatarConfig;
}

const p = (id: string, name: string, base: BaseId, look: Partial<AvatarConfig>): Preset => ({
  id,
  name,
  base,
  look: { ...DEFAULT_AVATAR, base, ...look },
});

/** Personajes para elegir en la bienvenida y en el editor: todos "hermanos" de Lumi. */
export const PRESETS: Preset[] = [
  { id: "clasica", name: "Lumi", base: "clasica", look: DEFAULT_AVATAR },
  p("luz", "Luz", "femenina", { cuerpo: "rosa", ojos: "cafe", cabello: "coletas", cabelloColor: "castano", prenda: "vestido", prendaColor: "indigo", lentes: "redondos" }),
  p("itzel", "Itzel", "femenina", { cuerpo: "lila", ojos: "miel", antena: false, cabello: "cola", cabelloColor: "negro", prenda: "blusa", prendaColor: "coral", accesorio: "mono", accesorioColor: "mostaza" }),
  p("maya", "Maya", "femenina", { cuerpo: "menta", ojos: "verde", antena: false, cabello: "rizos", cabelloColor: "negro", prenda: "overol", prendaColor: "mostaza", accesorio: "audifonos", accesorioColor: "indigo" }),
  p("leo", "Leo", "masculina", { cuerpo: "cielo", ojos: "azul", cabello: "picos", cabelloColor: "rubio", prenda: "jersey", prendaColor: "coral" }),
  p("diego", "Diego", "masculina", { cuerpo: "noche", ojos: "cafe", cabello: "lateral", cabelloColor: "negro", prenda: "corbata", prendaColor: "coral", lentes: "cuadrados", lentesColor: "dorado" }),
  p("andres", "Andrés", "masculina", { cuerpo: "rojo", ojos: "cafe", cabello: "corto", cabelloColor: "castano", vello: "barba", prenda: "chaleco", prendaColor: "mostaza", accesorio: "casco", accesorioColor: "mostaza" }),
];

// ---------- utilidades ----------

const FIELDS: { [K in keyof AvatarConfig]: readonly (string | boolean | null)[] } = {
  base: BASES.map((x) => x.id),
  cuerpo: BODIES.map((x) => x.id),
  ojos: EYE_COLORS.map((x) => x.id),
  antena: [true, false],
  cabello: HAIRS.map((x) => x.id),
  cabelloColor: HAIR_COLORS.map((x) => x.id),
  vello: FACIALS.map((x) => x.id),
  prenda: OUTFITS.map((x) => x.id),
  prendaColor: COLORS.map((x) => x.id),
  lentes: GLASSES.map((x) => x.id),
  lentesColor: FRAMES.map((x) => x.id),
  accesorio: ACCESSORIES.map((x) => x.id),
  accesorioColor: COLORS.map((x) => x.id),
  reunion: [...OUTFITS.map((x) => x.id), null],
};

/** Aplica solo los campos válidos de `patch`. Devuelve el resultado y qué cambió. */
export function applyAvatarPatch(current: AvatarConfig, patch: unknown): { next: AvatarConfig; changed: (keyof AvatarConfig)[] } {
  const next: AvatarConfig = { ...current };
  const changed: (keyof AvatarConfig)[] = [];
  if (!patch || typeof patch !== "object") return { next, changed };
  const src = { ...(patch as Record<string, unknown>) };
  // Configuraciones viejas: la antena era un accesorio
  if (src.accesorio === "antena") {
    src.accesorio = "ninguno";
    if (!("antena" in src)) src.antena = true;
  }
  for (const key of Object.keys(FIELDS) as (keyof AvatarConfig)[]) {
    if (!(key in src)) continue;
    const v = src[key];
    if (!FIELDS[key].includes(v as string | boolean | null)) continue;
    if (next[key] !== v) {
      (next as unknown as Record<string, unknown>)[key] = v;
      changed.push(key);
    }
  }
  return { next, changed };
}

/** Completa lo que falte para que un avatar guardado siempre tenga la forma correcta. */
export function normalizeAvatar(raw: unknown): AvatarConfig {
  return applyAvatarPatch(DEFAULT_AVATAR, raw).next;
}

export function sameAvatar(a: AvatarConfig, b: AvatarConfig): boolean {
  return (Object.keys(FIELDS) as (keyof AvatarConfig)[]).every((k) => a[k] === b[k]);
}

/** ¿Se ve la antena? (los gorros la tapan) */
export function showsAntenna(a: AvatarConfig): boolean {
  return a.antena && !HATS.includes(a.accesorio);
}

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** Piezas que tocan a una base: las suyas y las de todos (y trabajo para ropa). */
export function forBase<T extends string>(list: Option<T>[], base: BaseId): Option<T>[] {
  const mine: StyleGroup | null = base === "femenina" ? "ella" : base === "masculina" ? "el" : null;
  return list.filter((o) => !o.group || o.group === "todos" || o.group === "trabajo" || mine === null || o.group === mine);
}

/** Ropa formal que Lumi se pone sola en reuniones, según su base. */
export function formalFor(base: BaseId): OutfitId {
  return base === "femenina" ? "blusa" : base === "masculina" ? "corbata" : "corbatin";
}

export function randomAvatar(current: AvatarConfig): AvatarConfig {
  const base = pick(BASES).id;
  return {
    ...current,
    base,
    cuerpo: pick(BODIES).id,
    ojos: pick(EYE_COLORS).id,
    antena: Math.random() < 0.6,
    cabello: pick(forBase(HAIRS, base).filter((h) => h.id !== "ninguno")).id,
    cabelloColor: pick(HAIR_COLORS).id,
    vello: base === "masculina" ? pick(FACIALS).id : "ninguno",
    prenda: pick(forBase(OUTFITS, base).filter((o) => o.id !== "ninguna")).id,
    prendaColor: pick(COLORS).id,
    lentes: pick(GLASSES).id,
    lentesColor: pick(FRAMES).id,
    accesorio: pick(ACCESSORIES).id,
    accesorioColor: pick(COLORS).id,
  };
}

export function bodyOf(id: BodyId): Body {
  return BODIES.find((x) => x.id === id) ?? BODIES[0];
}

export const hexOf = {
  body: (id: BodyId) => bodyOf(id).hex,
  eyes: (id: EyeColorId) => (EYE_COLORS.find((x) => x.id === id) ?? EYE_COLORS[0]).hex,
  hair: (id: HairColorId) => (HAIR_COLORS.find((x) => x.id === id) ?? HAIR_COLORS[0]).hex,
  color: (id: ColorId) => (COLORS.find((x) => x.id === id) ?? COLORS[0]).hex,
  frame: (id: FrameId) => (FRAMES.find((x) => x.id === id) ?? FRAMES[0]).hex,
};

export function isLightBody(id: BodyId): boolean {
  return bodyOf(id).light;
}

const label = <T extends string>(list: Option<T>[], id: T) => (list.find((x) => x.id === id) ?? { label: id }).label;

/** Descripción corta en español, para la interfaz y para la IA. */
export function describeAvatar(a: AvatarConfig): string {
  const b = bodyOf(a.cuerpo);
  const parts: string[] = [a.cuerpo === "clasica" ? "cuerpo morado clásico" : b.kind === "piel" ? b.label.toLowerCase() : `cuerpo ${b.label.toLowerCase()}`];
  if (a.ojos !== "negro") parts.push(`ojos ${label(EYE_COLORS, a.ojos)}`);
  if (a.cabello !== "ninguno") parts.push(`cabello ${label(HAIRS, a.cabello).toLowerCase()} ${label(HAIR_COLORS, a.cabelloColor)}`);
  if (a.vello !== "ninguno") parts.push(label(FACIALS, a.vello).toLowerCase());
  if (a.prenda !== "ninguna") parts.push(`${label(OUTFITS, a.prenda).toLowerCase()} ${label(COLORS, a.prendaColor)}`);
  if (a.lentes !== "ninguno") parts.push(`lentes ${label(GLASSES, a.lentes).toLowerCase()}`);
  if (a.accesorio !== "ninguno") parts.push(`${label(ACCESSORIES, a.accesorio).toLowerCase()} ${label(COLORS, a.accesorioColor)}`);
  if (showsAntenna(a)) parts.push("antena");
  return parts.join(", ");
}

/** Lista de ids válidos, para que la IA pueda pedir cambios. */
export function avatarCatalogText(): string {
  const ids = (k: keyof AvatarConfig) => FIELDS[k].filter((x) => x !== null).join(" | ");
  return [
    `cuerpo: ${ids("cuerpo")}`,
    `ojos: ${ids("ojos")}`,
    `antena: true | false`,
    `base: ${ids("base")}`,
    `cabello: ${ids("cabello")} · cabelloColor: ${ids("cabelloColor")}`,
    `vello: ${ids("vello")}`,
    `prenda: ${ids("prenda")} · prendaColor: ${ids("prendaColor")}`,
    `lentes: ${ids("lentes")} · lentesColor: ${ids("lentesColor")}`,
    `accesorio: ${ids("accesorio")} · accesorioColor: ${ids("accesorioColor")}`,
    `reunion (prenda automática en reuniones): ${ids("reunion")} | null`,
  ].join("\n");
}
