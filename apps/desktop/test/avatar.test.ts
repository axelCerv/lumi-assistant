import { describe, expect, it } from "vitest";
import { deepMerge } from "../src/main/util";
import { BODIES, COLORS, DEFAULT_AVATAR, HAIRS, OUTFITS, forBase, formalFor, PRESETS, Settings, applyAvatarPatch, describeAvatar, normalizeAvatar, randomAvatar, showsAntenna } from "@lumi/shared";

describe("apariencia de Lumi", () => {
  it("la configuración nueva trae la Lumi clásica", () => {
    expect(Settings.parse({}).avatar).toEqual(DEFAULT_AVATAR);
  });

  it("valores inválidos en la configuración vuelven al valor por defecto sin romper lo demás", () => {
    const s = Settings.parse({ userName: "Axel", avatar: { prenda: "smoking", lentes: "sol" } });
    expect(s.userName).toBe("Axel");
    expect(s.avatar.prenda).toBe("ninguna");
    expect(s.avatar.lentes).toBe("sol");
  });

  it("applyAvatarPatch solo aplica campos e ids válidos", () => {
    const { next, changed } = applyAvatarPatch(DEFAULT_AVATAR, { lentes: "sol", lentesColor: "dorado", prenda: "tutu", hack: 1 });
    expect(changed).toEqual(["lentes", "lentesColor"]);
    expect(next.lentes).toBe("sol");
    expect(next.prenda).toBe(DEFAULT_AVATAR.prenda);
    expect(applyAvatarPatch(DEFAULT_AVATAR, null).changed).toEqual([]);
  });

  it("los personajes y el modo sorpresa siempre son válidos", () => {
    for (const p of PRESETS) expect(normalizeAvatar(p.look)).toEqual(p.look);
    for (let i = 0; i < 50; i++) {
      const r = randomAvatar(DEFAULT_AVATAR);
      expect(normalizeAvatar(r)).toEqual(r);
    }
  });

  it("describe el look en español", () => {
    const luz = PRESETS.find((p) => p.id === "luz")!.look;
    expect(describeAvatar(luz)).toBe("cuerpo rosa, ojos cafés, cabello coletas castaño, vestido índigo, lentes redondos, antena");
  });

  it("una configuración vieja con la antena como accesorio sigue teniendo antena", () => {
    const viejo = { cuerpo: "clasica", accesorio: "antena" };
    expect(normalizeAvatar(viejo)).toMatchObject({ accesorio: "ninguno", antena: true });
    expect(Settings.parse({ avatar: viejo }).avatar).toMatchObject({ accesorio: "ninguno", antena: true, ojos: "negro" });
  });

  it("los gorros tapan la antena; los audífonos no", () => {
    expect(showsAntenna({ ...DEFAULT_AVATAR, accesorio: "gorra" })).toBe(false);
    expect(showsAntenna({ ...DEFAULT_AVATAR, accesorio: "audifonos" })).toBe(true);
    expect(showsAntenna({ ...DEFAULT_AVATAR, antena: false })).toBe(false);
  });

  it("hay colores de la marca, tonos de piel y cabello corto", () => {
    const lumi = BODIES.filter((b) => b.kind === "lumi").map((b) => b.id);
    expect(lumi).toEqual(expect.arrayContaining(["clasica", "rosa", "rojo", "sol", "menta", "cielo"]));
    expect(BODIES.filter((b) => b.kind === "piel").length).toBe(4);
    expect(HAIRS.map((h) => h.id)).toEqual(expect.arrayContaining(["corto", "lateral", "picos", "rapado"]));
  });

  it("los personajes son hermanos de Lumi: colores de la marca", () => {
    for (const p of PRESETS) expect(BODIES.find((b) => b.id === p.look.cuerpo)?.kind).toBe("lumi");
  });

  it("ropa y peinados están separados para ella, para él, trabajo y para todos", () => {
    const g = (list: { id: string; group?: string }[], group: string) => list.filter((x) => x.group === group).map((x) => x.id);
    expect(g(OUTFITS, "ella")).toEqual(expect.arrayContaining(["blusa", "vestido"]));
    expect(g(OUTFITS, "el")).toEqual(expect.arrayContaining(["camisa", "corbata", "jersey"]));
    expect(g(OUTFITS, "trabajo")).toEqual(expect.arrayContaining(["bata", "delantal", "chaleco"]));
    expect(g(HAIRS, "ella")).toEqual(expect.arrayContaining(["cola", "trenzas", "bob"]));
    expect(g(HAIRS, "el")).toEqual(expect.arrayContaining(["corto", "rizado", "mohicano"]));
    for (const x of [...OUTFITS, ...HAIRS]) expect(x.group).toBeDefined();
  });

  it("el modo sorpresa respeta la base y la ropa formal también", () => {
    const masc = forBase(HAIRS, "masculina").map((h) => h.id);
    expect(masc).toContain("corto");
    expect(masc).not.toContain("trenzas");
    expect(forBase(HAIRS, "neutral").length).toBe(HAIRS.length);
    expect(formalFor("femenina")).toBe("blusa");
    expect(formalFor("masculina")).toBe("corbata");
  });

  it("hay más colores de ropa", () => {
    expect(COLORS.map((c) => c.id)).toEqual(expect.arrayContaining(["rosa", "rojo", "naranja", "cielo", "menta", "blanco", "negro"]));
  });

  it("guardar un look (como lo hace la app) no pierde ninguna pieza", () => {
    const looks = [...PRESETS.map((p) => p.look), ...Array.from({ length: 50 }, () => randomAvatar(DEFAULT_AVATAR))];
    for (const look of looks) {
      // Igual que settings.updateSettings: mezcla el parche sobre lo guardado y valida
      const saved = Settings.parse(deepMerge(Settings.parse({}), { avatar: look }));
      expect(saved.avatar).toEqual(look);
    }
  });
});
