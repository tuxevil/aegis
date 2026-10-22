import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
import { openStore } from "../storage/sqlite-store.js";

const fixture = JSON.parse(fs.readFileSync(new URL("../demo/blackout.json", import.meta.url)));
const flags = { PUBLIC_API_V1: true, BLACKOUT_MAP: true, BLACKOUT_DEMO: true };
const now = () => new Date("2026-10-21T16:00:00Z");
const options = { store: new HistoryStore(), now, mac: null, fetchUrl: async () => { throw new Error("offline"); } };
const remote = { remoteAddress: "192.0.2.3" };
async function appFor(t, overrides = {}) {
  const app = await createApp({ ...options, flags, ...overrides }); t.after(() => app.close()); return app;
}

test("map flag OFF leaves v4 bytes, assets and v1 private policy unchanged", async t => {
  const off = await appFor(t, { flags: { PUBLIC_API_V1: true } });
  const on = await appFor(t);
  for (const url of ["/", "/ui", "/assets/app.js", "/assets/style.css", "/api/status"]) {
    const a = await off.inject(url), b = await on.inject(url);
    assert.equal(a.statusCode, 200); assert.equal(a.body, b.body, url);
  }
  for (const url of ["/map", "/assets/blackout.js", "/assets/map/ecuador.geojson"]) assert.equal((await off.inject(url)).statusCode, 404);
  assert.equal((await off.inject({ ...remote, url: "/api/v1/areas" })).statusCode, 403);
  assert.equal((await on.inject("/map")).statusCode, 200);
  assert.match((await on.inject("/map")).headers["content-security-policy"], /script-src 'self'/);
});

test("demo API is public without forged headers and preserves all three scenarios and corrections", async t => {
  const app = await appFor(t);
  const response = await app.inject({ ...remote, url: "/api/v1/outages" });
  assert.equal(response.statusCode, 200);
  const { data, meta } = response.json();
  assert.equal(meta.mode, "demo"); assert.equal(meta.synthetic, true); assert.equal(meta.coverage, "unknown");
  assert.equal(data.length, 3); assert.ok(data.every(event => event.synthetic));
  assert.equal(data.find(e => e.type === "scheduled").start_at, "2026-10-22T13:00:00.000Z");
  assert.equal(data.find(e => e.status === "reported").end_at, null);
  const correction = data.find(e => e.id === "demo-event-corrected");
  assert.equal(correction.status, "unknown"); assert.equal(correction.evidence_ids.length, 2);
  const evidence = (await app.inject({ ...remote, url: `/api/v1/events/${correction.id}/evidence` })).json().data;
  assert.deepEqual(evidence.map(item => item.relation), ["support", "retraction"]);
  assert.equal(evidence[0].ingested_at, "2026-10-21T15:00:00.000Z");
  assert.equal(evidence[1].ingested_at, "2026-10-21T15:30:00.000Z");
});

test("area search supports ancestors, types, paging and literal wildcard input", async t => {
  const app = await appFor(t);
  const search = async query => (await app.inject(`/api/v1/areas?${query}`)).json();
  assert.equal((await search("q=Pallatanga")).data.length, 4);
  assert.equal((await search("q=Chimborazo")).data.length, 5);
  assert.equal((await search("q=%25")).data.length, 0);
  assert.equal((await search("type=sector&parent_id=demo-pallatanga")).data.length, 3);
  const page = await search("q=Pallatanga&limit=2");
  assert.equal(page.data.length, 2); assert.equal(page.meta.next_offset, 2);
  const next = await search("q=Pallatanga&limit=2&offset=2");
  assert.equal(next.meta.next_offset, null);
  assert.equal(new Set([...page.data, ...next.data].map(area => area.id)).size, 4);
  assert.ok(page.data.every(area => area.map_ref === "pallatanga-canton"));
});

test("event filters preserve [from,to) dates, coarse bbox, layers and deterministic pagination", async t => {
  const app = await appFor(t);
  const get = async query => (await app.inject(`/api/v1/outages?${query}`)).json();
  assert.equal((await get("area_id=demo-pallatanga")).data.length, 3);
  assert.equal((await get("area_id=demo-b")).data.length, 1);
  assert.equal((await get("layer=official")).data.length, 1);
  assert.equal((await get("layer=citizen")).data.length, 2);
  assert.equal((await get("layer=osint")).data.length, 0);
  assert.equal((await get("bbox=-79,-3,-78,-1")).data.length, 3);
  assert.equal((await get("bbox=-90,-3,-89,-1")).data.length, 0);
  assert.equal((await get("from=2026-10-21T10:30:00-05:00&to=2026-10-21T16:00:00Z")).data.length, 1);
  assert.equal((await get("to=2026-10-21T15:00:00Z")).data.length, 0);
  const page = await get("limit=1"), next = await get(`limit=1&offset=${page.meta.next_offset}`);
  assert.notEqual(page.data[0].id, next.data[0].id);
});

test("bad queries, arbitrary fields, excessive date spans and malformed IDs fail safely", async t => {
  const app = await appFor(t);
  for (const url of ["/api/v1/areas?limit=0", "/api/v1/areas?limit=51", "/api/v1/areas?offset=10001",
    "/api/v1/areas?unknown=private", "/api/v1/areas?q=a&q=b", "/api/v1/areas?type=house",
    "/api/v1/outages?layer=internal", "/api/v1/outages?from=2026-02-30T00:00:00Z",
    "/api/v1/outages?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z",
    "/api/v1/outages?bbox=-180,-90,180,90", "/api/v1/outages?bbox=-79,-1,-78,-3",
    "/api/v1/events/bad%20id", "/api/v1/events/demo-event-reported?secret=token"]) {
    const response = await app.inject({ ...remote, url });
    assert.equal(response.statusCode, 400, `${url}: ${response.body}`);
    assert.deepEqual(response.json(), { error: { code: "INVALID_REQUEST", message: "Solicitud inválida" } });
  }
  assert.equal((await app.inject("/api/v1/events/missing")).statusCode, 404);
  assert.deepEqual((await app.inject("/api/v1/events/missing/evidence")).json().data, []);
});

