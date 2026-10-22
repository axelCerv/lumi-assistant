/**
 * El "cerebro" de Lumi: el vault + su índice. Expone operaciones de alto nivel
 * (pendientes, entidades, rutinas, memoria, búsqueda) respetando las reglas del vault.
 */
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "chokidar";
import {
  birthdayKey,
  categoryFromTags,
  categoryTag,
  dailyStartDate,
  modeCategories,
  prettySlug,
  daysUntil,
  dayKey,
  formatCard,
  formatClassSlot,
  formatPayment,
  formatTaskLine,
  modeOfNote,
  modeOfTask,
  nextBirthday,
  nextPaymentDate,
  parseBirthday,
  parseCards,
  parseClassSlot,
  parsePayments,
  parseSchedule,
  parseTaskLine,
  slugify,
  safeFileName,
  toggleTaskLine,
  DAY_NAMES,
  type BirthdayInfo,
  type CardInfo,
  type Cycle,
  type Entity,
  type ListInfo,
  type MemoryFact,
  type Mode,
  type PaymentInfo,
  type PaymentInput,
  type Routine,
  type Subject,
  type SubjectInput,
  type SummaryInfo,
  type Tag,
  type Task,
  type TaskDraft,
} from "@lumi/shared";
import { Vault, VaultError, today, type Frontmatter } from "./vault";
import { IgnoreRules } from "./ignore";
import { FILES, FOLDERS, fillTemplate, templateFor } from "./structure";
import { openIndex, type IndexDb } from "../index/db";
import { Indexer } from "../index/indexer";
import { Searcher } from "../index/search";
import { BrainEmbedder, EmbeddingQueue } from "../index/embeddings";
import { debounce, errorText, log } from "../util";
import { catalogNote, linkName, resolveDir, scanCatalog, type CatalogConfig, type CatalogEntry } from "./catalog";

export const CATALOG_NOTE = "90-Lumi/clientes-y-proyectos.md";

interface TaskRow {
  nfm?: string;
  ntags?: string;
  key: string;
  path: string;
  line: number;
  raw: string;
  text: string;
  done: number;
  due: string | null;
  time: string | null;
  done_date: string | null;
  tags: string;
  links: string;
  private: number;
  lumi: number;
}

const DAY_KEYS = DAY_NAMES.map((d) => d.normalize("NFD").replace(/[̀-ͯ]/g, ""));

