/* AEGIS: display observations and scenarios without manufacturing certainty. */
const $ = (id) => document.getElementById(id);
const set = (id, value) => {
  if ($(id)) $(id).textContent = value ?? "—";
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const format = (value, digits = 1) =>
  finite(value)
    ? new Intl.NumberFormat("es-EC", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value)
    : "—";
const signed = (value, digits = 1) =>
  finite(value) ? `${value > 0 ? "+" : ""}${format(value, digits)}` : "—";
const validTime = (value) => Number.isFinite(Date.parse(value));
const fmtDate = (value, options = {}) =>
  validTime(value)
    ? new Date(value).toLocaleString("es-EC", {
        timeZone: "America/Guayaquil",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        ...options,
      })
    : "fecha sin confirmar";
const age = (value) => {
  if (!validTime(value)) return "sin hora de medición";
  const minutes = Math.floor((Date.now() - Date.parse(value)) / 60000);
  if (minutes < -5) return "hora de origen no válida";
  if (minutes < 60) return `hace ${Math.max(0, minutes)} min`;
  if (minutes < 1440) return `hace ${Math.floor(minutes / 60)} h`;
  return `hace ${Math.floor(minutes / 1440)} días`;
};
const fresh = (timestamp, hours) =>
  validTime(timestamp) &&
  Date.parse(timestamp) <= Date.now() + 300000 &&
  Date.now() - Date.parse(timestamp) <= hours * 3600000;
const css = (key) =>
  getComputedStyle(document.documentElement).getPropertyValue(key).trim();
const states = {
  unknown: "Datos incompletos",
  observed: "Observación reciente",
  watch: "Vigilancia",
  elevated: "Atención",
  critical: "Zona crítica",
};
const charts = new Map();
let snapshot = null,
  mazWindow = 72,
  rainMode = "forecast",
  syncing = false;

function chart(id, type, data, extra = {}) {
  if (charts.has(id)) {
    charts.get(id).destroy();
    charts.delete(id);
  }
  if (typeof Chart === "undefined" || !$(id)) return;
  const ticks = {
    color: css("--muted"),
    font: { size: 13, family: "IBM Plex Mono, monospace" },
    maxTicksLimit: 6,
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: css("--ink"),
        titleColor: css("--surface"),
        bodyColor: css("--surface"),
        padding: 11,
        displayColors: true,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { ...ticks, maxRotation: 0 },
        border: { display: false },
      },
      y: {
        grid: { color: css("--chart-grid") },
        ticks,
        border: { display: false },
      },
    },
    ...extra,
  };
  charts.set(id, new Chart($(id), { type, data, options }));
}
function showEmpty(id, show, message) {
  if (!$(id)) return;
  $(id).hidden = !show;
  if (message) $(id).textContent = message;
}
function removeChart(id) {
  charts.get(id)?.destroy();
  charts.delete(id);
}
function list(container, items, build) {
  const parent = $(container);
  parent.replaceChildren(...items.map(build));
}
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function overview(prefix, value) {
  const state = value || {
    level: "unknown",
    title: "Fuente no disponible",
    summary: "No pudimos consultar una lectura reciente.",
  };
  $(`${prefix}-overview`).dataset.level = state.level;
  set(`${prefix}-status`, states[state.level] || states.unknown);
  set(`${prefix}-title`, state.title);
  set(`${prefix}-summary`, state.summary);
}
function numericSeries(points, field, start) {
  const sorted = (points || [])
    .filter(
      (r) =>
        validTime(r.loctimestamp) &&
        Date.parse(r.loctimestamp) >= start &&
        finite(r[field]),
    )
    .sort((a, b) => Date.parse(a.loctimestamp) - Date.parse(b.loctimestamp));
  const result = [];
  for (const p of sorted) {
    const previous = result.at(-1);
    if (
      previous &&
      Date.parse(p.loctimestamp) - Date.parse(previous.loctimestamp) >
        3 * 3600000
    )
      result.push({
        loctimestamp: new Date(
          Date.parse(previous.loctimestamp) + 3600000,
        ).toISOString(),
        [field]: null,
      });
    result.push(p);
  }
  return result;
}
function paintMazar(data) {
  const maz = data.dams?.mazar || {};
  const recent = fresh(maz.timestamp, 2);
  set("maz-level", format(maz.cotaMsnm, 2));
  set(
    "maz-trend",
    recent
      ? `${finite(maz.changeMPerDay) ? signed(maz.changeMPerDay, 2) + " m/día · " : ""}${maz.trend || "Sin tendencia disponible"}`
      : "Lectura antigua o sin fecha",
  );
  $("maz-trend").classList.toggle(
    "declining",
    recent && maz.changeMPerDay < -0.05,
  );
  set(
    "maz-trend-window",
    finite(maz.trendHours)
      ? `Medido en ${format(maz.trendHours, 0)} horas`
      : "Necesitamos al menos 6 h de historia",
  );
  const ratio = finite(maz.cotaMsnm)
    ? Math.max(0, Math.min(100, ((maz.cotaMsnm - 2098) / 55) * 100))
    : 0;
  $("level-fill").style.width = ratio + "%";
  $("level-fill").style.background =
    recent && maz.cotaMsnm <= 2115
      ? css("--red")
      : recent && maz.changeMPerDay < -0.05
        ? css("--amber")
        : css("--teal");
  $("level-pin").style.left = ratio + "%";
  $("level-pin").style.display = finite(maz.cotaMsnm) ? "block" : "none";
  if (finite(maz.cotaMsnm))
    $("level-scale").setAttribute("aria-valuenow", String(maz.cotaMsnm));
  else $("level-scale").removeAttribute("aria-valuenow");
  $("level-scale").setAttribute(
    "aria-valuetext",
    finite(maz.cotaMsnm)
      ? `${format(maz.cotaMsnm, 2)} metros de altura. Seguridad a 2115 metros. No representa porcentaje de reserva.`
      : "Cota no disponible",
  );
  const days = recent && finite(maz.daysToShutdown) ? maz.daysToShutdown : null;
  set(
    "maz-days",
    days === 0
      ? "Umbral alcanzado"
      : days !== null
        ? `${format(days, 1)} días`
        : "Sin proyección",
  );
  set(
    "maz-projection",
    days === 0
      ? "Zona crítica para operación segura."
      : days !== null
        ? "Hasta 2115 m, si continúa este ritmo. No es fecha de apagón."
        : "Sin descenso medido útil o sin datos suficientes.",
  );
  set("maz-inflow", `${format(maz.caudalEntradaM3s, 1)} m³/s`);
  set(
    "maz-inflow-note",
    `${fresh(maz.caudalTimestamp, 2) ? "Entrada observada" : "Lectura no reciente"} · ${age(maz.caudalTimestamp)}`,
  );
  set(
    "maz-date",
    `Medición CELEC: ${fmtDate(maz.timestamp)} · ${age(maz.timestamp)}${data.dams?.retrievalFailed ? " · actualización fallida" : ""}`,
  );
  const last = validTime(maz.timestamp)
    ? Date.parse(maz.timestamp)
    : Date.now();
  const points = numericSeries(
    maz.history,
    "valueedit",
    last - mazWindow * 3600000,
  );
  const enough = points.filter((p) => finite(p.valueedit)).length >= 2;
  showEmpty(
    "maz-empty",
    !enough,
    "Historia insuficiente para mostrar evolución",
  );
  if (enough) {
    const values = points
      .filter((p) => finite(p.valueedit))
      .map((p) => p.valueedit);
    chart(
      "maz-chart",
      "line",
      {
        labels: points.map((p) =>
          fmtDate(p.loctimestamp, { month: "numeric", day: "numeric" }),
        ),
        datasets: [
          {
            label: "Cota observada (m)",
            data: points.map((p) => p.valueedit),
            borderColor: css("--teal"),
            backgroundColor: css("--soft"),
            fill: true,
            tension: 0,
            pointRadius: 2,
            borderWidth: 2,
            spanGaps: false,
          },
          {
            label: "Seguridad · 2115 m",
            data: points.map(() => 2115),
            borderColor: css("--red"),
            borderDash: [4, 4],
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      {
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: css("--muted"),
              maxTicksLimit: 4,
              maxRotation: 0,
              font: { size: 13 },
            },
            border: { display: false },
          },
          y: {
            suggestedMin: Math.min(2114, ...values),
            suggestedMax: Math.max(...values) + 1,
            ticks: {
              color: css("--muted"),
              font: { size: 13 },
              maxTicksLimit: 4,
            },
            grid: { color: css("--chart-grid") },
            border: { display: false },
          },
        },
      },
    );
    $("maz-chart").setAttribute(
      "aria-label",
      `Mazar: ${format(values[0], 2)} a ${format(values.at(-1), 2)} metros en la historia mostrada. Umbral de seguridad: 2115 metros.`,
    );
  } else removeChart("maz-chart");
  set(
    "maz-history-label",
    `COTA / ${mazWindow} H${recent ? "" : " / ANTIGUA"}`,
  );
  const am = data.dams?.molino;
  set(
    "amaluza-signal",
    am && finite(am.cotaMsnm)
      ? `Amaluza: ${format(am.cotaMsnm, 2)} m · ${age(am.timestamp)}`
      : "Amaluza: sin lectura disponible",
  );
}
function paintRain(data) {
  const w = data.weather || {},
    f = data.forecast || {};
  const recent = fresh(w.timestamp, 1),
    forecastRecent = fresh(f.retrievedAt, 3);
  const next24 = (f.hours || []).filter(
    (h) =>
      Date.parse(h.timestamp) >= Date.now() &&
      Date.parse(h.timestamp) < Date.now() + 86400000,
  );
  const complete =
    forecastRecent &&
    next24.length >= 20 &&
    next24.every((p) => finite(p.precipitationMm));
  const total = complete
    ? next24.reduce((sum, h) => sum + h.precipitationMm, 0)
    : null;
  set("rain-main", format(total, 1));
  set("rain-unit", "mm previstos");
  set("rain-main-title", "Próximas 24 horas");
  set("rain-subtitle", "Cabecera cantonal · modelo");
  if (!complete && recent) {
    set("rain-main", format(w.rainRateMmHr, 1));
    set("rain-unit", "mm/h medidos");
    set("rain-main-title", "Última lectura de estación");
    set("rain-subtitle", "Previsión no disponible");
  }
  set("weather-temp", format(w.tempC, 1));
  set("weather-day", format(w.rainDailyMm, 1));
  set("weather-wind", format(w.windGustKmh, 0));
  $("weather-wind").parentElement.title = "Ráfaga registrada por la estación";
  set(
    "weather-date",
    `Estación: ${fmtDate(w.timestamp)} · ${age(w.timestamp)}${w.retrievalFailed ? " · actualización fallida" : ""}. Modelo: consultado ${fmtDate(f.retrievedAt)}.`,
  );
  let points = [];
  if (rainMode === "forecast") {
    points = (f.hours || [])
      .filter(
        (p) => validTime(p.timestamp) && Date.parse(p.timestamp) >= Date.now(),
      )
      .slice(0, 48);
    set(
      "rain-chart-label",
      `PREVISIÓN / 48 H${forecastRecent ? "" : " / ANTIGUA"}`,
    );
  } else {
    const hours = new Map();
    for (const p of w.history || []) {
      const time = Date.parse(p.loctimestamp);
      if (
        !Number.isFinite(time) ||
        time < Date.now() - 24 * 3600000 ||
        !finite(p.rainRateMmHr)
      )
        continue;
      const hour = Math.floor(time / 3600000) * 3600000;
      const earlier = hours.get(hour);
      if (!earlier || earlier.value < p.rainRateMmHr)
        hours.set(hour, {
          timestamp: new Date(hour).toISOString(),
          value: p.rainRateMmHr,
        });
    }
    points = [...hours.values()].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    );
    set("rain-chart-label", "INTENSIDAD MÁXIMA / HORA · 24 H");
  }
  const enough = points.some((p) =>
    finite(rainMode === "forecast" ? p.precipitationMm : p.value),
  );
  showEmpty(
    "rain-empty",
    !enough,
    rainMode === "forecast"
      ? "Pronóstico temporalmente no disponible"
      : "Sin historia de lluvia de la estación",
  );
  if (enough)
    chart(
      "rain-chart",
      "bar",
      {
        labels: points.map((p) =>
          fmtDate(p.timestamp, { month: "numeric", day: "numeric" }),
        ),
        datasets: [
          {
            label:
              rainMode === "forecast"
                ? "Lluvia prevista (mm por hora)"
                : "Intensidad medida (mm/h)",
            data: points.map((p) =>
              rainMode === "forecast" ? p.precipitationMm : p.value,
            ),
            backgroundColor: css("--blue"),
            borderRadius: 3,
            maxBarThickness: 17,
          },
        ],
      },
      {
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: css("--muted"),
              maxTicksLimit: 4,
              maxRotation: 0,
              font: { size: 13 },
            },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            suggestedMax: 2,
            ticks: {
              color: css("--muted"),
              maxTicksLimit: 4,
              font: { size: 13 },
            },
            grid: { color: css("--chart-grid") },
            border: { display: false },
          },
        },
      },
    );
  else removeChart("rain-chart");
  $("rain-chart").setAttribute(
    "aria-label",
    rainMode === "forecast"
      ? `Lluvia prevista por modelo: ${format(total, 1)} mm en las próximas 24 horas, cuando hay cobertura suficiente.`
      : "Máxima intensidad registrada cada hora por una estación de Pallatanga. Las horas sin mediciones no equivalen a lluvia cero.",
  );
}
function paintNational(data) {
  const c = data.cenace || {};
  const comp = c.composition;
  const mix = [
    ["hidroeléctrica", "Hidroeléctrica", "--teal"],
    ["térmica", "Térmica", "--amber"],
    ["renovable", "Otras renovables", "--blue"],
    ["importación", "Importación", "--muted"],
  ].map(([key, label, color]) => ({
    key,
    label,
    color: css(color),
    value: comp?.[key],
  }));
  const valid = mix.every((v) => finite(v.value) && v.value >= 0);
  const total = valid ? mix.reduce((sum, v) => sum + v.value, 0) : 0;
  set(
    "hydro-share",
    total > 0 ? `${format((mix[0].value / total) * 100, 0)}%` : "—",
  );
  if (total > 0) {
    chart(
      "mix-chart",
      "doughnut",
      {
        labels: mix.map((v) => v.label),
        datasets: [
          {
            data: mix.map((v) => v.value),
            backgroundColor: mix.map((v) => v.color),
            borderWidth: 0,
            spacing: 3,
            borderRadius: 2,
          },
        ],
      },
      {
        cutout: "78%",
        scales: {},
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.label}: ${format((ctx.raw / total) * 100, 1)}% · ${format(ctx.raw, 0)} MWh`,
            },
          },
        },
      },
    );
    list("mix-legend", mix, (m) => {
      const row = element("div", "mix-row");
      const dot = element("i");
      dot.style.background = m.color;
      row.append(
        dot,
        element("span", null, m.label),
        element("strong", null, `${format((m.value / total) * 100, 1)}%`),
      );
      return row;
    });
  } else {
    removeChart("mix-chart");
    $("mix-legend").replaceChildren(
      element("p", "muted", "No hay composición confirmada"),
    );
  }
  set(
    "mix-date",
    `CENACE · ${c.sourceDate ? fmtDate(c.sourceDate + "T12:00:00-05:00", { hour: undefined, minute: undefined }) : "fecha sin confirmar"} · acumulado parcial del día`,
  );
  const h = c.hourly;
  const enough =
    h?.labels?.length &&
    Object.values(h.series || {}).some((series) => series.some(finite));
  showEmpty(
    "national-empty",
    !enough,
    "Curva de generación temporalmente no disponible",
  );
  set(
    "national-time",
    c.observedAt
      ? `${fmtDate(c.observedAt)} · ${age(c.observedAt)}`
      : "Hora sin confirmar",
  );
  if (enough) {
    const sources = [
      ["Hidráulica", "--teal"],
      ["Térmica", "--amber"],
      ["Renovable", "--blue"],
      ["Importación", "--muted"],
    ];
    const datasets = sources
      .filter(([key]) => h.series[key])
      .map(([key, color]) => ({
        label: key,
        data: h.series[key],
        borderColor: css(color),
        backgroundColor: css(color) + "90",
        fill: true,
        stack: "production",
        pointRadius: 0,
        borderWidth: 1,
        tension: 0,
        spanGaps: false,
      }));
    if (h.series["DEMANDA NACIONAL"])
      datasets.push({
        label: "Demanda atendida",
        data: h.series["DEMANDA NACIONAL"],
        borderColor: css("--ink"),
        borderDash: [4, 3],
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0,
        tension: 0,
        spanGaps: false,
        stack: "demand",
      });
    chart(
      "national-chart",
      "line",
      { labels: h.labels, datasets },
      {
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: css("--muted"),
              font: { size: 13 },
              maxTicksLimit: 6,
              maxRotation: 0,
            },
            border: { display: false },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              color: css("--muted"),
              font: { size: 13 },
              maxTicksLimit: 4,
            },
            grid: { color: css("--chart-grid") },
            border: { display: false },
          },
        },
      },
    );
  } else removeChart("national-chart");
  const sorted = (c.hydroGenerators || [])
    .filter((g) => finite(g.generationMWh))
    .sort((a, b) => b.generationMWh - a.generationMWh);
  const maximum = Math.max(1, ...sorted.map((g) => g.generationMWh));
  list("central-list", sorted, (g) => {
    const row = element("div", "central-row");
    const bar = element("div", "central-bar");
    const fill = element("span");
    fill.style.width = Math.max(0, (g.generationMWh / maximum) * 100) + "%";
    bar.append(fill);
    row.append(
      element("span", null, g.central),
      bar,
      element("strong", null, `${format(g.generationMWh, 0)} MWh`),
    );
    return row;
  });
  set(
    "energy-missing",
    `Evaluación parcial. Falta: ${(data.assessment?.energy?.missing || []).join("; ")}.`,
  );
}
function paintEnso(data) {
  const e = data.enso || {},
    o = e.official;
  const bulletinFresh = o && fresh(o.issuedAt + "T00:00:00Z", 60 * 24);
  set("enso-status", bulletinFresh ? o.label : "Diagnóstico no actualizado");
  set(
    "enso-issued",
    o
      ? `Boletín NOAA: ${fmtDate(o.issuedAt + "T12:00:00Z", { hour: undefined, minute: undefined })}${bulletinFresh ? "" : " · conservar como antecedente"}`
      : "Los índices semanales no reemplazan un diagnóstico oficial",
  );
  set("nino12", finite(e.nino12SSTA) ? `${signed(e.nino12SSTA)} °C` : "—");
  set("nino34", finite(e.nino34SSTA) ? `${signed(e.nino34SSTA)} °C` : "—");
  set(
    "enso-date",
    `Anomalía relativa semanal · ${e.sourceDate ? fmtDate(e.sourceDate + "T12:00:00Z", { hour: undefined, minute: undefined }) : "fecha sin confirmar"}${e.sourceDate && !fresh(e.sourceDate + "T12:00:00Z", 14 * 24) ? " · lectura antigua" : ""}`,
  );
  const points = e.series || [];
  showEmpty(
    "enso-empty",
    points.length < 2,
    "Índices NOAA temporalmente no disponibles",
  );
  if (points.length >= 2)
    chart(
      "enso-chart",
      "line",
      {
        labels: points.map((p) =>
          fmtDate(p.date + "T12:00:00Z", {
            hour: undefined,
            minute: undefined,
          }),
        ),
        datasets: [
          {
            label: "Niño 1+2 · relativo °C",
            data: points.map((p) => p.nino12),
            borderColor: css("--amber"),
            pointRadius: 0,
            borderWidth: 2,
            tension: 0,
          },
          {
            label: "Niño 3.4 · relativo °C",
            data: points.map((p) => p.nino34),
            borderColor: css("--blue"),
            pointRadius: 0,
            borderWidth: 2,
            tension: 0,
          },
        ],
      },
      {
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 3,
              maxRotation: 0,
              color: css("--muted"),
              font: { size: 13 },
            },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: {
              maxTicksLimit: 3,
              color: css("--muted"),
              font: { size: 13 },
            },
            grid: { color: css("--chart-grid") },
            border: { display: false },
          },
        },
      },
    );
  else removeChart("enso-chart");
}
function render(data) {
  snapshot = data;
  overview("energy", data.assessment?.energy);
  overview("local", data.assessment?.local);
  set("energy-coverage", "Señales de reserva · evaluación parcial");
  set(
    "local-coverage",
    fresh(data.weather?.timestamp, 1)
      ? "Estación + pronóstico local"
      : "Estación sin lectura reciente",
  );
  paintMazar(data);
  paintRain(data);
  paintNational(data);
  paintEnso(data);
  set("energy-method", data.assessment?.energy?.methodology);
  set("local-method", data.assessment?.local?.methodology);
  list("energy-reasons", data.assessment?.energy?.reasons || [], (reason) =>
    element("li", null, reason),
  );
  paintConsole(data);
  if ($("detail-dialog").open) paintDetail(selectedPanel);
}
async function sync() {
  if (syncing) return;
  syncing = true;
  $("refresh").disabled = true;
  set("sync-text", "Consultando fuentes…");
  try {
    const response = await fetch("/api/status", {
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error("No pudimos consultar el panorama");
    const data = await response.json();
    render(data);
    const unavailable = [
      "dams",
      "weather",
      "cenace",
      "enso",
      "forecast",
    ].filter((k) => data[k]?.error || data[k]?.retrievalFailed || !data[k]);
    set(
      "sync-text",
      `${unavailable.length ? "Consulta parcial" : "Consulta"} · ${fmtDate(data.timestamp, { day: undefined, month: undefined })}`,
    );
    $("sync-dot").classList.toggle("err", unavailable.length > 0);
    $("connection-message").hidden = unavailable.length === 0;
    set(
      "connection-message",
      unavailable.length
        ? "Algunas fuentes no respondieron. Cada panel indica la fecha y cobertura de sus datos; consultá los enlaces oficiales para completar el panorama."
        : "",
    );
  } catch {
    set("sync-text", "Sin conexión · reintentar");
    $("sync-dot").classList.add("err");
    $("connection-message").hidden = false;
    set(
      "connection-message",
      snapshot
        ? "La actualización falló. El panorama visible pertenece a la última consulta; revisá las horas de medición antes de usarlo."
        : "No pudimos consultar las fuentes. Probá actualizar o abrí los enlaces oficiales.",
    );
  } finally {
    syncing = false;
    $("refresh").disabled = false;
  }
}
function shareText() {
  if (!snapshot)
    return (
      "AEGIS · Energía de Ecuador y clima de Pallatanga, con fuentes y contexto.\n" +
      location.origin
    );
  return `AEGIS · Panorama consultado ${fmtDate(snapshot.timestamp, { year: "numeric" })} (Ecuador)\n\nEnergía: ${snapshot.assessment?.energy?.title || "Sin evaluación"}\nPallatanga: ${snapshot.assessment?.local?.title || "Sin evaluación"}\nMazar: ${format(snapshot.dams?.mazar?.cotaMsnm, 2)} m · medición ${fmtDate(snapshot.dams?.mazar?.timestamp)}\n\nSeñales y escenarios, no un anuncio de apagones. Consultá datos actualizados y fuentes:\n${location.origin}`;
}
function wrapCanvas(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = text.split(/\s+/);
  let line = "",
    count = 0;
  for (let i = 0; i < words.length; i++) {
    const candidate = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      count++;
      line = words[i];
      if (count >= maxLines - 1) {
        line = words.slice(i).join(" ");
        while (ctx.measureText(line + "…").width > maxWidth && line.length)
          line = line.slice(0, -1);
        ctx.fillText(line + "…", x, y);
        return y + lineHeight;
      }
    } else line = candidate;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}
function paintShare(host = location.host) {
  const canvas = $("share-canvas"),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#090c12";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#66dcce";
  ctx.fillRect(0, 0, 1200, 8);
  ctx.font = "700 26px IBM Plex Mono, monospace";
  ctx.fillText("AEGIS", 50, 65);
  ctx.fillStyle = "#8192a5";
  ctx.font = "12px IBM Plex Mono, monospace";
  ctx.fillText("ENERGÍA Y CLIMA, CON CONTEXTO", 157, 64);
  ctx.textAlign = "right";
  ctx.fillText(
    snapshot
      ? fmtDate(snapshot.timestamp, { year: "numeric" }) + " · UTC−5"
      : "OBSERVATORIO ABIERTO",
    1150,
    64,
  );
  ctx.textAlign = "left";
  ctx.fillStyle = "#d8e3ec";
  ctx.font = "650 45px IBM Plex Mono, monospace";
  ctx.fillText("GRID SENTINEL / SNAPSHOT", 50, 141);
  const panels = [
    {
      x: 50,
      bg: "#101b23",
      scope: "ENERGÍA · ECUADOR",
      a: snapshot?.assessment?.energy,
    },
    {
      x: 615,
      bg: "#131a2b",
      scope: "CLIMA · PALLATANGA",
      a: snapshot?.assessment?.local,
    },
  ];
  for (const p of panels) {
    ctx.fillStyle = p.bg;
    ctx.beginPath();
    ctx.roundRect(p.x, 184, 535, 292, 3);
    ctx.fill();
    ctx.fillStyle = "#8192a5";
    ctx.font = "700 12px IBM Plex Mono, monospace";
    ctx.fillText(p.scope, p.x + 26, 221);
    ctx.fillStyle = "#d8e3ec";
    ctx.font = "500 25px IBM Plex Mono, monospace";
    let y = wrapCanvas(
      ctx,
      p.a?.title || "Seguí las señales, con fuentes",
      p.x + 26,
      265,
      480,
      38,
      2,
    );
    ctx.fillStyle = "#8192a5";
    ctx.font = "14px IBM Plex Mono, monospace";
    wrapCanvas(
      ctx,
      p.a?.summary ||
        "Observaciones y tendencias para entender los cambios y prepararse.",
      p.x + 26,
      y + 16,
      477,
      26,
      3,
    );
    ctx.fillStyle = "#66dcce";
    ctx.font = "600 13px IBM Plex Mono, monospace";
    ctx.fillText(
      p.x === 50
        ? "Evaluación parcial · no anuncia cortes"
        : "Estación local + modelo meteorológico",
      p.x + 26,
      450,
    );
  }
  ctx.fillStyle = "#8192a5";
  ctx.font = "13px IBM Plex Mono, monospace";
  const maz = snapshot?.dams?.mazar;
  ctx.fillText(
    maz
      ? `Mazar: ${format(maz.cotaMsnm, 2)} m · medición ${fmtDate(maz.timestamp)}`
      : "Mazar · generación · lluvia · El Niño",
    50,
    512,
  );
  ctx.fillText(
    "Señales y escenarios. Los datos pueden cambiar; consultá la actualización.",
    50,
    540,
  );
  ctx.fillStyle = "#66dcce";
  ctx.font = "600 20px IBM Plex Mono, monospace";
  ctx.fillText(host, 50, 591);
  ctx.textAlign = "right";
  ctx.font = "12px IBM Plex Mono, monospace";
  ctx.fillText(
    "CELEC · CENACE · NOAA · Ambient Weather · Open-Meteo",
    1150,
    591,
  );
  ctx.textAlign = "left";
}
// Console navigation shares the actual panel DOM and observations across views.
const viewConfig = {
  overview: {
    name: "OVERVIEW",
    code: "01 / SYSTEM OVERVIEW",
    title: "MONITOR DE SEÑALES",
    panels: ["mazar", "rain", "national", "enso"],
  },
  energy: {
    name: "ENERGY",
    code: "02 / ECUADOR · POWER SYSTEM",
    title: "RESERVA / GENERACIÓN",
    panels: ["mazar", "national"],
  },
  weather: {
    name: "PALLATANGA",
    code: "03 / LOCAL WEATHER STATION",
    title: "ESTACIÓN / PREVISIÓN",
    panels: ["rain"],
  },
  enso: {
    name: "PACIFIC",
    code: "04 / ENSO · NOAA CPC",
    title: "PACÍFICO ECUATORIAL",
    panels: ["enso"],
  },
  sources: {
    name: "DATA LINKS",
    code: "05 / SOURCE REGISTRY",
    title: "FUENTES / EVENT LOG",
    panels: [],
  },
};
const panels = Object.fromEntries(
  [...document.querySelectorAll("[data-panel]")].map((el) => [
    el.dataset.panel,
    el,
  ]),
);
let currentView = "overview",
  selectedPanel = "mazar",
  commandIndex = 0,
  filteredCommands = [];
const events = [];
let lastDataSignature = "";
const panelChart = {
  mazar: "maz-chart",
  rain: "rain-chart",
  national: "national-chart",
  enso: "enso-chart",
};
const panelNames = {
  mazar: "MAZAR / CELEC SUR",
  rain: "PALLATANGA / LLUVIA",
  national: "SNI / CENACE",
  enso: "PACÍFICO / NOAA",
};
function resizeCharts() {
  requestAnimationFrame(() => {
    for (const instance of charts.values()) instance.resize?.();
  });
}
function setView(view, updateHash = true) {
  if (!viewConfig[view]) return;
  currentView = view;
  for (const section of document.querySelectorAll("[data-workspace]"))
    section.hidden = section.dataset.workspace !== view;
  for (const button of document.querySelectorAll("[data-view]")) {
    if (button.dataset.view === view)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  const target = document.querySelector(`[data-workspace="${view}"]`);
  for (const key of viewConfig[view].panels) {
    const slot = target.querySelector(`[data-slot="${key}"]`);
    if (slot && panels[key]) slot.append(panels[key]);
  }
  if (
    viewConfig[view].panels.length &&
    !viewConfig[view].panels.includes(selectedPanel)
  )
    selectedPanel = viewConfig[view].panels[0];
  set("view-name", viewConfig[view].name);
  set("view-title", viewConfig[view].title + " _");
  set("view-code", viewConfig[view].code);
  set("footer-view", viewConfig[view].name);
  document.body.dataset.view = view;
  if (updateHash) history.replaceState(null, "", `#${view}`);
  $("workspace").scrollTop = 0;
  selectPanel(selectedPanel);
  resizeCharts();
}
function selectPanel(key) {
  selectedPanel = key;
  for (const [name, panel] of Object.entries(panels))
    panel.classList.toggle("selected", name === key);
}
function updateClock() {
  set(
    "clock",
    new Date().toLocaleTimeString("es-EC", {
      timeZone: "America/Guayaquil",
      hour12: false,
    }),
  );
}
function dataTable(container, headers, rows) {
  const target = typeof container === "string" ? $(container) : container;
  if (!rows.length) {
    target.replaceChildren(
      element("p", "empty-table", "NO DATA / SIN LECTURAS"),
    );
    return;
  }
  const table = element("table"),
    head = element("thead"),
    tr = element("tr");
  headers.forEach((h) => tr.append(element("th", null, h)));
  head.append(tr);
  table.append(head);
  const body = element("tbody");
  for (const cells of rows) {
    const row = element("tr");
    for (const cell of cells) {
      const value =
        typeof cell === "object" && cell !== null ? cell : { text: cell };
      row.append(element("td", value.className || null, value.text ?? "—"));
    }
    body.append(row);
  }
  table.append(body);
  target.replaceChildren(table);
}
function sourceRows(data) {
  const specs = [
    [
      "CELEC",
      "dams",
      data.dams?.mazar?.timestamp,
      2,
      "https://generacioncsr.celec.gob.ec/",
    ],
    [
      "CENACE",
      "cenace",
      data.cenace?.observedAt,
      2,
      "https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm",
    ],
    [
      "AMBIENT",
      "weather",
      data.weather?.timestamp,
      1,
      "https://ambientweather.net/",
    ],
    [
      "NOAA",
      "enso",
      data.enso?.sourceDate ? data.enso.sourceDate + "T12:00:00Z" : null,
      14 * 24,
      "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
    ],
    [
      "FORECAST",
      "forecast",
      data.forecast?.retrievedAt,
      3,
      "https://open-meteo.com/",
    ],
  ];
  return specs.map(([name, key, time, hours, url]) => ({
    name,
    key,
    time,
    url,
    state: !validTime(time)
      ? "unknown"
      : fresh(time, hours) && !data[key]?.retrievalFailed
        ? "fresh"
        : "stale",
  }));
}
function paintConsole(data) {
  const maz = data.dams?.mazar,
    w = data.weather,
    c = data.cenace;
  const demand = c?.hourly?.series?.["DEMANDA NACIONAL"]?.findLast(finite);
  const comp = c?.composition;
  const values = ["hidroeléctrica", "térmica", "renovable", "importación"].map(
    (k) => comp?.[k],
  );
  const total = values.every(finite)
    ? values.reduce((sum, v) => sum + v, 0)
    : null;
  set("kpi-mazar", format(maz?.cotaMsnm, 2));
  set("kpi-inflow", format(maz?.caudalEntradaM3s, 1));
  set("kpi-demand", format(demand, 0));
  set("kpi-hydro", total > 0 ? format((values[0] / total) * 100, 1) : "—");
  set("kpi-temp", format(w?.tempC, 1));
  set("kpi-rain", format(w?.rainDailyMm, 1));
  const metrics = [
    ["TEMPERATURA", w?.tempC, "°C", 1],
    ["HUMEDAD", w?.humidity, "%", 0],
    ["LLUVIA / HORA", w?.rainRateMmHr, "mm/h", 2],
    ["LLUVIA / DÍA", w?.rainDailyMm, "mm", 1],
    ["RÁFAGA", w?.windGustKmh, "km/h", 1],
    ["PRESIÓN", w?.pressureHpa, "hPa", 1],
    ["ÍNDICE UV", w?.uvIndex, "", 1],
    ["RADIACIÓN SOLAR", w?.solarRadiation, "W/m²", 0],
  ];
  list("weather-telemetry", metrics, ([label, value, unit, digits]) => {
    const field = element("div", "telemetry-field");
    const strong = element("strong", null, format(value, digits));
    strong.append(element("small", null, unit));
    field.append(element("span", null, label), strong);
    return field;
  });
  dataTable(
    "energy-table",
    ["CENTRAL", "PRODUCCIÓN / MWh", "FECHA DE ORIGEN"],
    (c?.hydroGenerators || []).map((g) => [
      g.central,
      { text: format(g.generationMWh, 0), className: "numeric" },
      c.sourceDate || "—",
    ]),
  );
  dataTable(
    "forecast-table",
    ["HORA / ECUADOR", "PRECIP. / mm", "PROB. LLUVIA / %", "TEMP. / °C"],
    (data.forecast?.hours || []).map((r) => [
      fmtDate(r.timestamp),
      { text: format(r.precipitationMm, 2), className: "numeric" },
      format(r.precipitationProbability, 0),
      format(r.tempC, 1),
    ]),
  );
  dataTable(
    "enso-table",
    ["SEMANA", "NIÑO 1+2 / °C", "NIÑO 3.4 / °C"],
    [...(data.enso?.series || [])]
      .reverse()
      .map((r) => [
        r.date,
        { text: signed(r.nino12), className: "numeric" },
        signed(r.nino34),
      ]),
  );
  const sources = sourceRows(data);
  list("source-links", sources, (row) => {
    const span = element("span", null, row.name),
      state = element(
        "span",
        "source-state",
        { fresh: "[OK]", stale: "[OLD]", unknown: "[N/A]" }[row.state],
      );
    state.dataset.state = row.state;
    span.append(state);
    return span;
  });
  set(
    "source-count",
    `${sources.filter((r) => r.state === "fresh").length}/5 RECIENTES`,
  );
  const rows = sources.map((row) => [
    row.name,
    {
      text: { fresh: "OK", stale: "ANTIGUA / FALLO", unknown: "SIN DATOS" }[
        row.state
      ],
      className: "state-" + row.state,
    },
    fmtDate(row.time),
    age(row.time),
  ]);
  dataTable(
    "source-table",
    ["ORIGEN", "ESTADO", "MEDICIÓN / CONSULTA", "ANTIGÜEDAD"],
    rows,
  );
  set(
    "footer-sync",
    `SYNC ${fmtDate(data.timestamp, { day: undefined, month: undefined })}`,
  );
  const signature =
    sources.map((r) => r.name + ":" + r.state).join("|") +
    "|" +
    data.assessment?.energy?.level +
    "|" +
    data.assessment?.local?.level;
  if (signature !== lastDataSignature) {
    const unavailable = sources
      .filter((r) => r.state !== "fresh")
      .map((r) => r.name);
    events.unshift({
      time: data.timestamp,
      text: `SYNC / ${unavailable.length ? "PARCIAL: " + unavailable.join(", ") : "FUENTES RECIBIDAS"} / PWR:${data.assessment?.energy?.level || "N/A"} MET:${data.assessment?.local?.level || "N/A"}`,
      warning: unavailable.length > 0,
    });
    events.splice(30);
    lastDataSignature = signature;
  }
  list("event-log", events, (event) => {
    const row = element("div", event.warning ? "event-warning" : null);
    row.append(
      element(
        "time",
        null,
        fmtDate(event.time, { day: undefined, month: undefined }),
      ),
      document.createTextNode("> " + event.text),
    );
    return row;
  });
}
function openDialog(id) {
  for (const dialog of document.querySelectorAll("dialog[open]"))
    if (dialog.id !== id) dialog.close();
  if (!$(id).open) $(id).showModal();
}
function openDetail(key = selectedPanel) {
  selectPanel(key);
  openDialog("detail-dialog");
  paintDetail(key);
}
function paintDetail(key) {
  set("detail-title", panelNames[key]);
  const base = charts.get(panelChart[key]);
  showEmpty("detail-empty", !base, "NO SERIES / SIN HISTORIA SUFICIENTE");
  if (base) {
    const data = JSON.parse(JSON.stringify(base.data || base.config?.data));
    const options = {
      plugins: {
        legend: {
          display: true,
          labels: {
            color: css("--muted"),
            font: { size: 13, family: "IBM Plex Mono" },
            boxWidth: 15,
          },
        },
      },
    };
    if (key === "national")
      options.scales = {
        x: {
          grid: { display: false },
          ticks: { color: css("--muted"), maxTicksLimit: 8 },
        },
        y: {
          stacked: true,
          grid: { color: css("--chart-grid") },
          ticks: { color: css("--muted") },
        },
      };
    chart("detail-chart", base.config?.type || "line", data, options);
  } else removeChart("detail-chart");
  const content = $("detail-content");
  content.replaceChildren();
  const data = snapshot || {};
  let headers = [],
    rows = [],
    note = "",
    source = "";
  if (key === "mazar") {
    const m = data.dams?.mazar || {};
    headers = ["MEDICIÓN / ECUADOR", "COTA / m"];
    rows = [...(m.history || [])]
      .reverse()
      .map((r) => [fmtDate(r.loctimestamp), format(r.valueedit, 2)]);
    const group = element("div", "detail-kpis");
    for (const [label, value] of [
      ["COTA / m", format(m.cotaMsnm, 2)],
      ["24 H / m/día", signed(m.changeMPerDay, 2)],
      ["48–72 H / m/día", signed(m.longTermChangeMPerDay, 2)],
    ]) {
      const item = element("div");
      item.append(element("span", null, label), element("strong", null, value));
      group.append(item);
    }
    content.append(group);
    note = `${data.assessment?.energy?.summary || "Datos insuficientes."} Seguridad: 2115 m; mínimo de diseño: 2098 m. ${finite(m.daysToShutdown) ? "Escenario: " + format(m.daysToShutdown, 1) + " días hasta 2115 si continúa el ritmo reciente." : "Sin escenario de descenso útil."} No es una fecha de apagón.`;
    const reasons = element("ul", "detail-reasons");
    for (const reason of data.assessment?.energy?.reasons || [])
      reasons.append(element("li", null, reason));
    content.append(reasons);
    source = "https://generacioncsr.celec.gob.ec/";
  } else if (key === "rain") {
    if (rainMode === "forecast") {
      headers = ["HORA", "PREVISIÓN / mm", "PROB. LLUVIA / %", "TEMP. / °C"];
      rows = (data.forecast?.hours || []).map((r) => [
        fmtDate(r.timestamp),
        format(r.precipitationMm, 2),
        format(r.precipitationProbability, 0),
        format(r.tempC, 1),
      ]);
      note =
        "Previsión de modelo para la cabecera cantonal; no observación de estación ni aviso oficial. Consultado " +
        fmtDate(data.forecast?.retrievedAt) +
        ".";
      source = "https://open-meteo.com/";
    } else {
      headers = ["MEDICIÓN", "INTENSIDAD / mm/h", "DÍA / mm", "TEMP. / °C"];
      rows = [...(data.weather?.history || [])]
        .reverse()
        .map((r) => [
          fmtDate(r.loctimestamp),
          format(r.rainRateMmHr, 2),
          format(r.rainDailyMm, 1),
          format(r.tempC, 1),
        ]);
      note =
        "Una estación de Pallatanga. La intensidad y acumulación observadas no miden saturación de suelo ni probabilidad de deslave.";
      source = "https://ambientweather.net/";
    }
  } else if (key === "national") {
    const h = data.cenace?.hourly;
    headers = ["HORA", "HIDRO / MW", "TÉRMICA / MW", "DEMANDA / MW"];
    rows = (h?.labels || []).map((label, i) => [
      label,
      format(h.series?.Hidráulica?.[i], 1),
      format(h.series?.Térmica?.[i], 1),
      format(h.series?.["DEMANDA NACIONAL"]?.[i], 1),
    ]);
    note =
      "Fecha CENACE: " +
      (data.cenace?.sourceDate || "sin confirmar") +
      ". La curva mide producción y demanda atendida; no mide respaldo adicional ni confirma ausencia de racionamientos. " +
      (data.assessment?.energy?.missing || []).join(" / ");
    source =
      "https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm";
  } else {
    headers = ["SEMANA", "NIÑO 1+2 / °C", "NIÑO 3.4 / °C"];
    rows = [...(data.enso?.series || [])]
      .reverse()
      .map((r) => [r.date, signed(r.nino12), signed(r.nino34)]);
    note =
      "Anomalía relativa semanal; no ONI/RONI trimestral. Diagnóstico oficial: " +
      (data.enso?.official?.label || "no disponible") +
      " / " +
      (data.enso?.official?.issuedAt || "sin fecha") +
      ". ENSO no determina por sí solo un apagón o deslave.";
    source =
      "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml";
  }
  content.append(element("p", "detail-content-note", note));
  const table = element("div", "table-scroll");
  dataTable(table, headers, rows);
  content.append(table);
  const link = element("a", "detail-source", "FUENTE ORIGINAL ↗");
  link.href = source;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  content.append(link);
  resizeCharts();
}
function toggleCRT() {
  const enabled = document.documentElement.dataset.crt !== "on";
  document.documentElement.dataset.crt = enabled ? "on" : "off";
  $("theme").setAttribute("aria-pressed", String(enabled));
  $("theme").textContent = enabled ? "CRT ON" : "CRT";
  $("theme").setAttribute(
    "aria-label",
    enabled ? "Desactivar efecto CRT" : "Activar efecto CRT",
  );
  $("theme").title = enabled
    ? "CRT encendido: líneas, brillo y viñeta"
    : "Activar efecto CRT";
}
function toggleFocus() {
  document.body.classList.toggle("focus-mode");
  resizeCharts();
}
async function openShare() {
  set("share-feedback", "");
  openDialog("share-dialog");
  if (document.fonts?.ready) await document.fonts.ready;
  paintShare();
}
const commands = [
  ...Object.entries(viewConfig).map(([view, config], i) => ({
    label: `VISTA / ${config.name}`,
    search: config.title + " " + view,
    key: String(i + 1),
    action: () => setView(view),
  })),
  { label: "SYNC / CONSULTAR FUENTES", key: "R", action: sync },
  {
    label: "INSPECTOR / PANEL SELECCIONADO",
    key: "D",
    action: () => openDetail(),
  },
  { label: "EXPORTAR / SNAPSHOT", key: "S", action: openShare },
  { label: "FOCO / ALTERNAR", key: "F", action: toggleFocus },
  { label: "CRT / ALTERNAR", key: "", action: toggleCRT },
  {
    label: "AYUDA / HOTKEYS",
    key: "?",
    action: () => openDialog("help-dialog"),
  },
];
const normalize = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
function renderCommands() {
  const query = normalize($("command-input").value);
  filteredCommands = commands.filter((c) =>
    normalize(c.label + " " + (c.search || "")).includes(query),
  );
  commandIndex = Math.min(
    commandIndex,
    Math.max(0, filteredCommands.length - 1),
  );
  list("command-list", filteredCommands, (command, i) => {
    const row = element(
      "button",
      "command-row" + (i === commandIndex ? " selected" : ""),
    );
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(i === commandIndex));
    row.id = "command-option-" + i;
    row.append(
      element("span", null, command.label),
      element("kbd", null, command.key),
    );
    row.addEventListener("click", () => runCommand(i));
    return row;
  });
  $("command-input").setAttribute(
    "aria-activedescendant",
    filteredCommands.length ? "command-option-" + commandIndex : "",
  );
}
function runCommand(index) {
  const command = filteredCommands[index];
  if (!command) return;
  $("command-dialog").close();
  $("workspace").focus({ preventScroll: true });
  command.action();
}
function openCommands() {
  openDialog("command-dialog");
  $("command-input").value = "";
  commandIndex = 0;
  renderCommands();
  $("command-input").focus();
}
for (const button of document.querySelectorAll("[data-view]"))
  button.addEventListener("click", () => setView(button.dataset.view));
for (const panel of Object.values(panels)) {
  panel.addEventListener("pointerdown", () => selectPanel(panel.dataset.panel));
  panel.addEventListener("focusin", () => selectPanel(panel.dataset.panel));
}
for (const button of document.querySelectorAll("[data-detail]"))
  button.addEventListener("click", () => openDetail(button.dataset.detail));
for (const button of document.querySelectorAll("[data-close]"))
  button.addEventListener("click", () => $(button.dataset.close).close());
$("detail-dialog").addEventListener("close", () => removeChart("detail-chart"));
$("command-list").setAttribute("role", "listbox");
$("command-input").setAttribute("aria-controls", "command-list");
$("command-open").addEventListener("click", openCommands);
$("help-open").addEventListener("click", () => openDialog("help-dialog"));
$("command-input").addEventListener("input", () => {
  commandIndex = 0;
  renderCommands();
});
$("command-input").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    commandIndex =
      (commandIndex +
        (event.key === "ArrowDown" ? 1 : -1) +
        filteredCommands.length) %
      Math.max(1, filteredCommands.length);
    renderCommands();
  } else if (event.key === "Enter") {
    event.preventDefault();
    runCommand(commandIndex);
  }
});
window.addEventListener("hashchange", () =>
  setView(location.hash.slice(1), false),
);
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.repeat) return;
  const editing = event.target?.closest?.(
    'input,textarea,select,[contenteditable="true"]',
  );
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openCommands();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || editing) return;
  if (event.key === "Escape") {
    if (
      !document.querySelector("dialog[open]") &&
      document.body.classList.contains("focus-mode")
    ) {
      event.preventDefault();
      toggleFocus();
    }
    return;
  }
  if (document.querySelector("dialog[open]")) return;
  const key = event.key.toLowerCase();
  if (/^[1-5]$/.test(key)) {
    event.preventDefault();
    setView(Object.keys(viewConfig)[Number(key) - 1]);
  } else if (key === "r") {
    event.preventDefault();
    sync();
  } else if (key === "d") {
    event.preventDefault();
    openDetail();
  } else if (key === "s") {
    event.preventDefault();
    openShare();
  } else if (key === "/") {
    event.preventDefault();
    openCommands();
  } else if (key === "?" || key === "f1") {
    event.preventDefault();
    openDialog("help-dialog");
  } else if (key === "f") {
    event.preventDefault();
    toggleFocus();
  }
});

