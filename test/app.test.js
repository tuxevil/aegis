import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
const now = new Date("2026-10-12T21:00:00Z");
const html = fs.readFileSync(
  new URL("./fixtures/cenace.html", import.meta.url),
  "utf8",
);
const fake = async (url) => {
  if (url.includes("pointValues")) {
    const mrid = Number(new URL(url).searchParams.get("mrid"));
    return {
      status: 200,
      data: JSON.stringify({
        items: [
          {
            loctimestamp: now.toISOString(),
            valueedit: mrid === 30031 ? 2124 : mrid === 30538 ? 30 : 1,
          },
          {
            loctimestamp: new Date(now - 24 * 3600000).toISOString(),
            valueedit: mrid === 30031 ? 2125 : mrid === 30538 ? 60 : 1,
          },
        ],
      }),
    };
  }
  if (url.includes("InformacionOperativa")) return { status: 200, data: html };
  if (url.includes("rel_wksst"))
    return { status: 200, data: "07OCT2026 4.4 3.4 2.4 .2" };
  if (url.includes("ensodisc"))
    return {
      status: 200,
      data: "<p>8 October 2026</p><p>ENSO Alert System Status: El Niño Advisory</p>",
    };
  return { status: 503, data: "" };
};
test("panorama integra fuentes independientes y sobrevive fallo del pronóstico y estación", async (t) => {
  const app = await createApp({
    fetchUrl: fake,
    store: new HistoryStore(),
    now: () => now,
    mac: null,
  });
  t.after(() => app.close());
  const response = await app.inject("/api/status");
  assert.equal(response.statusCode, 200);
  const data = response.json();
  assert.equal(data.dams.mazar.cotaMsnm, 2124);
  assert.equal(data.assessment.energy.level, "elevated");
  assert.equal(data.enso.official.label, "El Niño confirmado");
  assert.equal(data.assessment.local.level, "unknown");
  assert.ok(data.forecast.error);
  assert.equal(JSON.stringify(data).includes("macAddress"), false);
  assert.equal(data.cenace.hydroGenerators[0].generationMWh, 11031);
});
test("concurrentes comparten consulta; el error no filtra URL ni identificador privado", async (t) => {
  let calls = 0;
  const app = await createApp({
    store: new HistoryStore(),
    mac: "test-private-id",
    fetchUrl: async (url) => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      throw new Error(url);
    },
  });
  t.after(() => app.close());
  const replies = await Promise.all([
    app.inject("/api/weather"),
    app.inject("/api/weather"),
  ]);
  assert.equal(calls, 1);
  for (const reply of replies) {
    assert.ok(reply.json().error);
    assert.equal(reply.body.includes("test-private-id"), false);
  }
});
test("restricción pública conserva dashboard mismo host y rechaza otras rutas/orígenes", async (t) => {
  const app = await createApp({
    fetchUrl: fake,
    store: new HistoryStore(),
    now: () => now,
    mac: null,
  });
  t.after(() => app.close());
  assert.equal(
    (await app.inject({ url: "/api/dams", remoteAddress: "192.0.2.1" }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/status",
        remoteAddress: "192.0.2.1",
        headers: { host: "example.com", origin: "https://evil.example" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/status",
        remoteAddress: "192.0.2.1",
        headers: { host: "example.com", referer: "https://example.com/" },
      })
    ).statusCode,
    200,
  );
  assert.equal((await app.inject("/")).statusCode, 200);
  assert.equal((await app.inject("/assets/app.js")).statusCode, 200);
  assert.equal((await app.inject("/assets/chart.js")).statusCode, 200);
});

test("fallos tienen pausa de reintento y se recuperan sin retener error para siempre", async (t) => {
  let time = new Date("2026-10-12T21:00:00Z"),
    calls = 0,
    offline = true;
  const app = await createApp({
    store: new HistoryStore(),
    now: () => time,
    mac: null,
    fetchUrl: async (url) => {
      calls++;
      if (offline) throw new Error("offline");
      return fake(url);
    },
  });
  t.after(() => app.close());
  assert.ok((await app.inject("/api/cenace")).json().error);
  assert.ok((await app.inject("/api/cenace")).json().error);
  assert.equal(calls, 1);
  time = new Date(time.getTime() + 61000);
  offline = false;
  const recovered = (await app.inject("/api/cenace")).json();
  assert.equal(recovered.sourceDate, "2026-10-12");
  assert.equal(recovered.error, undefined);
  assert.equal(calls, 2);
});
