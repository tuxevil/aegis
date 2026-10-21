import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
import { openStore } from "../storage/sqlite-store.js";
import { MIGRATIONS } from "../storage/migrations.js";
import { verifySnapshot, restoreSnapshot } from "../storage/backups.js";
import { CONSENT_VERSION } from "../reports/policy.js";
import { createReportGuard } from "../reports/abuse.js";

const seed = JSON.parse(fs.readFileSync(new URL("../demo/blackout.json", import.meta.url)));
const liveFlags = { PUBLIC_API_V1: true, BLACKOUT_MAP: true, SQLITE_STORAGE: true, CITIZEN_REPORTS: true };
const origin = "https://aegis.test";
const baseHeaders = { origin, "x-aegis-request": "citizen-report", "content-type": "application/json" };
const secret = () => randomBytes(32).toString("base64url");
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-reports-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
async function setup(t, { directory = ":memory:", initialTime = Date.parse("2026-10-21T17:00:00Z") } = {}) {
  let clock = initialTime; const now = () => new Date(clock);
  const store = await openStore({ directory, synthetic: false, now });
  const rows = structuredClone(seed); for (const list of Object.values(rows)) for (const row of list) row.synthetic = false;
  store.writeBatch(rows);
  const app = await createApp({ store: new HistoryStore(), now, mac: null, flags: liveFlags,
    reportsOrigin: origin, openV5Store: async () => store });
  t.after(() => app.close());
  const request = (method, url, body, { token, ip = "192.0.2.10", headers = {} } = {}) => app.inject({ method, url, remoteAddress: ip,
    headers: { ...baseHeaders, ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { payload: body }) });
  async function body(ip = "192.0.2.10", patch = {}) {
    clock += 2000;
    const response = await request("POST", "/api/v1/report-challenges", {}, { ip });
    assert.equal(response.statusCode, 200, response.body);
    clock += 2000; const challenge = response.json(), digits = challenge.question?.match(/(\d+) \+ (\d+)/);
    return { area_id: "demo-a", area_confirmed: true, consent: true, consent_version: CONSENT_VERSION,
      declaration: "outage", reported_start_at: null, request_id: randomUUID(), receipt_token: secret(),
      challenge_id: challenge.challenge_id, answer: digits ? String(Number(digits[1]) + Number(digits[2])) : "", website: "", ...patch };
  }
  async function create(ip = "192.0.2.10", patch = {}) {
    const payload = await body(ip, patch), response = await request("POST", "/api/v1/reports", payload, { ip });
    assert.equal(response.statusCode, 201, response.body); return { payload, report: response.json() };
  }
  return { app, store, request, body, create, now, advance(ms) { clock += ms; } };
}
const correction = (payload, patch = {}) => ({ area_id: payload.area_id, area_confirmed: true, consent: true,
  consent_version: CONSENT_VERSION, declaration: payload.declaration, reported_start_at: payload.reported_start_at,
  expected_revision: 1, reason: "wrong_time", ...patch });

test("report flags OFF preserve v4 and deny write/owner routes; live activation requires configured HTTPS origin", async t => {
  const app = await createApp({ store: new HistoryStore(), flags: { PUBLIC_API_V1: true, BLACKOUT_MAP: true } });
  t.after(() => app.close());
  assert.equal((await app.inject("/report")).statusCode, 404);
  assert.equal((await app.inject("/assets/report.js")).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: "/api/v1/reports", remoteAddress: "192.0.2.1", payload: {}, headers: baseHeaders })).statusCode, 403);
  assert.equal((await app.inject("/ui")).statusCode, 200);
  await assert.rejects(createApp({ store: new HistoryStore(), flags: liveFlags }), /REPORTS_ORIGIN/);
  await assert.rejects(createApp({ store: new HistoryStore(), flags: { CITIZEN_REPORTS: true } }), /requiere/);
});