$("theme").addEventListener("click", toggleCRT);
$("refresh").addEventListener("click", sync);
for (const button of document.querySelectorAll("[data-maz-window]"))
  button.addEventListener("click", () => {
    mazWindow = Number(button.dataset.mazWindow);
    document
      .querySelectorAll("[data-maz-window]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    if (snapshot) paintMazar(snapshot);
  });
for (const button of document.querySelectorAll("[data-rain-mode]"))
  button.addEventListener("click", () => {
    rainMode = button.dataset.rainMode;
    document
      .querySelectorAll("[data-rain-mode]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    if (snapshot) paintRain(snapshot);
  });
for (const button of document.querySelectorAll(".share-trigger"))
  button.addEventListener("click", openShare);
$("share-close").addEventListener("click", () => $("share-dialog").close());
$("share-dialog").addEventListener("click", (event) => {
  if (event.target === $("share-dialog")) {
    const rect = $("share-dialog").getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      $("share-dialog").close();
  }
});
async function copySummary() {
  try {
    await navigator.clipboard.writeText(shareText());
    set("share-feedback", "Resumen y enlace copiados.");
  } catch {
    set(
      "share-feedback",
      "No se pudo copiar. Compartí el enlace desde la barra de tu navegador.",
    );
  }
}
$("share-copy").addEventListener("click", copySummary);
$("share-native").addEventListener("click", async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "AEGIS · Energía y clima, con contexto",
        text: shareText(),
        url: location.origin,
      });
    } catch (error) {
      if (error.name !== "AbortError") await copySummary();
    }
  } else await copySummary();
});
$("share-download").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = `aegis-panorama-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = $("share-canvas").toDataURL("image/png");
  link.click();
  set(
    "share-feedback",
    "Imagen descargada. Incluí el enlace para consultar actualizaciones.",
  );
});
set(
  "today",
  new Date().toLocaleDateString("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "long",
    day: "numeric",
    month: "long",
  }),
);
window.Aegis = {
  render,
  paintShare,
  shareText,
  setView,
  openDetail,
  openCommands,
};
setView(
  viewConfig[location.hash.slice(1)] ? location.hash.slice(1) : "overview",
  false,
);
updateClock();
setInterval(updateClock, 1000);
sync();
setInterval(sync, 5 * 60000);
