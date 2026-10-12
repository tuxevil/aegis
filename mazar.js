const DAY = 86400000;
// Heurísticas de visualización: ventana de 24 h, al menos 6 h de separación,
// dato reciente (2 h) y tolerancia de 5 cm/día para ruido de medición.
export function assessMazar(latest, readings = [], now = new Date()) {
  const cota = latest?.valueedit;
  const result = {
    status: "Sin Datos",
    statusColor: "blue",
    trend: "Sin datos suficientes",
    trendColor: "blue",
    changeMPerDay: null,
    trendHours: null,
    daysToShutdown: null,
    longTermChangeMPerDay: null,
    longTermHours: null,
  };
  if (!Number.isFinite(cota)) return result;
  result.status =
    cota <= 2115
      ? "EMERGENCIA — Nivel crítico"
      : cota < 2120
        ? "ALERTA — Nivel bajo"
        : "Sobre umbral de prealerta";
  result.statusColor = cota <= 2115 ? "red" : cota < 2120 ? "orange" : "blue";
  if (cota <= 2115) result.daysToShutdown = 0;
  const time = Date.parse(latest.loctimestamp);
  if (
    !Number.isFinite(time) ||
    time > now.getTime() ||
    now.getTime() - time > 2 * 3600000
  ) {
    result.trend = "Datos desactualizados";
    return result;
  }
  const baseline = readings
    .filter(
      (r) =>
        Number.isFinite(r.valueedit) &&
        time - Date.parse(r.loctimestamp) >= 6 * 3600000 &&
        time - Date.parse(r.loctimestamp) <= DAY,
    )
    .sort((a, b) => Date.parse(a.loctimestamp) - Date.parse(b.loctimestamp))[0];
  if (!baseline) return result;
  const span = time - Date.parse(baseline.loctimestamp);
  const rate = ((cota - baseline.valueedit) * DAY) / span;
  result.changeMPerDay = +rate.toFixed(3);
  result.trendHours = +(span / 3600000).toFixed(1);
  result.trend =
    rate < -0.05
      ? "En descenso"
      : rate > 0.05
        ? "En ascenso"
        : "Sin cambio apreciable";
  result.trendColor = rate < -0.05 ? "orange" : "blue";
  if (rate < -0.05 && cota > 2115)
    result.daysToShutdown = +((cota - 2115) / -rate).toFixed(1);
  const longBaseline = readings
    .filter(
      (r) =>
        Number.isFinite(r.valueedit) &&
        time - Date.parse(r.loctimestamp) >= 48 * 3600000 &&
        time - Date.parse(r.loctimestamp) <= 72 * 3600000,
    )
    .sort((a, b) => Date.parse(a.loctimestamp) - Date.parse(b.loctimestamp))[0];
  if (longBaseline) {
    const longSpan = time - Date.parse(longBaseline.loctimestamp);
    result.longTermChangeMPerDay = +(
      ((cota - longBaseline.valueedit) * DAY) /
      longSpan
    ).toFixed(3);
    result.longTermHours = +(longSpan / 3600000).toFixed(1);
  }
  return result;
}