test("create is pending, stores timestamps separately and never echoes a receipt/IP or creates public incidents", async t => {
  const s = await setup(t), { payload, report } = await s.create("192.0.2.11", { reported_start_at: "2026-10-21T11:00:00-05:00" });
  assert.equal(report.status, "pending"); assert.equal(report.reported_start_at, "2026-10-21T16:00:00.000Z");
  assert.notEqual(report.received_at, report.reported_start_at);
  const publicBody = (await s.request("GET", "/api/v1/outages")).json();
  assert.equal(publicBody.data.length, 3); assert.equal(JSON.stringify(publicBody).includes(report.report_id), false);
  assert.equal(JSON.stringify(report).includes(payload.receipt_token), false);
  for (const key of ["receipt_hash", "receipt_token", "request_hash", "ip", "observation_id"]) assert.equal(Object.hasOwn(report, key), false);
  const summary = (await s.request("GET", "/api/v1/report-summary?area_id=demo-a")).json();
  assert.equal(summary.suppressed, true); assert.equal(summary.approved_reports, null); assert.equal(summary.coverage, "unknown");
});

test("consent, exact sector, closed fields, bounded dates, SQLi/XSS and body limits are validated server side", async t => {
  const s = await setup(t), payload = await s.body();
  for (const patch of [{ consent: false }, { consent: "true" }, { area_confirmed: false }, { consent_version: "old" },
    { area_id: "demo-pallatanga" }, { area_id: "Pallatanga" }, { area_id: "' OR 1=1 --" }, { declaration: "<script>alert(1)</script>" },
    { latitude: -2 }, { email: "private@example.invalid" }, { notes: "<img src=x onerror=alert(1)>" }, { status: "official" }, { moderation_state: "approved" },
    { reported_start_at: "2026-02-30T10:00:00Z" }, { reported_start_at: "2026-10-22T10:00:00Z" }, { reported_start_at: "2026-01-01T10:00:00Z" }]) {
    const response = await s.request("POST", "/api/v1/reports", { ...payload, ...patch });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.body.includes("private@example.invalid"), false);
  }
  const large = await s.request("POST", "/api/v1/reports", { ...payload, notes: "x".repeat(5000) });
  assert.equal(large.statusCode, 413); assert.equal(s.store.reports.queue().length, 0);
});

test("same request/token retries are idempotent; altered retries and equivalent submissions are not duplicated", async t => {
  const s = await setup(t), { payload, report } = await s.create();
  const retry = await s.request("POST", "/api/v1/reports", payload);
  assert.equal(retry.statusCode, 201); assert.equal(retry.json().report_id, report.report_id);
  for (const patch of [{ receipt_token: secret() }, { declaration: "restored" }]) {
    assert.equal((await s.request("POST", "/api/v1/reports", { ...payload, ...patch })).statusCode, 409);
  }
  const duplicate = await s.body(); assert.equal((await s.request("POST", "/api/v1/reports", duplicate)).statusCode, 409);
  assert.equal(s.store.reports.queue().length, 1);
  await s.create("192.0.2.12"); assert.equal(s.store.reports.queue().length, 2);
});

test("challenge expiry, replay, IP binding, honeypot and minimum wait fail closed", async t => {
  const s = await setup(t), body = await s.body();
  assert.equal((await s.request("POST", "/api/v1/reports", { ...body, website: "filled" })).statusCode, 403);
  assert.equal((await s.request("POST", "/api/v1/reports", body, { ip: "192.0.2.99" })).statusCode, 403);
  const fresh = (await s.request("POST", "/api/v1/report-challenges", {}, { ip: "192.0.2.20" })).json();
  assert.equal((await s.request("POST", "/api/v1/reports", { ...body, challenge_id: fresh.challenge_id }, { ip: "192.0.2.20" })).statusCode, 403);
  s.advance(601000);
  assert.equal((await s.request("POST", "/api/v1/reports", body)).statusCode, 403);
  const created = await s.create("192.0.2.30");
  const replay = { ...created.payload, request_id: randomUUID(), receipt_token: secret(), area_id: "demo-b" };
  assert.equal((await s.request("POST", "/api/v1/reports", replay, { ip: "192.0.2.30" })).statusCode, 403);
});

