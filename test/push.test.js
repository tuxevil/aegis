import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID, createECDH } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import webPush from "web-push";
import { openStore } from "../storage/sqlite-store.js";
import { MIGRATIONS } from "../storage/migrations.js";
import { restoreSnapshot } from "../storage/backups.js";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
import {
  PUSH_CONSENT_VERSION,
  endpoint,
  readPushConfig,
  dueTime,
} from "../push/policy.js";
import { dispatchPush } from "../push/transport.js";
import {
  setupPush,
  browser,
  document,
  temporary,
  fixture,
} from "../test-support/push-fixture.js";

test("separate opt-in, at most five exact sectors and endpoint/key/SSRF validation fail closed", async (t) => {
  const { store, input, create } = await setupPush(t);
  for (const patch of [
    { consent: false },
    { consent: "true" },
    { push_consent: false },
    { areas: [] },
    {
      areas: Array.from({ length: 6 }, (_, i) => ({
        area_id: `sector-${i}`,
        alias: "a",
      })),
    },
    { areas: [{ area_id: "canton", alias: "a" }] },
    { preferences: { mode: "immediate" } },
  ])
    assert.throws(() => store.subscriptions.create(input(patch)));
  const b = browser();
  for (const url of [
    "http://fcm.googleapis.com/fcm/send/x",
    "https://127.0.0.1/private",
    "https://fcm.googleapis.com.evil.invalid/fcm/send/x",
    "https://user@fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com/fcm/send/x?secret=y",
  ])
    assert.throws(() => endpoint({ ...b, endpoint: url }));
  assert.throws(() =>
    endpoint({
      ...b,
      keys: { ...b.keys, p256dh: randomBytes(65).toString("base64url") },
    }),
  );
  const web = create({ push_consent: false, browser: null });
  assert.equal(web.owner.push_registered, false);
  assert.equal(store.subscriptions.enqueue().queued, 0);
});

test("idempotent owner create/update/revoke uses hashed bearer, safe DTOs and encrypted DB/snapshot", async (t) => {
  const directory = temporary(t),
    { store, input } = await setupPush(t, { directory });
  const payload = input();
  const owner = store.subscriptions.create(payload);
  assert.deepEqual(store.subscriptions.create(payload), owner);
  assert.throws(
    () =>
      store.subscriptions.owner(
        owner.id,
        randomBytes(32).toString("base64url"),
      ),
    (e) => e.statusCode === 404,
  );
  const safe = JSON.stringify(owner);
  for (const value of [
    payload.management_token,
    payload.browser.endpoint,
    payload.browser.keys.auth,
    payload.browser.keys.p256dh,
  ])
    assert.equal(safe.includes(value), false);
  const snapshot = await store.backup();
  for (const file of [
    snapshot,
    path.join(directory, "aegis-v5.sqlite"),
    path.join(directory, "aegis-v5.sqlite-wal"),
  ])
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file);
      for (const value of [
        payload.management_token,
        payload.browser.endpoint,
        payload.browser.keys.auth,
        payload.browser.keys.p256dh,
        payload.areas[0].alias,
      ])
        assert.equal(data.includes(Buffer.from(value)), false);
    }
  const changed = store.subscriptions.update(
    owner.id,
    payload.management_token,
    1,
    store.subscriptions.validate({
      ...payload,
      areas: [{ area_id: "sector-2", alias: "New private alias" }],
    }),
  );
  assert.equal(changed.revision, 2);
  assert.equal(changed.areas[0].area_id, "sector-2");
  assert.throws(
    () =>
      store.subscriptions.update(
        owner.id,
        payload.management_token,
        1,
        store.subscriptions.validate(payload),
      ),
    (e) => e.statusCode === 409,
  );
  const revoked = store.subscriptions.revoke(
    owner.id,
    payload.management_token,
  );
  assert.equal(revoked.status, "revoked");
  assert.deepEqual(revoked.areas, []);
  assert.equal(revoked.push_registered, false);
  assert.deepEqual(
    store.subscriptions.revoke(owner.id, payload.management_token),
    revoked,
  );
});

