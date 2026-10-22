import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openStore } from "../storage/sqlite-store.js";
import { FEEDS } from "../feeds/providers.js";
import { parseFeed } from "../feeds/parser.js";
import { captureFeed, robotsPolicy } from "../feeds/capture.js";
const body = fs.readFileSync(
    new URL("./fixtures/feeds/rss.xml", import.meta.url),
  ),
  now = () => new Date("2026-10-22T14:00:00Z");
async function setup(t, synthetic = true, clock = now) {
  const store = await openStore({
    directory: ":memory:",
    synthetic,
    now: clock,
  });
  t.after(() => store.close());
  store.writeBatch({
    areas: [
      {
        id: "area",
        name: "Área sintética",
        parent_id: null,
        type: "canton",
        location_precision: "administrative_area",
        code: null,
        polygon_ref: null,
        polygon_version: null,
        synthetic,
      },
    ],
  });
  store.feeds.grant({
    provider_id: "celec-news",
    decision: "approved",
    valid_until: "2026-11-01T00:00:00Z",
    evidence_url: "https://www.celec.gob.ec/synthetic-permission",
    reason: "FICTIONAL permission for isolated test only",
  });
  return store;
}
test("RSS metadata separates publication from ingestion, classifies conservatively and never executes descriptions", () => {
  const rows = parseFeed(body, FEEDS[0], now());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].temporal_state, "old");
  assert.equal(rows[0].category, "outage");
  assert.equal(rows[0].url, "https://www.celec.gob.ec/example-a");
  assert.equal(globalThis.pwned, undefined);
  assert.equal(rows[1].published_at, "2026-10-22T13:00:00.000Z");
});
test("Atom, unknown dates, future publications and arbitrary/malicious XML fail safely", () => {
  const atom = Buffer.from(
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Dato sintético</title><link href="https://www.celec.gob.ec/x"/><published>no-date</published></entry></feed>',
  );
  assert.equal(parseFeed(atom, FEEDS[0], now())[0].temporal_state, "unknown");
  assert.throws(() =>
    parseFeed(
      Buffer.from(
        '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>',
      ),
      FEEDS[0],
    ),
  );
  assert.throws(() =>
    parseFeed(
      Buffer.from(
        "<rss><channel><item><title>x</title><link>https://evil.invalid/x</link></item></channel></rss>",
      ),
      FEEDS[0],
    ),
  );
  assert.throws(() => parseFeed(Buffer.alloc(262145), FEEDS[0]));
  assert.throws(() => parseFeed(Buffer.from("<broken"), FEEDS[0]));
});
test("old rumor republished with a new date preserves first publication; duplicate article and copied title are visible", async (t) => {
  const store = await setup(t);
  assert.equal(store.feeds.ingest("celec-news", body).added, 2);
  assert.equal(store.feeds.ingest("celec-news", body).added, 0);
  const repost = Buffer.from(
    body
      .toString()
      .replace(
        "Mon, 01 Jun 2026 10:00:00 -0500",
        "Thu, 22 Oct 2026 08:30:00 -0500",
      ),
  );
  assert.equal(store.feeds.ingest("celec-news", repost).added, 1);
  const queue = store.feeds.queue();
  const latest = queue.find(
    (r) => r.temporal_state === "recent" && r.category === "outage",
  );
  assert.equal(latest.first_published_at, "2026-06-01T15:00:00.000Z");
  assert.equal(latest.copies, 2);
  assert.equal(store.repositories.events.list().length, 0);
});
test("ambiguous location stays pending; exact local review creates only observation with no official/event assertion", async (t) => {
  const store = await setup(t);
  store.feeds.ingest("celec-news", body);
  const item = store.feeds.queue()[0];
  assert.throws(() =>
    store.feeds.review({
      item_id: item.id,
      decision: "approved",
      reason: "review",
    }),
  );
  assert.equal(store.feeds.queue().length, 2);
  const result = store.feeds.review({
    item_id: item.id,
    decision: "approved",
    rights_reviewed: true,
    area_id: "area",
    summary: "Resumen propio sintético, zona comprobada por operador.",
    reason: "Derechos y zona documentados",
  });
  const observation = store.repositories.observations.get(
    result.observation_id,
  );
  assert.equal(observation.occurred_at, null);
  assert.equal(observation.temporal_confidence, "unknown");
  assert.equal(
    store.repositories.sources.get(observation.source_id).official,
    false,
  );
  assert.equal(store.repositories.events.list().length, 0);
  assert.throws(() =>
    store.feeds.review({
      item_id: item.id,
      decision: "rejected",
      reason: "second",
    }),
  );
  assert.equal(store.feeds.history(item.id).length, 1);
});
test("robots, permission gate, bounded capture, validators and persistent cooldown fail closed", async (t) => {
  const store = await setup(t, false);
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(options.redirect, "error");
    return url.endsWith("robots.txt")
      ? new Response("User-agent: *\nDisallow: /wp-admin/\nCrawl-delay: 7200", {
          headers: { "content-type": "text/plain" },
        })
      : new Response(body, {
          headers: { "content-type": "application/rss+xml", etag: '"v1"' },
        });
  };
  await assert.rejects(
    captureFeed(store, "celec-news", { fetchImpl }),
    /permisos/,
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    await captureFeed(store, "celec-news", { fetchImpl, rightsReviewed: true }),
    { status: "ok" },
  );
  await assert.rejects(
    captureFeed(store, "celec-news", { fetchImpl, rightsReviewed: true }),
    /Cooldown/,
  );
  assert.equal(calls, 2);
  assert.equal(
    robotsPolicy("User-agent: *\nDisallow: /wp-admin/", FEEDS[0].url),
    3600,
  );
  assert.throws(() => robotsPolicy("User-agent: *\nDisallow: /", FEEDS[0].url));
  await assert.rejects(captureFeed(store, "unknown", { rightsReviewed: true }));
});
test("failed fetch, 304 without artifact and forbidden robots preserve history and reserve cooldown", async (t) => {
  const store = await setup(t, false);
  store.feeds.ingest("celec-news", body);
  let calls = 0;
  await assert.rejects(
    captureFeed(store, "celec-news", {
      rightsReviewed: true,
      fetchImpl: async () => {
        calls++;
        return new Response("User-agent: *\nDisallow: /", {
          headers: { "content-type": "text/plain" },
        });
      },
    }),
    /fallida/,
  );
  assert.equal(calls, 1);
  assert.equal(store.feeds.queue().length, 2);
  await assert.rejects(
    captureFeed(store, "celec-news", { rightsReviewed: true }),
    /Cooldown/,
  );
});
test("revoked or expired permissions hide feed evidence without deleting observations or original metadata", async (t) => {
  let time = Date.parse("2026-10-22T14:00:00Z");
  const store = await setup(t, true, () => new Date(time));
  store.feeds.ingest("celec-news", body);
  const item = store.feeds.queue()[0];
  const result = store.feeds.review({
    item_id: item.id,
    decision: "approved",
    rights_reviewed: true,
    area_id: "area",
    summary: "Synthetic reviewed summary",
    reason: "Synthetic source rights and zone",
  });
  const fixture = JSON.parse(
    fs.readFileSync(new URL("./fixtures/storage-v1.json", import.meta.url)),
  );
  store.writeBatch({
    events: [
      {
        ...fixture.events[0],
        id: "feed-event",
        area_id: "area",
        status: "reported",
      },
    ],
    evidence: [
      {
        ...fixture.evidence[0],
        id: "feed-link",
        event_id: "feed-event",
        observation_id: result.observation_id,
        human_reviewed: true,
      },
    ],
  });
  assert.ok(store.publicReader.getEvent("feed-event"));
  time = Date.parse("2026-11-02T00:00:00Z");
  assert.equal(store.publicReader.getEvent("feed-event"), null);
  assert.ok(store.repositories.observations.get(result.observation_id));
  time = Date.parse("2026-10-23T00:00:00Z");
  store.feeds.grant({
    provider_id: "celec-news",
    decision: "rejected",
    valid_until: "2026-11-01T00:00:00Z",
    evidence_url: "https://www.celec.gob.ec/synthetic-withdrawal",
    reason: "Synthetic licence revoked",
  });
  assert.equal(store.feeds.permission("celec-news"), false);
  assert.equal(store.publicReader.getEvent("feed-event"), null);
  assert.equal(store.feeds.history(item.id).length, 1);
});
test("conditional 304 retains validated document and validators; oversized response and unsupported redirects fail closed", async (t) => {
  let time = Date.parse("2026-10-22T14:00:00Z"),
    count = 0;
  const store = await setup(t, false, () => new Date(time));
  const fetchImpl = async (url, options) => {
    if (url.endsWith("robots.txt"))
      return new Response("User-agent: *\nDisallow: /wp-admin/", {
        headers: { "content-type": "text/plain" },
      });
    count++;
    if (count === 1)
      return new Response(body, {
        headers: { "content-type": "application/rss+xml", etag: '"original"' },
      });
    assert.equal(options.headers["if-none-match"], '"original"');
    return new Response(null, { status: 304 });
  };
  await captureFeed(store, "celec-news", { fetchImpl, rightsReviewed: true });
  time += 3600001;
  await captureFeed(store, "celec-news", { fetchImpl, rightsReviewed: true });
  assert.equal(store.feeds.queue().length, 2);
  time += 3600001;
  assert.equal(store.feeds.claim("celec-news").etag, '"original"');
  const other = await setup(t, false);
  await assert.rejects(
    captureFeed(other, "celec-news", {
      rightsReviewed: true,
      fetchImpl: async (url) =>
        url.endsWith("robots.txt")
          ? new Response("User-agent: *", {
              headers: { "content-type": "text/plain" },
            })
          : new Response(Buffer.alloc(262145), {
              headers: { "content-type": "application/rss+xml" },
            }),
    }),
  );
  assert.equal(other.feeds.queue().length, 0);
});
test('migration 005 to 006 snapshots old history and restores old schema into a new directory',async t=>{
 const {MIGRATIONS}=await import('../storage/migrations.js'),{restoreSnapshot}=await import('../storage/backups.js'),os=await import('node:os'),path=await import('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aegis-feeds-migration-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const directory=path.join(root,'active');
 const old=await openStore({directory,synthetic:true,migrations:MIGRATIONS.slice(0,5)});old.close();
 const current=await openStore({directory,synthetic:true});assert.equal(current.info().version,6);current.close();
 const snapshot=fs.readdirSync(path.join(directory,'backups')).find(v=>v.startsWith('pre-migration-'));assert.ok(snapshot);
 const restoredDirectory=path.join(root,'restored');await restoreSnapshot(path.join(directory,'backups',snapshot),restoredDirectory);
 const restored=await openStore({directory:restoredDirectory,synthetic:true,migrations:MIGRATIONS.slice(0,5)});assert.equal(restored.info().version,5);restored.close();
});
