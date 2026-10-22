/**
 * Clientes y proyectos que ya tienes organizados en carpetas.
 *
 * Lumi solo LEE estas carpetas (dentro o fuera del vault) y aprende de ellas:
 *   Clientes/
 *     Acme/                    → cliente «Acme»
 *       Proyectos/Sitio web/   → proyecto «Sitio web» de Acme
 *       App móvil/             → proyecto «App móvil» de Acme (subcarpeta directa)
 *       Reuniones/             → se ignora (no es un proyecto)
 *     Grupo Norte.md           → cliente «Grupo Norte»
 *   Proyectos/
 *     Rediseño.md  (cliente: [[Acme]])  → proyecto de Acme
 *     Acme/Campaña/            → proyecto «Campaña» de Acme (carpeta con nombre de cliente)
 *     Otro/                    → proyecto sin cliente (lo asignas tú)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { slugify } from "@lumi/shared";
import { parseNote } from "./vault";

export interface CatalogEntry {
  name: string;
  kind: "cliente" | "proyecto";
  /** Relativa al vault si está dentro; ruta completa si está fuera. */
  path: string;
  client: string | null;
}

export interface CatalogConfig {
  clientsDir: string | null;
  projectsDir: string | null;
}

const MAX_ENTRIES = 3000;
const SKIP_TOP = /^(?:archivo|archive|archivados?|plantillas?|templates?|attachments?|adjuntos?|assets|recursos|resources|media|_.*)$/i;
/** Subcarpetas de un cliente que NO son proyectos. */
const NOT_PROJECT =
  /^(?:reuniones|juntas|minutas|notas|notes|meetings|facturas?|facturaci[oó]n|invoices?|contratos?|contracts?|documentos?|docs?|archivos?|files|recursos|resources|assets|adjuntos?|attachments?|im[aá]genes|images|media|propuestas?|cotizaciones?|presupuestos?|correos?|emails?|admin|administraci[oó]n|finanzas|legal|plantillas?|templates?|archivo|archive|otros|varios|misc|general|inbox|personas|contactos|people|entregables)$/i;
const PROJECTS_DIR = /^(?:proyectos?|projects?)$/i;
const CLIENTS_DIR = /^(?:clientes?|clients?|cuentas|customers|empresas)$/i;
/** Carpetas del sistema de Lumi que nunca son tus clientes. */
const LUMI_SYSTEM = /^(?:90-Lumi|99-Plantillas|00-Inbox|01-Diario|02-Reuniones|03-Pendientes|07-Rutinas)$/;

/** «01 - Acme» → «Acme» (los números solo ordenan las carpetas). */
export function cleanName(name: string): string {
  const n = name.replace(/\.md$/i, "").replace(/^\d+\s*[-_.)]\s*/, "").trim();
  return n || name.replace(/\.md$/i, "");
}

function hidden(name: string): boolean {
  return name.startsWith(".");
}

export function resolveDir(vaultRoot: string, dir: string): string {
  return path.isAbsolute(dir) ? path.normalize(dir) : path.join(vaultRoot, dir);
}

/** Ruta que se guarda: relativa al vault si cae dentro, completa si no. */
export function storedPath(vaultRoot: string, abs: string): string {
  const rel = path.relative(vaultRoot, abs);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep).join("/");
  return abs;
}

async function list(abs: string): Promise<{ dirs: string[]; notes: string[] }> {
  const out = { dirs: [] as string[], notes: [] as string[] };
  let items: import("node:fs").Dirent[];
  try {
    items = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const it of items) {
    if (hidden(it.name)) continue;
    if (it.isDirectory()) out.dirs.push(it.name);
    else if (it.isFile() && /\.md$/i.test(it.name)) out.notes.push(it.name);
  }
  out.dirs.sort((a, b) => a.localeCompare(b, "es"));
  out.notes.sort((a, b) => a.localeCompare(b, "es"));
  return out;
}

/** Lee solo el encabezado YAML de una nota (para «type» y «cliente»). */
async function frontmatter(abs: string): Promise<Record<string, unknown>> {
  try {
    const fh = await fs.open(abs, "r");
    try {
      const buf = Buffer.alloc(4096);
      const { bytesRead } = await fh.read(buf, 0, 4096, 0);
      const head = buf.subarray(0, bytesRead).toString("utf8");
      if (!head.startsWith("---")) return {};
      const end = head.indexOf("\n---", 3);
      if (end === -1) return {};
      return parseNote(head.slice(0, end + 4) + "\n").fm;
    } finally {
      await fh.close();
    }
  } catch {
    return {};
  }
}