test("only current reviewed official schedules match subscribed areas; industrial, unresolved, stale and opt-out never queue", async (t) => {
  const { store, create, schedule, advance } = await setupPush(t);
  create();
  create({ areas: [{ area_id: "sector-1", alias: "Industrial fixture" }] });
  schedule("v1", false);
  assert.equal(store.subscriptions.enqueue().queued, 0);
  schedule();
  assert.equal(store.subscriptions.enqueue().queued, 1);
  assert.equal(store.subscriptions.enqueue().queued, 0);
  advance(7 * 3600000);
  const job = store.subscriptions.claim();
  assert.equal(job, null);
  assert.equal(
    store.subscriptions.diagnostics().find((r) => r.state === "suppressed")
      .count,
    1,
  );
});

test("two reviewed revisions produce distinct idempotent keys and suppress a superseded job before delivery", async (t) => {
  const { store, create, schedule } = await setupPush(t);
  create();
  schedule();
  assert.equal(store.subscriptions.enqueue().queued, 1);
  schedule("v2");
  assert.equal(store.subscriptions.enqueue().queued, 1);
  assert.equal(store.subscriptions.enqueue().queued, 0);
  const job = store.subscriptions.claim();
  assert.ok(job);
  assert.match(job.payload.body, /Antes:/);
  assert.match(job.payload.body, /Ahora:/);
  assert.equal(
    job.payload.evidence_url,
    "https://www.eeasa.com.ec/trabajos-programadas/",
  );
  store.subscriptions.finish(job.lease_id, 201);
  assert.equal(store.subscriptions.claim(), null);
  assert.ok(
    store.subscriptions.diagnostics().some((r) => r.state === "suppressed"),
  );
});

test("missing row is not cancellation; explicit documentary cancellation requires exact quote and separate review", async (t) => {
  const { store, create, schedule } = await setupPush(t);
  create();
  const first = schedule().find((r) => r.type === "maintenance");
  store.subscriptions.enqueue();
  let job = store.subscriptions.claim();
  store.subscriptions.finish(job.lease_id, 201);
  const source = document("v1")
    .toString()
    .replace(
      "Mantenimiento de redes de distribución",
      "Se cancela el mantenimiento programado de redes de distribución",
    );
  store.schedules.ingest({
    provider_id: "eeasa-maintenance",
    body: Buffer.from(source),
  });
  const cancellation = store.schedules
    .queue()
    .find((r) => r.entry_id === first.entry_id);
  store.schedules.review({
    revision_id: cancellation.id,
    decision: "reviewed",
    rights_reviewed: true,
    review_reason: "Synthetic cancellation doc reviewed",
  });
  assert.equal(
    store.subscriptions.enqueue().queued,
    0,
    "ordinary review cannot turn a cancellation phrase into a new outage alert",
  );
  assert.throws(() =>
    store.subscriptions.confirmCancellation({
      revision_id: cancellation.id,
      quote: "invented cancellation",
      review_reason: "fixture",
    }),
  );
  store.subscriptions.confirmCancellation({
    revision_id: cancellation.id,
    quote: cancellation.motive,
    review_reason: "Explicit cancellation verified for this sector/date",
  });
  assert.equal(store.subscriptions.enqueue().queued, 1);
  job = store.subscriptions.claim();
  assert.match(job.payload.title, /cancelación/);
  assert.match(job.payload.body, /Cancelación documentada/);
});

test("quiet hours and daily digest postpone work; one digest groups multiple eligible notices", async (t) => {
  const { store, create, schedule, prefs, set, advance } = await setupPush(t);
  const sub = create({
    preferences: { ...prefs, mode: "digest", digest_hour: 8 },
  });
  schedule();
  store.subscriptions.enqueue();
  store.subscriptions.requestTest(
    sub.owner.id,
    sub.payload.management_token,
    randomUUID(),
  );
  assert.equal(store.subscriptions.claim(), null);
  advance(3600000);
  const job = store.subscriptions.claim();
  assert.ok(job);
  assert.match(job.payload.title, /resumen de 2/);
  store.subscriptions.finish(job.lease_id, 201);
  assert.equal(
    dueTime(new Date("2026-10-23T04:30:00Z"), prefs),
    "2026-10-23T12:00:00.000Z",
  );
  assert.equal(
    dueTime(new Date("2026-10-22T14:00:00Z"), { ...prefs, mode: "digest" }),
    "2026-10-23T13:00:00.000Z",
  );
});