test("progressive checks and per-IP quota limit spam without storing raw IPs", async t => {
  const s = await setup(t), ip = "192.0.2.40";
  await s.create(ip, { area_id: "demo-a" }); await s.create(ip, { area_id: "demo-b" });
  const challenge = (await s.request("POST", "/api/v1/report-challenges", {}, { ip })).json();
  assert.match(challenge.question, /Comprobación adicional/); s.advance(2000);
  const candidate = { area_id: "demo-c", area_confirmed: true, consent: true, consent_version: CONSENT_VERSION,
    declaration: "outage", reported_start_at: null, request_id: randomUUID(), receipt_token: secret(), challenge_id: challenge.challenge_id, answer: "0", website: "" };
  assert.equal((await s.request("POST", "/api/v1/reports", candidate, { ip })).statusCode, 403);
  const numbers = challenge.question.match(/(\d+) \+ (\d+)/); candidate.answer = String(Number(numbers[1]) + Number(numbers[2]));
  assert.equal((await s.request("POST", "/api/v1/reports", candidate, { ip })).statusCode, 201);
  await s.create(ip, { declaration: "restored", area_id: "demo-a" }); await s.create(ip, { declaration: "restored", area_id: "demo-b" });
  const sixth = await s.body(ip, { declaration: "restored", area_id: "demo-c" });
  assert.equal((await s.request("POST", "/api/v1/reports", sixth, { ip })).statusCode, 429);
});

test("custom header/JSON/origin are CSRF gates; only a receipt authorizes owner access", async t => {
  const s = await setup(t), { payload, report } = await s.create();
  for (const headers of [{ origin: "https://evil.test" }, { "x-aegis-request": "" }, { "sec-fetch-site": "cross-site" }, { origin: "null" }]) {
    assert.equal((await s.request("POST", "/api/v1/report-challenges", {}, { headers })).statusCode, 403);
  }
  assert.equal((await s.request("POST", "/api/v1/report-challenges", "{}", { headers: { "content-type": "text/plain" } })).statusCode, 400);
  for (const token of [undefined, secret()]) assert.equal((await s.request("GET", `/api/v1/reports/${report.report_id}`, undefined, { token })).statusCode, 404);
  assert.equal((await s.request("GET", `/api/v1/reports/${report.report_id}`, undefined, { token: payload.receipt_token })).statusCode, 200);
  assert.equal((await s.request("GET", `/api/v1/reports/${report.report_id}?token=${payload.receipt_token}`)).statusCode, 400);
  for (const method of ["POST", "PATCH", "DELETE"]) assert.equal((await s.request(method, "/api/v1/admin", {})).statusCode, 403);
});

test("moderated summaries suppress small groups; correction preserves revisions and requires fresh review", async t => {
  const s = await setup(t), reports = [];
  for (let i = 0; i < 3; i++) {
    const created = await s.create(`192.0.2.${50 + i}`); reports.push(created);
    s.store.reports.moderate(created.report.report_id, 1, "approved");
  }
  assert.equal(s.store.reports.summary("demo-a").approved_reports, 3);
  const first = reports[0], body = correction(first.payload, { declaration: "restored", reason: "changed_state" });
  const response = await s.request("PATCH", `/api/v1/reports/${first.report.report_id}`, body, { token: first.payload.receipt_token });
  assert.equal(response.statusCode, 200); assert.equal(response.json().revision, 2); assert.equal(response.json().status, "pending");
  assert.equal(s.store.reports.summary("demo-a").approved_reports, null);
  assert.equal((await s.request("PATCH", `/api/v1/reports/${first.report.report_id}`, body, { token: first.payload.receipt_token })).json().revision, 2);
  assert.equal((await s.request("PATCH", `/api/v1/reports/${first.report.report_id}`, { ...body, declaration: "outage" }, { token: first.payload.receipt_token })).statusCode, 409);
  assert.throws(() => s.store.reports.moderate(first.report.report_id, 1, "approved"), /CONFLICT/);
  s.store.reports.moderate(first.report.report_id, 2, "approved");
  assert.equal(s.store.reports.summary("demo-a").restoration_reports, 1);
});

test("withdrawal is authorized, terminal, idempotent and immediately removed from aggregates", async t => {
  const s = await setup(t), { payload, report } = await s.create();
  s.store.reports.moderate(report.report_id, 1, "approved");
  assert.equal((await s.request("DELETE", `/api/v1/reports/${report.report_id}`, { expected_revision: 1 }, { token: secret() })).statusCode, 404);
  const removed = await s.request("DELETE", `/api/v1/reports/${report.report_id}`, { expected_revision: 1 }, { token: payload.receipt_token });
  assert.equal(removed.json().status, "withdrawn"); assert.equal(removed.json().revision, 2);
  const again = await s.request("DELETE", `/api/v1/reports/${report.report_id}`, { expected_revision: 1 }, { token: payload.receipt_token });
  assert.equal(again.json().revision, 2);
  assert.equal((await s.request("PATCH", `/api/v1/reports/${report.report_id}`, correction(payload, { expected_revision: 2 }), { token: payload.receipt_token })).statusCode, 409);
  assert.equal(s.store.reports.summary("demo-a").approved_reports, null);
});

