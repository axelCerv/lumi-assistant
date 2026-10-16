/**
 * Apariencia de Lumi: catálogo de piezas, personajes base y utilidades.
 *
 * Lumi es una esferita que flota. La silueta redonda siempre manda: el
 * cabello vive arriba, la ropa abajo y la cara queda libre (salvo lentes).
 * Todo se dibuja en un lienzo de 200×200 con la esfera en (100,112) r 62.
 */

export type BodyId = "clasica" | "clara" | "media" | "morena" | "oscura";
export type BaseId = "femenina" | "masculina" | "neutral";
export type HairId = "ninguno" | "mechon" | "fleco" | "coletas" | "chongo" | "rizos" | "copete";
export type HairColorId = "negro" | "castano" | "rubio" | "pelirrojo" | "lila";
export type FacialId = "ninguno" | "barba" | "bigote";
export type OutfitId = "ninguna" | "playera" | "bufanda" | "overol" | "rayas" | "corbatin" | "capa";
export type ColorId = "indigo" | "verde" | "coral" | "mostaza" | "grafito";
export type GlassesId = "ninguno" | "redondos" | "cuadrados" | "gato" | "sol";
export type FrameId = "negro" | "carey" | "indigo" | "dorado";
export type AccessoryId = "ninguno" | "antena" | "gorra" | "gorro" | "audifonos" | "mono" | "boina";

export interface AvatarConfig {
  /** Punto de partida: cambia pestañas y grosor de cejas, nada más. */
  base: BaseId;
  cuerpo: BodyId;
  cabello: HairId;
  cabelloColor: HairColorId;
  vello: FacialId;
  prenda: OutfitId;
  prendaColor: ColorId;
  lentes: GlassesId;
  lentesColor: FrameId;
  accesorio: AccessoryId;
  accesorioColor: ColorId;
  /** Prenda que Lumi se pone sola cuando hay una reunión por empezar. */
  reunion: OutfitId | null;
}

interface Option<T extends string> {
  id: T;
  label: string;
}
interface Swatch<T extends string> extends Option<T> {
  hex: string;
}

export const BODIES: (Swatch<BodyId> & { light: boolean })[] = [
  { id: "clasica", label: "Lumi clásica", hex: "#5B57D1", light: false },
  { id: "clara", label: "Clara", hex: "#F6D3B8", light: true },
  { id: "media", label: "Media", hex: "#E8B48F", light: true },
  { id: "morena", label: "Morena", hex: "#C68A5E", light: true },
  { id: "oscura", label: "Morena oscura", hex: "#8D5A3B", light: true },
];

export const BASES: Option<BaseId>[] = [
  { id: "femenina", label: "Femenina" },
  { id: "masculina", label: "Masculina" },
  { id: "neutral", label: "Neutral" },
];

export const HAIRS: Option<HairId>[] = [
  { id: "ninguno", label: "Sin cabello" },
  { id: "mechon", label: "Mechón" },
  { id: "fleco", label: "Fleco" },
  { id: "coletas", label: "Coletas" },
  { id: "chongo", label: "Chongo" },
  { id: "rizos", label: "Rizos" },
  { id: "copete", label: "Copete" },
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
  { id: "ninguna", label: "Sin ropa" },
  { id: "playera", label: "Playera" },
  { id: "bufanda", label: "Bufanda" },
  { id: "overol", label: "Overol" },
  { id: "rayas", label: "Rayas" },
  { id: "corbatin", label: "Corbatín" },
  { id: "capa", label: "Capa" },
];

export const COLORS: Swatch<ColorId>[] = [
  { id: "indigo", label: "índigo", hex: "#4B4BD8" },
  { id: "verde", label: "verde azulado", hex: "#2E9C8F" },
  { id: "coral", label: "coral", hex: "#E86F5A" },
  { id: "mostaza", label: "mostaza", hex: "#E2A33B" },
  { id: "grafito", label: "grafito", hex: "#3B3F55" },
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
  { id: "antena", label: "Antena" },
  { id: "gorra", label: "Gorra" },
  { id: "gorro", label: "Gorro" },
  { id: "audifonos", label: "Audífonos" },
  { id: "mono", label: "Moño" },
  { id: "boina", label: "Boina" },
];

/** La Lumi de siempre: morada, con antena y sin ropa. */
export const DEFAULT_AVATAR: AvatarConfig = {
  base: "neutral",
  cuerpo: "clasica",
  cabello: "ninguno",
  cabelloColor: "castano",
  vello: "ninguno",
  prenda: "ninguna",
  prendaColor: "indigo",
  lentes: "ninguno",
  lentesColor: "negro",
  accesorio: "antena",
  accesorioColor: "mostaza",
  reunion: null,
};

export interface Preset {
  id: string;
  name: string;
  base: BaseId | "clasica";
  look: AvatarConfig;
}

const p = (id: string, name: string, base: Preset["base"], look: Partial<AvatarConfig>): Preset => ({
  id,
  name,
  base,
  look: { ...DEFAULT_AVATAR, accesorio: "ninguno", ...look },
});

