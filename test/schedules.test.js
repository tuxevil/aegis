import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "../storage/sqlite-store.js";
import { MIGRATIONS } from "../storage/migrations.js";
import { restoreSnapshot } from "../storage/backups.js";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
import { EEASA } from "../schedules/providers.js";
import { parseEeasa } from "../schedules/eeasa.js";
import { downloadSchedule, captureSchedule } from "../schedules/capture.js";
const file = (name) =>
  fs.readFileSync(
    new URL(`./fixtures/schedules/${name}.html`, import.meta.url),
  );
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/storage-v1.json", import.meta.url)),
);
const temporary = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-schedules-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
async function setup(t, options = {}) {
  let clock = Date.parse("2026-10-22T12:00:00Z");
  const now = () => new Date(clock),
    synthetic = options.synthetic ?? true;
  const store = await openStore({
    directory: ":memory:",
    synthetic,
    now,
    ...options,
  });
  t.after(() => store.close());
  store.writeBatch({
    areas: [
      {
        ...fixture.areas[0],
        id: "canton",
        type: "canton",
        location_precision: "administrative_area",
        synthetic,
      },
      ...["sector-a", "sector-b"].map((id) => ({
        ...fixture.areas[0],
        id,
        parent_id: "canton",
        name: `Synthetic ${id}`,
        synthetic,
      })),
    ],
  });
  const ingest = (name = "eeasa-v1") =>
    store.schedules.ingest({ provider_id: EEASA.id, body: file(name) });
  const bind = (label, area) =>
    store.schedules.bind({
      provider_id: EEASA.id,
      sector_label: label,
      area_id: area,
      reference_url: EEASA.url,
      review_reason: "Synthetic catalog correspondence verified",
    });
  const review = (id, patch = {}) =>
    store.schedules.review({
      revision_id: id,
      decision: "reviewed",
      rights_reviewed: true,
      review_reason: "Synthetic fixture rights, sector and extraction reviewed",
      ...patch,
    });
  const list = (area = "sector-a", patch = {}) =>
    store.schedules.listPublic({
      area_id: area,
      from: "2026-10-22T00:00:00Z",
      to: "2026-10-25T00:00:00Z",
      ...patch,
    });
  return {
    store,
    now,
    ingest,
    bind,
    review,
    list,
    advance: (ms) => (clock += ms),
  };
}

test("EEASA fixture parser preserves separate times, maintenance/industrial categories and unknown publication date", () => {
  const parsed = parseEeasa(file("eeasa-v1"));
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.source_published_at, null);
  assert.equal(parsed.entries[0].start_at, "2026-10-22T14:00:00.000Z");
  assert.equal(parsed.entries[0].end_at, "2026-10-22T18:00:00.000Z");
  assert.equal(parsed.entries[0].type, "maintenance");
  assert.equal(parsed.entries[1].type, "industrial");
  assert.equal(parseEeasa(file("eeasa-v2")).entries[1].parser_confidence, 0.5);
});

test("Ecuador interpretation survives UTC date rollover and unrelated international timezone/DST settings", () => {
  const row = parseEeasa(file("eeasa-utc")).entries[0];
  assert.equal(row.start_at, "2026-10-24T03:30:00.000Z");
  assert.equal(row.end_at, "2026-10-24T04:30:00.000Z");
  const code = `import fs from 'node:fs';import {parseEeasa} from './schedules/eeasa.js';console.log(parseEeasa(fs.readFileSync('test/fixtures/schedules/eeasa-utc.html')).entries[0].start_at);`;
  for (const tz of ["UTC", "America/New_York", "Europe/Madrid"])
    assert.equal(
      execFileSync(process.execPath, ["--input-type=module", "-e", code], {
        env: { ...process.env, TZ: tz },
        encoding: "utf8",
      }).trim(),
      row.start_at,
    );
});

test("soft404, empty cards, invalid calendar, ambiguous multi-window rows and unsupported time syntax fail closed", () => {
  assert.throws(() => parseEeasa(file("eeasa-invalid")), /FORMAT_REVIEW/);
  const source = file("eeasa-v1").toString();
  for (const [old, replacement] of [
    ["22 - octubre", "32 - octubre"],
    ["09:00 a 13:00", "23:00 a 01:00"],
    ["09:00 a 13:00", "9h00 a 13h00"],
    ["jueves,", "viernes,"],
    ["SECTOR SINTÉTICO B", "SECTOR SINTÉTICO A"],
  ])
    assert.throws(() =>
      parseEeasa(Buffer.from(source.replace(old, replacement))),
    );
  assert.throws(
    () => parseEeasa(Buffer.alloc(EEASA.max_bytes + 1)),
    /BODY_LIMIT/,
  );
  assert.throws(() => parseEeasa(new Uint8Array([255, 254])));
});

