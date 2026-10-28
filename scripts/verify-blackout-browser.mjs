// Optional browser verification. Uses an externally installed Playwright; no runtime dependency.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";

const { chromium } = await import(process.env.AEGIS_PLAYWRIGHT_MODULE || "playwright");
const app = await createApp({ store: new HistoryStore(), mac: null,
  fetchUrl: async () => ({ status: 503, data: "" }),
  flags: { PUBLIC_API_V1: true, BLACKOUT_MAP: true, BLACKOUT_DEMO: true },
});
let browser;
const report = { viewports: [], pageErrors: [], externalRequests: [] };
try {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ headless: true,
    ...(process.env.AEGIS_CHROMIUM ? { executablePath: process.env.AEGIS_CHROMIUM } : {}), args: ["--no-sandbox"],
  });
  fs.mkdirSync("artifacts", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: "reduce" });
    const page = await context.newPage(), requests = [];
    page.on("pageerror", error => report.pageErrors.push(error.message));
    page.on("request", request => { requests.push(request.url()); if (!request.url().startsWith(base)) report.externalRequests.push(request.url()); });
    await page.goto(`${base}/map`);
    await page.waitForFunction(() => document.querySelectorAll(".event-card").length === 3);
    assert.equal(await page.locator(".mode-banner").textContent().then(text => text.includes("DATOS DE EJEMPLO")), true);
    assert.equal(requests.some(url => /geojson|blackout-map/.test(url)), false, "map loads only after a user gesture");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
    await page.getByLabel("Provincia, cantón, parroquia o sector").fill("Pallatanga");
    await page.getByLabel("Provincia, cantón, parroquia o sector").press("Enter");
    const sector = page.getByRole("button", { name: /Sector de ejemplo B/ });
    await sector.focus(); await sector.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll(".event-card").length === 1 && document.activeElement.id === "results");
    await page.getByLabel("Tipo de fuente").selectOption("official");
    await page.getByText("Sin información verificada para este ámbito o filtro.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Quitar filtro de área" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".event-card").length === 1);
    await page.getByLabel("Tipo de fuente").selectOption("");
    await page.waitForFunction(() => document.querySelectorAll(".event-card").length === 3);
    await page.getByRole("button", { name: "Cargar mapa ligero" }).click();
    const marker = page.getByRole("button", { name: /Pallatanga.*fichas de esta página/ });
    await marker.waitFor(); await marker.focus(); await marker.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "results");
    await page.getByRole("button", { name: "Acercar mapa" }).click();
    assert.notEqual(await page.locator("#map-canvas svg").getAttribute("viewBox"), "0 0 520 500");
    await page.getByRole("button", { name: "Restablecer vista" }).click();
    assert.equal(await page.locator("#map-canvas svg").getAttribute("viewBox"), "0 0 520 500");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `map overflow at ${width}`);
    const correction = page.locator(".event-card").filter({ hasText: "Reporte corregido por su autor" });
    await correction.locator("summary").focus(); await correction.locator("summary").press("Enter");
    await page.getByText("Corrección / retractación · Reporte ciudadano sintético", { exact: true }).waitFor();
    assert.equal(await correction.locator(".evidence-list li").count(), 2);
    await correction.locator("summary").press("Enter");
    await page.screenshot({ path: `artifacts/aegis5-pr03-${width}.png`, fullPage: true });
    const transfer = await page.evaluate(() => [...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource")]
      .reduce((total, item) => total + item.transferSize, 0));
    report.viewports.push({ width, overflow: false, keyboard: true, map: true, correction: true, transferBytesIncludingInteractions: transfer });
    await context.close();
  }
  const page = await browser.newPage({ viewport: { width: 320, height: 960 } });
  page.on("pageerror", error => report.pageErrors.push(error.message));
  await page.route("**/assets/map/ecuador.geojson", route => route.abort());
  await page.goto(`${base}/map`);
  await page.waitForFunction(() => document.querySelectorAll(".event-card").length === 3);
  await page.getByRole("button", { name: "Cargar mapa ligero" }).click();
  await page.getByText("Mapa no disponible.", { exact: false }).waitFor();
  assert.equal(await page.locator(".event-card").count(), 3);
  await page.route("**/api/v1/outages?**", route => route.abort());
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await page.getByText("Se conservan las fichas de la consulta anterior", { exact: false }).waitFor();
  assert.equal(await page.locator(".event-card").count(), 3);
  report.mapFailurePreservesList = true; report.networkFailureMarksStale = true;
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.externalRequests, []);
  fs.writeFileSync("artifacts/aegis5-pr03-browser.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { if (browser) await browser.close(); await app.close(); }
