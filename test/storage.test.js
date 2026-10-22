import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "../storage/sqlite-store.js";
import { MIGRATIONS } from "../storage/migrations.js";
import { restoreSnapshot, verifySnapshot, snapshot } from "../storage/backups.js";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";

const now = () => new Date("2026-10-22T01:00:00Z");
// All fixture entities are explicitly synthetic; never loaded by runtime modules.
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/storage-v1.json", import.meta.url)));
const demoBatch = () => structuredClone(fixture);
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-sqlite-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
async function memory(t, options = {}) {
  const store = await openStore({ directory: ":memory:", synthetic: true, now, ...options });
  t.after(() => store.close());
  return store;
}
const migration = sql => ({ version: 2, sql, checksum: createHash("sha256").update(sql).digest("hex") });

test("SQLite WAL survives a new process and repeated migrations; v4 JSON untouched", async t => {
  const directory = temporary(t);
  const legacy = path.join(directory, "observations.json");
  fs.writeFileSync(legacy, '{"version":1,"series":{"test":[]}}');
  const original = fs.readFileSync(legacy);
  const store = await openStore({ directory, synthetic: true, now });
  assert.equal(store.info().journal, "wal");
  store.writeBatch(demoBatch());
  store.close();
  const source = `import {openStore} from './storage/sqlite-store.js';
    const s=await openStore({directory:process.argv[1],synthetic:true});
    console.log(JSON.stringify({info:s.info(),observation:s.repositories.observations.get('demo-observation')}));s.close();`;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", source, directory], { encoding: "utf8" }));
  assert.equal(result.info.version, 1);
  assert.equal(result.observation.occurred_at, "2026-10-22T00:00:00.000Z");
  assert.equal(result.observation.observed_at, null);
  assert.deepEqual(fs.readFileSync(legacy), original);
  assert.equal(fs.statSync(path.join(directory, "aegis-v5.sqlite")).mode & 0o777, 0o600);
});

test("atomic batch, idempotent duplicates, immutable conflicts and foreign keys", async t => {
  const store = await memory(t);
  store.writeBatch(demoBatch());
  store.writeBatch(demoBatch());
  for (const repository of Object.values(store.repositories)) assert.equal(repository.list().length, 1);
  const observation = demoBatch().observations[0];
  assert.throws(() => store.writeBatch({ observations: [{ ...observation, summary: "changed" }] }), /contenido distinto/);
  assert.throws(() => store.writeBatch({ observations: [{ ...observation, id: "duplicate" }] }), /UNIQUE/);
  assert.throws(() => store.writeBatch({ artifacts: [{ ...demoBatch().artifacts[0], id: "duplicate" }] }), /UNIQUE/);
  assert.throws(() => store.writeBatch({ evidence: [{ ...demoBatch().evidence[0], id: "duplicate" }] }), /UNIQUE/);
  assert.throws(() => store.writeBatch({ areas: [{ ...demoBatch().areas[0], id: "rolled-back" }],
    observations: [{ ...observation, id: "invalid", dedupe_key: "invalid", source_id: "missing" }] }), /FOREIGN KEY/);
  assert.equal(store.repositories.areas.get("rolled-back"), null);
  assert.throws(() => store.transaction(repos => {
    repos.areas.insert({ ...demoBatch().areas[0], id: "caught-but-rolled-back" });
    try {
      repos.observations.insert({ ...observation, id: "invalid", dedupe_key: "invalid", source_id: "missing" });
    } catch { /* A caught error must not permit committing a partial transaction. */ }
  }), /FOREIGN KEY/);
  assert.equal(store.repositories.areas.get("caught-but-rolled-back"), null);
  assert.equal(store.repositories.observations.get("demo-observation").summary, observation.summary);
});

