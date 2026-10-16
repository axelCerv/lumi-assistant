/**
 * Índice local (desechable): SQLite con FTS5 para texto y sqlite-vec para vectores.
 * Se reconstruye desde el vault en cualquier momento.
 */
import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { log, errorText } from "../util";

export const EMBED_DIM = 384;
const SCHEMA_VERSION = "4";

export interface IndexDb {
  db: Database.Database;
  vec: boolean;
  vecError: string | null;
}

function loadVec(db: Database.Database): string | null {
  try {
    // Dentro de la app empaquetada la extensión vive fuera del .asar
    const p = sqliteVec.getLoadablePath().replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    db.loadExtension(p);
    return null;
  } catch (e) {
    return errorText(e);
  }
}

export function openIndex(file: string): IndexDb {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  const version = (() => {
    try {
      return (db.prepare("SELECT value FROM meta WHERE key='schema'").get() as { value: string } | undefined)?.value;
    } catch {
      return undefined;
    }
  })();
  if (version && version !== SCHEMA_VERSION) {
    log.info("Índice con esquema viejo: se reconstruye.");
    for (const t of ["notes", "chunks", "chunks_fts", "chunks_vec", "tasks", "links", "meta"]) db.exec(`DROP TABLE IF EXISTS ${t}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS notes(
      path TEXT PRIMARY KEY, title TEXT, type TEXT, folder TEXT, date TEXT, mtime REAL,
      private INTEGER, fm TEXT, tags TEXT, links TEXT, aliases TEXT
    );
    CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, ord INTEGER, heading TEXT, text TEXT);
    CREATE INDEX IF NOT EXISTS chunks_path ON chunks(path);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(title, heading, text, tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE IF NOT EXISTS tasks(
      key TEXT PRIMARY KEY, path TEXT, line INTEGER, raw TEXT, text TEXT, done INTEGER,
      due TEXT, time TEXT, done_date TEXT, tags TEXT, links TEXT, private INTEGER, lumi INTEGER
    );
    CREATE INDEX IF NOT EXISTS tasks_path ON tasks(path);
    CREATE TABLE IF NOT EXISTS links(src TEXT, dst TEXT);
    CREATE INDEX IF NOT EXISTS links_src ON links(src);
    CREATE INDEX IF NOT EXISTS links_dst ON links(dst);
  `);
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema', ?)").run(SCHEMA_VERSION);

  const vecError = loadVec(db);
  if (!vecError) {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(embedding float[${EMBED_DIM}])`);
  } else {
    log.warn("sqlite-vec no disponible; la búsqueda será solo por texto:", vecError);
  }
  return { db, vec: !vecError, vecError };
}

export function vecBuffer(v: number[] | Float32Array): Buffer {
  const f = v instanceof Float32Array ? v : new Float32Array(v);
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}
