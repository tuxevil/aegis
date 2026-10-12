import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HistoryStore } from "../history.js";
import {
  parseCenace,
  parseEnso,
  parseWeather,
  parseForecast,
  decodePlotlyY,
} from "../sources.js";
import { assessEnergy, assessLocal } from "../assessment.js";
const now = new Date("2026-10-12T21:00:00Z");
const stamp = (hours) => new Date(now - hours * 3600000).toISOString();
const weather = { timestamp: stamp(0), rainDailyMm: 1, rainRateMmHr: 0 };

test("CENACE selecciona hoy, no el gráfico mensual con más centrales", () => {
  const result = parseCenace(
    fs.readFileSync(new URL("./fixtures/cenace.html", import.meta.url), "utf8"),
    now,
  );
  assert.equal(result.sourceDate, "2026-10-12");
  assert.equal(result.observedAt, "2026-10-12T15:30:00-05:00");
  assert.equal(
    result.hydroGenerators.find((g) => g.central === "Coca Codo").generationMWh,
    11031,
  );
  assert.equal(
    result.hydroGenerators.find((g) => g.central === "Mazar").generationMWh,
    766,
  );
  assert.equal(result.hourly.labels.length, 48);
  assert.equal(result.hourly.series["DEMANDA NACIONAL"].at(-1), null);
  assert.equal(result.composition["hidroeléctrica"], 42057.64);
});
test("CENACE nunca inventa fecha de origen si desaparece el encabezado", () => {
  const html = fs
    .readFileSync(new URL("./fixtures/cenace.html", import.meta.url), "utf8")
    .replaceAll(/<span>[^<]+<\/span>/g, "");
  const result = parseCenace(html, now);
  assert.equal(result.sourceDate, null);
  assert.equal(result.observedAt, null);
});
test("arrays Plotly enteros y NaN se decodifican sin confundir ausencia con cero", () => {
  const buffer = Buffer.alloc(8);
  buffer.writeInt32LE(1200);
  buffer.writeInt32LE(0, 4);
  assert.deepEqual(
    decodePlotlyY({ dtype: "i4", bdata: buffer.toString("base64") }),
    [1200, 0],
  );
  assert.deepEqual(decodePlotlyY([1, null, NaN]), [1, null, null]);
});
test("NOAA: una semana cálida no inventa diagnóstico oficial ni super El Niño", () => {
  const text =
    "30SEP2026 1.8 1.2 1.6 .2\n07OCT2026 4.4 3.4 2.4 .2\n14OCT2026 9 9 9 9";
  const result = parseEnso(text, null, now);
  assert.equal(result.official, null);
  assert.equal(result.nino12SSTA, 4.4);
  assert.equal(result.series.length, 2);
  const bulletin =
    "<p>8 October 2026</p><p>ENSO Alert System Status: El Niño Advisory</p>";
  assert.equal(
    parseEnso(text, bulletin, now).official.label,
    "El Niño confirmado",
  );
});
test("Mazar advierte caída rápida antes de 2115 y declara evaluación parcial", () => {
  const result = assessEnergy(
    {
      mazar: {
        timestamp: stamp(0),
        cotaMsnm: 2130,
        changeMPerDay: -1,
        daysToShutdown: 15,
      },
    },
    null,
    now,
  );
  assert.equal(result.level, "elevated");
  assert.ok(result.missing.includes("Disponibilidad adicional de térmicas"));
});
test("el caudal reciente descendente participa en la evaluación junto al nivel", () => {
  const result = assessEnergy(
    {
      mazar: {
        timestamp: stamp(0),
        cotaMsnm: 2130,
        changeMPerDay: -0.2,
        daysToShutdown: 75,
        caudalTimestamp: stamp(0),
        caudalEntradaM3s: 30,
        inflowHistory: [{ loctimestamp: stamp(24), valueedit: 60 }],
      },
    },
    null,
    now,
  );
  assert.equal(result.level, "elevated");
  assert.match(result.title, /Menos entrada/);
  assert.match(result.reasons.at(-1), /50%/);
});
test("datos viejos o ausentes no muestran tranquilidad ni emergencia actual inventada", () => {
  assert.equal(
    assessEnergy({ mazar: { timestamp: stamp(6), cotaMsnm: 2110 } }, null, now)
      .level,
    "unknown",
  );
  assert.equal(assessEnergy(null, null, now).level, "unknown");
  assert.equal(
    assessLocal({ timestamp: stamp(6), rainRateMmHr: 0 }, null, now).level,
    "unknown",
  );
});
test("lluvia observada y previsión se evalúan por separado, sin probabilidad de deslave", () => {
  assert.equal(
    assessLocal({ ...weather, rainRateMmHr: 10 }, null, now).level,
    "elevated",
  );
  const forecast = {
    retrievedAt: stamp(0),
    hours: Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(now.getTime() + i * 3600000).toISOString(),
      precipitationMm: 1,
    })),
  };
  const result = assessLocal(weather, forecast, now);
  assert.equal(result.rainTomorrow, 24);
  assert.equal(result.level, "watch");
});
test("estación conserva cero, omite campos ausentes y calcula presión con historia real", () => {
  const result = parseWeather(
    [
      {
        dateutc: now.getTime(),
        tempf: 68,
        hourlyrainin: 0,
        dailyrainin: 0,
        baromrelin: 30,
      },
      { dateutc: now.getTime() - 3 * 3600000, baromrelin: 30.1 },
    ],
    new HistoryStore(),
    now,
  );
  assert.equal(result.tempC, 20);
  assert.equal(result.rainRateMmHr, 0);
  assert.equal(result.humidity, null);
  assert.ok(result.pressureChangeHpa < 0);
  assert.equal(result.landslideRisk, undefined);
});
test("modelo horario Ecuador convierte tiempos a instantes UTC sin desplazar el pronóstico", () => {
  const json = {
    utc_offset_seconds: -18000,
    hourly: {
      time: Array.from({ length: 72 }, (_, i) =>
        new Date(Date.UTC(2026, 9, 12) + i * 3600000)
          .toISOString()
          .slice(0, 16),
      ),
      precipitation: Array(72).fill(1),
    },
  };
  const result = parseForecast(json, now);
  assert.equal(result.hours[0].timestamp, now.toISOString());
  assert.equal(result.hours.length, 48);
});
test("historia sobrevive reinicio, deduplica y conserva datos de distintas señales", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-history-"));
  const store = new HistoryStore(directory);
  store.record("30031", [{ loctimestamp: stamp(1), valueedit: 2131 }], now);
  const restarted = new HistoryStore(directory);
  restarted.record(
    "30031",
    [
      { loctimestamp: stamp(1), valueedit: 2131 },
      { loctimestamp: stamp(0), valueedit: 2130 },
    ],
    now,
  );
  assert.equal(restarted.read("30031").length, 2);
  assert.equal(restarted.read("30031").at(-1).valueedit, 2130);
});

test("formato de historial incompatible no se sobreescribe ni pierde datos", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-migration-"));
  const file = path.join(directory, "observations.json");
  const original = JSON.stringify({
    version: 99,
    series: { valuable: [1, 2, 3] },
  });
  fs.writeFileSync(file, original);
  assert.throws(() => new HistoryStore(directory), /incompatible/);
  assert.equal(fs.readFileSync(file, "utf8"), original);
});

test("el descenso de varios días no se oculta por desaceleración o recuperación reciente", () => {
  const mazar = {
    timestamp: stamp(0),
    cotaMsnm: 2130,
    changeMPerDay: -0.2,
    daysToShutdown: 75,
    longTermChangeMPerDay: -1,
    longTermHours: 60,
  };
  const declining = assessEnergy({ mazar }, null, now);
  assert.equal(declining.level, "elevated");
  assert.match(declining.reasons.join(" "), /60 h/);
  const recovering = assessEnergy(
    { mazar: { ...mazar, changeMPerDay: 0.2, daysToShutdown: null } },
    null,
    now,
  );
  assert.equal(recovering.level, "watch");
  assert.match(recovering.title, /Recuperación reciente/);
});