test("temporal queries distinguish occurrence from ingestion, normalize offsets and paginate", async t => {
  const store = await memory(t);
  store.writeBatch(demoBatch());
  const repo = store.repositories.observations;
  const range = { area_id: "demo-area", from: "2026-10-21T19:00:00-05:00", to: "2026-10-22T00:15:00Z" };
  assert.equal(repo.list({ ...range, time: "occurred_at" }).length, 1);
  assert.equal(repo.list({ ...range, time: "ingested_at" }).length, 0);
  assert.equal(repo.list({ to: "2026-10-22T00:30:00Z", time: "ingested_at" }).length, 0);
  assert.equal(repo.list({ from: "2026-10-22T00:30:00Z", time: "ingested_at" }).length, 1);
  assert.equal(repo.list({ limit: 1, offset: 1 }).length, 0);
  assert.equal(repo.list({ area_id: "' OR 1=1 --" }).length, 0);
  for (const options of [{ limit: 501 }, { offset: -1 }, { from: "yesterday" },
    { from: "2026-02-30T00:00:00Z" },
    { from: "2026-10-22T00:30:00Z", to: "2026-10-21T00:00:00Z" }, { from: range.from, time: "id; DROP TABLE events" }]) {
    assert.throws(() => repo.list(options));
  }
});

test("source loss and failed ingests preserve original dates and all existing evidence", async t => {
  const store = await memory(t);
  store.writeBatch(demoBatch());
  const before = store.repositories.observations.list();
  // No ingestion record arrives on an upstream failure. Failed partial writes are atomic.
  store.writeBatch({});
  assert.throws(() => store.writeBatch({ observations: [{ ...demoBatch().observations[0],
    id: "failed-ingest", dedupe_key: "failed-ingest", artifact_id: "missing-artifact" }] }), /FOREIGN KEY/);
  assert.deepEqual(store.repositories.observations.list(), before);
  assert.equal(store.repositories.evidence.list().length, 1);
});

test("online snapshot captures WAL and restores into a new directory without overwrites", async t => {
  const directory = temporary(t);
  const store = await openStore({ directory, synthetic: true, now });
  t.after(() => store.close());
  store.writeBatch(demoBatch());
  assert.ok(fs.existsSync(path.join(directory, "aegis-v5.sqlite-wal")));
  const snapshot = await store.backup();
  assert.equal(verifySnapshot(snapshot), 1);
  const restoreDirectory = path.join(directory, "restored");
  await restoreSnapshot(snapshot, restoreDirectory);
  const restored = await openStore({ directory: restoreDirectory, synthetic: true });
  try { assert.deepEqual(restored.repositories.observations.list(), store.repositories.observations.list()); }
  finally { restored.close(); }
  const before = fs.readFileSync(path.join(restoreDirectory, "aegis-v5.sqlite"));
  await assert.rejects(restoreSnapshot(snapshot, restoreDirectory), /EEXIST/);
  assert.deepEqual(fs.readFileSync(path.join(restoreDirectory, "aegis-v5.sqlite")), before);
  await assert.rejects(restoreSnapshot(snapshot, directory), /EEXIST/);
  const corrupt = path.join(directory, "corrupt.sqlite");
  fs.writeFileSync(corrupt, "invalid");
  await assert.rejects(restoreSnapshot(corrupt, path.join(directory, "bad-restore")));
  assert.equal(fs.existsSync(path.join(directory, "bad-restore")), false);
});

test("backup retention keeps fresh verified snapshot and leaves unrelated files alone", async t => {
  const directory = temporary(t);
  const store = await openStore({ directory, synthetic: true, now });
  t.after(() => store.close());
  const backups = path.join(directory, "backups");
  await store.backup({ keep: 1 });
  fs.writeFileSync(path.join(backups, "manual.sqlite"), "keep");
  const latest = await store.backup({ keep: 1 });
  assert.ok(fs.existsSync(latest));
  assert.equal(fs.readdirSync(backups).filter(file => file.startsWith("daily-")).length, 1);
  assert.equal(fs.readFileSync(path.join(backups, "manual.sqlite"), "utf8"), "keep");
  await assert.rejects(store.backup({ keep: 0 }));
});