/** «[[Acme]]», «[[Acme|ACME]]», ["[[Acme]]"] o «Acme» → «Acme». */
export function linkName(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return null;
  const m = /\[\[([^\]|#]+)/.exec(s);
  const name = (m ? m[1] : s).trim();
  return name ? (name.split("/").pop() ?? name) : null;
}

function clientFromFm(fm: Record<string, unknown>): string | null {
  return linkName(fm.cliente ?? fm.client ?? fm.empresa ?? fm.company);
}

export async function scanCatalog(vaultRoot: string, cfg: CatalogConfig): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  const seen = new Set<string>();
  const add = (e: CatalogEntry) => {
    const k = `${e.kind}:${slugify(e.name)}`;
    if (!e.name || seen.has(k) || entries.length >= MAX_ENTRIES) {
      // Un proyecto repetido que antes no tenía cliente toma el que ahora sí conocemos
      if (seen.has(k) && e.client) {
        const prev = entries.find((x) => x.kind === e.kind && slugify(x.name) === slugify(e.name));
        if (prev && !prev.client) prev.client = e.client;
      }
      return;
    }
    seen.add(k);
    entries.push(e);
  };
  const store = (abs: string) => storedPath(vaultRoot, abs);

  /** Proyectos dentro de una carpeta (de un cliente o una carpeta «Proyectos»). */
  async function projectsIn(abs: string, client: string | null, depth = 0): Promise<void> {
    const { dirs, notes } = await list(abs);
    const owner = path.basename(abs);
    const sub = depth === 0 ? dirs.find((d) => PROJECTS_DIR.test(cleanName(d))) : undefined;
    if (sub) return projectsIn(path.join(abs, sub), client, depth + 1);
    for (const d of dirs) {
      if (NOT_PROJECT.test(cleanName(d)) || SKIP_TOP.test(d) || /^(?:\d{2,4}|q[1-4])$/i.test(cleanName(d))) continue;
      const pAbs = path.join(abs, d);
      // Nota de carpeta (Proyecto/Proyecto.md) con «cliente:» manda sobre la carpeta
      const fm = await frontmatter(path.join(pAbs, `${d}.md`));
      add({ name: cleanName(d), kind: "proyecto", path: store(pAbs), client: clientFromFm(fm) ?? client });
    }
    for (const n of notes) {
      // La nota con el mismo nombre que la carpeta es la del cliente, no un proyecto
      if (cleanName(n) === cleanName(owner)) continue;
      const fm = await frontmatter(path.join(abs, n));
      const type = typeof fm.type === "string" ? fm.type.toLowerCase() : null;
      // Dentro de un cliente solo cuentan las notas marcadas como proyecto (o las de «Proyectos/»)
      if (client && depth === 0 && type !== "proyecto" && type !== "project") continue;
      if (type && type !== "proyecto" && type !== "project") continue;
      add({ name: cleanName(n), kind: "proyecto", path: store(path.join(abs, n)), client: clientFromFm(fm) ?? client });
    }
  }

  const clientsAbs = cfg.clientsDir ? resolveDir(vaultRoot, cfg.clientsDir) : null;
  const projectsAbs = cfg.projectsDir ? resolveDir(vaultRoot, cfg.projectsDir) : null;

  if (clientsAbs) {
    const { dirs, notes } = await list(clientsAbs);
    for (const d of dirs) {
      if (SKIP_TOP.test(d) || LUMI_SYSTEM.test(d) || PROJECTS_DIR.test(cleanName(d))) continue;
      const name = cleanName(d);
      add({ name, kind: "cliente", path: store(path.join(clientsAbs, d)), client: null });
      await projectsIn(path.join(clientsAbs, d), name);
    }
    for (const n of notes) {
      const fm = await frontmatter(path.join(clientsAbs, n));
      const type = typeof fm.type === "string" ? fm.type.toLowerCase() : "cliente";
      if (type === "proyecto" || type === "project") add({ name: cleanName(n), kind: "proyecto", path: store(path.join(clientsAbs, n)), client: clientFromFm(fm) });
      else if (type === "cliente" || type === "client" || !fm.type) add({ name: cleanName(n), kind: "cliente", path: store(path.join(clientsAbs, n)), client: null });
    }
    // «Clientes/Proyectos/…» dentro de la misma carpeta: proyectos sueltos
    const loose = dirs.find((d) => PROJECTS_DIR.test(cleanName(d)));
    if (loose) await projectsIn(path.join(clientsAbs, loose), null, 1);
  }

  if (projectsAbs && projectsAbs !== clientsAbs) {
    const clients = entries.filter((e) => e.kind === "cliente");
    const { dirs, notes } = await list(projectsAbs);
    for (const d of dirs) {
      if (SKIP_TOP.test(d) || LUMI_SYSTEM.test(d)) continue;
      const asClient = clients.find((c) => slugify(c.name) === slugify(cleanName(d)));
      if (asClient) await projectsIn(path.join(projectsAbs, d), asClient.name, 1);
      else {
        const fm = await frontmatter(path.join(projectsAbs, d, `${d}.md`));
        add({ name: cleanName(d), kind: "proyecto", path: store(path.join(projectsAbs, d)), client: clientFromFm(fm) });
      }
    }
    for (const n of notes) {
      const fm = await frontmatter(path.join(projectsAbs, n));
      const type = typeof fm.type === "string" ? fm.type.toLowerCase() : "proyecto";
      if (type !== "proyecto" && type !== "project") continue;
      add({ name: cleanName(n), kind: "proyecto", path: store(path.join(projectsAbs, n)), client: clientFromFm(fm) });
    }
  }

  // El cliente de un proyecto se escribe como el cliente conocido («acme» → «Acme»)
  const byslug = new Map(entries.filter((e) => e.kind === "cliente").map((e) => [slugify(e.name), e.name]));
  for (const e of entries) if (e.client) e.client = byslug.get(slugify(e.client)) ?? e.client;
  return entries;
}

/**
 * Busca en el vault (hasta 3 niveles) carpetas que parezcan de clientes o de proyectos.
 * Las de Lumi (05-Clientes, 04-Proyectos) van al final: esas ya las conoce.
 */
export async function detectCatalogDirs(vaultRoot: string): Promise<{ clients: string[]; projects: string[] }> {
  const clients: { rel: string; depth: number; size: number }[] = [];
  const projects: { rel: string; depth: number; size: number }[] = [];
  async function walk(rel: string, depth: number): Promise<void> {
    if (depth > 3) return;
    const { dirs, notes } = await list(path.join(vaultRoot, rel));
    if (rel) {
      const name = cleanName(path.basename(rel));
      const size = dirs.length + notes.length;
      if (CLIENTS_DIR.test(name) && size > 0) {
        clients.push({ rel, depth, size });
        return; // lo de adentro son los clientes, no más candidatos
      }
      // Una carpeta «Proyectos» dentro de un cliente no es la de todos los proyectos
      if (PROJECTS_DIR.test(name) && size > 0 && !clients.some((c) => rel.startsWith(`${c.rel}/`))) projects.push({ rel, depth, size });
    }
    for (const d of dirs) {
      if (LUMI_SYSTEM.test(d) || SKIP_TOP.test(d)) continue;
      await walk(rel ? `${rel}/${d}` : d, depth + 1);
    }
  }
  await walk("", 0);
  const lumiOwn = (r: string) => r === "05-Clientes" || r === "04-Proyectos";
  const order = (a: { rel: string; depth: number; size: number }, b: typeof a) =>
    Number(lumiOwn(a.rel)) - Number(lumiOwn(b.rel)) || a.depth - b.depth || b.size - a.size;
  return { clients: clients.sort(order).map((x) => x.rel), projects: projects.sort(order).map((x) => x.rel) };
}

/** Nota de Lumi con la lista (para que la búsqueda y la IA también la vean). */
export function catalogNote(entries: { name: string; kind: string; client?: string | null }[], cfg: CatalogConfig): string {
  const clients = entries.filter((e) => e.kind === "cliente").sort((a, b) => a.name.localeCompare(b.name, "es"));
  const projects = entries.filter((e) => e.kind === "proyecto");
  const lines = [
    "# Clientes y proyectos",
    "",
    `Lumi arma esta lista sola${cfg.clientsDir || cfg.projectsDir ? ` con tus carpetas (${[cfg.clientsDir, cfg.projectsDir].filter(Boolean).join(" y ")})` : ""} y con tus notas de clientes y proyectos. No la edites: se rehace cada vez que cambian.`,
    "",
  ];
  for (const c of clients) {
    const ps = projects.filter((p) => p.client && slugify(p.client) === slugify(c.name)).map((p) => p.name).sort((a, b) => a.localeCompare(b, "es"));
    lines.push(`## ${c.name}`, ps.length ? ps.map((p) => `- ${p}`).join("\n") : "- (sin proyectos)", "");
  }
  const loose = projects.filter((p) => !p.client || !clients.some((c) => slugify(c.name) === slugify(p.client!)));
  if (loose.length) lines.push("## Proyectos sin cliente", loose.map((p) => `- ${p.name}${p.client ? ` (cliente: ${p.client})` : ""}`).join("\n"), "");
  return lines.join("\n");
}
