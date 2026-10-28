// Optional local Chromium/TLS verification; mocked browser push, never sends to a provider.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  setupPush,
  browser as browserFixture,
} from "../test-support/push-fixture.js";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
const modulePath = process.env.AEGIS_PLAYWRIGHT_MODULE,
  executablePath = process.env.AEGIS_CHROMIUM;
if (!modulePath || !executablePath)
  throw new Error(
    "Configurar AEGIS_PLAYWRIGHT_MODULE y AEGIS_CHROMIUM externos; no se descargan navegadores",
  );
const { chromium } = await import(modulePath),
  cleanups = [],
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-watch-browser-"));
let browser, app, server, ticker;
try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      path.join(temporary, "key.pem"),
      "-out",
      path.join(temporary, "cert.pem"),
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
  server = https.createServer(
    {
      key: fs.readFileSync(path.join(temporary, "key.pem")),
      cert: fs.readFileSync(path.join(temporary, "cert.pem")),
    },
    (req, res) => app.routing(req, res),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `https://localhost:${server.address().port}`;
  const fixture = await setupPush({ after: (fn) => cleanups.push(fn) });
  fixture.schedule();
  ticker = setInterval(() => fixture.advance(1000), 1000);
  ticker.unref();
  app = await createApp({
    store: new HistoryStore(),
    now: fixture.now,
    mac: null,
    flags: {
      PUBLIC_API_V1: true,
      SQLITE_STORAGE: true,
      BLACKOUT_MAP: true,
      OFFICIAL_SCHEDULES: true,
      PUSH_ALERTS: true,
    },
    pushConfig: { ...fixture.config, origin },
    openV5Store: async () => fixture.store,
    fetchUrl: async () => {
      throw Error("offline");
    },
  });
  await app.ready();
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--ignore-certificate-errors",
      "--disable-background-networking",
    ],
  });
  fs.mkdirSync("artifacts", { recursive: true });
  const reports = [];
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      ignoreHTTPSErrors: true,
    });
    await context.addInitScript(
      ({ mock }) => {
        window.__pushCalls = 0;
        window.__mockSubscribed = false;
        const subscription = {
          ...mock,
          toJSON: () => mock,
          unsubscribe: async () => {
            window.__mockSubscribed = false;
            return true;
          },
        };
        PushManager.prototype.subscribe = function () {
          window.__pushCalls++;
          window.__mockSubscribed = true;
          return Promise.resolve(subscription);
        };
        PushManager.prototype.getSubscription = function () {
          return Promise.resolve(window.__mockSubscribed ? subscription : null);
        };
        Object.defineProperty(Notification, "permission", {
          get: () => "granted",
        });
      },
      { mock: browserFixture() },
    );
    const page = await context.newPage(),
      errors = [],
      external = [];
    let bytes = 0;
    page.on("pageerror", (error) => errors.push(error.name));
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== origin)
        external.push(new URL(request.url()).hostname);
    });
    page.on("response", async (response) => {
      try {
        bytes += (await response.body()).length;
      } catch {}
    });
    await page.goto(origin + "/watch/");
    await page.waitForFunction(() =>
      document
        .getElementById("verification-status")
        .textContent.includes("preparada"),
    );
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    assert.equal(await page.evaluate(() => window.__pushCalls), 0);
    await page.locator("#search").focus();
    await page.keyboard.type("Synthetic");
    await page.keyboard.press("Enter");
    await page.locator("#results button").first().focus();
    await page.keyboard.press("Enter");
    await page.locator("#selected input").fill(`Zona de ejemplo ${width}`);
    await page.locator("#consent").check();
    await page.locator("#scheduled").check();
    if (await page.locator("#answer-label").isVisible()) {
      const text = await page.locator("#answer-label").innerText(),
        m = text.match(/(\d+)\s*\+\s*(\d+)/);
      assert.ok(m);
      await page.locator("#answer").fill(String(Number(m[1]) + Number(m[2])));
    }
    await page.locator("#save-web").click();
    await page.waitForFunction(() =>
      document.getElementById("owner-code").value.startsWith("watch_"),
    );
    const code = await page.locator("#owner-code").inputValue();
    await page.locator("#hide-code").click();
    await page.locator("#consent").check();
    await page.locator("#push-consent").check();
    await page.locator("#enable-push").click();
    await page.waitForFunction(() =>
      document.getElementById("owner-state").textContent.includes("registrado"),
    );
    assert.equal(await page.evaluate(() => window.__pushCalls), 1);
    await page.locator("#test").click();
    await page.waitForFunction(() =>
      document.getElementById("status").textContent.includes("Prueba encolada"),
    );
    await page.locator("#forget").click();
    await page.locator("#management-code").fill(code);
    await page.locator("#load").click();
    await page.waitForFunction(() =>
      document.getElementById("owner-state").textContent.includes("activa"),
    );
    await page.locator("#query-date").fill("2026-10-22");
    await page.locator("#query").click();
    await page.locator("#schedules li").first().waitFor();
    assert.equal(await page.locator("#owner-code").inputValue(), "");
    assert.equal(await page.locator("#management-code").inputValue(), "");
    assert.equal(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
      0,
    );
    assert.ok(!page.url().includes(code));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `artifacts/aegis5-pr07-${width}.png`,
      fullPage: true,
      mask: [page.locator("#owner-code"), page.locator("#management-code")],
    });
    await page.locator("#revoke").click();
    await page.waitForFunction(() =>
      document.getElementById("status").textContent.includes("Baja completada"),
    );
    const cachePaths = await page.evaluate(async () => {
      const urls = [];
      for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys())
          urls.push(new URL(request.url).pathname);
      return urls;
    });
    assert.ok(cachePaths.every((p) => p.startsWith("/watch/")));
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() =>
      document
        .getElementById("availability")
        .textContent.includes("no disponible"),
    );
    assert.equal(errors.length, 0);
    assert.equal(external.length, 0);
    reports.push({
      width,
      overflow: false,
      push_calls: 1,
      private_inputs_empty: true,
      no_storage: true,
      offline_shell: true,
      cache_paths: cachePaths,
      transfer_bytes: bytes,
      external_requests: external.length,
      page_errors: errors.length,
    });
    await context.close();
  }
  fs.writeFileSync(
    "artifacts/aegis5-pr07-browser.json",
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports));
} finally {
  clearInterval(ticker);
  await browser?.close();
  await app?.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  fs.rmSync(temporary, { recursive: true, force: true });
}