export function dayIndex(name: string): number {
  const n = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const i = DAY_KEYS.indexOf(n);
  if (i >= 0) return i;
  const short: Record<string, number> = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
  return short[n.slice(0, 3)] ?? -1;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface BrainStatus {
  indexing: boolean;
  progress: number;
}

export class Brain {
  readonly vault: Vault;
  readonly ignore: IgnoreRules;
  readonly idx: IndexDb;
  readonly indexer: Indexer;
  readonly searcher: Searcher;
  readonly queue: EmbeddingQueue;
  status: BrainStatus = { indexing: false, progress: 0 };
  private watcher: FSWatcher | null = null;
  private defaultTime = "09:00";
  /** Modos activos: deciden a qué modo pertenece cada nota y pendiente. */
  private modes: Mode[] = [];
  /** Tus carpetas de clientes y proyectos (solo se leen). */
  private catalogCfg: CatalogConfig & { assign: Record<string, string> } = { clientsDir: null, projectsDir: null, assign: {} };
  private catalogEntries: CatalogEntry[] = [];
  catalogInfo: { lastScan: string | null; error: string | null } = { lastScan: null, error: null };
  private catalogScan: Promise<void> | null = null;
  private catalogAgain = false;
  private catalogTimer: NodeJS.Timeout | null = null;
  private catalogSoon = debounce(() => void this.rescanCatalog(), 1500);
  private closed = false;

  constructor(
    root: string,
    userData: string,
    readonly embedder: BrainEmbedder,
    private onChange: () => void,
  ) {
    this.vault = new Vault(root);
    this.ignore = new IgnoreRules(root);
    const id = createHash("sha1").update(root).digest("hex").slice(0, 10);
    this.idx = openIndex(path.join(userData, `indice-${id}.sqlite`));
    this.indexer = new Indexer(this.vault, this.ignore, this.idx);
    this.searcher = new Searcher(this.idx, embedder);
    this.queue = new EmbeddingQueue(this.idx, embedder, debounce(() => this.onChange(), 1000));
  }

  setDefaultReminderTime(t: string): void {
    if (/^\d{1,2}:\d{2}$/.test(t)) this.defaultTime = t.padStart(5, "0");
  }

  setModes(modes: Mode[]): void {
    this.modes = modes;
  }

  /** Modo de una nota (o null si es compartida). */
  modeOf(rel: string, fm: Frontmatter = {}, tags: string[] = []): string | null {
    return modeOfNote(rel, fm, tags, this.modes);
  }

  /** Modo de una nota del índice, por su ruta. */
  modeOfPath(rel: string): string | null {
    const r = this.idx.db.prepare("SELECT fm, tags FROM notes WHERE path = ?").get(rel) as { fm: string; tags: string } | undefined;
    return this.modeOf(rel, r ? JSON.parse(r.fm) : {}, r ? JSON.parse(r.tags) : []);
  }

  async start(): Promise<void> {
    await this.reindex();
    this.watch();
    await this.rescanCatalog();
    // Las carpetas de fuera del vault no avisan cuando cambian: se revisan cada 10 minutos
    this.catalogTimer = setInterval(() => {
      if (this.catalogCfg.clientsDir || this.catalogCfg.projectsDir) void this.rescanCatalog();
    }, 10 * 60_000);
  }

  /* --------------------- Clientes y proyectos (carpetas) --------------------- */

  /** Cambia las carpetas o las asignaciones; vuelve a leer si cambiaron las carpetas. */
  setCatalogConfig(cfg: CatalogConfig & { assign: Record<string, string> }, rescan = true): void {
    const dirsChanged = cfg.clientsDir !== this.catalogCfg.clientsDir || cfg.projectsDir !== this.catalogCfg.projectsDir;
    const assignChanged = JSON.stringify(cfg.assign) !== JSON.stringify(this.catalogCfg.assign);
    this.catalogCfg = { clientsDir: cfg.clientsDir, projectsDir: cfg.projectsDir, assign: { ...cfg.assign } };
    if (!rescan) return;
    if (dirsChanged) void this.rescanCatalog();
    else if (assignChanged) {
      void this.writeCatalogNote();
      this.onChange();
    }
  }

  catalogDirs(): CatalogConfig {
    return { clientsDir: this.catalogCfg.clientsDir, projectsDir: this.catalogCfg.projectsDir };
  }

  /** Lee de nuevo tus carpetas de clientes y proyectos. */
  rescanCatalog(): Promise<void> {
    if (this.catalogScan) {
      this.catalogAgain = true;
      return this.catalogScan;
    }
    const run = async () => {
      do {
        if (this.closed) return;
        this.catalogAgain = false;
        const cfg = this.catalogDirs();
        try {
          this.catalogEntries = cfg.clientsDir || cfg.projectsDir ? await scanCatalog(this.vault.root, cfg) : [];
          this.catalogInfo = { lastScan: new Date().toISOString(), error: null };
          for (const [k, d] of [["clientes", cfg.clientsDir], ["proyectos", cfg.projectsDir]] as const) {
            if (d && !fs.existsSync(resolveDir(this.vault.root, d))) this.catalogInfo.error = `No encuentro la carpeta de ${k}: ${d}`;
          }
        } catch (e) {
          this.catalogInfo = { lastScan: new Date().toISOString(), error: errorText(e) };
          log.warn("catálogo:", errorText(e));
        }
        await this.writeCatalogNote();
        this.onChange();
      } while (this.catalogAgain);
    };
    this.catalogScan = run().finally(() => (this.catalogScan = null));
    return this.catalogScan;
  }

  /** ¿Esta ruta (absoluta) cae dentro de tus carpetas de clientes o proyectos? */
  private inCatalogDirs(abs: string): boolean {
    return [this.catalogCfg.clientsDir, this.catalogCfg.projectsDir].some((d) => {
      if (!d) return false;
      const base = resolveDir(this.vault.root, d);
      return abs === base || abs.startsWith(base + path.sep);
    });
  }

  /** La lista en 90-Lumi para que la búsqueda y la IA también la tengan. Solo se escribe si cambió. */
  private async writeCatalogNote(): Promise<void> {
    if (this.closed) return;
    try {
      const ents = this.entities().filter((e) => e.kind !== "persona");
      if (!ents.length && !(await this.vault.exists(CATALOG_NOTE))) return;
      const body = catalogNote(ents, this.catalogDirs());
      const cur = await this.vault.read(CATALOG_NOTE);
      if (cur && cur.body.trim() === body.trim()) return;
      if (cur && !this.vault.isLumiOwned(cur.fm)) return;
      await this.vault.writeLumi(CATALOG_NOTE, { type: "catalogo" }, body);
      await this.indexer.indexFile(CATALOG_NOTE);
    } catch (e) {
      log.warn("catálogo (nota):", errorText(e));
    }
  }

  async reindex(): Promise<void> {
    this.status = { indexing: true, progress: 0 };
    this.onChange();
    try {
      await this.indexer.fullScan((done, total) => {
        this.status = { indexing: true, progress: total ? done / total : 1 };
        this.onChange();
      });
    } finally {
      this.status = { indexing: false, progress: 1 };
      this.onChange();
      this.queue.kick();
    }
  }

  private watch(): void {
    const changed = debounce(() => {
      this.onChange();
      this.queue.kick();
    }, 400);
    this.watcher = watch(this.vault.root, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 350, pollInterval: 100 },
      ignored: (p: string) => {
        const rel = this.vault.rel(p);
        if (!rel || rel === ".lumiignore") return false;
        if (rel.split("/").some((seg) => seg.startsWith(".") && seg !== ".lumiignore")) return true;
        return this.ignore.isIgnored(rel);
      },
    });
    const onFile = async (p: string, removed: boolean) => {
      const rel = this.vault.rel(p);
      if (this.inCatalogDirs(p)) this.catalogSoon();
      if (rel === ".lumiignore") {
        await this.reindex();
        return;
      }
      if (!rel.endsWith(".md")) return;
      try {
        if (removed) this.indexer.remove(rel);
        else await this.indexer.indexFile(rel);
        changed();
      } catch (e) {
        log.warn("watcher:", errorText(e));
      }
    };
    this.watcher.on("add", (p) => onFile(p, false));
    this.watcher.on("change", (p) => onFile(p, false));
    this.watcher.on("unlink", (p) => onFile(p, true));
    // Una carpeta nueva de cliente o proyecto (aunque esté vacía) también cuenta
    this.watcher.on("addDir", (p) => this.inCatalogDirs(p) && this.catalogSoon());
    this.watcher.on("unlinkDir", (p) => this.inCatalogDirs(p) && this.catalogSoon());
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.catalogTimer) clearInterval(this.catalogTimer);
    await this.watcher?.close();
    this.idx.db.close();
  }

  /** Reindexa un archivo de inmediato (después de que Lumi lo escribe). */
  async touch(rel: string): Promise<void> {
    await this.indexer.indexFile(rel);
    this.onChange();
    this.queue.kick();
  }

  /* ------------------------------ Entidades ------------------------------ */

  /**
   * Clientes, proyectos y personas que Lumi conoce: tus notas (05-Clientes,
   * 04-Proyectos, 06-Personas o con «type:») + lo que encontró en tus carpetas.
   * Cada proyecto sabe de qué cliente es (por su nota, su carpeta o porque tú lo asignaste).
   */
  entities(): Entity[] {
    const rows = this.idx.db
      .prepare("SELECT path, type, fm FROM notes WHERE type IN ('cliente','proyecto','persona') ORDER BY path")
      .all() as { path: string; type: Entity["kind"]; fm: string }[];
    const out: Entity[] = rows.map((r) => {
      const name = r.path.split("/").pop()!.replace(/\.md$/, "");
      const e: Entity = { name, kind: r.type, path: r.path, slug: slugify(name), origin: "vault" };
      if (r.type === "proyecto") {
        let fm: Frontmatter = {};
        try {
          fm = JSON.parse(r.fm || "{}");
        } catch {
          /* encabezado roto */
        }
        e.client = linkName(fm.cliente ?? fm.client ?? fm.empresa) ?? null;
      }
      return e;
    });
    const byKey = new Map(out.map((e) => [`${e.kind}:${e.slug}`, e]));
    for (const c of this.catalogEntries) {
      const slug = slugify(c.name);
      const known = byKey.get(`${c.kind}:${slug}`);
      if (known) {
        if (c.kind === "proyecto" && !known.client && c.client) known.client = c.client;
        continue;
      }
      const e: Entity = { name: c.name, kind: c.kind, path: c.path, slug, origin: "carpeta", ...(c.kind === "proyecto" ? { client: c.client } : {}) };
      out.push(e);
      byKey.set(`${c.kind}:${slug}`, e);
    }
    // Lo que tú asignaste manda; y el cliente se escribe como lo conoce Lumi
    const clients = new Map(out.filter((e) => e.kind === "cliente").map((e) => [e.slug, e.name]));
    for (const e of out) {
      if (e.kind !== "proyecto") continue;
      const a = this.catalogCfg.assign[e.slug];
      if (a !== undefined) e.client = a || null;
      if (e.client) e.client = clients.get(slugify(e.client)) ?? e.client;
      else e.client = null;
    }
    return out;
  }

  tagToEntity(tag: string, ents = this.entities()): Tag | null {
    const m = /^(cliente|proyecto)\/(.+)$/.exec(tag);
    if (!m) return null;
    const kind = m[1] as Tag["kind"];
    const e = ents.find((x) => x.kind === kind && x.slug === m[2]);
    const name = e?.name ?? m[2].replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    return { kind, name };
  }

  /** Crea la nota de un cliente/proyecto/persona si no existe. Devuelve su nombre. */
  async ensureEntity(kind: Entity["kind"], name: string, client?: string | null): Promise<string> {
    const existing = this.entities().find((e) => e.kind === kind && (e.slug === slugify(name) || e.name.toLowerCase() === name.toLowerCase()));
    if (existing) return existing.name;
    const folder = kind === "cliente" ? FOLDERS.clientes : kind === "proyecto" ? FOLDERS.proyectos : FOLDERS.personas;
    const fileName = safeFileName(name);
    const rel = `${folder}/${fileName}.md`;
    let tpl = fillTemplate(templateFor(kind === "cliente" ? "Cliente" : kind === "proyecto" ? "Proyecto" : "Persona"), { title: fileName });
    // El proyecto nace dentro de su cliente
    if (kind === "proyecto" && client?.trim()) tpl = /^cliente:.*$/m.test(tpl) ? tpl.replace(/^cliente:.*$/m, `cliente: "[[${client.trim()}]]"`) : tpl;
    if (!(await this.vault.exists(rel))) {
      // Las notas de entidades son tuyas: Lumi solo las crea con la plantilla
      await this.vault.createIfMissing(rel, {}, tpl);
      await this.touch(rel);
    }
    return fileName;
  }

  /* ------------------------------ Pendientes ----------------------------- */

  private rowToTask(r: TaskRow, ents: Entity[], subjects: Subject[] = [], noteModes = new Map<string, string | null>()): Task {
    const tagList = JSON.parse(r.tags || "[]") as string[];
    if (!noteModes.has(r.path)) noteModes.set(r.path, this.modeOf(r.path, JSON.parse(r.nfm || "{}"), JSON.parse(r.ntags || "[]")));
    const mode = modeOfTask(tagList, noteModes.get(r.path) ?? null, this.modes);
    const modeObj = this.modes.find((m) => m.id === mode) ?? null;
    const subjectTag = tagList.find((t) => t.toLowerCase().startsWith("escuela/"))?.slice(8).toLowerCase();
    let subject: string | null = null;
    let category: string | null = null;
    // En Escuela, #escuela/<x> es materia si existe esa materia; si es una de las categorías, categoría
    const schoolCat = subjectTag && !subjects.some((x) => x.slug === subjectTag) ? modeCategories(this.modes.find((m) => m.id === "escuela")).find((c) => slugify(c) === subjectTag) : undefined;
    if (schoolCat) category = schoolCat;
    else if (subjectTag) subject = subjects.find((x) => x.slug === subjectTag)?.name ?? prettySlug(subjectTag);
    else if (r.path.startsWith(`${FOLDERS.materias}/`)) subject = subjects.find((x) => r.path.startsWith(`${x.path.split("/").slice(0, -1).join("/")}/`))?.name ?? r.path.split("/")[2] ?? null;
    if (!category && modeObj && modeObj.id !== "escuela") category = categoryFromTags(tagList, modeObj);
    const tags: Tag[] = [];
    const otherTags: string[] = [];
    for (const t of tagList) {
      const e = this.tagToEntity(t, ents);
      if (e) tags.push(e);
      else otherTags.push(t);
    }
    // Un proyecto siempre es de un cliente: si la línea solo dice el proyecto, se agrega su cliente
    for (const t of [...tags]) {
      if (t.kind !== "proyecto") continue;
      const client = ents.find((e) => e.kind === "proyecto" && e.slug === slugify(t.name))?.client;
      if (client && !tags.some((x) => x.kind === "cliente" && slugify(x.name) === slugify(client))) tags.unshift({ kind: "cliente", name: client });
    }
    tags.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "cliente" ? -1 : 1));
    let remindAt: string | null = null;
    const daily = /🔔/u.test(r.raw);
    const [h, mi] = (r.time ?? this.defaultTime).split(":").map(Number);
    if (r.due) {
      const [y, mo, d] = r.due.split("-").map(Number);
      remindAt = new Date(y, mo - 1, d, h, mi).toISOString();
    }
    if (daily && !r.done) {
      // Cada día: el aviso de hoy (o el del día en que empieza, si aún no llega)
      const now = new Date();
      const todayAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
      if (!remindAt || new Date(remindAt) < todayAt) remindAt = todayAt.toISOString();
    }
    // "Mandar factura · Acme" → "Mandar factura" cuando Acme ya se muestra como etiqueta
    let text = r.text;
    for (const t of tags) text = text.replace(new RegExp(`\\s·\\s${t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s·|$)`), "");
    return {
      key: r.key,
      path: r.path,
      line: r.line,
      raw: r.raw,
      text: text.trim() || r.text,
      done: !!r.done,
      due: r.due,
      time: r.time,
      remindAt,
      doneDate: r.done_date,
      tags,
      otherTags,
      links: JSON.parse(r.links || "[]"),
      private: !!r.private,
      lumiFile: !!r.lumi,
      mode,
      subject,
      category,
      urgent: /🔺|⏫/u.test(r.raw) || tagList.some((t) => t.toLowerCase() === "urgente"),
      daily,
    };
  }

  tasks(opts: { includeDone?: boolean } = {}): Task[] {
    const ents = this.entities();
    const subjects = this.subjects();
    const modes = new Map<string, string | null>();
    const rows = this.idx.db
      .prepare(
        `SELECT t.*, n.fm AS nfm, n.tags AS ntags FROM tasks t JOIN notes n ON n.path = t.path
         WHERE n.type NOT IN ('plantilla', 'lista') ${opts.includeDone ? "" : "AND (t.done = 0 OR t.done_date >= date('now','-14 day'))"}`,
      )
      .all() as TaskRow[];
    return rows.map((r) => this.rowToTask(r, ents, subjects, modes));
  }

  task(key: string): Task | null {
    const r = this.idx.db.prepare("SELECT t.*, n.fm AS nfm, n.tags AS ntags FROM tasks t LEFT JOIN notes n ON n.path = t.path WHERE t.key = ?").get(key) as
      | TaskRow
      | undefined;
    return r ? this.rowToTask(r, this.entities(), this.subjects()) : null;
  }

  async appendInbox(text: string): Promise<void> {
    const day = today();
    const rel = `${FOLDERS.inbox}/${day}.md`;
    await this.vault.appendLumi(rel, `- ${hhmm(new Date())} · ${text.replace(/\n+/g, " ")}`, {
      fm: { type: "inbox", date: day },
      body: `# Inbox · ${day}\n\nNotas rápidas tal como las escribiste.`,
    });
    await this.touch(rel);
  }

  /** Un recordatorio diario sin fecha empieza hoy (o mañana, si su hora ya pasó). */
  private withDailyStart(draft: TaskDraft): TaskDraft {
    return draft.daily && !draft.date ? { ...draft, date: dailyStartDate(draft.time, this.defaultTime) } : draft;
  }

  async createTask(input: TaskDraft): Promise<string> {
    const draft = this.withDailyStart(input);
    const tags: Tag[] = [];
    const clientOf = (d: TaskDraft) => d.tags.find((t) => t.kind === "cliente")?.name ?? null;
    for (const t of draft.tags) tags.push({ kind: t.kind, name: await this.ensureEntity(t.kind, t.name, t.kind === "proyecto" ? clientOf(draft) : null) });
    const cls = this.classTags(draft, draft.mode ?? null) ?? [];
    const line = formatTaskLine({ ...draft, tags, extraTags: [...cls, ...(draft.extraTags ?? [])] });
    await this.vault.appendLumi(FILES.pendientes, line, {
      fm: { type: "pendientes" },
      body: "# Pendientes\n\nPendientes que creaste con Lumi. Puedes marcarlos aquí, desde Lumi o desde el plugin Tasks.",
    });
    await this.touch(FILES.pendientes);
    const parsed = parseTaskLine(line)!;
    const row = this.idx.db
      .prepare("SELECT key FROM tasks WHERE path = ? AND text = ? ORDER BY line DESC LIMIT 1")
      .get(FILES.pendientes, parsed.text) as { key: string } | undefined;
    return row?.key ?? "";
  }

  /** Cambia un pendiente existente (a petición tuya). Conserva su estado. */
  async updateTask(key: string, input: TaskDraft): Promise<string> {
    const draft = this.withDailyStart(input);
    const t = this.task(key);
    if (!t) throw new VaultError("No encontré ese pendiente; quizá cambió en Obsidian.");
    const tags: Tag[] = [];
    const client = draft.tags.find((g) => g.kind === "cliente")?.name ?? null;
    for (const g of draft.tags) tags.push({ kind: g.kind, name: await this.ensureEntity(g.kind, g.name, g.kind === "proyecto" ? client : null) });
    const indent = /^(\s*)/.exec(t.raw)?.[1] ?? "";
    const isModeTag = (x: string) => this.modes.some((m) => x === m.id);
    // Si el borrador no dice el modo, se conserva el que tenía
    // (también cuando venía de su materia/categoría: #personal/casa → personal)
    const fromPrefixed = t.mode && t.otherTags.some((x) => x.startsWith(`${t.mode}/`)) ? t.mode : null;
    let mode = draft.mode === undefined ? (t.otherTags.find(isModeTag) ?? fromPrefixed) : draft.mode;
    // Si el modo ya sale de la carpeta o del encabezado de la nota, no hace falta la etiqueta
    if (mode && !t.otherTags.some(isModeTag) && this.modeOfPath(t.path) === mode) mode = null;
    const target = draft.mode === undefined ? t.mode : draft.mode;
    const cls = this.classTags(draft, target);
    // Conserva etiquetas que no son de cliente/proyecto; las de otro modo (escuela/…) se quitan si el
    // modo cambió, y la materia/categoría anterior se quita si el borrador trae una (o ninguna)
    const keep = t.otherTags.filter(
      (x) =>
        !isModeTag(x) &&
        !(draft.mode !== undefined && t.mode && draft.mode !== t.mode && x.startsWith(`${t.mode}/`)) &&
        !(cls && ((t.mode && x.startsWith(`${t.mode}/`)) || (target && x.startsWith(`${target}/`)))),
    );
    let line = indent + formatTaskLine({ ...draft, tags, mode, extraTags: [...(cls ?? []), ...(draft.extraTags ?? []), ...keep] });
    if (t.done) line = toggleTaskLine(line, t.doneDate ?? today());
    await this.vault.replaceLine(t.path, t.line, t.raw, line);
    await this.touch(t.path);
    const parsed = parseTaskLine(line)!;
    const row = this.idx.db.prepare("SELECT key FROM tasks WHERE path = ? AND text = ? LIMIT 1").get(t.path, parsed.text) as
      | { key: string }
      | undefined;
    return row?.key ?? key;
  }

  async toggleTask(key: string): Promise<Task | null> {
    const t = this.task(key);
    if (!t) throw new VaultError("No encontré ese pendiente; quizá cambió en Obsidian.");
    await this.vault.replaceLine(t.path, t.line, t.raw, toggleTaskLine(t.raw, today()));
    await this.touch(t.path);
    return t;
  }

  async deleteTask(key: string): Promise<void> {
    const t = this.task(key);
    if (!t) return;
    if (!t.lumiFile) throw new VaultError("Ese pendiente vive en una nota tuya: bórralo desde Obsidian.");
    await this.vault.replaceLine(t.path, t.line, t.raw, null);
    await this.touch(t.path);
  }

  taskDraft(key: string): TaskDraft | null {
    const t = this.task(key);
    if (!t) return null;
    const contact = t.links.find((l) => !t.tags.some((g) => g.name === l)) ?? null;
    return { title: t.text, date: t.due, time: t.time, tags: t.tags, contact, mode: t.mode, subject: t.subject, category: t.category, daily: t.daily };
  }

  /**
   * Etiqueta de materia o categoría de un borrador (#escuela/calculo-i, #personal/casa).
   * undefined = el borrador no dice nada (se conserva lo que haya); [] = quitarla.
   */
  private classTags(draft: TaskDraft, mode: string | null): string[] | undefined {
    if (draft.subject === undefined && draft.category === undefined) return undefined;
    const out: string[] = [];
    if (draft.subject?.trim()) {
      const n = draft.subject.trim();
      const subj = this.subjects().find((x) => x.name.toLowerCase() === n.toLowerCase() || x.slug === slugify(n));
      out.push(`escuela/${subj?.slug ?? slugify(n)}`);
    }
    // Sin modo explícito, la categoría es del único modo activo (si solo hay uno)
    const catMode = mode ?? (this.modes.length === 1 ? this.modes[0].id : null);
    if (draft.category?.trim() && catMode && !(catMode === "escuela" && out.length)) out.push(categoryTag(catMode, draft.category.trim()));
    return out;
  }

  /* ------------------------------- Rutinas ------------------------------- */

  routines(): Routine[] {
    const rows = this.idx.db.prepare("SELECT path, title, fm FROM notes WHERE type = 'rutina'").all() as {
      path: string;
      title: string;
      fm: string;
    }[];
    return rows.map((r) => {
      const fm = JSON.parse(r.fm) as Frontmatter;
      const dias = Array.isArray(fm.dias) ? fm.dias : typeof fm.dias === "string" ? fm.dias.split(/[,\s]+/) : ["lunes", "martes", "miércoles", "jueves", "viernes"];
      const days = dias.map((d) => (typeof d === "number" ? d : dayIndex(String(d)))).filter((d) => d >= 0 && d <= 6);
      const hora = typeof fm.hora === "string" ? fm.hora : typeof fm.hora === "number" ? `${Math.floor(fm.hora / 60)}:${fm.hora % 60}` : "09:00";
      return {
        path: r.path,
        title: r.title,
        days,
        time: hora.padStart(5, "0"),
        active: fm.activa !== false,
        lumiFile: fm.source === "lumi",
        mode: typeof fm.modo === "string" && this.modes.some((m) => m.id === fm.modo) ? fm.modo : null,
      };
    });
  }

  async createRoutine(r: { title: string; days: number[]; time: string; mode?: string | null }): Promise<string> {
    const rel = await this.vault.createNew(
      `${FOLDERS.rutinas}/${safeFileName(r.title)}.md`,
      { type: "rutina", dias: [...r.days].sort().map((d) => DAY_NAMES[d]), hora: r.time, activa: true, modo: r.mode ?? undefined, source: "lumi" },
      `# ${r.title}\n\nRutina creada con Lumi.\n`,
    );
    await this.touch(rel);
    return rel;
  }

  async setRoutineActive(rel: string, active: boolean): Promise<void> {
    await this.vault.setFrontmatter(rel, { activa: active }, { userRequested: true });
    await this.touch(rel);
  }

  async deleteRoutine(rel: string): Promise<void> {
    await this.vault.deleteLumiFile(rel);
    this.indexer.remove(rel);
    this.onChange();
  }

  /* ------------------------------- Memoria ------------------------------- */

  facts(): MemoryFact[] {
    const rows = this.idx.db.prepare("SELECT path FROM notes WHERE path LIKE ?").all(`${FOLDERS.memoria}/%`) as { path: string }[];
    return rows.flatMap((r) => this.factsIn(r.path));
  }

  private factsCache = new Map<string, { mtime: number; facts: MemoryFact[] }>();

  private factsIn(rel: string): MemoryFact[] {
    try {
      const abs = this.vault.abs(rel);
      const mtime = fs.statSync(abs).mtimeMs;
      const c = this.factsCache.get(rel);
      if (c && c.mtime === mtime) return c.facts;
      const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
      const topic = rel.split("/").pop()!.replace(/\.md$/, "");
      const facts: MemoryFact[] = [];
      lines.forEach((line, i) => {
        const m = /^- (\d{4}-\d{2}-\d{2}) · (.+?)(?: · \(origen: (.+?)\))?(?: · modo: ([a-z0-9-]+))?\s*$/.exec(line);
        if (m) facts.push({ topic, date: m[1], text: m[2], origin: m[3] ?? null, mode: m[4] ?? null, path: rel, line: i });
      });
      this.factsCache.set(rel, { mtime, facts });
      return facts;
    } catch {
      return [];
    }
  }

  async addFact(text: string, topic: string, origin: string | null, mode: string | null = null): Promise<void> {
    const name = safeFileName(topic || "General");
    const rel = `${FOLDERS.memoria}/${name}.md`;
    const line = `- ${today()} · ${text.replace(/\n+/g, " ").trim()}${origin ? ` · (origen: ${origin})` : ""}${mode ? ` · modo: ${mode}` : ""}`;
    await this.vault.appendLumi(rel, line, {
      fm: { type: "memoria", tema: name },
      body: `# Memoria · ${name}\n\nHechos que confirmaste para que Lumi los recuerde.\n`,
    });
    await this.touch(rel);
  }

  async deleteFact(rel: string, lineNo: number): Promise<void> {
    const f = this.factsIn(rel).find((x) => x.line === lineNo);
    if (!f) return;
    const note = await this.vault.read(rel);
    if (!note || !this.vault.isLumiOwned(note.fm)) throw new VaultError("Ese archivo de memoria es tuyo: edítalo en Obsidian.");
    const raw = note.raw.split(/\r?\n/)[lineNo];
    await this.vault.replaceLine(rel, lineNo, raw, null);
    await this.touch(rel);
  }

  summaries(): SummaryInfo[] {
    const rows = this.idx.db
      .prepare("SELECT path, title, fm, date FROM notes WHERE path LIKE ? ORDER BY path DESC")
      .all(`${FOLDERS.resumenes}/%`) as { path: string; title: string; fm: string; date: string | null }[];
    return rows.map((r) => {
      const fm = JSON.parse(r.fm) as Frontmatter;
      return {
        path: r.path,
        title: r.title,
        kind: fm.periodo === "mensual" ? "mensual" : "semanal",
        date: (typeof fm.date === "string" ? fm.date : r.date) ?? "",
      };
    });
  }

  /* ------------------------------- Lectura ------------------------------- */

  /** Lee una nota para la IA. Respeta .lumiignore y `lumi: privado`. */
  async readForAI(rel: string): Promise<{ title: string; text: string } | null> {
    if (this.ignore.isIgnored(rel)) return null;
    const note = await this.vault.read(rel);
    if (!note || note.fm.lumi === "privado" || note.fm.lumi === "private") return null;
    const row = this.idx.db.prepare("SELECT title FROM notes WHERE path = ?").get(rel) as { title: string } | undefined;
    return { title: row?.title ?? rel, text: note.body };
  }

  /** Busca una nota por nombre o ruta aproximada. */
  resolveNote(nameOrPath: string): string | null {
    const q = nameOrPath.replace(/^\[\[|\]\]$/g, "").replace(/\.md$/, "").trim();
    const direct = this.idx.db.prepare("SELECT path FROM notes WHERE path = ? OR path = ?").get(q, `${q}.md`) as { path: string } | undefined;
    if (direct) return direct.path;
    const byName = this.idx.db
      .prepare("SELECT path FROM notes WHERE lower(path) LIKE ? OR lower(title) = ? ORDER BY length(path) LIMIT 1")
      .get(`%/${q.toLowerCase()}.md`, q.toLowerCase()) as { path: string } | undefined;
    return byName?.path ?? null;
  }

  /** Notas con fecha dentro de un rango (para resúmenes). */
  notesBetween(from: string, to: string, types?: string[]): { path: string; title: string; type: string; date: string }[] {
    const rows = this.idx.db
      .prepare("SELECT path, title, type, date FROM notes WHERE date >= ? AND date <= ? AND private = 0 ORDER BY date")
      .all(from, to) as { path: string; title: string; type: string; date: string }[];
    return types ? rows.filter((r) => types.includes(r.type)) : rows;
  }

  noteMeta(rel: string): { title: string; type: string; fm: Frontmatter } | null {
    const r = this.idx.db.prepare("SELECT title, type, fm FROM notes WHERE path = ?").get(rel) as
      | { title: string; type: string; fm: string }
      | undefined;
    return r ? { title: r.title, type: r.type, fm: JSON.parse(r.fm) } : null;
  }

  findByFrontmatter(key: string, value: string): string | null {
    const r = this.idx.db
      .prepare("SELECT path FROM notes WHERE json_extract(fm, ?) = ? LIMIT 1")
      .get(`$.${key}`, value) as { path: string } | undefined;
    return r?.path ?? null;
  }

  /* ------------------------------- Escuela ------------------------------- */

  subjects(): Subject[] {
    const rows = this.idx.db.prepare("SELECT path, title, fm FROM notes WHERE type = 'materia' ORDER BY path").all() as {
      path: string;
      title: string;
      fm: string;
    }[];
    return rows.map((r) => {
      const fm = JSON.parse(r.fm) as Frontmatter;
      const name = (typeof fm.nombre === "string" && fm.nombre.trim()) || r.path.split("/").pop()!.replace(/\.md$/, "");
      const schedule = Array.isArray(fm.horario) ? fm.horario.map(String) : typeof fm.horario === "string" ? [fm.horario] : [];
      const unlink = (v: unknown) => (typeof v === "string" && v.trim() ? v.replace(/^\[\[|\]\]$/g, "").trim() : null);
      const max = Number(fm.faltas_max);
      return {
        path: r.path,
        name,
        slug: slugify(name),
        teacher: unlink(fm.profesor),
        slots: parseSchedule(schedule),
        schedule,
        platform: unlink(fm.plataforma),
        link: unlink(fm.enlace),
        maxAbsences: Number.isFinite(max) && max > 0 ? max : null,
        aiAllowed: fm.ia_permitida === true,
        color: unlink(fm.color),
      };
    });
  }

  cycle(): Cycle | null {
    const rows = this.idx.db.prepare("SELECT path, title, fm FROM notes WHERE type = 'ciclo'").all() as { path: string; title: string; fm: string }[];
    const list = rows.map((r) => {
      const fm = JSON.parse(r.fm) as Frontmatter;
      const d = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
      return { path: r.path, name: (typeof fm.nombre === "string" && fm.nombre) || r.title, start: d(fm.inicio), end: d(fm.fin) };
    });
    return list.sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""))[0] ?? null;
  }

  async saveCycle(c: { name: string; start: string; end: string }): Promise<void> {
    const rel = `${FOLDERS.escuela}/Ciclo.md`;
    await this.vault.writeLumi(
      rel,
      { type: "ciclo", modo: "escuela", nombre: c.name.trim() || "Ciclo", inicio: c.start || undefined, fin: c.end || undefined },
      `# ${c.name.trim() || "Ciclo escolar"}\n\n${c.start && c.end ? `Del ${c.start} al ${c.end}.` : "Fechas por definir."} Las clases de tus materias solo cuentan dentro de estas fechas.\n`,
    );
    await this.touch(rel);
  }

  /** Crea o actualiza la nota de una materia (10-Escuela/Materias/<Nombre>/<Nombre>.md). */
  async saveSubject(input: SubjectInput, existingPath?: string | null): Promise<string> {
    const name = safeFileName(input.name);
    const schedule = input.schedule
      .map((x) => x.trim())
      .filter(Boolean)
      .flatMap((x) => {
        const slots = parseClassSlot(x);
        return slots.length ? slots.map(formatClassSlot) : [x];
      });
    const fm: Frontmatter = {
      type: "materia",
      modo: "escuela",
      profesor: input.teacher.trim() ? `[[${safeFileName(input.teacher)}]]` : undefined,
      horario: schedule,
      plataforma: input.platform.trim() || undefined,
      enlace: input.link.trim() || undefined,
      faltas_max: input.maxAbsences ?? undefined,
      ia_permitida: input.aiAllowed,
    };
    if (input.teacher.trim()) await this.ensureEntity("persona", input.teacher.trim());
    if (existingPath) {
      await this.vault.setFrontmatter(existingPath, fm, { userRequested: true });
      await this.touch(existingPath);
      return existingPath;
    }
    const rel = await this.vault.createNew(
      `${FOLDERS.materias}/${name}/${name}.md`,
      { ...fm, source: "lumi" },
      `# ${name}\n\nNota de la materia. Guarda tus apuntes en la carpeta de esta materia (por ejemplo «Apuntes/Tema 1.md»): Lumi los usa para hacerte preguntas de repaso.\n\n## Tarjetas de repaso\nViven en [[Repaso - ${name}]], una por línea: «Pregunta::Respuesta».\n`,
    );
    await this.touch(rel);
    return rel;
  }

  private fileCache = new Map<string, { mtime: number; text: string }>();

  /** Lee un archivo del vault con caché por fecha de modificación. */
  private readCached(rel: string): string | null {
    try {
      const abs = this.vault.abs(rel);
      const mtime = fs.statSync(abs).mtimeMs;
      const c = this.fileCache.get(rel);
      if (c && c.mtime === mtime) return c.text;
      const text = fs.readFileSync(abs, "utf8");
      this.fileCache.set(rel, { mtime, text });
      return text;
    } catch {
      return null;
    }
  }

  /** Tarjetas «Pregunta::Respuesta» de las notas de la escuela (nunca de notas privadas). */
  cards(): CardInfo[] {
    const rows = this.idx.db
      .prepare("SELECT path, fm FROM notes WHERE private = 0 AND (path LIKE ? OR type = 'repaso') AND type NOT IN ('plantilla', 'materia', 'ciclo')")
      .all(`${FOLDERS.escuela}/%`) as { path: string; fm: string }[];
    const subjects = this.subjects();
    const out: CardInfo[] = [];
    for (const r of rows) {
      const text = this.readCached(r.path);
      if (!text) continue;
      const fm = JSON.parse(r.fm) as Frontmatter;
      const fromFm = typeof fm.materia === "string" ? fm.materia.replace(/^\[\[|\]\]$/g, "") : null;
      const fromPath = subjects.find((s) => r.path.startsWith(`${s.path.split("/").slice(0, -1).join("/")}/`))?.name ?? null;
      for (const c of parseCards(text, r.path)) out.push({ id: c.id, question: c.question, answer: c.answer, path: r.path, subject: fromFm ?? fromPath });
    }
    return out;
  }

  /** Agrega tarjetas al archivo de repaso de una materia. Devuelve la ruta. */
  async addCards(subjectPath: string, cards: { question: string; answer: string }[]): Promise<string> {
    const subject = this.subjects().find((s) => s.path === subjectPath);
    const name = subject?.name ?? subjectPath.split("/").slice(-2, -1)[0] ?? "General";
    const dir = subjectPath.includes("/") ? subjectPath.split("/").slice(0, -1).join("/") : FOLDERS.escuela;
    const rel = `${dir}/Repaso - ${safeFileName(name)}.md`;
    const lines = cards.filter((c) => c.question.trim() && c.answer.trim()).map((c) => formatCard(c.question, c.answer));
    if (!lines.length) return rel;
    await this.vault.appendLumi(rel, lines.join("\n"), {
      fm: { type: "repaso", modo: "escuela", materia: `[[${name}]]` },
      body: `# Repaso · ${name}\n\nTarjetas en formato «Pregunta::Respuesta» (compatibles con el plugin Spaced Repetition). Lumi te las pregunta con repaso espaciado.`,
    });
    await this.touch(rel);
    return rel;
  }

  /** Lee las notas de una materia (apuntes) para la IA, sin las privadas. */
  async subjectNotes(subjectPath: string, max = 30_000): Promise<string> {
    const dir = subjectPath.split("/").slice(0, -1).join("/");
    const rows = this.idx.db
      .prepare("SELECT path, title FROM notes WHERE path LIKE ? AND type NOT IN ('repaso', 'plantilla') ORDER BY mtime DESC")
      .all(`${dir}/%`) as { path: string; title: string }[];
    let out = "";
    for (const r of rows) {
      const note = await this.readForAI(r.path);
      if (!note || !note.text.trim()) continue;
      out += `\n\n### ${note.title}\n${note.text.trim()}`;
      if (out.length > max) break;
    }
    return out.slice(0, max);
  }

  /* ------------------------------- Personal ------------------------------- */

  lists(): ListInfo[] {
    const rows = this.idx.db.prepare("SELECT path, title FROM notes WHERE type = 'lista' ORDER BY path").all() as { path: string; title: string }[];
    return rows.map((r) => {
      const text = this.readCached(r.path) ?? "";
      const items = text
        .split(/\r?\n/)
        .map((raw, line) => {
          const t = parseTaskLine(raw);
          return t && t.text ? { text: t.text, done: t.done, line, raw } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      return { path: r.path, name: r.title, items };
    });
  }

  async createList(name: string): Promise<string> {
    const title = safeFileName(name);
    const rel = await this.vault.createNew(`${FOLDERS.listas}/${title}.md`, { type: "lista", modo: "personal", source: "lumi" }, `# ${title}\n`);
    await this.touch(rel);
    return rel;
  }

  async addListItem(rel: string, text: string): Promise<void> {
    const items = text
      .split(/\n|,(?![^(]*\))/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!items.length) return;
    const title = rel.split("/").pop()!.replace(/\.md$/, "");
    await this.vault.appendLumi(rel, items.map((i) => `- [ ] ${i}`).join("\n"), { fm: { type: "lista", modo: "personal" }, body: `# ${title}` });
    await this.touch(rel);
  }

  async toggleListItem(rel: string, line: number): Promise<void> {
    const text = await fs.promises.readFile(this.vault.abs(rel), "utf8");
    const raw = text.split(/\r?\n/)[line];
    if (raw === undefined || !parseTaskLine(raw)) throw new VaultError("La lista cambió; vuelve a intentarlo.");
    const p = parseTaskLine(raw)!;
    // En listas no hace falta la fecha de completado
    const next = p.done ? raw.replace(/^(\s*[-*+] )\[[xX]\]/, "$1[ ]") : raw.replace(/^(\s*[-*+] )\[[ /-]\]/, "$1[x]");
    await this.vault.replaceLine(rel, line, raw, next);
    await this.touch(rel);
  }

  /** Quita de una lista de Lumi lo ya marcado. */
  async clearList(rel: string): Promise<number> {
    const note = await this.vault.read(rel);
    if (!note) return 0;
    if (!this.vault.isLumiOwned(note.fm)) throw new VaultError("Esta lista es tuya: limpia lo marcado en Obsidian.");
    const lines = note.raw.split(/\r?\n/);
    let removed = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (parseTaskLine(lines[i])?.done) {
        await this.vault.replaceLine(rel, i, lines[i], null);
        removed++;
      }
    }
    await this.touch(rel);
    return removed;
  }

  payments(now = new Date()): PaymentInfo[] {
    const text = this.readCached(FILES.pagos) ?? "";
    return parsePayments(text)
      .map((p) => {
        const next = nextPaymentDate(p, now);
        return { name: p.name, day: p.day, month: p.month, amount: p.amount, lead: p.lead, line: p.line, next: dayKey(next), daysLeft: daysUntil(next, now) };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }

  async savePayment(p: PaymentInput, replaceLine?: number | null): Promise<void> {
    const line = formatPayment(p);
    if (replaceLine !== null && replaceLine !== undefined) {
      const raw = (await fs.promises.readFile(this.vault.abs(FILES.pagos), "utf8")).split(/\r?\n/)[replaceLine];
      if (raw === undefined) throw new VaultError("No encontré ese pago; quizá cambió en Obsidian.");
      await this.vault.replaceLine(FILES.pagos, replaceLine, raw, line);
    } else {
      await this.vault.appendLumi(FILES.pagos, line, {
        fm: { type: "pagos", modo: "personal" },
        body: "# Pagos y recibos\n\nUno por línea: `- Nombre · día 5 · $monto` (mensual) o `- Nombre · 15/04 · $monto` (anual). Lumi te avisa unos días antes. Nunca escribas aquí números de tarjeta o de cuenta.",
      });
    }
    await this.touch(FILES.pagos);
  }

  async deletePayment(lineNo: number): Promise<void> {
    const raw = (await fs.promises.readFile(this.vault.abs(FILES.pagos), "utf8")).split(/\r?\n/)[lineNo];
    if (raw === undefined) return;
    await this.vault.replaceLine(FILES.pagos, lineNo, raw, null);
    await this.touch(FILES.pagos);
  }

  /** Cumpleaños de tus personas (campo `cumple:` en su nota), del más próximo al más lejano. */
  birthdays(now = new Date()): BirthdayInfo[] {
    const rows = this.idx.db.prepare("SELECT path, title, fm FROM notes WHERE type = 'persona'").all() as { path: string; title: string; fm: string }[];
    const out: BirthdayInfo[] = [];
    for (const r of rows) {
      const fm = JSON.parse(r.fm) as Frontmatter;
      const b = parseBirthday(fm.cumple ?? fm.cumpleanos ?? fm.birthday);
      if (!b) continue;
      const next = nextBirthday(b, now);
      out.push({
        name: r.path.split("/").pop()!.replace(/\.md$/, ""),
        path: r.path,
        date: dayKey(next),
        daysLeft: daysUntil(next, now),
        age: b.year ? next.getFullYear() - b.year : null,
      });
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  async setBirthday(name: string, date: string): Promise<void> {
    const b = parseBirthday(date);
    if (!b) throw new VaultError("No entendí la fecha. Usa «15/03» o «15 de marzo».");
    const person = await this.ensureEntity("persona", name);
    const rel = this.entities().find((e) => e.kind === "persona" && e.name === person)?.path ?? `${FOLDERS.personas}/${person}.md`;
    await this.vault.setFrontmatter(rel, { cumple: birthdayKey(b) }, { userRequested: true });
    await this.touch(rel);
  }

  /** Pasa a mañana los pendientes de hoy (y atrasados) que no se hicieron. Solo cambia la fecha. */
  async moveDueToTomorrow(keys: string[], tomorrow: string): Promise<number> {
    let moved = 0;
    for (const key of keys) {
      const t = this.task(key);
      if (!t || t.done || !t.due) continue;
      const next = t.raw.replace(/📅\uFE0F?\s*\d{4}-\d{2}-\d{2}/u, `📅 ${tomorrow}`);
      if (next === t.raw) continue;
      try {
        await this.vault.replaceLine(t.path, t.line, t.raw, next);
        await this.touch(t.path);
        moved++;
      } catch {
        /* la nota cambió; se queda como estaba */
      }
    }
    return moved;
  }
}
