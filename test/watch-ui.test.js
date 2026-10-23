import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { setupPush, browser } from "../test-support/push-fixture.js";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
const code = fs.readFileSync(
  new URL("../public/watch/app.js", import.meta.url),
  "utf8",
);
const wait = async (predicate) => {
  for (let i = 0; i < 160; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("UI condition timeout");
};
async function page(t, { push = false, lost = false, link = false, select = true } = {}) {
  const ctx = await setupPush(t),
    { store, config, now } = ctx;
  const app = await createApp({
    store: new HistoryStore(),
    now,
    mac: null,
    flags: {
      PUBLIC_API_V1: true,
      SQLITE_STORAGE: true,
      BLACKOUT_MAP: true,
      OFFICIAL_SCHEDULES: true,
      PUSH_ALERTS: true,
    },
    pushConfig: config,
    openV5Store: async () => store,
    fetchUrl: async () => {
      throw Error("offline");
    },
  });
  const html = (await app.inject("/watch/")).body,
    dom = new JSDOM(html, {
      url: config.origin + "/watch/" + (link ? "?area_id=sector-0" : ""),
      runScripts: "outside-only",
    }),
    window = dom.window,
    requests = [];
  let subscribeCalls = 0,
    fail = lost,
    firstId = null;
  if (push) {
    const mock = browser(),
      subscription = {
        ...mock,
        toJSON: () => mock,
        unsubscribe: async () => true,
      },
      registration = {
        pushManager: {
          subscribe: () => {
            subscribeCalls++;
            return Promise.resolve(subscription);
          },
          getSubscription: async () => subscription,
        },
      };
    Object.defineProperty(window, "isSecureContext", { value: true });
    window.PushManager = class {};
    window.Notification = { permission: "default" };
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: {
        register: async () => registration,
        ready: Promise.resolve(registration),
      },
    });
  }
  window.fetch = async (url, options = {}) => {
    ctx.advance(1100);
    requests.push({ url, method: options.method, body: options.body });
    const response = await app.inject({
      method: options.method || "GET",
      url,
      headers: { ...options.headers, origin: config.origin },
      ...(options.body ? { payload: options.body } : {}),
      remoteAddress: "198.51.100.11",
    });
    if (url === "/api/v1/subscriptions" && options.method === "POST" && fail) {
      fail = false;
      firstId = response.json().id;
      throw new Error("Connection lost after server commit");
    }
    return {
      ok: response.statusCode < 400,
      status: response.statusCode,
      json: async () => response.json(),
    };
  };
  window.eval(code);
  t.after(async () => {
    await app.close();
    await new Promise((r) => setTimeout(r, 0));
    window.close();
  });
  const $ = (id) => window.document.getElementById(id);
  await wait(() => $("verification-status").textContent.includes("preparada"));
  if(select){
  $("search-button").click();
  await wait(() => $("results").querySelector("button"));
  $("results").querySelector("button").click();
  await wait(() => !$("save-web").disabled);
  }
  return {
    ...ctx,
    dom,
    window,
    $,
    requests,
    subscribeCalls: () => subscribeCalls,
    firstId: () => firstId,
  };
}

test("web fallback creates, reloads and deletes via private code without Storage/URL persistence or alias HTML execution", async (t) => {
  const { $, window, requests } = await page(t);
  $("selected").querySelector("input").value = "<b>private</b>";
  $("selected").querySelector("input").dispatchEvent(new window.Event("input"));
  $("consent").checked = true;
  $("save-web").click();
  await wait(() => $("owner-code").value.startsWith("watch_"));
  const code = $("owner-code").value;
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);
  assert.equal(window.location.href.includes(code), false);
  assert.equal($("selected").querySelector("b"), null);
  $("hide-code").click();
  assert.equal($("owner-code").value, "");
  $("forget").click();
  $("management-code").value = code;
  $("load").click();
  await wait(() => $("owner-state").textContent.includes("activa"));
  assert.equal($("management-code").value, "");
  assert.equal($("selected").querySelector("input").value, "<b>private</b>");
  $("revoke").click();
  await wait(() => $("status").textContent.includes("Baja completada"));
  assert.equal($("owner-code").value, "");
  assert.ok(requests.every((r) => !r.url.includes(code.split(".")[1])));
});

test("browser subscription is invoked only from explicit click and opt-in; no permission requested on load", async (t) => {
  const { $, subscribeCalls, window } = await page(t, { push: true });
  assert.equal(subscribeCalls(), 0);
  $("enable-push").click();
  assert.equal(subscribeCalls(), 0);
  $("consent").checked = true;
  $("push-consent").checked = true;
  $("scheduled").checked = true;
  $("enable-push").click();
  assert.equal(subscribeCalls(), 1);
  await wait(() => $("owner-code").value.startsWith("watch_"));
  assert.match($("owner-state").textContent, /registrado/);
  $("hide-code").click();
  $("test").click();
  await wait(() => $("status").textContent.includes("Prueba encolada"));
  assert.match($("availability").textContent, /desactivado/);
  window.Notification.permission = "denied";
  $("consent").checked = true;
  $("enable-push").click();
  assert.equal(subscribeCalls(), 1);
  assert.match($("status").textContent, /bloqueadas/);
});

