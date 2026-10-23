import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
const remote = { remoteAddress: "198.51.100.60" };
test("OpenAPI documents only enabled explicit public GET routes, never private mutation/owner endpoints", async (t) => {
  const app = await createApp({
    store: new HistoryStore(),
    mac: null,
    flags: {
      PUBLIC_API_V1: true,
      BLACKOUT_MAP: true,
      BLACKOUT_DEMO: true,
      CITIZEN_REPORTS: true,
      TIME_MACHINE: true,
    },
  });
  t.after(() => app.close());
  const response = await app.inject({ ...remote, url: "/api/v1/openapi.json" });
  assert.equal(response.statusCode, 200, response.body);
  const doc = response.json();
  assert.equal(doc.openapi, "3.1.0");
  assert.ok(doc.paths["/api/v1/areas"]);
  assert.ok(doc.paths["/api/v1/events/{id}/evidence"]);
  assert.ok(doc.paths["/api/v1/timeline"]);
  assert.equal(doc.paths["/api/v1/report-summary"].get.parameters.find(p=>p.name==="area_id").required,true);
  assert.equal(doc.paths["/api/v1/schedules"], undefined);
  assert.equal(doc.paths["/api/v1/subscriptions/{id}"], undefined);
  for (const operation of Object.values(doc.paths))
    assert.deepEqual(Object.keys(operation), ["get"]);
  assert.ok(!JSON.stringify(doc).includes("receipt_token"));
  assert.ok(!JSON.stringify(doc).includes("management_token"));
  assert.equal(
    (await app.inject({ ...remote, url: "/api/v1/openapi.json?private=1" }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        ...remote,
        method: "POST",
        url: "/api/v1/openapi.json",
      })
    ).statusCode,
    403,
  );
  const off = await createApp({ store: new HistoryStore(), mac: null });
  t.after(() => off.close());
  assert.equal(
    (await off.inject({ ...remote, url: "/api/v1/openapi.json" })).statusCode,
    403,
  );
});
test("aggregate error telemetry contains no identities and counts validation/rate failures on registered public reads", async (t) => {
  const app = await createApp({
    store: new HistoryStore(),
    mac: null,
    flags: { PUBLIC_API_V1: true },
  });
  t.after(() => app.close());
  await app.inject({ ...remote, url: "/api/v1/health/public?unknown=1" });
  for (let i = 0; i < 61; i++)
    await app.inject({ ...remote, url: "/api/v1/health/public" });
  const quality = await app.inject({
    ...remote,
    url: "/api/v1/health/quality",
  });
  assert.equal(quality.statusCode, 200, quality.body);
  const value = quality.json();
  assert.ok(value.errors_4xx >= 2);
  assert.ok(value.rate_limited >= 1);
  assert.ok(!quality.body.includes(remote.remoteAddress));
  assert.equal(value.sources.last_attempt_at, null);
  assert.equal(value.scope, "registered-public-get-only");
});
test("checked-in full capability OpenAPI is reproducible without network or secret material", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-openapi-"));
  try {
    const file = path.join(directory, "openapi.json");
    execFileSync(process.execPath, ["scripts/export-openapi.mjs", file], {
      stdio: "pipe",
    });
    const generated = JSON.parse(fs.readFileSync(file)),
      committed = JSON.parse(
        fs.readFileSync(new URL("../docs/api/openapi.json", import.meta.url)),
      );
    assert.deepEqual(generated, committed);
    assert.equal(Object.keys(generated.paths).length, 14);
    assert.ok(
      generated.components.schemas.event.properties.end_at.type.includes(
        "null",
      ),
    );
    assert.ok(!JSON.stringify(generated).includes("VAPID_PRIVATE_KEY"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('telemetry reports loader failures and public 5xx without disclosing source URLs or exception messages',async t=>{
 let broken=false;const now=()=>{if(broken)throw Error('private-fixture-message');return new Date('2026-10-22T12:00:00Z');};
 const app=await createApp({store:new HistoryStore(),now,mac:null,fetchUrl:async()=>{throw Error('private-fixture-source-url');},flags:{PUBLIC_API_V1:true}});t.after(()=>app.close());
 await app.inject('/api/status');broken=true;assert.equal((await app.inject({...remote,url:'/api/v1/health/public'})).statusCode,500);broken=false;
 const response=await app.inject({...remote,url:'/api/v1/health/quality'});assert.equal(response.statusCode,200);const result=response.json();assert.ok(result.errors_5xx>=1);assert.ok(result.sources.attempts>=1);assert.ok(result.sources.failures>=1);assert.equal(result.sources.last_attempt_at,'2026-10-22T12:00:00.000Z');assert.ok(!response.body.includes('private-fixture'));
});