test("parser does not execute source scripts, remote assets, markup or fetch embedded links", () => {
  const source = file("eeasa-v1")
    .toString()
    .replace(
      "<body>",
      '<body><script>globalThis.AEGIS_SCHEDULE_EXECUTED=true</script><img src="http://127.0.0.1/private"><iframe src="https://example.invalid"></iframe>',
    );
  const mutating = source.replace(
    "</section>",
    '<script>document.querySelector("h5.card-title").remove()</script></section>',
  );
  assert.equal(
    parseEeasa(Buffer.from(mutating)).entries[0].start_at,
    "2026-10-22T14:00:00.000Z",
  );
  assert.equal(parseEeasa(Buffer.from(source)).entries.length, 2);
  assert.equal(globalThis.AEGIS_SCHEDULE_EXECUTED, undefined);
});

test("original bytes/hash are preserved; duplicate captures are idempotent and remain pending without exact geography/rights", async (t) => {
  const { store, ingest, list, bind, review } = await setup(t);
  const result = ingest();
  assert.deepEqual(
    store.schedules.document(result.artifact_id),
    file("eeasa-v1"),
  );
  assert.equal(
    store.repositories.artifacts.get(result.artifact_id).sha256,
    hash(file("eeasa-v1")),
  );
  assert.equal(ingest().duplicate, true);
  assert.equal(store.schedules.queue().length, 2);
  assert.deepEqual(list().data, []);
  const first = store.schedules.queue().find((r) => r.type === "maintenance");
  assert.throws(() => review(first.id), /correspondencia/);
  bind(first.sector_label, "sector-a");
  assert.throws(() => review(first.id, { rights_reviewed: false }), /Derechos/);
  review(first.id);
  const item = list().data[0];
  assert.equal(item.review_state, "reviewed");
  assert.equal(item.effective_status, "published");
  assert.equal(item.synthetic, true);
  assert.equal(item.original_zone, "America/Guayaquil");
  assert.equal(item.source_published_at, null);
  assert.equal(item.source_url, EEASA.url);
});

test("silent replacement at the same URL detects changed hours; approval is revision-specific and auditable", async (t) => {
  const { store, ingest, list, bind, review } = await setup(t);
  ingest();
  const first = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(first.sector_label, "sector-a");
  review(first.id);
  const replaced = ingest("eeasa-v2");
  assert.notEqual(replaced.artifact_id, first.artifact_id);
  let current = list().data[0];
  assert.equal(current.start_at, first.start_at);
  assert.equal(current.source_status, "changed");
  assert.equal(current.effective_status, "unverified");
  const changed = store.schedules
    .queue()
    .find((r) => r.entry_id === first.entry_id);
  assert.equal(changed.revision_no, 2);
  assert.equal(changed.predecessor_id, first.id);
  assert.ok(JSON.parse(changed.change_json).includes("start_at"));
  assert.throws(() => review(first.id), /desactualizada/);
  review(changed.id);
  current = list().data[0];
  assert.equal(current.start_at, "2026-10-22T15:30:00.000Z");
  assert.equal(current.effective_status, "revised");
  assert.equal(
    store.schedules.history(first.entry_id)[0].start_at,
    "2026-10-22T14:00:00.000Z",
  );
});

test("a row missing in the next valid document is unverified, never cancelled; restoring old document hash creates a new revision", async (t) => {
  const { store, ingest, list, bind, review } = await setup(t);
  ingest();
  const row = store.schedules.queue().find((r) => r.type === "industrial");
  bind(row.sector_label, "sector-b");
  review(row.id);
  ingest("eeasa-v2");
  const missing = list("sector-b").data[0];
  assert.equal(missing.source_status, "missing");
  assert.equal(missing.effective_status, "unverified");
  assert.equal(missing.type, "industrial");
  assert.equal(store.schedules.history(row.entry_id).at(-1).row_present, 0);
  const reverted = ingest("eeasa-v1");
  assert.equal(reverted.duplicate, false);
  assert.equal(store.schedules.history(row.entry_id).at(-1).revision_no, 3);
  assert.equal(store.schedules.history(row.entry_id).at(-1).row_present, 1);
  assert.equal(list("sector-b").data[0].source_status, "changed");
  assert.equal(
    store.repositories.artifacts.list().length,
    2,
    "content addressed storage deduplicates the original bytes",
  );
});