test("uncertain create retries the identical request/token without another subscription or an editable pending payload", async (t) => {
  const { $, requests, firstId } = await page(t, { lost: true });
  $("consent").checked = true;
  $("save-web").click();
  await wait(() => $("status").textContent.includes("incierta"));
  assert.equal($("selected").querySelector("input").disabled, true);
  assert.match($("save-web").textContent, /Reintentar/);
  $("save-web").click();
  await wait(() => $("owner-code").value.startsWith("watch_"));
  const posts = requests.filter(
    (r) => r.url === "/api/v1/subscriptions" && r.method === "POST",
  );
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body, posts[1].body);
  assert.equal($("owner-code").value.split(".")[0], firstId());
  $("hide-code").click();
});

function worker({ current = true, clients = [] } = {}) {
  const listeners = {},
    notifications = [],
    opened = [],
    deleted = [],
    shell = [];
  const context = {
    URL,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url) => {
      if (url === "/api/v1/push/validate") return Response.json({ current });
      throw Error("offline");
    },
    caches: {
      open: async () => ({ addAll: async (urls) => shell.push(...urls) }),
      keys: async () => ["aegis-watch-v0", "other-cache"],
      delete: async (key) => deleted.push(key),
      match: async (key) => new Response(key),
    },
    self: {
      location: { origin: "https://watch.example" },
      addEventListener: (name, fn) => (listeners[name] = fn),
      registration: {
        pushManager: { getSubscription: async () => ({ toJSON: browser }) },
        showNotification: async (title, options) =>
          notifications.push({ title, ...options }),
        unregister: async () => true,
      },
      clients: {
        claim: async () => {},
        matchAll: async () => clients,
        openWindow: async (url) => opened.push(url),
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(new URL("../public/watch/sw.js", import.meta.url), "utf8"),
    context,
  );
  return { listeners, notifications, opened, deleted, shell };
}
test("service worker caches only scoped static shell, leaves APIs/v4 untouched and removes only its own old caches", async () => {
  const w = worker();
  let pending;
  w.listeners.install({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.ok(
    w.shell.every((url) => url.startsWith("/watch/") && !url.includes("api")),
  );
  w.listeners.activate({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.deepEqual(w.deleted, ["aegis-watch-v0"]);
  let handled = false;
  for (const url of [
    "https://watch.example/api/v1/subscriptions/private",
    "https://watch.example/ui",
  ])
    w.listeners.fetch({
      request: { url, method: "GET" },
      respondWith: () => (handled = true),
    });
  assert.equal(handled, false);
  w.listeners.fetch({
    request: { url: "https://watch.example/watch/", method: "GET" },
    respondWith: (p) => (pending = p),
  });
  assert.equal(await (await pending).text(), "/watch/");
});
test("service worker renders plain notification text and restricts notification clicks to the same watch scope", async () => {
  const w = worker();
  let pending;
  w.listeners.push({
    data: {
      json: () => ({
        title: "<img>",
        body: "Plain text",
        url: "https://evil.invalid/private",
        tag: "event",
        job_ids: ["job_test"],
      }),
    },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.equal(w.notifications[0].title, "<img>");
  assert.equal(w.notifications[0].data.url, "https://watch.example/watch/");
  w.listeners.notificationclick({
    notification: { close() {}, data: { url: "/api/status" } },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.deepEqual(w.opened, ["https://watch.example/watch/"]);
});

test("stale notification omits hours and clicking a live watch preserves its private RAM session", async () => {
  let focused = false,
    message,
    pending;
  const w = worker({
    current: false,
    clients: [
      {
        url: "https://watch.example/watch/",
        postMessage: (v) => {
          message = v;
        },
        focus: async () => {
          focused = true;
        },
        navigate: () => {
          throw Error("must not erase session");
        },
      },
    ],
  });
  w.listeners.push({
    data: {
      json: () => ({
        title: "Old 09:00",
        body: "Old hours 09:00 to 10:00",
        job_ids: ["job_test"],
        url: "/watch/?area_id=sector-0",
      }),
    },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.ok(!w.notifications[0].body.includes("09:00"));
  assert.match(w.notifications[0].title, /versión vigente/);
  w.listeners.notificationclick({
    notification: { close() {}, data: { url: "/watch/?area_id=sector-0" } },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.equal(focused, true);
  assert.equal(message.type, "schedule-update");
});

test('notification deep link queries its public sector without changing private saved selections',async t=>{
 const {$,requests}=await page(t,{link:true,select:false});await wait(()=>$('schedules').textContent.includes('Synthetic area 0'));assert.equal($('selected').children.length,0);assert.match($('linked-sector').textContent,/No cambia tus preferencias/);assert.ok(requests.some(r=>r.url.startsWith('/api/v1/areas?id=sector-0')));
});
