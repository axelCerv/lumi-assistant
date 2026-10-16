import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESSORIES, DEFAULT_AVATAR, INVOKE_METHODS, OUTFITS, PRESETS, avatarCatalogText, type AvatarConfig } from "@lumi/shared";

// Configuración en memoria (la real escribe en la carpeta de datos de la app)
const store = vi.hoisted(() => ({ avatar: null as AvatarConfig | null }));
vi.mock("../src/main/settings", () => ({
  getSettings: () => ({ avatar: store.avatar }),
  updateSettings: (patch: { avatar?: AvatarConfig }) => {
    if (patch.avatar) store.avatar = patch.avatar;
  },
}));

import { LUMI_TOOLS, executeTool, type ToolContext } from "../src/main/llm/tools";

const ctx = (): ToolContext => ({ brain: null, meetings: [], sources: [], actions: [], origin: null });

describe("personalización: Claude cambia el look", () => {
  beforeEach(() => {
    store.avatar = { ...DEFAULT_AVATAR };
  });

  it("la herramienta ofrece exactamente las piezas del catálogo", () => {
    const tool = LUMI_TOOLS.find((t) => t.name === "cambiar_apariencia")!;
    const props = tool.parameters.properties as Record<string, { enum?: string[] }>;
    expect(props.prenda.enum).toEqual(OUTFITS.map((o) => o.id));
    expect(props.accesorio.enum).toEqual(ACCESSORIES.map((a) => a.id));
  });

  it("aplica solo lo que cambia y deja una acción para deshacer", async () => {
    const c = ctx();
    const r = await executeTool(c, { id: "t1", name: "cambiar_apariencia", input: { lentes: "sol", lentesColor: "dorado" } });
    expect(store.avatar?.lentes).toBe("sol");
    expect(store.avatar?.prenda).toBe(DEFAULT_AVATAR.prenda);
    expect(r.content).toContain("lentes de sol");
    expect(c.actions[0]).toMatchObject({ kind: "apariencia", lookBefore: DEFAULT_AVATAR });
  });

  it("ignora piezas que no existen sin tocar nada", async () => {
    const c = ctx();
    const r = await executeTool(c, { id: "t2", name: "cambiar_apariencia", input: { prenda: "smoking" } });
    expect(store.avatar).toEqual(DEFAULT_AVATAR);
    expect(c.actions).toHaveLength(0);
    expect(r.content).toContain("No hubo cambios");
  });
});

describe("personalización: catálogo y atajos", () => {
  it("hay personajes base femeninos y masculinos, con ids únicos", () => {
    expect(PRESETS.filter((p) => p.base === "femenina").length).toBeGreaterThanOrEqual(3);
    expect(PRESETS.filter((p) => p.base === "masculina").length).toBeGreaterThanOrEqual(3);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it("el catálogo para Claude menciona todas las prendas", () => {
    const text = avatarCatalogText();
    for (const o of OUTFITS) expect(text).toContain(o.id);
  });

  it("el clic derecho del avatar está expuesto a la interfaz", () => {
    expect(INVOKE_METHODS).toContain("avatarMenu");
  });
});