test("parse failure stores quarantined original and preserves every prior schedule/date instead of cancellation", async (t) => {
  const { store, ingest, list, bind, review } = await setup(t);
  ingest();
  const first = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(first.sector_label, "sector-a");
  review(first.id);
  const failed = ingest("eeasa-invalid");
  assert.equal(failed.parse_error, "FORMAT_REVIEW");
  assert.ok(store.schedules.document(failed.artifact_id));
  assert.equal(store.schedules.history(first.entry_id).length, 1);
  const visible = list().data[0];
  assert.equal(visible.source_status, "failed");
  assert.equal(visible.effective_status, "unverified");
  assert.equal(visible.start_at, first.start_at);
});

test("unresolved labels, low confidence and mapping conflicts never produce a public schedule", async (t) => {
  const { store, ingest, bind, review, list } = await setup(t);
  ingest("eeasa-v2");
  const unresolved = store.schedules.queue().find((r) => r.type === "unknown");
  bind(unresolved.sector_label, "sector-a");
  assert.throws(() => review(unresolved.id), /extracción/);
  assert.throws(() => bind(unresolved.sector_label, "sector-b"), /conflicto/);
  assert.throws(
    () => bind("Synthetic ambiguous canton", "canton"),
    /generalizado/,
  );
  assert.deepEqual(list().data, []);
  assert.throws(
    () =>
      store.schedules.bind({
        provider_id: EEASA.id,
        sector_label: "x",
        area_id: "sector-a",
        reference_url: "https://evil.invalid",
        review_reason: "x",
      }),
    /oficial/,
  );
});

test("download allowlist, TLS defaults, timeout signal, MIME, redirects and byte limits are explicit", async () => {
  let received;
  const result = await downloadSchedule(EEASA.id, {
    fetchImpl: async (url, options) => {
      received = { url, options };
      return new Response(file("eeasa-v1"), {
        headers: { "content-type": "text/html", etag: "v1" },
      });
    },
  });
  assert.equal(received.url, EEASA.url);
  assert.equal(received.options.redirect, "error");
  assert.ok(received.options.signal instanceof AbortSignal);
  assert.equal(received.options.credentials, "omit");
  assert.equal(result.etag, "v1");
  await assert.rejects(downloadSchedule("https://127.0.0.1/"), /registrado/);
  for (const response of [
    new Response("x", { status: 302 }),
    new Response("x", { headers: { "content-type": "application/pdf" } }),
    new Response(Buffer.alloc(EEASA.max_bytes + 1), {
      headers: { "content-type": "text/html" },
    }),
  ])
    await assert.rejects(
      downloadSchedule(EEASA.id, { fetchImpl: async () => response }),
    );
});

test("fetch cooldown spans processes/connections; 304 and source failure preserve original evidence without cancelling", async (t) => {
  const directory = temporary(t),
    { store, advance, list, bind, review } = await setup(t, {
      directory,
      synthetic: false,
    });
  let requests = 0;
  const fetchImpl = async () => {
    requests++;
    return new Response(file("eeasa-v1"), {
      headers: { "content-type": "text/html", etag: '"one"' },
    });
  };
  await captureSchedule(store, EEASA.id, { fetchImpl });
  const first = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(first.sector_label, "sector-a");
  review(first.id);
  await assert.rejects(
    captureSchedule(store, EEASA.id, { fetchImpl }),
    /15 minutos/,
  );
  assert.equal(requests, 1);
  const other = await openStore({
    directory,
    synthetic: false,
    now: () => new Date("2026-10-22T12:00:00Z"),
  });
  t.after(() => other.close());
  assert.throws(() => other.schedules.claimFetch(EEASA.id), /15 minutos/);
  advance(16 * 60000);
  await assert.rejects(
    captureSchedule(store, EEASA.id, {
      fetchImpl: async () => {
        throw new Error("network private URL must not leak");
      },
    }),
    /conserva/,
  );
  const failed = list().data[0];
  assert.equal(failed.source_status, "failed");
  assert.equal(failed.start_at, first.start_at);
  assert.equal(failed.effective_status, "unverified");
  advance(16 * 60000);
  await captureSchedule(store, EEASA.id, {
    fetchImpl: async (_, options) => {
      assert.equal(options.headers["if-none-match"], '"one"');
      return new Response(null, { status: 304 });
    },
  });
  assert.equal(list().data[0].source_status, "current");
  assert.equal(store.schedules.history(first.entry_id).length, 1);
});