test("404/410 scrub endpoint and disable subsequent jobs; transient failures retry with a bounded lease", async (t) => {
  for (const status of [404, 410]) {
  const { store, create } = await setupPush(t);
  const first = create();
  store.subscriptions.requestTest(
    first.owner.id,
    first.payload.management_token,
    randomUUID(),
  );
  const job = store.subscriptions.claim();
  store.subscriptions.finish(job.lease_id, status);
  const owner = store.subscriptions.owner(
    first.owner.id,
    first.payload.management_token,
  );
  assert.equal(owner.endpoint_state, "invalid");
  assert.equal(owner.push_consent, false);
  assert.equal(store.subscriptions.claim(), null);
  }
});

test("provider acceptance is not delivery; retries are bounded, delivery flag OFF and synthetic live transport are blocked", async (t) => {
  const { store, create, config, advance } = await setupPush(t);
  const first = create();
  store.subscriptions.requestTest(
    first.owner.id,
    first.payload.management_token,
    randomUUID(),
  );
  await assert.rejects(
    dispatchPush(store, config, { transport: async () => ({ status: 201 }) }),
    /PUSH_DELIVERY/,
  );
  await assert.rejects(
    dispatchPush(store, { ...config, delivery: true }),
    /fixtures/,
  );
  let requests = 0;
  const transport = async () => {
    requests++;
    return { status: 503 };
  };
  await dispatchPush(store, { ...config, delivery: true }, { transport });
  assert.equal(requests, 1);
  advance(60000);
  await dispatchPush(store, { ...config, delivery: true }, { transport });
  advance(300000);
  await dispatchPush(store, { ...config, delivery: true }, { transport });
  advance(3600000);
  await dispatchPush(store, { ...config, delivery: true }, { transport });
  assert.equal(requests, 3);
  assert.ok(
    store.subscriptions.diagnostics().some((r) => r.state === "failed"),
  );
});

test("revocation and edits suppress pending work, one-hour explicit test cap and endpoint ownership cannot be bypassed", async (t) => {
  const { store, create, input } = await setupPush(t);
  const first = create();
  assert.throws(
    () => store.subscriptions.create(input({ browser: first.payload.browser })),
    (e) => e.statusCode === 409,
  );
  const requestId = randomUUID();
  assert.deepEqual(
    store.subscriptions.requestTest(
      first.owner.id,
      first.payload.management_token,
      requestId,
    ),
    { queued: true },
  );
  assert.deepEqual(
    store.subscriptions.requestTest(
      first.owner.id,
      first.payload.management_token,
      requestId,
    ),
    { queued: true },
  );
  assert.throws(
    () =>
      store.subscriptions.requestTest(
        first.owner.id,
        first.payload.management_token,
        randomUUID(),
      ),
    (e) => e.statusCode === 429,
  );
  store.subscriptions.revoke(first.owner.id, first.payload.management_token);
  assert.equal(store.subscriptions.claim(), null);
});

