import fs from "node:fs";
import { createHash } from "node:crypto";

export const MIGRATIONS = Object.freeze(["001-foundations.sql", "002-citizen-reports.sql", "003-correlation.sql"].map((file, index) => {
  const sql = fs.readFileSync(new URL(`./migrations/${file}`, import.meta.url), "utf8");
  return Object.freeze({ version: index + 1, sql, checksum: createHash("sha256").update(sql).digest("hex") });
}));
export const APPLICATION_ID = 0x41454735;

// Inspect before changing pragmas, so unknown/future databases fail closed.
export function inspectDatabase(db, migrations = MIGRATIONS) {
  const applicationId = db.prepare("PRAGMA application_id").get().application_id;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  if (tables.length === 0 && applicationId === 0 && db.prepare("PRAGMA user_version").get().user_version === 0) return [];
  if (applicationId !== APPLICATION_ID) throw new Error("Base ajena a AEGIS; no se modifica");
  const applied = db.prepare("SELECT version, checksum FROM schema_migrations ORDER BY version").all();
  if (db.prepare("PRAGMA user_version").get().user_version !== applied.length) {
    throw new Error("Versión de esquema inconsistente");
  }
  for (const [index, row] of applied.entries()) {
    const migration = migrations[index];
    if (!migration || row.version !== migration.version || row.checksum !== migration.checksum) {
      throw new Error("Migración incompatible; conservar base y usar snapshot");
    }
  }
  return applied;
}

export function migrate(db, applied, now, migrations = MIGRATIONS, { transactionOpen = false } = {}) {
  if (!transactionOpen) db.exec("BEGIN IMMEDIATE");
  try {
    // Recheck under the writer lock, including after a snapshot.
    const current = inspectDatabase(db, migrations);
    if (current.length !== applied.length) throw new Error("Esquema cambió durante apertura; reintentar");
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL
    ) STRICT`);
    const record = db.prepare("INSERT INTO schema_migrations VALUES (?, ?, ?)");
    for (const migration of migrations.slice(applied.length)) {
      if (migration.version !== applied.length + 1) throw new Error("Secuencia de migración inválida");
      db.exec(migration.sql);
      record.run(migration.version, migration.checksum, now().toISOString());
      applied = [...applied, migration];
    }
    db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${applied.length}`);
    db.exec("COMMIT");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* SQLite may have auto-rolled back on FULL/IOERR. */ }
    throw error;
  }
}