test("unexpected 304 fails closed; a valid 304 can recover after a semantic-error response", async (t) => {
  const { store, advance, bind, review, list } = await setup(t, {
    synthetic: false,
  });
  await assert.rejects(
    captureSchedule(store, EEASA.id, {
      fetchImpl: async () => new Response(null, { status: 304 }),
    }),
    /fallida/,
  );
  advance(16 * 60000);
  await captureSchedule(store, EEASA.id, {
    fetchImpl: async () =>
      new Response(file("eeasa-v1"), {
        headers: { "content-type": "text/html", etag: "one" },
      }),
  });
  const first = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(first.sector_label, "sector-a");
  review(first.id);
  advance(16 * 60000);
  const result = await captureSchedule(store, EEASA.id, {
    fetchImpl: async () =>
      new Response(file("eeasa-invalid"), {
        headers: { "content-type": "text/html" },
      }),
  });
  assert.equal(result.outcome, "failed");
  assert.equal(list().data[0].source_status, "failed");
  advance(16 * 60000);
  await captureSchedule(store, EEASA.id, {
    fetchImpl: async () => new Response(null, { status: 304 }),
  });
  assert.equal(list().data[0].source_status, "current");
});

test("review decisions are append-only and can revoke a publication with optimistic concurrency", async (t) => {
  const directory = temporary(t),
    { store, ingest, bind, review, list } = await setup(t, { directory });
  ingest();
  const row = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(row.sector_label, "sector-a");
  review(row.id);
  assert.throws(() => review(row.id), /Conflicto/);
  review(row.id, { decision: "rejected", expected_review: 1 });
  assert.deepEqual(list().data, []);
  const db = new DatabaseSync(path.join(directory, "aegis-v5.sqlite"));
  t.after(() => db.close());
  for (const sql of [
    "DELETE FROM schedule_reviews",
    "UPDATE schedule_revisions SET type='residential'",
    "DELETE FROM schedule_documents",
  ])
    assert.throws(() => db.exec(sql), /immutable/);
});

test("public schedules are flag gated, paginated and sanitized; writes and raw originals remain private", async (t) => {
  const { store, now, ingest, bind, review } = await setup(t);
  ingest();
  const first = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(first.sector_label, "sector-a");
  review(first.id);
  const common = {
    store: new HistoryStore(),
    now,
    mac: null,
    fetchUrl: async () => {
      throw new Error("offline");
    },
  };
  const off = await createApp({ ...common, flags: { PUBLIC_API_V1: true } });
  t.after(() => off.close());
  const app = await createApp({
    ...common,
    flags: {
      PUBLIC_API_V1: true,
      SQLITE_STORAGE: true,
      OFFICIAL_SCHEDULES: true,
    },
    openV5Store: async () => store,
  });
  t.after(() => app.close());
  const url =
      "/api/v1/schedules?area_id=sector-a&from=2026-10-22T00:00:00Z&to=2026-10-23T00:00:00Z",
    remoteAddress = "198.51.100.27";
  assert.equal((await off.inject({ url, remoteAddress })).statusCode, 403);
  const result = await app.inject({ url, remoteAddress });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().data.length, 1);
  assert.equal(result.json().meta.coverage, "unknown");
  assert.equal(result.json().data[0].source_url, EEASA.url);
  for (const secret of [
    "body",
    "stored_ref",
    "review_reason",
    "reference_url",
    "sector_label",
    "motive",
    "natural_key",
  ])
    assert.ok(!Object.hasOwn(result.json().data[0], secret));
  const industrial = store.schedules
    .queue()
    .find((r) => r.type === "industrial");
  bind(industrial.sector_label, "sector-a");
  review(industrial.id);
  const firstPage = (
    await app.inject({ url: url + "&limit=1", remoteAddress })
  ).json();
  assert.equal(firstPage.meta.next_offset, 1);
  const secondPage = (
    await app.inject({ url: url + "&limit=1&offset=1", remoteAddress })
  ).json();
  assert.notEqual(firstPage.data[0].id, secondPage.data[0].id);
  assert.equal(secondPage.meta.next_offset, null);
  assert.equal(
    (await app.inject({ url: url + "&type=residential", remoteAddress })).json()
      .data.length,
    0,
  );
  assert.equal(
    store.repositories.events.list().length,
    0,
    "schedules never infer incidents or restoration",
  );
  for (const bad of [
    url + "&unknown=x",
    url + "&limit=51",
    "/api/v1/schedules",
    url.replace("2026-10-23", "2026-12-23"),
    url.replace("2026-10-23", "2026-10-21"),
    url.replace("2026-10-22", "2026-02-30"),
  ])
    assert.equal(
      (await app.inject({ url: bad, remoteAddress })).statusCode,
      400,
      bad,
    );
  for (const method of ["POST", "DELETE", "PATCH", "HEAD", "OPTIONS"])
    assert.equal(
      (await app.inject({ method, url, remoteAddress })).statusCode,
      403,
    );
  for (const asset of ["/api/v1/schedules/document", "/api/v1/admin/schedules"])
    assert.equal(
      (await app.inject({ url: asset, remoteAddress })).statusCode,
      403,
    );
  assert.equal((await app.inject("/ui")).body, (await off.inject("/ui")).body);
  await assert.rejects(
    createApp({
      ...common,
      flags: { OFFICIAL_SCHEDULES: true, PUBLIC_API_V1: true },
    }),
    /requiere/,
  );
});

