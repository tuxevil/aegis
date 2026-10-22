import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";

const html = fs.readFileSync(new URL("../public/report.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../public/report.js", import.meta.url), "utf8");
async function setup(t, transform = value => value) {
  let clock = Date.parse("2026-10-21T18:00:00Z"), simulateLostResponse = false, submitted;
  const app = await createApp({ store: new HistoryStore(), now: () => new Date(clock), flags: {
    PUBLIC_API_V1: true, BLACKOUT_MAP: true, BLACKOUT_DEMO: true, CITIZEN_REPORTS: true,
  } });
  const window = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/report" }).window;
  const calls = [];
  window.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method });
    clock += 2000;
    const response = await app.inject({ url, method: options.method || "GET", headers: {
      origin: "http://localhost", ...options.headers,
    }, ...(options.body === undefined ? {} : { payload: options.body }) });
    if (url === "/api/v1/reports" && response.statusCode === 201) {
      submitted = JSON.parse(options.body);
      if (simulateLostResponse) { simulateLostResponse = false; throw new Error("response lost after commit"); }
    }
    return { ok: response.statusCode < 400, status: response.statusCode, json: async () => transform(response.json(), url) };
  };
  window.eval(script); await window.AegisReports.ready;
  t.after(async () => {
    await app.close();
    // Let fire-and-forget summary responses settle before destroying the DOM.
    await new Promise(resolve => setTimeout(resolve, 0));
    window.close();
  });
  return { window, document: window.document, calls, getSubmitted: () => submitted, loseNextResponse() { simulateLostResponse = true; } };
}
async function until(check) {
  for (let i = 0; i < 400; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail("Expected DOM state not reached");
}
async function choose(page, query = "Pallatanga") {
  page.document.getElementById("sector-query").value = query;
  await page.window.AegisReports.search();
  page.document.querySelector("#sector-options button").click();
  page.document.getElementById("sector-confirm").checked = true;
  page.document.getElementById("report-consent").checked = true;
}

test("report UI requires explicit sector/consent, marks demo and shows the private code only to the creator", async t => {
  const page = await setup(t), d = page.document;
  assert.match(d.getElementById("report-mode").textContent, /DEMO/);
  assert.equal(d.getElementById("report-consent").checked, false);
  await page.window.AegisReports.submit(); assert.match(d.getElementById("report-status").textContent, /sector|comprobación/);
  assert.equal(page.calls.filter(call => call.url === "/api/v1/reports").length, 0);
  await choose(page); await until(() => !d.getElementById("send-report").disabled);
  await page.window.AegisReports.submit();
  assert.equal(d.getElementById("receipt-panel").hidden, false);
  assert.match(d.getElementById("private-receipt").value, /^r_[a-f0-9-]{36}\.[a-zA-Z0-9_-]{43}$/);
  assert.match(d.getElementById("report-status").textContent, /pendiente de revisión/);
  assert.equal(page.window.localStorage.length, 0);
  for (const call of page.calls) assert.equal(call.url.includes(page.getSubmitted().receipt_token), false);
});

test("lost response retries the same cryptographic request and never creates a second report", async t => {
  const page = await setup(t); await choose(page); await until(() => !page.document.getElementById("send-report").disabled);
  page.loseNextResponse(); await page.window.AegisReports.submit(); const first = page.getSubmitted();
  assert.match(page.document.getElementById("report-status").textContent, /mismo envío/);
  assert.equal(page.document.getElementById("declaration").disabled, true);
  await page.window.AegisReports.submit();
  assert.equal(page.getSubmitted().request_id, first.request_id); assert.equal(page.getSubmitted().receipt_token, first.receipt_token);
  assert.equal(page.document.getElementById("receipt-panel").hidden, false);
});

test("creator can correct and withdraw, with revision and explicit withdrawal confirmation", async t => {
  const page = await setup(t), d = page.document; await choose(page); await until(() => !d.getElementById("send-report").disabled);
  await page.window.AegisReports.submit();
  const code = d.getElementById("private-receipt").value;
  d.getElementById("sector-confirm").checked = true; d.getElementById("report-consent").checked = true;
  d.getElementById("correction-reason").value = "changed_state"; d.getElementById("declaration").value = "restored";
  await page.window.AegisReports.submit();
  assert.match(d.getElementById("manage-status").textContent, /revisión 2/);
  assert.equal(d.getElementById("private-receipt").value, code);
  await page.window.AegisReports.withdraw(); assert.match(d.getElementById("manage-status").textContent, /Marca/);
  d.getElementById("withdraw-confirm").checked = true; await page.window.AegisReports.withdraw();
  assert.match(d.getElementById("report-status").textContent, /retirado/); assert.equal(d.getElementById("send-report").disabled, true);
});

test("receipt loads in an authorization header, is cleared from inputs and cannot be embedded in a URL", async t => {
  const page = await setup(t), d = page.document; await choose(page); await until(() => !d.getElementById("send-report").disabled);
  await page.window.AegisReports.submit(); const code = d.getElementById("private-receipt").value;
  d.getElementById("management-code").value = code; await page.window.AegisReports.load();
  assert.equal(d.getElementById("management-code").value, ""); assert.equal(d.getElementById("private-receipt").value, "");
  assert.match(d.getElementById("manage-status").textContent, /En revisión/);
  assert.ok(page.calls.every(call => !call.url.includes(code.split(".")[1])));
});

test("area and policy text never execute HTML; ambiguous search cannot submit", async t => {
  const page = await setup(t, (body, url) => {
    if (url.includes("areas?")) body.data[0].name = '<img src=x onerror="attack()">';
    if (url.includes("reports/config")) body.policy.purpose = '<svg onload="attack()"></svg>';
    return body;
  });
  page.document.getElementById("sector-query").value = "Pallatanga"; await page.window.AegisReports.search();
  assert.equal(page.document.querySelectorAll("#policy-content svg,#sector-options img").length, 0);
  assert.match(page.document.getElementById("policy-content").textContent, /<svg/);
  assert.match(page.document.getElementById("sector-options").textContent, /<img/);
  await page.window.AegisReports.submit(); assert.equal(page.calls.filter(call => call.url === "/api/v1/reports").length, 0);
});
