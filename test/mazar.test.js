import test from "node:test";
import assert from "node:assert/strict";
import { assessMazar } from "../mazar.js";
const now = new Date("2026-10-12T18:00:00Z");
const reading = (hours, valueedit) => ({
  valueedit,
  loctimestamp: new Date(now - hours * 3600000).toISOString(),
});
test("nivel sobre prealerta con caída rápida muestra descenso y proyecta con tasa real", () => {
  const result = assessMazar(
    reading(0, 2130),
    [reading(12, 2131), reading(0, 2130)],
    now,
  );
  assert.equal(result.status, "Sobre umbral de prealerta");
  assert.equal(result.trend, "En descenso");
  assert.equal(result.changeMPerDay, -2);
  assert.equal(result.daysToShutdown, 7.5);
});
test("sin historia suficiente no afirma estabilidad ni inventa días", () => {
  const result = assessMazar(reading(0, 2130), [reading(1, 2131)], now);
  assert.equal(result.trend, "Sin datos suficientes");
  assert.equal(result.daysToShutdown, null);
});
test("lecturas antiguas no producen proyección vigente", () => {
  const result = assessMazar(
    reading(3, 2130),
    [reading(15, 2131), reading(3, 2130)],
    now,
  );
  assert.equal(result.trend, "Datos desactualizados");
  assert.equal(result.daysToShutdown, null);
});
test("subida y nivel sin variación no proyectan parada", () => {
  for (const [earlier, trend] of [
    [2129, "En ascenso"],
    [2130, "Sin cambio apreciable"],
  ]) {
    const result = assessMazar(reading(0, 2130), [reading(12, earlier)], now);
    assert.equal(result.trend, trend);
    assert.equal(result.daysToShutdown, null);
  }
});
test("umbrales de nivel independientes de tendencia y ausencia de datos", () => {
  assert.equal(
    assessMazar(reading(0, 2120), [], now).status,
    "Sobre umbral de prealerta",
  );
  assert.equal(
    assessMazar(reading(0, 2119), [], now).status,
    "ALERTA — Nivel bajo",
  );
  assert.equal(assessMazar(reading(0, 2115), [], now).daysToShutdown, 0);
  assert.equal(assessMazar(null, [], now).statusColor, "blue");
});

test("contrasta 24 h con una ventana larga sin fabricar historia de 72 h", () => {
  const result = assessMazar(
    reading(0, 2128),
    [reading(24, 2128.2), reading(60, 2131)],
    now,
  );
  assert.equal(result.changeMPerDay, -0.2);
  assert.equal(result.longTermChangeMPerDay, -1.2);
  assert.equal(result.longTermHours, 60);
  assert.equal(
    assessMazar(reading(0, 2128), [reading(24, 2128.2)], now)
      .longTermChangeMPerDay,
    null,
  );
});
