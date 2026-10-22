// Optional local browser QA. Never writes private receipt codes to artifacts or logs.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
const { chromium } = await import(process.env.AEGIS_PLAYWRIGHT_MODULE || "playwright");
const app = await createApp({ store: new HistoryStore(), mac: null,
  flags: { PUBLIC_API_V1: true, BLACKOUT_MAP: true, BLACKOUT_DEMO: true, CITIZEN_REPORTS: true },
});
let browser;
const report = { viewports: [], pageErrors: [], externalRequests: [], receiptInUrl: false };
try {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"],
    ...(process.env.AEGIS_CHROMIUM ? { executablePath: process.env.AEGIS_CHROMIUM } : {}),
  });
  fs.mkdirSync("artifacts", { recursive: true });
  const widths = [320, 390, 768, 1440];
  for (const [index, width] of widths.entries()) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: "reduce" });
    const page = await context.newPage(), urls = [];
    page.on("pageerror", error => report.pageErrors.push(error.message));
    page.on("request", request => { urls.push(request.url()); if (!request.url().startsWith(base)) report.externalRequests.push(request.url()); });
    await page.goto(`${base}/report`);
    await page.getByText("DEMO · Envíos sintéticos", { exact: false }).waitFor();
    assert.equal(await page.getByRole("checkbox", { name: /Acepto el uso/ }).isChecked(), false);
    await page.getByLabel("Buscar sector por nombre o localidad").fill("Pallatanga");
    await page.getByLabel("Buscar sector por nombre o localidad").press("Enter");
    const sector = page.getByRole("button", { name: /Sector de ejemplo A/ });
    await sector.focus(); await sector.press("Enter");
    await page.getByRole("checkbox", { name: /Confirmo que este es el sector/ }).check();
    await page.getByRole("checkbox", { name: /Acepto el uso/ }).check();
    const local = new Date(Date.now() - 5 * 3600000 - (index + 1) * 60000).toISOString().slice(0, 16);
    await page.getByLabel("Hora en que lo notaste", { exact: false }).fill(local);
    await page.waitForFunction(() => !document.getElementById("send-report").disabled);
    if (await page.locator("#question-group").isVisible()) {
      const question = await page.locator("#question-label").textContent(), digits = question.match(/(\d+) \+ (\d+)/);
      await page.locator("#challenge-answer").fill(String(Number(digits[1]) + Number(digits[2])));
    }
    await page.getByRole("button", { name: "Enviar a revisión", exact: true }).click();
    await page.getByText("Reporte recibido, pendiente de revisión.", { exact: false }).waitFor();
    const code = await page.locator("#private-receipt").inputValue();
    assert.equal(/^r_[a-f0-9-]{36}\.[a-zA-Z0-9_-]{43}$/.test(code), true, "Receipt format");
    const token = code.split(".")[1];
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await page.getByLabel("Código privado completo").fill(code);
    await page.getByRole("button", { name: "Consultar mi reporte", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("management-code").value === "" && document.getElementById("private-receipt").value === "");
    assert.equal(await page.locator("#receipt-panel").isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${width}`);
    // Both code fields are now cleared by the application, not merely hidden for QA.
    await page.screenshot({ path: `artifacts/aegis5-pr04-${width}.png`, fullPage: true });
    await page.getByRole("checkbox", { name: /Confirmo que este es el sector/ }).check();
    await page.getByRole("checkbox", { name: /Acepto el uso/ }).check();
    await page.getByLabel("Estado observado").selectOption("restored");
    await page.getByLabel("Motivo de la corrección").selectOption("changed_state");
    await page.getByRole("button", { name: "Guardar corrección", exact: true }).click();
    await page.getByText("Corrección recibida.", { exact: false }).waitFor();
    await page.getByRole("checkbox", { name: /Quiero retirar/ }).check();
    await page.getByRole("button", { name: "Retirar mi reporte", exact: true }).click();
    await page.getByText("Reporte retirado.", { exact: false }).waitFor();
    assert.equal(urls.some(url => url.includes(token)), false); report.receiptInUrl ||= urls.some(url => url.includes(token));
    report.viewports.push({ width, overflow: false, explicitConsent: true, create: true, ownerAccess: true,
      correction: true, withdrawal: true, screenshotContainsReceipt: false });
    await context.close();
  }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.externalRequests, []);
  fs.writeFileSync("artifacts/aegis5-pr04-browser.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { if (browser) await browser.close(); await app.close(); }
