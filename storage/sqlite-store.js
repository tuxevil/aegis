import { createTimeline } from "./timeline.js";
import { createFeeds } from "./feeds.js";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inspectDatabase, migrate, MIGRATIONS } from "./migrations.js";
import { createRepositories } from "./repositories.js";
import { snapshot, verifyDatabase, pruneDailySnapshots } from "./backups.js";
import { createPublicReader } from "./public-reader.js";
import { createCitizenReports } from "./citizen-reports.js";
import { createSubscriptions } from "./subscriptions.js";
import { createSchedules } from "./schedules.js";
import { createCorrelation } from "./correlation.js";

export async function openStore({
  directory = process.env.DB_DIR || ".data/v5",
  synthetic = false,
  now = () => new Date(),
  maxBytes = Number(process.env.DB_MAX_BYTES || 64 * 1024 * 1024),
  migrations = MIGRATIONS,
  takeSnapshot = snapshot,
  allowMigrations = true,
  pushStorageKey = process.env.PUSH_STORAGE_KEY,
} = {}) {
  if (typeof synthetic !== "boolean" || !Number.isSafeInteger(maxBytes) || maxBytes < 65536) throw new Error("Configuración SQLite inválida");
  if (directory !== ":memory:") fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = directory === ":memory:" ? ":memory:" : path.resolve(directory, "aegis-v5.sqlite");
  const db = new DatabaseSync(file, { timeout: 3000 });
  let busy = false, closed = false, writing = false, writeFailure = null;
  try {
    const applied = inspectDatabase(db, migrations);
    const pending = applied.length < migrations.length;
    if (pending && !allowMigrations) throw new Error("Migración pendiente; ejecutar init explícitamente antes de operar");
    const pageSize = db.prepare("PRAGMA page_size").get().page_size;
    const maxPages = Math.floor(maxBytes / pageSize);
    if (db.prepare("PRAGMA page_count").get().page_count > maxPages) throw new Error("Base excede límite; no se recorta historial");
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000; PRAGMA max_page_count=${maxPages}`);
    if (pending) {
      // Reserve the writer before the snapshot and keep it until migration commits.
      // Online backup reads a separate connection: backing up a connection with an
      // active write transaction would stay BUSY rather than produce a snapshot.
      db.exec("BEGIN IMMEDIATE");
      try {
        if (inspectDatabase(db, migrations).length !== applied.length) throw new Error("Esquema cambió durante apertura; reintentar");
        if (applied.length && file !== ":memory:") {
          const reader = new DatabaseSync(file, { readOnly: true });
          try {
            await takeSnapshot(reader, path.join(directory, "backups"), { now, kind: "pre-migration", migrations });
          } finally { reader.close(); }
        }
        migrate(db, applied, now, migrations, { transactionOpen: true });
      } catch (error) {
        try { db.exec("ROLLBACK"); } catch { /* migrate or SQLite may already have rolled back. */ }
        throw error;
      }
    }
    const mode = db.prepare("SELECT value FROM settings WHERE key='synthetic'").get();
    if (!mode && applied.length) throw new Error("Base sin marca demo/live; requiere revisión");
    if (mode && mode.value !== String(synthetic)) throw new Error("No mezclar base demo y live");
    db.prepare("INSERT INTO settings(key,value) VALUES('synthetic',?) ON CONFLICT(key) DO NOTHING").run(String(synthetic));
    const journal = db.prepare("PRAGMA journal_mode=WAL").get().journal_mode;
    if (file !== ":memory:" && journal !== "wal") throw new Error("SQLite WAL no disponible");
    db.exec("PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=256; PRAGMA journal_size_limit=4194304");
    if (file !== ":memory:") fs.chmodSync(file, 0o600);
    verifyDatabase(db, migrations);

    const available = () => {
      if (closed || busy) throw new Error("Base cerrada o backup en curso");
    };
    const repositories = createRepositories(db, { synthetic, assertWritable: () => {
      available();
      if (!writing) throw new Error("Escritura requiere transacción");
      if (writeFailure) throw writeFailure;
    }, onWriteFailure: error => { writeFailure = error; } });
    const store = {
      repositories,
      timeline: createTimeline(db,{synthetic,available,now,getReader:()=>store.publicReader}),
      feeds: createFeeds(db, { synthetic, now, available, transaction: work => store.transaction(work), getRepositories: () => repositories }),
      publicReader: createPublicReader(db, { synthetic, available, now, projectEvent: id => store.correlation.project(id) }),
      reports: createCitizenReports(db, { synthetic, available, transaction: work => store.transaction(work), now }),
      subscriptions: createSubscriptions(db, { synthetic, available, transaction: work => store.transaction(work), now, key: pushStorageKey, getSchedules: () => store.schedules }),
      schedules: createSchedules(db, { synthetic, available, transaction: work => store.transaction(work), now }),
      correlation: createCorrelation(db, { synthetic, available, transaction: work => store.transaction(work), now }),
      transaction(work) {
        available();
        if (writing || typeof work !== "function" || work.constructor.name === "AsyncFunction") throw new Error("Transacción síncrona, sin anidación");
        db.exec("BEGIN IMMEDIATE");
        writing = true;
        writeFailure = null;
        try {
          const result = work(repositories);
          if (result && typeof result.then === "function") throw new Error("No esperar promesas dentro de transacción");
          if (writeFailure) throw writeFailure;
          db.exec("COMMIT");
          return result;
        } catch (error) {
          // SQLITE_FULL/IOERR may already have rolled the transaction back.
          try { db.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
          throw error;
        } finally { writing = false; writeFailure = null; }
      },
      writeBatch(batch) {
        if (!batch || Object.keys(batch).some(key => !Object.hasOwn(repositories, key))) throw new Error("Repositorio desconocido");
        return store.transaction(repos => Object.fromEntries(Object.keys(repos).map(table => {
          const records = batch[table] || [];
          if (!Array.isArray(records) || records.length > 500) throw new Error("Lote excede 500 filas por entidad");
          return [table, records.map(record => repos[table].insert(record))];
        })));
      },
      info() {
        available();
        return {
          version: db.prepare("PRAGMA user_version").get().user_version,
          journal: db.prepare("PRAGMA journal_mode").get().journal_mode,
          synthetic, pageSize,
          pages: db.prepare("PRAGMA page_count").get().page_count,
          maxPages: db.prepare("PRAGMA max_page_count").get().max_page_count,
        };
      },
      async backup({ directory: backupDirectory = path.join(directory, "backups"), keep = 7 } = {}) {
        available();
        if (writing || !Number.isInteger(keep) || keep < 1 || keep > 365) throw new Error("Backup fuera de transacción y retención 1–365");
        busy = true;
        try {
          const destination = await snapshot(db, backupDirectory, { now, migrations });
          pruneDailySnapshots(backupDirectory, keep, destination);
          return destination;
        } finally { busy = false; }
      },
      close() {
        if (closed) return;
        if (busy || writing) throw new Error("No cerrar durante una operación");
        db.close(); closed = true;
      },
    };
    return store;
  } catch (error) { db.close(); throw error; }
}