test("restart keeps idempotency/owner access; SQLite/snapshots never store raw receipt, request ID or IP", async t => {
  const directory = temporary(t), s = await setup(t, { directory }), { payload, report } = await s.create("192.0.2.71");
  const backup = await s.store.backup(); await s.app.close();
  const reopened = await openStore({ directory, synthetic: false, now: s.now });
  try {
    assert.equal(reopened.reports.owner(report.report_id, payload.receipt_token).status, "pending");
    assert.equal(reopened.reports.replay(payload, reopened.reports.validate(payload)).report_id, report.report_id);
  } finally { reopened.close(); }
  for (const file of [path.join(directory, "aegis-v5.sqlite"), backup]) {
    const data = fs.readFileSync(file);
    for (const value of [payload.receipt_token, payload.request_id, "192.0.2.71"]) assert.equal(data.includes(Buffer.from(value)), false);
  }
});

test("logical retention hides expired receipts; pruning cascades revisions and reviews", async t => {
  const s = await setup(t), { payload, report } = await s.create();
  s.store.reports.moderate(report.report_id, 1, "approved");
  s.store.reports.withdraw(report.report_id, payload.receipt_token, 1);
  s.advance(8 * 86400000);
  assert.throws(() => s.store.reports.owner(report.report_id, payload.receipt_token), /NOT_FOUND/);
  assert.equal(s.store.reports.prune(), 1); assert.equal(s.store.reports.prune(), 0);
});

test("migration v1→v2 preserves history, makes snapshot and supports snapshot rollback with old schema", async t => {
  const directory = temporary(t), old = await openStore({ directory, synthetic: true, migrations: MIGRATIONS.slice(0, 1) });
  old.writeBatch(seed); old.close();
  const upgraded = await openStore({ directory, synthetic: true });
  assert.equal(upgraded.info().version, MIGRATIONS.length); assert.equal(upgraded.repositories.events.list().length, 3); upgraded.close();
  const snapshot = path.join(directory, "backups", fs.readdirSync(path.join(directory, "backups"))[0]);
  assert.equal(verifySnapshot(snapshot), 1);
  const rollback = path.join(directory, "rollback"); await restoreSnapshot(snapshot, rollback);
  const restored = await openStore({ directory: rollback, synthetic: true, migrations: MIGRATIONS.slice(0, 1) });
  assert.equal(restored.info().version, 1); assert.equal(restored.repositories.events.list().length, 3); restored.close();
});

test("operator CLI queue/review returns no receipt hashes and has no public admin endpoint", async t => {
  // The CLI intentionally uses wall time; create its fixture relative to that clock.
  const directory = temporary(t), s = await setup(t, { directory, initialTime: Date.now() }), { report, payload } = await s.create();
  await s.app.close();
  const run = (...args) => execFileSync(process.execPath, ["scripts/reports.js", ...args], { encoding: "utf8", env: { ...process.env, DB_DIR: directory, SQLITE_DEMO: "false" } });
  const queue = JSON.parse(run("queue")); assert.equal(queue.length, 1);
  for (const field of ["receipt_hash", "request_hash", payload.receipt_token]) assert.equal(JSON.stringify(queue).includes(field), false);
  assert.equal(JSON.parse(run("approve", report.report_id, "1")).status, "approved");
  assert.equal(JSON.parse(run("queue")).length, 0);
});

test("ephemeral guard caps subjects and removes IP fingerprints/challenges after expiry", () => {
  let at = 0; const guard = createReportGuard({ now: () => new Date(at), capacity: 2 });
  guard.issue("192.0.2.1"); guard.issue("192.0.2.2");
  assert.throws(() => guard.issue("192.0.2.3"), /RATE_LIMITED/);
  at = 3601000; guard.prune(); assert.deepEqual(guard.counts(), { subjects: 0, challenges: 0 });
  guard.issue("192.0.2.3"); guard.close(); assert.deepEqual(guard.counts(), { subjects: 0, challenges: 0 });
});