test("six-hour staleness downgrades current schedule without changing its original occurrence/publication dates", async (t) => {
  const { store, ingest, bind, review, list, advance } = await setup(t);
  ingest();
  const row = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(row.sector_label, "sector-a");
  review(row.id);
  const original = list().data[0];
  advance(7 * 3600000);
  const later = list().data[0];
  assert.equal(later.source_status, "stale");
  assert.equal(later.effective_status, "unverified");
  assert.equal(later.fetched_at, original.fetched_at);
  assert.equal(later.imported_at, original.imported_at);
  assert.equal(later.start_at, original.start_at);
});

test("v3→v4 backup/restore keeps originals/revisions/reviews and supports rollback into a new directory", async (t) => {
  const directory = temporary(t);
  const old = await openStore({
    directory,
    synthetic: true,
    migrations: MIGRATIONS.slice(0, 3),
  });
  old.writeBatch(fixture);
  old.close();
  const { store, ingest, bind, review, list } = await setup(t, { directory });
  const imported = ingest();
  const first = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(first.sector_label, "sector-a");
  review(first.id);
  const snapshot = await store.backup(),
    dest = path.join(temporary(t), "restored");
  await restoreSnapshot(snapshot, dest);
  const restored = await openStore({
    directory: dest,
    synthetic: true,
    now: () => new Date("2026-10-22T12:00:00Z"),
  });
  t.after(() => restored.close());
  assert.deepEqual(
    restored.schedules.document(imported.artifact_id),
    file("eeasa-v1"),
  );
  assert.deepEqual(
    restored.schedules.listPublic({
      area_id: "sector-a",
      from: "2026-10-22T00:00:00Z",
      to: "2026-10-25T00:00:00Z",
    }),
    list(),
  );
  const before = fs
    .readdirSync(path.join(directory, "backups"))
    .find((x) => x.startsWith("pre-migration"));
  const rollback = path.join(temporary(t), "v3");
  await restoreSnapshot(path.join(directory, "backups", before), rollback);
  const previous = await openStore({
    directory: rollback,
    synthetic: true,
    migrations: MIGRATIONS.slice(0, 3),
  });
  t.after(() => previous.close());
  assert.equal(previous.info().version, 3);
  assert.equal(
    previous.repositories.events.get("demo-event").status,
    "reported",
  );
});

