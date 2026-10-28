import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { projectInfrastructure } from "../api/infrastructure.js";
import { HistoryStore } from "../history.js";
import { createApp } from "../backend.js";
import { drawScene } from "../public/explorer/scene.js";
const now = () => new Date("2026-10-22T12:00:00Z");
test("height observation, freshness, source and history remain separate from thresholds and volume", () => {
  const history = new HistoryStore();
  history.record(
    "30031",
    [{ valueedit: 2120, loctimestamp: "2026-10-22T11:30:00Z" }],
    now(),
  );
  const current = projectInfrastructure(
    {
      mazar: { cotaMsnm: 2120, timestamp: "2026-10-22T11:30:00Z" },
      secret: "must not leak",
    },
    history,
    now(),
  );
  assert.equal(current.measurement.state, "current");
  assert.equal(current.references.safety_m, 2115);
  assert.equal(current.references.design_min_m, 2098);
  assert.equal(current.references.volume_model, "unavailable");
  assert.equal(current.observations.length, 1);
  assert.ok(!JSON.stringify(current).includes("must not leak"));
  assert.ok(
    !Object.keys(current).some((k) => /reserve|volume_percent|mwh/i.test(k)),
  );
  assert.equal(
    projectInfrastructure(
      { mazar: { cotaMsnm: 2120, timestamp: "2026-10-21T10:00:00Z" } },
      history,
      now(),
    ).measurement.state,
    "stale",
  );
  assert.equal(
    projectInfrastructure({}, history, now()).measurement.value_m,
    null,
  );
  assert.equal(
    projectInfrastructure(
      {
        retrievalFailed: true,
        mazar: { cotaMsnm: 2120, timestamp: "2026-10-22T11:30:00Z" },
      },
      history,
      now(),
    ).measurement.state,
    "failed",
  );
});
test("public projection is explicit flag-gated GET and preserves all v4 bytes with no station disclosure", async (t) => {
  const store = new HistoryStore(),
    fetchUrl = async () => ({ status: 503, data: "" }),
    off = await createApp({ store, now, mac: null, fetchUrl }),
    on = await createApp({
      store: new HistoryStore(),
      now,
      mac: null,
      fetchUrl,
      flags: { PUBLIC_API_V1: true, EXPLORER_3D: true },
    });
  t.after(() => Promise.all([off.close(), on.close()]));
  const pub = await on.inject({
    url: "/api/v1/infrastructure",
    remoteAddress: "198.51.100.12",
  });
  assert.equal(pub.statusCode, 200, pub.body);
  assert.equal(pub.json().measurement.state, "missing");
  assert.equal(pub.json().references.volume_model, "unavailable");
  assert.equal((await off.inject({ url: "/explorer/" })).statusCode, 404);
  assert.equal(
    (await on.inject({ url: "/api/v1/infrastructure?mac=private" })).statusCode,
    400,
  );
  assert.equal(
    (
      await on.inject({
        method: "POST",
        url: "/api/v1/infrastructure",
        remoteAddress: "198.51.100.12",
      })
    ).statusCode,
    403,
  );
  for (const url of ["/", "/ui", "/api/status"])
    assert.equal(
      (await off.inject({ url })).body,
      (await on.inject({ url })).body,
    );
  assert.equal(
    (await on.inject({ url: "/explorer/scene.js" })).statusCode,
    200,
  );
});
test("illustrative scene has a 2D fallback and bounded geometry without WebGL", () => {
  assert.equal(drawScene({ getContext: () => null }), false);
  let lines = 0;
  const ctx = {
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {
      lines++;
    },
    stroke() {},
    fillText() {},
  };
  assert.equal(drawScene({ getContext: () => ctx }, 45), true);
  assert.equal(lines, 312);
});
test("explorer loads no 3D until gesture, preserves accessible unknown/stale readings and handles canvas failure", async (t) => {
  const html = fs.readFileSync(
      new URL("../public/explorer/index.html", import.meta.url),
      "utf8",
    ),
    script = fs.readFileSync(
      new URL("../public/explorer/app.js", import.meta.url),
      "utf8",
    ),
    dom = new JSDOM(html, {
      runScripts: "outside-only",
      url: "https://example.invalid/explorer/",
    });
  t.after(() => dom.window.close());
  const { window } = dom,
    $ = (id) => window.document.getElementById(id);
  window.AbortSignal = AbortSignal;
  let calls = 0;
  window.fetch = async () => {
    calls++;
    return {
      ok: true,
      json: async () => projectInfrastructure({}, new HistoryStore(), now()),
    };
  };
  window.eval(script);
  for (
    let i = 0;
    i < 30 && !$("status").textContent.includes("Sin lectura");
    i++
  )
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls, 1);
  assert.equal($("three").hidden, true);
  assert.match($("measurement").textContent, /desconocida/);
  assert.match(window.document.body.textContent, /2098/);
  assert.match(window.document.body.textContent, /2115/);
  assert.equal($("scene").getAttribute("role"), "img");
  assert.ok(!window.document.querySelector("script[src*=http]"));
  $("load-3d").click();
  for (
    let i = 0;
    i < 30 && !$("fallback").textContent.includes("no disponible");
    i++
  )
    await new Promise((r) => setTimeout(r, 10));
  assert.match($("fallback").textContent, /no disponible/);
  assert.equal($("three").hidden, true);
  assert.equal(window.localStorage.length, 0);
});

test('failed CELEC refresh is explicit with a recent retained reading and does not alter v4 JSON fields',async t=>{
 const history=new HistoryStore();history.record('30031',[{valueedit:2120,loctimestamp:'2026-10-22T11:30:00Z'}],now());const app=await createApp({store:history,now,mac:null,fetchUrl:async()=>{throw Error('unreachable fixture');},flags:{PUBLIC_API_V1:true,EXPLORER_3D:true}});t.after(()=>app.close());
 const result=(await app.inject({url:'/api/v1/infrastructure'})).json();assert.equal(result.measurement.state,'failed');assert.equal(result.measurement.value_m,2120);assert.equal(result.measurement.observed_at,'2026-10-22T11:30:00Z');
 const v4=await app.inject('/api/dams');assert.ok(!v4.body.includes('refresh-failure'));assert.ok(!v4.body.includes('CELEC_REFRESH_FAILURE'));const html=(await app.inject('/explorer/')).body;assert.ok(!html.includes('href="/map"'));
});