/** Personajes para elegir en la bienvenida y en el editor. */
export const PRESETS: Preset[] = [
  { id: "clasica", name: "Lumi", base: "clasica", look: DEFAULT_AVATAR },
  p("luz", "Luz", "femenina", { base: "femenina", cuerpo: "clara", cabello: "coletas", cabelloColor: "castano", prenda: "bufanda", prendaColor: "indigo", lentes: "redondos" }),
  p("itzel", "Itzel", "femenina", { base: "femenina", cuerpo: "morena", cabello: "chongo", cabelloColor: "negro", prenda: "playera", prendaColor: "coral", accesorio: "mono", accesorioColor: "mostaza" }),
  p("maya", "Maya", "femenina", { base: "femenina", cuerpo: "oscura", cabello: "rizos", cabelloColor: "negro", prenda: "overol", prendaColor: "mostaza", accesorio: "audifonos", accesorioColor: "indigo" }),
  p("leo", "Leo", "masculina", { base: "masculina", cuerpo: "clara", cabello: "fleco", cabelloColor: "rubio", prenda: "capa", prendaColor: "verde", accesorio: "gorra", accesorioColor: "coral" }),
  p("diego", "Diego", "masculina", { base: "masculina", cuerpo: "oscura", cabello: "copete", cabelloColor: "negro", prenda: "corbatin", prendaColor: "indigo", lentes: "cuadrados" }),
  p("andres", "Andrés", "masculina", { base: "masculina", cuerpo: "media", cabello: "mechon", cabelloColor: "castano", vello: "barba", prenda: "rayas", prendaColor: "coral", lentes: "sol", lentesColor: "dorado" }),
];

// ---------- utilidades ----------

const FIELDS: { [K in keyof AvatarConfig]: readonly (string | null)[] } = {
  base: BASES.map((x) => x.id),
  cuerpo: BODIES.map((x) => x.id),
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
  const src = patch as Record<string, unknown>;
  for (const key of Object.keys(FIELDS) as (keyof AvatarConfig)[]) {
    if (!(key in src)) continue;
    const v = src[key];
    if (!FIELDS[key].includes(v as string | null)) continue;
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

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export function randomAvatar(current: AvatarConfig): AvatarConfig {
  const base = pick(BASES).id;
  return {
    ...current,
    base,
    cuerpo: pick(BODIES.filter((b) => b.light)).id,
    cabello: pick(HAIRS.slice(1)).id,
    cabelloColor: pick(HAIR_COLORS).id,
    vello: base === "masculina" ? pick(FACIALS).id : "ninguno",
    prenda: pick(OUTFITS.slice(1)).id,
    prendaColor: pick(COLORS).id,
    lentes: pick(GLASSES).id,
    lentesColor: pick(FRAMES).id,
    accesorio: pick(ACCESSORIES.filter((a) => a.id !== "antena")).id,
    accesorioColor: pick(COLORS).id,
  };
}

export const hexOf = {
  body: (id: BodyId) => (BODIES.find((x) => x.id === id) ?? BODIES[0]).hex,
  hair: (id: HairColorId) => (HAIR_COLORS.find((x) => x.id === id) ?? HAIR_COLORS[0]).hex,
  color: (id: ColorId) => (COLORS.find((x) => x.id === id) ?? COLORS[0]).hex,
  frame: (id: FrameId) => (FRAMES.find((x) => x.id === id) ?? FRAMES[0]).hex,
};

export function isLightBody(id: BodyId): boolean {
  return (BODIES.find((x) => x.id === id) ?? BODIES[0]).light;
}

const label = <T extends string>(list: Option<T>[], id: T) => (list.find((x) => x.id === id) ?? { label: id }).label;

/** Descripción corta en español, para la interfaz y para Claude. */
export function describeAvatar(a: AvatarConfig): string {
  const parts: string[] = [a.cuerpo === "clasica" ? "cuerpo morado clásico" : `tono ${label(BODIES, a.cuerpo).toLowerCase()}`];
  if (a.cabello !== "ninguno") parts.push(`${label(HAIRS, a.cabello).toLowerCase()} ${label(HAIR_COLORS, a.cabelloColor)}`);
  if (a.vello !== "ninguno") parts.push(label(FACIALS, a.vello).toLowerCase());
  if (a.prenda !== "ninguna") parts.push(`${label(OUTFITS, a.prenda).toLowerCase()} ${label(COLORS, a.prendaColor)}`);
  if (a.lentes !== "ninguno") parts.push(`lentes ${label(GLASSES, a.lentes).toLowerCase()}`);
  if (a.accesorio !== "ninguno") parts.push(a.accesorio === "antena" ? "antena" : `${label(ACCESSORIES, a.accesorio).toLowerCase()} ${label(COLORS, a.accesorioColor)}`);
  return parts.join(", ");
}

/** Lista de ids válidos, para que Claude pueda pedir cambios. */
export function avatarCatalogText(): string {
  const ids = (k: keyof AvatarConfig) => FIELDS[k].filter((x) => x !== null).join(" | ");
  return [
    `cuerpo: ${ids("cuerpo")}`,
    `base: ${ids("base")}`,
    `cabello: ${ids("cabello")} · cabelloColor: ${ids("cabelloColor")}`,
    `vello: ${ids("vello")}`,
    `prenda: ${ids("prenda")} · prendaColor: ${ids("prendaColor")}`,
    `lentes: ${ids("lentes")} · lentesColor: ${ids("lentesColor")}`,
    `accesorio: ${ids("accesorio")} · accesorioColor: ${ids("accesorioColor")}`,
    `reunion (prenda automática en reuniones): ${ids("reunion")} | null`,
  ].join("\n");
}
