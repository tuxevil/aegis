import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setupTimeline } from "../test-support/timeline-fixture.js";
import { timelineCsv } from "../storage/timeline.js";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
test("known-then replay changes after a correction and retains original ingestion/event axes", async (t) => {
  const { store, add, set, query } = await setupTimeline(t),
    one = add("original");
  set("2026-10-22T12:10:00Z");
  add("correction", "retraction", one.event.id, "original");
  const before = store.timeline.list(query("2026-10-22T12:05:00Z")),
    after = store.timeline.list(query("2026-10-22T12:10:00Z"));
  assert.equal(before.data[0].status, "reported");
  assert.equal(after.data[0].status, "unknown");
  assert.equal(before.data[0].start_at, "2026-10-22T10:00:00.000Z");
  assert.equal(before.data[0].recorded_at, "2026-10-22T12:00:00.000Z");
  assert.equal(before.data[0].evidence.length, 1);
  assert.equal(after.data[0].evidence.length, 2);
  assert.equal(before.data[0].duration_seconds, null);
  assert.equal(
    store.timeline.list(query("2026-10-22T11:00:00Z")).data.length,
    0,
  );
});
test("historical replay never resurrects revoked/private evidence, holds or personal review metadata", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-replay-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { store, add, set, query } = await setupTimeline(t, { directory });
  const a = add("one");
  set("2026-10-22T12:10:00Z");
  add("two");
  const db = new DatabaseSync(path.join(directory, "aegis-v5.sqlite"));
  t.after(() => db.close());
  db.exec("UPDATE sources SET enabled=0 WHERE id='source_one'");
  const row = store.timeline.list(query("2026-10-22T12:10:00Z")).data[0];
  assert.equal(row.status, "unknown");
  assert.equal(row.redacted, true);
  assert.equal(row.start_at, null);
  assert.equal(row.evidence.length, 1);
  db.exec("UPDATE sources SET enabled=1 WHERE id='source_one'");
  store.correlation.hold(a.event.id, "Private synthetic operator reason");
  const held = store.timeline.list(query("2026-10-22T12:00:00Z"));
  assert.equal(held.data[0].redacted, true);
  assert.ok(!JSON.stringify(held).includes("Private synthetic operator"));
});
test("bounded periods and explicit unknown dates prevent fabricated 2024 reconstructions", async (t) => {
  const { store, add, query } = await setupTimeline(t);
  add("one");
  assert.equal(
    store.timeline.list({
      ...query(),
      from: "2024-01-01T00:00:00Z",
      to: "2024-01-02T00:00:00Z",
    }).data.length,
    0,
  );
  for (const patch of [
    { known_at: "2099-01-01T00:00:00Z" },
    { from: "2026-02-30T00:00:00Z" },
    { limit: 500 },
    { offset: -1 },
    { area_id: "' OR 1=1" },
    { from: "2020-01-01T00:00:00Z" },
  ])
    assert.throws(() => store.timeline.list({ ...query(), ...patch }));
});
test("CSV preserves nullable durations and source links and blocks spreadsheet formula injection", () => {
  const csv = timelineCsv([
    {
      event_id: "event",
      area_name: '=HYPERLINK("bad")',
      type: "scheduled",
      status: "reported",
      start_at: null,
      end_at: null,
      recorded_at: "2026-10-22T00:00:00Z",
      revision: 1,
      duration_seconds: null,
      synthetic: true,
      evidence: [{ source_url: "https://example.invalid/source" }],
    },
  ]);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /https:\/\/example.invalid\/source/);
  assert.ok(!csv.includes("undefined"));
});
test("public timeline is GET-only, flag gated, closed and produces sanitized JSON/CSV", async (t) => {
  const context = await setupTimeline(t);
  context.add("original");
  const app = await createApp({
    store: new HistoryStore(),
    now: context.now,
    mac: null,
    flags: {
      PUBLIC_API_V1: true,
      BLACKOUT_MAP: true,
      SQLITE_STORAGE: true,
      TIME_MACHINE: true,
    },
    openV5Store: async () => context.store,
  });
  t.after(() => app.close());
  const url =
    "/api/v1/timeline?" +
    new URLSearchParams(context.query(context.now().toISOString()));
  const response = await app.inject({ url, remoteAddress: "198.51.100.31" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().data[0].revision, 1);
  assert.ok(!response.body.includes("origin_key"));
  assert.equal((await app.inject({ url: url + "&private=1" })).statusCode, 400);
  assert.equal(
    (await app.inject({ url, method: "POST", remoteAddress: "198.51.100.31" }))
      .statusCode,
    403,
  );
  const csv = await app.inject({ url: url + "&format=csv" });
  assert.equal(csv.statusCode, 200, csv.body);
  assert.match(csv.headers["content-type"], /text\/csv/);
  assert.match(csv.body, /source/);
  assert.equal((await app.inject({ url: "/history/" })).statusCode, 200);
  const off = await createApp({ store: new HistoryStore(), mac: null });
  t.after(() => off.close());
  assert.equal((await off.inject({ url: "/history/" })).statusCode, 404);
  assert.equal(
    (await off.inject({ url, remoteAddress: "198.51.100.31" })).statusCode,
    403,
  );
});

test("duration is reported only after sufficient independent restoration evidence", async (t) => {
  const { store, add, set, query } = await setupTimeline(t),
    one = add("outage");
  set("2026-10-22T12:10:00Z");
  add("restore-one", "restored", one.event.id);
  assert.equal(store.timeline.list(query()).data[0].duration_seconds, null);
  set("2026-10-22T12:20:00Z");
  add("restore-two", "restored", one.event.id);
  const row = store.timeline.list(query()).data[0];
  assert.equal(row.status, "ended");
  assert.equal(row.duration_seconds, 3600);
  assert.equal(row.end_at, "2026-10-22T11:00:00.000Z");
});

test("redacted time is matched as unknown before range filtering, preventing a hidden-interval oracle", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aegis-redacted-time-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { store, add, set, query } = await setupTimeline(t, { directory });
  add("hidden");
  set("2026-10-22T12:10:00Z");
  add("visible");
  const db = new DatabaseSync(path.join(directory, "aegis-v5.sqlite"));
  t.after(() => db.close());
  db.exec("UPDATE sources SET enabled=0 WHERE id='source_hidden'");
  const current = store.timeline.list(query()).data,
    earlier = store.timeline.list({
      ...query(),
      from: "2024-01-01T00:00:00Z",
      to: "2024-01-02T00:00:00Z",
    }).data;
  assert.equal(current.length, 1);
  assert.equal(earlier.length, 1);
  assert.equal(earlier[0].redacted, true);
  assert.equal(earlier[0].start_at, null);
  assert.equal(earlier[0].event_id, current[0].event_id);
});
test("CSV retains evidence relation/publication/ingestion even when a URL is withheld", () => {
  const value = timelineCsv(
    [
      {
        event_id: "event",
        area_name: "public",
        type: "unplanned",
        status: "unknown",
        start_at: null,
        end_at: null,
        recorded_at: "2026-10-22T12:00:00Z",
        revision: 2,
        duration_seconds: null,
        synthetic: true,
        evidence: [
          {
            source_url: null,
            source_name: "Reviewed source",
            relation: "retraction",
            source_published_at: "2026-10-21T12:00:00Z",
            ingested_at: "2026-10-22T12:00:00Z",
          },
        ],
      },
    ],
    { known_at: "2026-10-23T00:00:00Z" },
  );
  assert.match(value, /Reviewed source/);
  assert.match(value, /retraction/);
  assert.match(value, /2026-10-21T12:00:00Z/);
  assert.match(value, /2026-10-23T00:00:00Z/);
});

