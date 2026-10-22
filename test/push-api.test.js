import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
import { setupPush } from "../test-support/push-fixture.js";
const flags = {
  PUBLIC_API_V1: true,
  SQLITE_STORAGE: true,
  BLACKOUT_MAP: true,
  OFFICIAL_SCHEDULES: true,
  PUSH_ALERTS: true,
};
export async function apiSetup(t) {
  const context = await setupPush(t);
  const { store, config, now } = context;
  const app = await createApp({
    store: new HistoryStore(),
    now,
    mac: null,
    flags,
    pushConfig: config,
    openV5Store: async () => store,
    fetchUrl: async () => {
      throw Error("offline");
    },
  });
  t.after(() => app.close());
  const headers = {
    origin: config.origin,
    "x-aegis-request": "sector-watch",
    "content-type": "application/json",
  };
  const send = (method, url, payload, extra = {}) =>
    app.inject({
      method,
      url,
      payload,
      headers: { ...headers, ...extra },
      remoteAddress: "198.51.100.19",
    });
  const challenge = async () => {
    const response = await send("POST", "/api/v1/subscription-challenges", {});
    assert.equal(response.statusCode, 200, response.body);
    context.advance(1100);
    return response.json();
  };
  const enroll = async (patch = {}) => {
    const c = await challenge(),
      body = {
        ...context.input(patch),
        challenge_id: c.challenge_id,
        answer: "",
        website: "",
      };
    const response = await send("POST", "/api/v1/subscriptions", body);
    return { body, response };
  };
  return { ...context, app, send, headers, challenge, enroll };
}

test("public key is public but all owner methods require secret, origin/JSON/header and strict consent", async (t) => {
  const { app, config, send, enroll } = await apiSetup(t);
  const key = await app.inject({
    url: "/api/v1/push/public-key",
    remoteAddress: "198.51.100.19",
  });
  assert.equal(key.statusCode, 200);
  assert.equal(key.json().delivery_enabled, false);
  assert.equal(key.json().public_key, config.publicKey);
  assert.ok(!key.body.includes(config.privateKey));
  const { body, response } = await enroll();
  assert.equal(response.statusCode, 201, response.body);
  const owner = response.json(),
    url = `/api/v1/subscriptions/${owner.id}`;
  const auth = { authorization: `Bearer ${body.management_token}` };
  assert.equal((await send("GET", url, undefined, auth)).statusCode, 200);
  assert.equal((await send("GET", url)).statusCode, 404);
  for (const extra of [
    { ...auth, origin: "https://evil.invalid" },
    { ...auth, "x-aegis-request": "bad" },
    { ...auth, "content-type": "text/plain" },
  ])
    assert.equal(
      (await send("DELETE", url, {}, extra)).statusCode,
      extra["content-type"] ? 400 : 403,
    );
  const safe = await send("GET", url, undefined, auth);
  for (const secret of [
    body.management_token,
    body.browser.endpoint,
    body.browser.keys.auth,
  ])
    assert.equal(safe.body.includes(secret), false);
  assert.equal((await send("DELETE", url, {}, auth)).json().status, "revoked");
  assert.equal((await send("DELETE", url, {}, auth)).json().status, "revoked");
});

test("API challenges, idempotence, strict nested fields, spam and update revision conflicts are enforced", async (t) => {
  const { send, input, challenge, advance } = await apiSetup(t);
  const c = await challenge(),
    body = {
      ...input(),
      challenge_id: c.challenge_id,
      answer: "",
      website: "",
    };
  for (const patch of [
    { consent: "true" },
    { push_consent: "true" },
    {
      browser: { ...body.browser, keys: { ...body.browser.keys, extra: "x" } },
    },
    { areas: [{ area_id: "sector-0", alias: "x", latitude: 1 }] },
  ]) {
    const response = await send("POST", "/api/v1/subscriptions", {
      ...body,
      ...patch,
    });
    assert.equal(response.statusCode, 400, response.body);
  }
  const first = await send("POST", "/api/v1/subscriptions", body);
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(
    (await send("POST", "/api/v1/subscriptions", body)).json().id,
    first.json().id,
  );
  const updated = {
    ...input({ browser: null, push_consent: false }),
    expected_revision: 1,
  };
  delete updated.management_token;
  delete updated.request_id;
  const url = `/api/v1/subscriptions/${first.json().id}`,
    auth = { authorization: `Bearer ${body.management_token}` };
  const response = await send("PATCH", url, updated, auth);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().push_registered, false);
  assert.equal((await send("PATCH", url, updated, auth)).statusCode, 409);
});

test("flag OFF leaves v4 and watch assets untouched; service worker is scoped to watch and has no API cache", async (t) => {
  const { app, now } = await apiSetup(t);
  const off = await createApp({
    store: new HistoryStore(),
    now,
    flags: {},
    mac: null,
    fetchUrl: async () => {
      throw Error("offline");
    },
  });
  t.after(() => off.close());
  for (const url of ["/", "/ui", "/assets/app.js", "/assets/style.css"])
    assert.equal((await app.inject(url)).body, (await off.inject(url)).body);
  for (const url of [
    "/watch/",
    "/watch/app.js",
    "/watch/sw.js",
    "/watch/manifest.webmanifest",
  ])
    assert.equal((await off.inject(url)).statusCode, 404);
  const manifest = (await app.inject("/watch/manifest.webmanifest")).json();
  assert.equal(manifest.scope, "/watch/");
  assert.equal(manifest.start_url, "/watch/");
  assert.equal(
    (await app.inject("/watch/sw.js")).headers["service-worker-allowed"],
    undefined,
  );
  assert.match(
    (await app.inject("/watch/")).headers["content-security-policy"],
    /worker-src 'self'/,
  );
  for (const url of [
    "/api/v1/admin/push",
    "/api/v1/subscriptions/unknown/endpoint",
  ])
    assert.equal(
      (await app.inject({ url, remoteAddress: "198.51.100.19" })).statusCode,
      403,
    );
  await assert.rejects(
    createApp({ flags: { PUSH_ALERTS: true }, store: new HistoryStore() }),
    /requiere/,
  );
});

test("receive eligibility uses native endpoint/key proof without exposing management secrets", async (t) => {
  const { send, enroll, store } = await apiSetup(t),
    { body, response } = await enroll();
  assert.equal(response.statusCode, 201);
  store.subscriptions.requestTest(
    response.json().id,
    body.management_token,
    crypto.randomUUID(),
  );
  const job = store.subscriptions.claim(),
    payload = { browser: body.browser, job_ids: job.payload.job_ids };
  const valid = await send("POST", "/api/v1/push/validate", payload);
  assert.equal(valid.statusCode, 200, valid.body);
  assert.deepEqual(valid.json(), { current: true });
  assert.equal(
    (
      await send("POST", "/api/v1/push/validate", payload, {
        origin: "https://evil.invalid",
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await send("POST", "/api/v1/push/validate", { ...payload, job_ids: [] }))
      .statusCode,
    400,
  );
  store.subscriptions.revoke(response.json().id, body.management_token);
  assert.deepEqual(
    (await send("POST", "/api/v1/push/validate", payload)).json(),
    { current: false },
  );
});
