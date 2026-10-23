import fs from "node:fs";
import assert from "node:assert/strict";
import { setupTimeline } from "../test-support/timeline-fixture.js";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
const { chromium } = await import(
    process.env.AEGIS_PLAYWRIGHT_MODULE || "playwright"
  ),
  clean = [];
const context = await setupTimeline({ after: (fn) => clean.push(fn) }),
  one = context.add("original");
context.store.schedules.ingest({
  provider_id: "eeasa-maintenance",
  body: fs.readFileSync(
    new URL("../test/fixtures/schedules/eeasa-v1.html", import.meta.url),
  ),
});
for (const row of context.store.schedules
  .queue()
  .filter((r) => r.type === "maintenance")) {
  context.store.schedules.bind({
    provider_id: "eeasa-maintenance",
    sector_label: row.sector_label,
    area_id: "area",
    reference_url: "https://www.eeasa.com.ec/trabajos-programadas/",
    review_reason: "Synthetic exact geography",
  });
  context.store.schedules.review({
    revision_id: row.id,
    decision: "reviewed",
    rights_reviewed: true,
    review_reason: "Synthetic source rights review",
  });
}
context.set("2026-10-22T12:10:00Z");
context.add("correction", "retraction", one.event.id, "original");
const app = await createApp({
  store: new HistoryStore(),
  now: context.now,
  mac: null,
  flags: {
    PUBLIC_API_V1: true,
    BLACKOUT_MAP: true,
    SQLITE_STORAGE: true,
    TIME_MACHINE: true,
    OFFICIAL_SCHEDULES: true,
  },
  openV5Store: async () => context.store,
});
let browser;
const report = [];
try {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.AEGIS_CHROMIUM
      ? { executablePath: process.env.AEGIS_CHROMIUM }
      : {}),
  });
  fs.mkdirSync("artifacts", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }),
      errors = [],
      external = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!r.url().startsWith(base)) external.push(r.url());
    });
    await page.goto(base + "/history/");
    await page.locator("#search").fill("replay");
    await page.locator("#find").click();
    const area = page.getByRole("button", {
      name: "Área sintética de replay",
      exact: true,
    });
    await area.focus();
    await area.press("Enter");
    await page.locator("#from").fill("2026-10-22");
    await page.locator("#to").fill("2026-10-22");
    await page.locator("#known").fill("2026-10-22T07:05");
    await page.getByRole("button", { name: "Consultar revisión" }).click();
    await page
      .getByText("Estado registrado: Reportado · revisión 1", { exact: true })
      .waitFor();
    await page.locator("#known").fill("2026-10-22T07:10");
    await page.getByRole("button", { name: "Consultar revisión" }).click();
    await page
      .getByText("Estado registrado: Desconocido · revisión 2", { exact: true })
      .waitFor();
    await page.locator("#compare-planned").click();
    await page
      .getByText("No acredita duración efectiva.", { exact: false })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await page.screenshot({
      path: `artifacts/aegis5-pr10-${width}.png`,
      fullPage: true,
    });
    report.push({
      width,
      overflow: false,
      keyboard: true,
      replay: true,
      errors: 0,
      external: 0,
    });
    await page.close();
  }
  fs.writeFileSync(
    "artifacts/aegis5-pr10-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await app.close();
  for (const fn of clean.reverse()) await fn();
}