test("historical schedule comparison uses reviewed versions at the same knowledge cutoff, never actual outage duration", async (t) => {
  const { setupPush } = await import("../test-support/push-fixture.js"),
    ctx = await setupPush(t);
  ctx.schedule("v1");
  const first = ctx.store.timeline.listSchedules({
    area_id: "sector-0",
    from: "2026-10-22T00:00:00Z",
    to: "2026-10-23T00:00:00Z",
    known_at: ctx.now().toISOString(),
  });
  assert.equal(first.data.length, 1);
  assert.equal(first.data[0].duration_seconds, null);
  const before = ctx.now().toISOString();
  ctx.advance(300000);
  ctx.schedule("v2");
  const query = {
    area_id: "sector-0",
    from: "2026-10-22T00:00:00Z",
    to: "2026-10-23T00:00:00Z",
  };
  const old = ctx.store.timeline.listSchedules({ ...query, known_at: before }),
    current = ctx.store.timeline.listSchedules(query);
  assert.equal(old.data[0].start_at, first.data[0].start_at);
  assert.notEqual(old.data[0].start_at, current.data[0].start_at);
  assert.equal(current.meta.nature, "scheduled-not-observed");
  assert.equal(current.data[0].duration_seconds, null);
});

test("historical schedule GET is source-gated, sanitized and current revocation overrides old knowledge", async (t) => {
  const { setupPush } = await import("../test-support/push-fixture.js"),
    ctx = await setupPush(t),
    rows = ctx.schedule("v1"),
    known = ctx.now().toISOString(),
    params = new URLSearchParams({
      area_id: "sector-0",
      from: "2026-10-22T00:00:00Z",
      to: "2026-10-23T00:00:00Z",
      known_at: known,
    });
  const app = await createApp({
    store: new HistoryStore(),
    now: ctx.now,
    mac: null,
    flags: {
      PUBLIC_API_V1: true,
      BLACKOUT_MAP: true,
      SQLITE_STORAGE: true,
      OFFICIAL_SCHEDULES: true,
      TIME_MACHINE: true,
    },
    openV5Store: async () => ctx.store,
  });
  t.after(() => app.close());
  const url = "/api/v1/timeline/schedules?" + params,
    response = await app.inject({ url, remoteAddress: "198.51.100.31" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().data.length, 1);
  assert.equal(response.json().data[0].duration_seconds, null);
  assert.ok(!response.body.includes("review_reason"));
  assert.equal(
    (await app.inject({ url: url + "&format=csv" })).statusCode,
    400,
  );
  ctx.advance(60000);
  ctx.store.schedules.review({
    revision_id: rows.find((r) => r.type === "maintenance").id,
    expected_review: 1,
    decision: "rejected",
    rights_reviewed: false,
    review_reason: "Synthetic rights withdrawn",
  });
  assert.equal((await app.inject({ url })).json().data.length, 0);
});
