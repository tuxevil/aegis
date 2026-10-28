import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Fastify from "fastify";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
import { FEATURE_NAMES, readFeatureFlags } from "../feature-flags.js";
import { publicSchemas } from "../api/schemas.js";

const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/public-v1.json", import.meta.url)));
const instant = new Date("2026-10-21T15:00:00Z");
const options = {
  store: new HistoryStore(), now: () => instant, mac: null,
  fetchUrl: async () => { throw new Error("offline"); },
};
const remote = { remoteAddress: "192.0.2.40" };

test("flags fail closed, independently, and are immutable", () => {
  assert.ok(Object.values(readFeatureFlags({})).every(value => value === false));
  for (const name of FEATURE_NAMES) {
    for (const value of ["false", "1", "TRUE", "yes", "", undefined]) {
      assert.equal(readFeatureFlags({ [name]: value })[name], false);
    }
    assert.equal(readFeatureFlags({ [name]: "true" })[name], true);
  }
  assert.equal(readFeatureFlags(Object.create({ PUBLIC_API_V1: true })).PUBLIC_API_V1, false);
  assert.ok(Object.isFrozen(readFeatureFlags({})));
});

test("flag OFF preserves v4 responses and assets; v1 is not registered", async t => {
  const off = await createApp({ ...options, flags: {} });
  const on = await createApp({ ...options, store: new HistoryStore(), flags: { PUBLIC_API_V1: true } });
  t.after(() => Promise.all([off.close(), on.close()]));
  for (const url of ["/", "/ui", "/assets/app.js", "/assets/style.css", "/assets/chart.js",
    "/assets/favicon.svg", "/assets/social.png", "/api/status", "/api/dams", "/api/weather",
    "/api/cenace", "/api/enso", "/api/forecast"]) {
    const a = await off.inject(url), b = await on.inject(url);
    assert.equal(a.statusCode, 200, url);
    assert.equal(b.statusCode, a.statusCode, url);
    assert.equal(b.body, a.body, url);
  }
  assert.equal((await off.inject("/api/v1/health/public")).statusCode, 404);
  assert.equal((await off.inject({ ...remote, url: "/api/v1/health/public" })).statusCode, 403);
});

test("only explicit GET v1 health is public; headers never unlock private routes", async t => {
  let fetches = 0;
  const app = await createApp({ ...options, flags: { PUBLIC_API_V1: true },
    fetchUrl: async () => { fetches++; throw new Error("offline"); } });
  t.after(() => app.close());
  const health = await app.inject({ ...remote, url: "/api/v1/health/public" });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { api_version: "1", status: "foundation", timestamp: instant.toISOString(), coverage: "unknown" });
  assert.equal(fetches, 0);
  const invalid = await app.inject({ ...remote, url: "/api/v1/health/public?secret=private" });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.json(), { error: { code: "INVALID_REQUEST", message: "Solicitud inválida" } });
  for (const url of ["/api/dams", "/api/weather", "/api/cenace", "/api/enso", "/api/forecast",
    "/api/v1/admin", "/api/v1/ingest", "/api/v1/subscriptions", "/api/v1/events/private",
    "/api/v1/health/public/extra", "/api/v1/health/public/", "/api/v1/health%2Fpublic"]) {
    for (const headers of [{}, { host: "example.com", origin: "https://example.com", referer: "https://example.com/" }]) {
      assert.equal((await app.inject({ ...remote, url, headers })).statusCode, 403, url);
    }
  }
  for (const method of ["POST", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal((await app.inject({ ...remote, method, url: "/api/v1/health/public" })).statusCode, 403, method);
  }
  assert.equal((await app.inject({ ...remote, url: "/api/status" })).statusCode, 403);
  assert.equal((await app.inject({ ...remote, url: "/api/status", headers: { host: "example.com", referer: "https://example.com/" } })).statusCode, 200);
});

test("v1 internal failures do not expose dependency messages", async t => {
  const app = await createApp({ ...options, flags: { PUBLIC_API_V1: true },
    now: () => { throw new Error("private-dependency-details"); } });
  t.after(() => app.close());
  const response = await app.inject({ ...remote, url: "/api/v1/health/public" });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: { code: "INTERNAL_ERROR", message: "Servicio no disponible" } });
});

test("public v1 rate limits are bounded and return sanitized contract errors", async t => {
  const app = await createApp({ ...options, flags: { PUBLIC_API_V1: true } });
  t.after(() => app.close());
  for (let i = 0; i < 60; i++) assert.equal((await app.inject({ ...remote, url: "/api/v1/health/public" })).statusCode, 200);
  const response = await app.inject({ ...remote, url: "/api/v1/health/public" });
  assert.equal(response.statusCode, 429);
  assert.equal(response.json().error.code, "RATE_LIMITED");
  assert.equal(response.body.includes(remote.remoteAddress), false);
});

test("public contracts validate fixtures and reject private/invalid input; serialize only allowed fields", async t => {
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  t.after(() => app.close());
  for (const [name, schema] of Object.entries(publicSchemas)) {
    app.post(`/${name}`, { schema: { body: schema, response: { 200: schema } } }, async req => ({ ...req.body, private_secret: "must-not-leak" }));
  }
  for (const [name, fixture] of Object.entries(fixtures)) {
    const response = await app.inject({ method: "POST", url: `/${name}`, payload: fixture });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), fixture);
    for (const field of ["ip", "receipt_token", "push_endpoint", "mac", "latitude", "longitude"]) {
      assert.equal((await app.inject({ method: "POST", url: `/${name}`, payload: { ...fixture, [field]: "private" } })).statusCode, 400);
    }
    assert.equal((await app.inject({ method: "POST", url: `/${name}`, payload: {} })).statusCode, 400);
  }
  for (const [name, patch] of [["event", { status: "confirmed" }], ["event", { start_at: "yesterday" }],
    ["evidence", { source_url: "javascript:alert(1)" }], ["schedule", { parser_confidence: 2 }], ["area", { type: "house" }]]) {
    assert.equal((await app.inject({ method: "POST", url: `/${name}`, payload: { ...fixtures[name], ...patch } })).statusCode, 400);
  }
});