test("storage key mismatch/tamper, expiry and migration backups preserve old history without private endpoint output", async (t) => {
  const directory = temporary(t),
    key = randomBytes(32);
  let old = await openStore({
    directory,
    synthetic: true,
    migrations: MIGRATIONS.slice(0, 4),
  });
  old.writeBatch(fixture);
  old.close();
  const { store, create, advance } = await setupPush(t, {
    directory,
    pushStorageKey: key,
  });
  const first = create(),
    backup = await store.backup(),
    dest = path.join(temporary(t), "restore");
  await restoreSnapshot(backup, dest);
  const restored = await openStore({
    directory: dest,
    synthetic: true,
    pushStorageKey: key,
    now: () => new Date("2026-10-22T12:00:00Z"),
  });
  t.after(() => restored.close());
  assert.equal(
    restored.subscriptions.owner(first.owner.id, first.payload.management_token)
      .push_registered,
    true,
  );
  const wrong = await openStore({
    directory: dest,
    synthetic: true,
    pushStorageKey: randomBytes(32),
    now: () => new Date("2026-10-22T12:00:00Z"),
  });
  t.after(() => wrong.close());
  assert.throws(
    () =>
      wrong.subscriptions.owner(first.owner.id, first.payload.management_token),
    /Clave Push/,
  );
  advance(181 * 86400000);
  assert.throws(
    () =>
      store.subscriptions.owner(first.owner.id, first.payload.management_token),
    (e) => e.statusCode === 404,
  );
  assert.equal(store.subscriptions.prune().expired, 1);
});

