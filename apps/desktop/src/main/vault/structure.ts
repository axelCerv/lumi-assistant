/** Estructura y plantillas iniciales del vault (templates/vault del repositorio). */
import { promises as fs } from "node:fs";
import path from "node:path";
import { modeFile, type Mode } from "@lumi/shared";
import { Vault, today } from "./vault";
import { exists } from "../util";

export const FOLDERS = {
  inbox: "00-Inbox",
  diario: "01-Diario",
  reuniones: "02-Reuniones",
  pendientes: "03-Pendientes",
  proyectos: "04-Proyectos",
  clientes: "05-Clientes",
  personas: "06-Personas",
  rutinas: "07-Rutinas",
  conocimiento: "08-Conocimiento",
  lumi: "90-Lumi",
  memoria: "90-Lumi/memoria",
  resumenes: "90-Lumi/resumenes",
  plantillas: "99-Plantillas",
  modos: "90-Lumi/modos",
  escuela: "10-Escuela",
  materias: "10-Escuela/Materias",
  personal: "20-Personal",
  listas: "20-Personal/Listas",
} as const;

/** Carpetas que solo se crean si el modo está activo. */
const MODE_FOLDERS: Record<string, string[]> = {
  escuela: [FOLDERS.escuela, FOLDERS.materias],
  personal: [FOLDERS.personal, FOLDERS.listas, `${FOLDERS.personal}/Salud`, `${FOLDERS.personal}/Metas`, `${FOLDERS.personal}/Eventos`],
};
const OPTIONAL = new Set(Object.values(MODE_FOLDERS).flat());

export const FILES = {
  perfil: "90-Lumi/perfil.md",
  preferencias: "90-Lumi/preferencias.md",
  pendientes: "03-Pendientes/Pendientes.md",
  ignore: ".lumiignore",
  entregas: "10-Escuela/Entregas.md",
  pagos: "20-Personal/Pagos.md",
};

// Las plantillas se incluyen en el build (Vite las lee como texto).
const TEMPLATES = import.meta.glob("../../../../../templates/vault/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function templateFiles(): { rel: string; content: string }[] {
  return Object.entries(TEMPLATES).map(([key, content]) => {
    let rel = key.split("templates/vault/")[1];
    if (rel === "lumiignore.txt") rel = FILES.ignore;
    return { rel, content };
  });
}

export function templateFor(name: "Reunión" | "Persona" | "Cliente" | "Proyecto" | "Nota diaria" | "Rutina"): string {
  return templateFiles().find((t) => t.rel === `${FOLDERS.plantillas}/${name}.md`)?.content ?? "";
}

/** Rellena los marcadores de plantilla de Obsidian ({{title}}, {{date:…}}). */
export function fillTemplate(tpl: string, values: { title?: string; date?: string } = {}): string {
  return tpl
    .replace(/\{\{title\}\}/g, values.title ?? "")
    .replace(/\{\{date(?::[^}]*)?\}\}/g, values.date ?? today());
}

/** ¿Parece un vault de Obsidian (o al menos una carpeta con notas)? */
export async function looksLikeVault(root: string): Promise<boolean> {
  return (await exists(path.join(root, ".obsidian"))) || (await exists(path.join(root, FOLDERS.lumi)));
}

/**
 * Crea las carpetas de Lumi y copia las plantillas que falten.
 * Nunca reemplaza un archivo existente: sirve igual para un vault nuevo o uno que ya usas.
 */
export async function installStructure(root: string, placeholders: Record<string, string> = {}): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  for (const f of Object.values(FOLDERS)) if (!OPTIONAL.has(f)) await fs.mkdir(path.join(root, f), { recursive: true });
  const vault = new Vault(root);
  for (const t of templateFiles()) {
    if (await vault.exists(t.rel)) continue;
    let content = t.content;
    // Los archivos de 90-Lumi usan marcadores {{clave}} propios; las plantillas se dejan intactas
    if (!t.rel.startsWith(FOLDERS.plantillas)) {
      content = content.replace(/\{\{(\w+)\}\}/g, (_, k: string) => placeholders[k] ?? "");
    }
    await fs.mkdir(path.dirname(vault.abs(t.rel)), { recursive: true });
    await fs.writeFile(vault.abs(t.rel), content, "utf8");
  }
}

/**
 * Prepara lo de cada modo activo: sus carpetas (10-Escuela, 20-Personal…) y su
 * archivo de personalidad en 90-Lumi/modos/. Nunca reemplaza nada existente.
 */
export async function ensureModeStructure(root: string, modes: Mode[]): Promise<void> {
  const vault = new Vault(root);
  for (const m of modes) {
    for (const f of MODE_FOLDERS[m.id] ?? []) await fs.mkdir(path.join(root, f), { recursive: true });
    const rel = modeFile(m.id);
    if (await vault.exists(rel)) continue;
    const tpl = templateFiles().find((t) => t.rel === rel)?.content;
    await fs.mkdir(path.dirname(vault.abs(rel)), { recursive: true });
    await fs.writeFile(
      vault.abs(rel),
      tpl ??
        `---\ntype: modo\nmodo: ${m.id}\nsource: usuario\n---\n# Modo ${m.nombre} ${m.icono}\n\nEste archivo es tuyo: Lumi lo lee cuando está en modo ${m.nombre}. Escribe aquí cómo quieres que te hable y qué debe cuidar.\n\n## Cómo hablo\n- \n\n## Qué cuido\n- \n`,
      "utf8",
    );
  }
}