test("all writes, unknown API paths and old private routes remain remote-denied", async t => {
  const app = await appFor(t);
  const headers = { host: "example.com", origin: "https://example.com", referer: "https://example.com/", "x-forwarded-for": "127.0.0.1" };
  for (const url of ["/api/v1/reports", "/api/v1/subscriptions", "/api/v1/admin", "/api/weather"]) {
    assert.equal((await app.inject({ ...remote, url, headers })).statusCode, 403);
  }
  for (const method of ["POST", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal((await app.inject({ ...remote, url: "/api/v1/areas", method, headers })).statusCode, 403);
  }
});

test("empty live mode is unknown and never loads demo or opens storage implicitly", async t => {
  let opens = 0;
  const app = await appFor(t, { flags: { PUBLIC_API_V1: true, BLACKOUT_MAP: true },
    openV5Store: async () => { opens++; throw new Error("must not run"); } });
  const body = (await app.inject("/api/v1/outages")).json();
  assert.equal(opens, 0); assert.deepEqual(body.data, []);
  assert.equal(body.meta.mode, "live"); assert.equal(body.meta.coverage, "unknown");
  await assert.rejects(createApp({ ...options, flags: { BLACKOUT_MAP: true } }), /requiere/);
  await assert.rejects(createApp({ ...options, flags: { ...flags, SQLITE_STORAGE: true } }), /aislada/);
});

test("live publication excludes pending/private evidence, unreviewed links and unsupported official claims", async t => {
  const store = await openStore({ directory: ":memory:", synthetic: false });
  const batch = structuredClone(fixture);
  for (const rows of Object.values(batch)) for (const row of rows) row.synthetic = false;
  batch.observations[1].moderation_state = "pending";
  batch.evidence[2].human_reviewed = false;
  batch.evidence[3].human_reviewed = false;
  batch.artifacts[0].source_url = "https://example.com/public?receipt=private-token";
  store.writeBatch(batch);
  // Official-looking event backed only by a citizen must stay hidden.
  store.writeBatch({ observations: [{ ...batch.observations[1], id: "reviewed-citizen", dedupe_key: "reviewed-citizen", moderation_state: "approved" }],
    events: [{ ...batch.events[0], id: "unsupported-official" }],
    evidence: [{ ...batch.evidence[0], id: "unsupported-link", event_id: "unsupported-official", observation_id: "reviewed-citizen" }] });
  const app = await appFor(t, { flags: { PUBLIC_API_V1: true, BLACKOUT_MAP: true, SQLITE_STORAGE: true }, openV5Store: async () => store });
  const response = await app.inject("/api/v1/outages");
  assert.equal(response.json().data.length, 1);
  for (const id of ["demo-event-reported", "demo-event-corrected", "unsupported-official"]) {
    assert.equal((await app.inject(`/api/v1/events/${id}`)).statusCode, 404);
    assert.deepEqual((await app.inject(`/api/v1/events/${id}/evidence`)).json().data, []);
  }
  const evidence = (await app.inject("/api/v1/events/demo-event-scheduled/evidence")).json().data;
  assert.equal(evidence[0].source_url, null);
  const serialized = JSON.stringify(evidence);
  for (const field of ["private-token", "dedupe_key", "access_policy", "stored_ref", "moderation_state", "human_reviewed", "sha256"]) assert.equal(serialized.includes(field), false, field);
});

test("private sources and disabled issuers cannot publish history through list or direct evidence", async t => {
  const store = await openStore({ directory: ":memory:", synthetic: false });
  const batch = structuredClone(fixture);
  for (const rows of Object.values(batch)) for (const row of rows) row.synthetic = false;
  batch.sources[0].enabled = false;
  batch.sources[1].access_policy = "private";
  store.writeBatch(batch);
  const app = await appFor(t, { flags: { PUBLIC_API_V1: true, BLACKOUT_MAP: true, SQLITE_STORAGE: true }, openV5Store: async () => store });
  assert.deepEqual((await app.inject("/api/v1/outages")).json().data, []);
  assert.deepEqual((await app.inject("/api/v1/events/demo-event-corrected/evidence")).json().data, []);
  assert.equal(store.repositories.events.list().length, 3, "publication filtering never deletes stored history");
});

test("public evidence pages preserve correction order and public routes remain rate limited", async t => {
  const app = await appFor(t);
  const first = (await app.inject("/api/v1/events/demo-event-corrected/evidence?limit=1")).json();
  const next = (await app.inject(`/api/v1/events/demo-event-corrected/evidence?limit=1&offset=${first.meta.next_offset}`)).json();
  assert.equal(first.data[0].relation, "support"); assert.equal(next.data[0].relation, "retraction");
  assert.equal(next.meta.next_offset, null);
  for (let i = 0; i < 60; i++) assert.equal((await app.inject({ ...remote, url: "/api/v1/areas" })).statusCode, 200);
  const throttled = await app.inject({ ...remote, url: "/api/v1/areas" });
  assert.equal(throttled.statusCode, 429); assert.equal(throttled.json().error.code, "RATE_LIMITED");
});