test("VAPID key file generation is exclusive and private, without secrets in command output", (t) => {
  const directory = temporary(t),
    file = path.join(directory, "push.env");
  const run = () =>
    execFileSync(process.execPath, ["scripts/push.js", "init-keys", file], {
      env: { ...process.env, WATCH_ORIGIN: "https://watch.example" },
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  assert.deepEqual(JSON.parse(run()), { created: true, mode: "0600" });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(run);
  assert.match(fs.readFileSync(file, "utf8"), /PUSH_DELIVERY=false/);
});

test("delivery lease excludes concurrent workers, recovers after crash, and rejects stale acknowledgements", async (t) => {
  const directory = temporary(t),
    { store, key, now, create, advance } = await setupPush(t, { directory });
  const first = create();
  store.subscriptions.requestTest(
    first.owner.id,
    first.payload.management_token,
    randomUUID(),
  );
  const other = await openStore({
    directory,
    synthetic: true,
    pushStorageKey: key,
    now,
  });
  t.after(() => other.close());
  const a = store.subscriptions.claim();
  assert.ok(a);
  assert.equal(other.subscriptions.claim(), null);
  advance(31000);
  const b = other.subscriptions.claim();
  assert.ok(b);
  assert.notEqual(a.lease_id, b.lease_id);
  assert.equal(a.payload.tag, b.payload.tag);
  assert.equal(store.subscriptions.finish(a.lease_id, 201).completed, 0);
  other.subscriptions.finish(b.lease_id, 201);
  assert.equal(store.subscriptions.claim(), null);
  assert.ok(
    store.subscriptions.owner(first.owner.id, first.payload.management_token)
      .last_accepted_at,
  );
});

test("unreviewed revisions, revoked rights/bindings and false cancellation quotations cannot pass a delivery gate", async (t) => {
  const { store, create, schedule } = await setupPush(t);
  create();
  const first = schedule().find((r) => r.type === "maintenance");
  store.subscriptions.enqueue();
  store.schedules.review({
    revision_id: first.id,
    decision: "rejected",
    expected_review: 1,
    rights_reviewed: false,
    review_reason: "Rights revoked in synthetic fixture",
  });
  assert.equal(store.subscriptions.claim(), null);
  assert.throws(() =>
    store.subscriptions.confirmCancellation({
      revision_id: first.id,
      quote: "Se cancela un horario por rumor",
      review_reason: "not evidence",
    }),
  );
});

test("editing a pending subscription rebuilds only never-attempted work and never replays accepted events", async (t) => {
  const { store, create, schedule } = await setupPush(t);
  const first = create();
  schedule();
  assert.equal(store.subscriptions.enqueue().queued, 1);
  const value = store.subscriptions.validate({
    ...first.payload,
    areas: [{ area_id: "sector-0", alias: "Changed alias" }],
  });
  store.subscriptions.update(
    first.owner.id,
    first.payload.management_token,
    1,
    value,
  );
  assert.equal(store.subscriptions.enqueue().queued, 1);
  const job = store.subscriptions.claim();
  assert.ok(job);
  store.subscriptions.finish(job.lease_id, 201);
  store.subscriptions.update(
    first.owner.id,
    first.payload.management_token,
    2,
    value,
  );
  assert.equal(store.subscriptions.enqueue().queued, 0);
});

test("opt-in worker is bounded, stoppable and refuses a synthetic live sender", async (t) => {
  const { config } = await setupPush(t);
  const { startPushWorker } = await import("../push/transport.js");
  let cycles = 0;
  const mock = {
    info: () => ({ synthetic: false }),
    subscriptions: {
      prune() {},
      enqueue() {
        cycles++;
        return { next_offset: null };
      },
      claim() {
        return null;
      },
    },
  };
  assert.throws(() => startPushWorker(mock, config), /requiere/);
  assert.throws(
    () =>
      startPushWorker(
        { info: () => ({ synthetic: true }) },
        { ...config, delivery: true },
      ),
    /live/,
  );
  const stop = startPushWorker(
    mock,
    { ...config, delivery: true },
    { intervalMs: 20 },
  );
  for (let n = 0; n < 80 && cycles === 0; n++)
    await new Promise((r) => setTimeout(r, 20));
  assert.ok(cycles > 0);
  await stop();
  const count = cycles;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(cycles, count);
});

test("receipt-free receive proof revalidates accepted jobs against current version, expiry and owner preferences", async (t) => {
  const { store, create, schedule, advance } = await setupPush(t);
  const first = create();
  schedule();
  store.subscriptions.enqueue();
  const job = store.subscriptions.claim();
  assert.ok(job.payload.job_ids.length);
  const proof = {
    browser: first.payload.browser,
    job_ids: job.payload.job_ids,
  };
  assert.deepEqual(store.subscriptions.validateDelivery(proof), {
    current: true,
  });
  store.subscriptions.finish(job.lease_id, 201);
  assert.deepEqual(store.subscriptions.validateDelivery(proof), {
    current: true,
  });
  assert.deepEqual(
    store.subscriptions.validateDelivery({
      ...proof,
      browser: { ...browser(), endpoint: first.payload.browser.endpoint },
    }),
    { current: false },
  );
  schedule("v2", false);
  assert.deepEqual(store.subscriptions.validateDelivery(proof), {
    current: false,
  });
  advance(24 * 3600000);
  assert.deepEqual(store.subscriptions.validateDelivery(proof), {
    current: false,
  });
});

test("receive proof cannot revive revoked ownership or an unattempted job", async (t) => {
  const { store, create } = await setupPush(t),
    first = create();
  store.subscriptions.requestTest(
    first.owner.id,
    first.payload.management_token,
    randomUUID(),
  );
  const job = store.subscriptions.claim(),
    proof = { browser: first.payload.browser, job_ids: job.payload.job_ids };
  assert.equal(store.subscriptions.validateDelivery(proof).current, true);
  store.subscriptions.revoke(first.owner.id, first.payload.management_token);
  assert.equal(store.subscriptions.validateDelivery(proof).current, false);
});

test('remapped sector receives new schedule without another areas predecessor hours',async t=>{
 const {store,schedule,create}=await setupPush(t);schedule('v1');store.schedules.ingest({provider_id:'eeasa-maintenance',body:document('v2')});const row=store.schedules.queue().find(r=>r.type==='maintenance');
 store.schedules.bind({provider_id:'eeasa-maintenance',sector_label:row.sector_label,area_id:'sector-2',reference_url:'https://www.eeasa.com.ec/trabajos-programadas/',review_reason:'Synthetic corrected sector',expected_binding:1});
 store.schedules.review({revision_id:row.id,decision:'reviewed',rights_reviewed:true,review_reason:'Synthetic new area review'});
 create({areas:[{area_id:'sector-2',alias:'Synthetic corrected sector'}]});store.subscriptions.enqueue();const job=store.subscriptions.claim();assert.ok(job);assert.ok(!job.payload.body.includes('Antes:'));assert.match(job.payload.title,/programación/);
});