test("local CLI requires explicit flag/current DB and cannot fetch real content into synthetic mode", async (t) => {
  const directory = temporary(t);
  const { store } = await setup(t, { directory });
  const run = (args, env = {}, input) =>
    execFileSync(process.execPath, ["scripts/schedules.js", ...args], {
      env: {
        ...process.env,
        DB_DIR: directory,
        SQLITE_DEMO: "true",
        OFFICIAL_SCHEDULES: "false",
        ...env,
      },
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  assert.throws(
    () => run(["import", EEASA.id], {}, file("eeasa-v1")),
    /OFFICIAL_SCHEDULES/,
  );
  const imported = JSON.parse(
    run(["import", EEASA.id], { OFFICIAL_SCHEDULES: "true" }, file("eeasa-v1")),
  );
  assert.equal(imported.entries, 2);
  assert.equal(JSON.parse(run(["queue"])).length, 2);
  assert.equal(
    run(["document", imported.artifact_id]),
    file("eeasa-v1").toString(),
  );
  assert.throws(
    () => run(["fetch", EEASA.id], { OFFICIAL_SCHEDULES: "true" }),
    /sintética/,
  );
  assert.equal(store.schedules.queue().length, 2);
});

test("binding corrections preserve versions and suppress the old area until the exact revision is re-reviewed", async (t) => {
  const { store, ingest, bind, review, list } = await setup(t);
  ingest();
  const row = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(row.sector_label, "sector-a");
  review(row.id);
  store.schedules.bind({
    provider_id: EEASA.id,
    sector_label: row.sector_label,
    area_id: "sector-b",
    reference_url: EEASA.url,
    expected_binding: 1,
    review_reason: "Corrected synthetic sector correspondence",
  });
  assert.deepEqual(list().data, []);
  assert.deepEqual(list("sector-b").data, []);
  review(row.id, { expected_review: 1 });
  assert.equal(list("sector-b").data.length, 1);
  assert.deepEqual(
    store.schedules.history(row.entry_id)[0].reviews.map((r) => r.area_id),
    ["sector-a", "sector-b"],
  );
});

test("local import does not claim a successful live network check and database FULL preserves earlier originals", async (t) => {
  const { store, ingest, bind, review, list } = await setup(t, {
    synthetic: false,
    maxBytes: 512 * 1024,
  });
  ingest();
  const row = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(row.sector_label, "sector-a");
  review(row.id);
  assert.equal(list().data[0].acquisition, "local_import");
  assert.equal(list().data[0].last_checked_at, null);
  assert.equal(list().data[0].source_status, "stale");
  const padded = Buffer.concat([
    file("eeasa-v1"),
    Buffer.alloc(240 * 1024 - file("eeasa-v1").length, 32),
  ]);
  assert.throws(
    () => store.schedules.ingest({ provider_id: EEASA.id, body: padded }),
    /full/,
  );
  assert.equal(store.repositories.artifacts.list().length, 1);
  assert.deepEqual(store.schedules.document(row.artifact_id), file("eeasa-v1"));
  assert.equal(store.schedules.history(row.entry_id).length, 1);
});

test("a new local document cannot borrow a recent HTTPS validation of a different hash", async (t) => {
  const { store, advance, bind, review, list, ingest } = await setup(t, {
    synthetic: false,
  });
  await captureSchedule(store, EEASA.id, {
    fetchImpl: async () =>
      new Response(file("eeasa-v1"), {
        headers: { "content-type": "text/html" },
      }),
  });
  const first = store.schedules.queue().find((r) => r.type === "maintenance");
  bind(first.sector_label, "sector-a");
  review(first.id);
  assert.equal(list().data[0].source_status, "current");
  advance(60000);
  ingest("eeasa-v2");
  const changed = store.schedules
    .queue()
    .find((r) => r.entry_id === first.entry_id);
  review(changed.id);
  assert.equal(list().data[0].source_status, "stale");
  assert.equal(list().data[0].effective_status, "unverified");
});

test("a running or crashed fetch retains the last completed validation and its original freshness", async t => {
  const {store,advance,bind,review,list}=await setup(t,{synthetic:false});
  await captureSchedule(store,EEASA.id,{fetchImpl:async()=>new Response(file("eeasa-v1"),{headers:{"content-type":"text/html"}})});
  const row=store.schedules.queue().find(r=>r.type==="maintenance");bind(row.sector_label,"sector-a");review(row.id);
  const original=list().data[0];advance(16*60000);store.schedules.claimFetch(EEASA.id);
  assert.equal(list().data[0].source_status,"current");assert.equal(list().data[0].last_checked_at,original.last_checked_at);
  advance(20*60000);assert.equal(list().data[0].source_status,"current");assert.equal(list().data[0].fetched_at,original.fetched_at);
  advance(6*3600000);assert.equal(list().data[0].source_status,"stale");assert.equal(list().data[0].last_checked_at,original.last_checked_at);
});
