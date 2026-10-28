import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";

const html = fs.readFileSync(new URL("../public/blackout.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../public/blackout.js", import.meta.url), "utf8");
async function setup(t, { live = false, reporting = false, transform = value => value } = {}) {
  const app = await createApp({ store: new HistoryStore(), flags: {
    PUBLIC_API_V1: true, BLACKOUT_MAP: true, BLACKOUT_DEMO: !live, CITIZEN_REPORTS: reporting,
  } });
  const dom = new JSDOM(reporting ? (await app.inject("/map")).body : html, { url: "http://localhost/map", runScripts: "outside-only" });
  const window = dom.window;
  const calls = [];
  let offline = false;
  window.fetch = async url => {
    calls.push(url);
    if (offline) throw new Error("offline");
    const response = await app.inject(url);
    return { ok: response.statusCode === 200, json: async () => transform(response.json(), url) };
  };
  window.eval(script);
  await window.AegisBlackout.ready;
  t.after(async () => { window.close(); await app.close(); });
  return { window, document: window.document, calls, setOffline(value) { offline = value; } };
}
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail("DOM did not reach expected state");
}

test("citizen view marks demo, shows all scenarios/dates and performs no map/font requests initially", async t => {
  const { document, calls } = await setup(t);
  assert.match(document.getElementById("mode-banner").textContent, /DATOS DE EJEMPLO/);
  assert.equal(document.querySelectorAll(".event-card").length, 3);
  const text = document.getElementById("event-list").textContent;
  assert.match(text, /Programación/); assert.match(text, /sin confirmar/); assert.match(text, /corregido/);
  assert.match(text, /Desconocido/); assert.match(text, /Ecuador/);
  assert.equal(calls.length, 1); assert.ok(calls[0].startsWith("/api/v1/outages"));
  assert.equal(document.getElementById("toggle-map").getAttribute("aria-expanded"), "false");
  assert.ok(document.querySelector('a[href="/ui"]'));
});

test("search selects the exact area, layer filter updates results and moves keyboard focus", async t => {
  const { window, document } = await setup(t);
  document.getElementById("area-search").value = "Pallatanga";
  await window.AegisBlackout.search();
  assert.equal(document.querySelectorAll("#area-options button").length, 4);
  const button = [...document.querySelectorAll("#area-options button")].find(element => element.textContent.includes("ejemplo B"));
  button.click();
  await until(() => document.getElementById("selected-area").textContent.includes("ejemplo B") && document.querySelectorAll(".event-card").length === 1);
  await until(() => document.activeElement.id === "results");
  assert.match(document.getElementById("event-list").textContent, /sin confirmar/);
  document.getElementById("layer").value = "official";
  document.getElementById("layer").dispatchEvent(new window.Event("change"));
  await until(() => document.getElementById("event-list").textContent.includes("Sin información verificada"));
  document.getElementById("clear-area").click();
  await until(() => document.querySelectorAll(".event-card").length === 1);
  assert.match(document.getElementById("event-list").textContent, /Programación/);
});

test("correction disclosure preserves original evidence and retraction without linking fake documents", async t => {
  const { document } = await setup(t);
  const details = document.querySelector(".event-card details");
  details.open = true;
  await until(() => document.querySelectorAll(".evidence-list li").length === 2);
  assert.match(details.textContent, /original/); assert.match(details.textContent, /retractación/);
  assert.match(details.textContent, /15:30|10:30/);
  assert.equal(details.querySelectorAll("a").length, 0);
});

test("network failure marks previous data stale; later empty response clears old figures", async t => {
  const page = await setup(t);
  page.setOffline(true); await page.window.AegisBlackout.refresh();
  assert.equal(page.document.querySelectorAll(".event-card").length, 3);
  assert.match(page.document.getElementById("request-status").textContent, /consulta anterior/);
  page.setOffline(false);
  page.document.getElementById("layer").value = "osint";
  await page.window.AegisBlackout.refresh();
  assert.equal(page.document.querySelectorAll(".event-card").length, 0);
  assert.match(page.document.getElementById("event-list").textContent, /Se desconoce el estado/);
});

test("unknown live coverage and map failure leave an accessible working list", async t => {
  const { window, document } = await setup(t, { live: true });
  assert.match(document.getElementById("mode-banner").textContent, /CONSULTA PÚBLICA/);
  assert.match(document.getElementById("event-list").textContent, /Sin información verificada/);
  // jsdom cannot import the map module; this exercises the same network/module-failure path.
  await window.AegisBlackout.showMap();
  assert.match(document.getElementById("map-status").textContent, /Mapa no disponible/);
  assert.equal(document.getElementById("event-list").getAttribute("aria-busy"), "false");
  assert.equal(document.getElementById("toggle-map").disabled, false);
});

test("external titles and evidence remain text, never executable HTML", async t => {
  const { document } = await setup(t, { transform(body, url) {
    if (url.includes("outages")) body.data[0].area_name = '<img src=x onerror="window.compromised=true">';
    if (url.includes("evidence")) {
      body.data[0].summary = "<svg onload='window.compromised=true'></svg>";
      body.data[0].source_name = "<script>attack</script>";
    }
    return body;
  } });
  assert.match(document.querySelector("h3").textContent, /<img/);
  document.querySelector("details").open = true;
  await until(() => document.querySelectorAll(".evidence-list li").length === 2);
  assert.equal(document.querySelectorAll(".event-card img,.event-card svg,.event-card script").length, 0);
  assert.match(document.querySelector(".evidence-list").textContent, /<svg/);
});

test("map shows moderated citizen aggregate separately without adding incidents or loading household pins", async t => {
  const page = await setup(t, { reporting: true, transform(body, url) {
    if (url.includes("report-summary")) return { ...body, suppressed: false, approved_reports: 3, outage_reports: 2, restoration_reports: 1 };
    return body;
  } });
  page.document.getElementById("area-search").value = "Pallatanga";
  await page.window.AegisBlackout.search();
  [...page.document.querySelectorAll("#area-options button")].find(button => button.textContent.includes("ejemplo A")).click();
  await until(() => page.document.querySelectorAll(".event-card").length === 1 && page.document.getElementById("citizen-summary").textContent.includes("3 aprobados"));
  assert.match(page.document.getElementById("citizen-summary").textContent, /No prueban independencia/);
  assert.match(page.document.getElementById("citizen-summary").textContent, /Consulta:/);
  assert.equal(page.calls.some(url => url.includes("geojson")), false);
  assert.ok(page.document.querySelector('a[href="/report"]'));
});
