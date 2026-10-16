import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Vault, VaultError } from "../src/main/vault/vault";
import { installStructure, FILES } from "../src/main/vault/structure";

let root: string;
let vault: Vault;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "lumi-vault-"));
  vault = new Vault(root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("estructura del vault", () => {
  it("crea carpetas y plantillas", async () => {
    await installStructure(root);
    for (const f of ["00-Inbox", "02-Reuniones", "05-Clientes", "90-Lumi/memoria", "99-Plantillas"]) expect(existsSync(path.join(root, f))).toBe(true);
    expect(existsSync(path.join(root, ".lumiignore"))).toBe(true);
    expect(readFileSync(path.join(root, FILES.pendientes), "utf8")).toContain("source: lumi");
    expect(readFileSync(path.join(root, "99-Plantillas/Reunión.md"), "utf8")).toContain("{{title}}");
  });

  it("no reemplaza archivos que ya existían en un vault propio", async () => {
    mkdirSync(path.join(root, "90-Lumi"), { recursive: true });
    writeFileSync(path.join(root, "90-Lumi/perfil.md"), "# Mi perfil escrito a mano\n");
    await installStructure(root);
    expect(readFileSync(path.join(root, "90-Lumi/perfil.md"), "utf8")).toBe("# Mi perfil escrito a mano\n");
  });
});

describe("reglas de convivencia", () => {
  it("nunca sobrescribe un archivo del usuario", async () => {
    writeFileSync(path.join(root, "mio.md"), "---\ntype: nota\n---\nTexto mío\n");
    await expect(vault.writeLumi("mio.md", {}, "otro")).rejects.toBeInstanceOf(VaultError);
    await expect(vault.appendLumi("mio.md", "x", { fm: {}, body: "" })).rejects.toBeInstanceOf(VaultError);
    expect(readFileSync(path.join(root, "mio.md"), "utf8")).toContain("Texto mío");
  });

  it("crea archivos nuevos sin pisar los existentes", async () => {
    const a = await vault.createNew("A.md", { type: "x" }, "uno");
    const b = await vault.createNew("A.md", { type: "x" }, "dos");
    expect(a).toBe("A.md");
    expect(b).toBe("A (2).md");
  });

  it("agrega una sección Lumi sin tocar el resto", async () => {
    const original = "---\ntype: reunion\ndate: 2026-10-13\n---\n# Reunión\n\nNotas mías.\n\n## Otra cosa\nTexto\n";
    writeFileSync(path.join(root, "r.md"), original);
    await vault.upsertLumiSection("r.md", "Decisiones", "- Se aprueba el presupuesto");
    await vault.upsertLumiSection("r.md", "Decisiones", "- Se aprueba el presupuesto\n- Se cambia la fecha");
    const text = readFileSync(path.join(root, "r.md"), "utf8");
    expect(text).toContain("Notas mías.");
    expect(text).toContain("## Otra cosa\nTexto");
    expect(text.match(/## Lumi · Decisiones/g)?.length).toBe(1);
    expect(text).toContain("- Se cambia la fecha");
    // La fecha del frontmatter del usuario no se transforma
    expect(text).toContain("date: 2026-10-13");
    expect(text).not.toContain("updated:");
  });

  it("solo reemplaza una línea si sigue siendo la esperada", async () => {
    writeFileSync(path.join(root, "t.md"), "a\n- [ ] b\nc\n");
    await expect(vault.replaceLine("t.md", 1, "- [ ] otra", "x")).rejects.toBeInstanceOf(VaultError);
    await vault.replaceLine("t.md", 1, "- [ ] b", "- [x] b");
    expect(readFileSync(path.join(root, "t.md"), "utf8")).toBe("a\n- [x] b\nc\n");
  });
});

describe("sección Lumi en nota del usuario", () => {
  it("conserva el texto exacto antes de la sección", async () => {
    const original = "---\ntype: reunion\ndate: 2026-10-13\ntags: [a, b]\n---\n# Reunión\nNotas mías.\n";
    writeFileSync(path.join(root, "x.md"), original);
    await vault.upsertLumiSection("x.md", "Pendientes detectados", "- [ ] algo");
    expect(readFileSync(path.join(root, "x.md"), "utf8")).toBe(`${original}\n## Lumi · Pendientes detectados\n- [ ] algo\n`);
  });
});
