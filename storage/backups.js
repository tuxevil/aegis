import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";
import { inspectDatabase, MIGRATIONS } from "./migrations.js";

export function verifyDatabase(db, migrations = MIGRATIONS) {
  if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) {
    throw new Error("Integridad SQLite inválida");
  }
  return inspectDatabase(db, migrations);
}

export function verifySnapshot(file, migrations = MIGRATIONS) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const applied = verifyDatabase(db, migrations);
    if (!applied.length) throw new Error("Snapshot sin esquema AEGIS");
    return applied.length;
  } finally { db.close(); }
}

// Online SQLite backup includes committed WAL pages. Never copy just the live .sqlite file.
export async function snapshot(db, directory, { now = () => new Date(), kind = "daily", migrations = MIGRATIONS } = {}) {
  if (!["daily", "pre-migration"].includes(kind)) throw new Error("Tipo de snapshot inválido");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const staging = fs.mkdtempSync(path.join(directory, ".snapshot-"));
  const temporary = path.join(staging, "snapshot.sqlite");
  const name = `${kind}-${now().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.sqlite`;
  const destination = path.join(directory, name);
  try {
    await backup(db, temporary, { rate: 128 });
    fs.chmodSync(temporary, 0o600);
    verifySnapshot(temporary, migrations);
    // Hard link is atomic and fails rather than overwriting an existing destination.
    fs.linkSync(temporary, destination);
    return destination;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function pruneDailySnapshots(directory, keep = 7, preserve = null) {
  if (!Number.isInteger(keep) || keep < 1 || keep > 365) throw new Error("Retención inválida");
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^daily-\d{4}-\d{2}-\d{2}T[\dZ-]+-[a-f0-9-]{36}\.sqlite$/.test(entry.name))
    .map(entry => ({ name: entry.name, time: fs.statSync(path.join(directory, entry.name)).mtimeMs }))
    .sort((a, b) => Number(path.join(directory, b.name) === preserve) - Number(path.join(directory, a.name) === preserve)
      || b.time - a.time || b.name.localeCompare(a.name));
  for (const entry of entries.slice(keep)) fs.unlinkSync(path.join(directory, entry.name));
  return entries.slice(keep).length;
}

// Restore only to a NEW directory. Stop the app before manually switching DB_DIR.
export async function restoreSnapshot(file, directory) {
  verifySnapshot(file);
  fs.mkdirSync(directory, { mode: 0o700 }); // EEXIST deliberately refuses live destinations.
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const destination = path.join(directory, "aegis-v5.sqlite");
    await backup(db, destination, { rate: 128 });
    fs.chmodSync(destination, 0o600);
    verifySnapshot(destination);
    return destination;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  } finally { db.close(); }
}
