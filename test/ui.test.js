import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { buildAssessment } from "../assessment.js";
const html = fs.readFileSync(
  new URL("../frontend.html", import.meta.url),
  "utf8",
);
const script = fs.readFileSync(
  new URL("../public/app.js", import.meta.url),
  "utf8",
);
const fixture = () => {
  const now = new Date();
  const timestamp = now.toISOString();
  const dams = {
    mazar: {
      cotaMsnm: 2130,
      caudalEntradaM3s: 30,
      caudalTimestamp: timestamp,
      timestamp,
      changeMPerDay: -2,
      trend: "En descenso",
      trendHours: 12,
      daysToShutdown: 7.5,
      history: [
        {
          loctimestamp: new Date(now - 12 * 3600000).toISOString(),
          valueedit: 2131,
        },
        { loctimestamp: timestamp, valueedit: 2130 },
      ],
    },
  };
  const data = {
    timestamp,
    dams,
    weather: { error: "Sin conexión" },
    forecast: { error: "Sin pronóstico" },
    enso: { error: "Sin datos" },
    cenace: { error: "Sin datos" },
  };
  data.assessment = buildAssessment(data, now);
  return data;
};
async function setup(t, data) {
  const dom = new JSDOM(html, {
    url: "https://aegis.example/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  dom.window.Chart = class {
    constructor(canvas, config) {
      this.config = config;
    }
    destroy() {}
  };
  dom.window.fetch = async () => ({ ok: true, json: async () => data });
  dom.window.AbortSignal.timeout = () => undefined;
  dom.window.eval(script);
  await new Promise((resolve) => setTimeout(resolve, 15));
  return dom.window;
}
test("widget usa el descenso real, muestra evaluación parcial y estado de fuente ausente", async (t) => {
  const window = await setup(t, fixture());
  const doc = window.document;
  assert.match(doc.getElementById("maz-days").textContent, /7,5/);
  assert.equal(doc.getElementById("energy-status").textContent, "Atención");
  assert.equal(
    doc.getElementById("local-status").textContent,
    "Datos incompletos",
  );
  assert.match(
    doc.getElementById("maz-projection").textContent,
    /No es fecha de apagón/,
  );
  assert.equal(doc.getElementById("rain-empty").hidden, false);
  assert.match(window.Aegis.shareText(), /Señales y escenarios/);
});
test("una respuesta nueva vacía limpia cifras anteriores y no interpreta null como cero", async (t) => {
  const window = await setup(t, fixture());
  const empty = { timestamp: new Date().toISOString() };
  empty.assessment = buildAssessment(empty);
  window.Aegis.render(empty);
  assert.equal(window.document.getElementById("maz-level").textContent, "—");
  assert.equal(
    window.document.getElementById("maz-days").textContent,
    "Sin proyección",
  );
  assert.equal(window.document.getElementById("hydro-share").textContent, "—");
  assert.equal(
    window.document.getElementById("energy-overview").dataset.level,
    "unknown",
  );
});
test("nombres de fuentes externos se muestran como texto, nunca HTML ejecutable", async (t) => {
  const data = fixture();
  data.cenace = {
    hydroGenerators: [
      { central: '<img src=x onerror="alert(1)">', generationMWh: 100 },
    ],
  };
  const window = await setup(t, data);
  const container = window.document.getElementById("central-list");
  assert.equal(container.querySelector("img"), null);
  assert.match(container.textContent, /<img/);
});

test("las vistas responden a 1–5 y cambian paneles reales sin duplicar gráficos", async (t) => {
  const window = await setup(t, fixture());
  window.document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "2", bubbles: true }),
  );
  assert.equal(window.document.body.dataset.view, "energy");
  assert.equal(
    window.document.querySelector('[data-workspace="energy"]').hidden,
    false,
  );
  assert.equal(
    window.document.getElementById("energy-panel").closest("[data-workspace]")
      .dataset.workspace,
    "energy",
  );
  window.Aegis.setView("overview");
  assert.equal(
    window.document.getElementById("energy-panel").closest("[data-workspace]")
      .dataset.workspace,
    "overview",
  );
  assert.equal(window.document.querySelectorAll("#maz-chart").length, 1);
});
test("los hotkeys de vista no interrumpen escritura ni atajos del navegador", async (t) => {
  const window = await setup(t, fixture());
  const input = window.document.getElementById("command-input");
  input.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "3", bubbles: true }),
  );
  assert.equal(window.document.body.dataset.view, "overview");
  const event = new window.KeyboardEvent("keydown", {
    key: "r",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.document.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
});
test("enlace profundo de vista e inspector permiten consultar los datos originales", async (t) => {
  const window = await setup(t, fixture());
  for (const dialog of window.document.querySelectorAll("dialog")) {
    dialog.showModal = function () {
      this.setAttribute("open", "");
    };
    dialog.close = function () {
      this.removeAttribute("open");
    };
  }
  window.Aegis.setView("energy");
  assert.equal(window.location.hash, "#energy");
  window.Aegis.openDetail("mazar");
  assert.equal(window.document.getElementById("detail-dialog").open, true);
  assert.match(
    window.document.getElementById("detail-content").textContent,
    /2130|2\.130/,
  );
  assert.equal(
    window.document.querySelectorAll("#detail-content tbody tr").length,
    2,
  );
});
test("paleta filtra, ejecuta y devuelve foco al workspace para continuar con teclado", async (t) => {
  const window = await setup(t, fixture());
  for (const dialog of window.document.querySelectorAll("dialog")) {
    dialog.showModal = function () {
      this.setAttribute("open", "");
    };
    dialog.close = function () {
      this.removeAttribute("open");
    };
  }
  window.Aegis.openCommands();
  const input = window.document.getElementById("command-input");
  input.value = "energy";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.querySelectorAll(".command-row").length, 1);
  input.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(window.document.body.dataset.view, "energy");
  assert.equal(window.document.getElementById("command-dialog").open, false);
  assert.equal(window.document.activeElement.id, "workspace");
});