test("migration failure rolls back DDL and rows, creates a restorable pre-migration snapshot", async t => {
  const directory = temporary(t);
  const store = await openStore({ directory, synthetic: true, now });
  store.writeBatch(demoBatch()); store.close();
  const badMigration = migration("CREATE TABLE transient(id INTEGER); INSERT INTO nonexistent VALUES(1);");
  await assert.rejects(openStore({ directory, synthetic: true, now, migrations: [...MIGRATIONS, badMigration] }), /nonexistent/);
  const snapshots = fs.readdirSync(path.join(directory, "backups")).filter(file => file.startsWith("pre-migration-"));
  assert.equal(snapshots.length, 1);
  assert.equal(verifySnapshot(path.join(directory, "backups", snapshots[0])), 1);
  const db = new DatabaseSync(path.join(directory, "aegis-v5.sqlite"));
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='transient'").get(), undefined);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1);
  db.close();
  const reopened = await openStore({ directory, synthetic: true, now });
  assert.equal(reopened.repositories.observations.list().length, 1); reopened.close();
  const restoredDirectory = path.join(directory, "rollback");
  await restoreSnapshot(path.join(directory, "backups", snapshots[0]), restoredDirectory);
  const restored = await openStore({ directory: restoredDirectory, synthetic: true });
  assert.equal(restored.repositories.evidence.list().length, 1); restored.close();
});

test("successful version upgrade is repeatable; older code refuses future schema unchanged", async t => {
  const directory = temporary(t);
  const store = await openStore({ directory, synthetic: true, now }); store.close();
  const migrations = [...MIGRATIONS, migration("CREATE TABLE next_version(id INTEGER PRIMARY KEY) STRICT;")];
  for (let i = 0; i < 2; i++) {
    const upgraded = await openStore({ directory, synthetic: true, now, migrations });
    assert.equal(upgraded.info().version, 2); upgraded.close();
  }
  const file = path.join(directory, "aegis-v5.sqlite"), before = fs.readFileSync(file);
  await assert.rejects(openStore({ directory, synthetic: true }), /incompatible/);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(fs.readdirSync(path.join(directory, "backups")).length, 1);
});

test("changed migration checksum and foreign DB fail closed without modifying files", async t => {
  const directory = temporary(t);
  const store = await openStore({ directory, synthetic: true, now }); store.close();
  const file = path.join(directory, "aegis-v5.sqlite"), before = fs.readFileSync(file);
  await assert.rejects(openStore({ directory, synthetic: true, migrations: [{ ...MIGRATIONS[0], checksum: "bad" }] }), /incompatible/);
  assert.deepEqual(fs.readFileSync(file), before);
  const foreign = path.join(directory, "foreign"); fs.mkdirSync(foreign);
  const foreignFile = path.join(foreign, "aegis-v5.sqlite");
  const db = new DatabaseSync(foreignFile); db.exec("CREATE TABLE private_data(secret TEXT)"); db.close();
  const foreignBefore = fs.readFileSync(foreignFile);
  await assert.rejects(openStore({ directory: foreign }), /ajena/);
  assert.deepEqual(fs.readFileSync(foreignFile), foreignBefore);
});

test("demo/live isolation persists, private fields rejected, writes require sync transactions", async t => {
  const directory = temporary(t);
  const store = await openStore({ directory, synthetic: true, now });
  store.writeBatch(demoBatch());
  assert.throws(() => store.repositories.areas.insert(demoBatch().areas[0]), /transacción/);
  assert.throws(() => store.transaction(async () => {}), /síncrona/);
  assert.throws(() => store.transaction(() => store.transaction(() => {})), /anidación/);
  assert.throws(() => store.transaction(() => Promise.resolve()), /promesas/);
  assert.throws(() => store.writeBatch({ areas: [{ ...demoBatch().areas[0], synthetic: false }] }), /demo y live/);
  assert.throws(() => store.writeBatch({ areas: [{ ...demoBatch().areas[0], latitude: 1 }] }), /desconocidos/);
  store.close();
  await assert.rejects(openStore({ directory, synthetic: false }), /demo y live/);
  const reopened = await openStore({ directory, synthetic: true });
  assert.equal(reopened.repositories.areas.list().length, 1); reopened.close();
});

test("size limit rejects growth atomically without deleting historical rows", async t => {
  const store = await memory(t, { maxBytes: 256 * 1024 });
  store.writeBatch(demoBatch());
  const rows = Array.from({ length: 200 }, (_, i) => ({ ...demoBatch().observations[0],
    id: `growth-${i}`, dedupe_key: `growth-${i}`, summary: "x".repeat(2000) }));
  assert.throws(() => store.writeBatch({ observations: rows }), /full/);
  assert.equal(store.repositories.observations.list().length, 1);
  assert.ok(store.info().pages <= store.info().maxPages);
  store.writeBatch({ areas: [{ ...demoBatch().areas[0], id: "after-full" }] });
  assert.ok(store.repositories.areas.get("after-full"));
});

test("SQLite OFF never opens storage; ON uses injected lifecycle and preserves v4", async t => {
  let opens = 0, closes = 0;
  const options = { store: new HistoryStore(), now, mac: null,
    fetchUrl: async () => { throw new Error("offline"); },
    openV5Store: async () => { opens++; return { close() { closes++; } }; } };
  const off = await createApp({ ...options, flags: {} });
  const on = await createApp({ ...options, flags: { SQLITE_STORAGE: true } });
  try {
    assert.equal(opens, 1);
    assert.equal(off.hasDecorator("v5Store"), false);
    assert.equal(on.hasDecorator("v5Store"), true);
    assert.equal((await off.inject("/api/status")).body, (await on.inject("/api/status")).body);
  } finally { await off.close(); await on.close(); }
  assert.equal(closes, 1);
});

test("operator CLI init/status/backup/verify/restore works; status never creates a missing DB", async t => {
  const directory = temporary(t);
  const dbDirectory = path.join(directory, "db");
  const cli = (...args) => execFileSync(process.execPath, ["scripts/storage.js", ...args], {
    encoding: "utf8", env: { ...process.env, DB_DIR: dbDirectory, SQLITE_DEMO: "true" }, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  assert.throws(() => cli("status"));
  assert.equal(fs.existsSync(dbDirectory), false);
  assert.equal(JSON.parse(cli("init")).version, 1);
  assert.equal(JSON.parse(cli("status")).version, 1);
  const snapshot = cli("backup");
  assert.match(cli("verify", snapshot), /válido/);
  const restored = path.join(directory, "restored");
  assert.equal(cli("restore", snapshot, restored), path.join(restored, "aegis-v5.sqlite"));
  assert.throws(() => cli("restore", snapshot, dbDirectory));
  assert.equal(JSON.parse(cli("status")).version, 1);
});

test("writer lock covers snapshot and migration with no commit gap; failed snapshots release lock", async t => {
  const directory = temporary(t), file = path.join(directory, "aegis-v5.sqlite");
  const initial = await openStore({ directory, synthetic: true });
  initial.writeBatch(demoBatch()); initial.close();
  const migrations = [...MIGRATIONS, migration("CREATE TABLE after_snapshot(id INTEGER PRIMARY KEY) STRICT;")];
  let attempts = 0, snapshotFile;
  async function concurrentWriterMustWait() {
    // A separate process avoids blocking this process's event loop while backup runs.
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
      import {DatabaseSync} from 'node:sqlite';
      const db=new DatabaseSync(process.argv[1],{timeout:50});
      try {db.exec("INSERT INTO settings(key,value) VALUES('concurrent-write','lost-on-rollback')");process.exitCode=2;}
      catch(error){if(!/locked/.test(error.message))throw error;}
      finally{db.close();}
    `, file], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = ""; child.stderr.on("data", data => { stderr += data; });
    const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
    assert.equal(code, 0, stderr); attempts++;
  }
  const upgraded = await openStore({ directory, synthetic: true, migrations, takeSnapshot: async (...args) => {
    await concurrentWriterMustWait();
    snapshotFile = await snapshot(...args);
    await concurrentWriterMustWait(); // The former race: snapshot completed, migration not started.
    return snapshotFile;
  } });
  upgraded.close();
  assert.equal(attempts, 2); assert.equal(verifySnapshot(snapshotFile), 1);
  const reader = new DatabaseSync(file);
  assert.equal(reader.prepare("SELECT value FROM settings WHERE key='concurrent-write'").get(), undefined);
  reader.exec("INSERT INTO settings(key,value) VALUES('after-migration','ok')");reader.close();
  const rollback = path.join(directory, "rollback-before-snapshot");
  await restoreSnapshot(snapshotFile, rollback);
  await assert.rejects(openStore({ directory: rollback, synthetic: true, migrations,
    takeSnapshot: async () => { throw new Error("backup-failed"); } }), /backup-failed/);
  const writable = await openStore({ directory: rollback, synthetic: true });
  writable.writeBatch({ areas: [{ ...demoBatch().areas[0], id: "after-failed-backup" }] });
  assert.ok(writable.repositories.areas.get("after-failed-backup")); writable.close();
});
