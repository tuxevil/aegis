import https from "node:https";
import http from "node:http";
import { JSDOM } from "jsdom";
import { fetchMrid } from "./celec.js";
import { assessMazar } from "./mazar.js";

export const SOURCE_URLS = {
  celec: "https://generacioncsr.celec.gob.ec/",
  cenace: "https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm",
  enso: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
  indices: "https://www.cpc.ncep.noaa.gov/data/indices/rel_wksst9120.txt",
  forecast:
    "https://api.open-meteo.com/v1/forecast?latitude=-1.99856&longitude=-78.96629&hourly=temperature_2m,precipitation,precipitation_probability&forecast_days=3&timezone=America%2FGuayaquil",
};

export function fetchPublic(
  url,
  { rejectUnauthorized = true, timeoutMs = 12000 } = {},
) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        rejectUnauthorized,
        headers: {
          "User-Agent": "AEGIS-Grid/4.0 (public environmental dashboard)",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
          if (data.length > 8 * 1024 * 1024)
            req.destroy(new Error("Respuesta demasiado grande"));
        });
        res.on("end", () => resolve({ status: res.statusCode, data }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () =>
      req.destroy(new Error("Fuente no respondió a tiempo")),
    );
  });
}

export function decodePlotlyY(raw) {
  if (Array.isArray(raw))
    return raw.map((v) => (Number.isFinite(v) ? v : null));
  const readers = {
    f8: [8, "readDoubleLE"],
    f4: [4, "readFloatLE"],
    i4: [4, "readInt32LE"],
    i2: [2, "readInt16LE"],
  };
  const type = readers[raw?.dtype];
  if (!type || typeof raw.bdata !== "string") return [];
  const buf = Buffer.from(raw.bdata, "base64");
  const result = [];
  for (let i = 0; i + type[0] <= buf.length; i += type[0]) {
    const v = buf[type[1]](i);
    result.push(Number.isFinite(v) ? v : null);
  }
  return result;
}

function plotsIn(element) {
  const result = [];
  for (const script of element.querySelectorAll("script")) {
    const code = script.textContent;
    const start = /Plotly\.newPlot\(\s*["'][^"']+["']\s*,\s*/g;
    let match;
    while ((match = start.exec(code))) {
      let quoted = false,
        escape = false,
        depth = 0;
      const from = start.lastIndex;
      for (let i = from; i < code.length; i++) {
        const ch = code[i];
        if (quoted) {
          if (escape) escape = false;
          else if (ch === "\\") escape = true;
          else if (ch === '"') quoted = false;
        } else if (ch === '"') quoted = true;
        else if (ch === "[" || ch === "{") depth++;
        else if (ch === "]" || ch === "}") {
          depth--;
          if (depth === 0) {
            try {
              result.push(JSON.parse(code.slice(from, i + 1)));
            } catch {
              /* reject changed source format */
            }
            start.lastIndex = i + 1;
            break;
          }
        }
      }
    }
  }
  return result;
}

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export function ecuadorDay(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parseCenace(html, now = new Date()) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  // Choose the semantic section, never the largest chart across daily/monthly/annual tabs.
  const current = [...document.querySelectorAll(".tab-content")].find((el) =>
    /PRODUCCI[ÓO]N EN TIEMPO REAL/.test(
      el.querySelector("h2")?.textContent || "",
    ),
  );
  if (!current) {
    dom.window.close();
    throw new Error("Sección CENACE no reconocida");
  }
  const dateMatch = [...current.querySelectorAll("span")]
    .map((el) => el.textContent.toLowerCase())
    .find((t) => /\d{1,2} de [a-z]+ de \d{4}/.test(t))
    ?.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  const month = dateMatch ? MONTHS_ES.indexOf(dateMatch[2]) : -1;
  const sourceDate =
    month >= 0
      ? `${dateMatch[3]}-${String(month + 1).padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`
      : null;
  let composition = null,
    hydroGenerators = [],
    hourly = null;
  for (const data of plotsIn(current)) {
    if (!Array.isArray(data) || !data.length) continue;
    const first = data[0];
    if (first.type === "pie" && first.labels?.some((l) => /HIDROEL/i.test(l))) {
      composition = {};
      first.labels.forEach((label, i) => {
        composition[label.toLowerCase()] = Number.isFinite(first.values?.[i])
          ? +first.values[i].toFixed(2)
          : null;
      });
    }
    if (
      first.type === "bar" &&
      data.some((t) => /Coca Codo|Mazar|Paute/i.test(t.name || ""))
    ) {
      hydroGenerators = data.map((t) => ({
        central: t.name?.trim(),
        generationMWh: decodePlotlyY(t.y)[0] ?? null,
      }));
    }
    if (!hourly && first.x?.length >= 24 && /^\d\d:\d\d$/.test(first.x[0])) {
      const series = {};
      for (const t of data)
        if (t.name) {
          const values = decodePlotlyY(t.y);
          series[t.name.trim()] = first.x.map((_, i) => values[i] ?? null);
        }
      hourly = { labels: first.x, series };
    }
  }
  dom.window.close();
  if (!composition && !hourly)
    throw new Error("Gráficos CENACE no reconocidos");
  const demand = hourly?.series["DEMANDA NACIONAL"] || [];
  const index = demand.findLastIndex(Number.isFinite);
  const observedAt =
    sourceDate && index >= 0
      ? `${sourceDate}T${hourly.labels[index]}:00-05:00`
      : null;
  return {
    timestamp: now.toISOString(),
    sourceDate,
    observedAt,
    composition,
    hydroGenerators,
    hourly,
    source: SOURCE_URLS.cenace,
    scope:
      "Acumulado del día y potencia observada; no disponibilidad de reserva",
  };
}

export function parseEnso(text, bulletinHtml, now = new Date()) {
  const rows = text
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(
      (r) =>
        /^\d{2}[A-Z]{3}\d{4}$/.test(r[0]) &&
        r.length >= 5 &&
        r.slice(1, 5).every((v) => Number.isFinite(Number(v))),
    );
  const toDate = (value) => {
    const month = MONTHS_EN.findIndex(
      (m) => m.slice(0, 3).toUpperCase() === value.slice(2, 5),
    );
    return month < 0
      ? null
      : `${value.slice(5)}-${String(month + 1).padStart(2, "0")}-${value.slice(0, 2)}`;
  };
  const valid = rows.filter(
    (r) =>
      toDate(r[0]) && Date.parse(`${toDate(r[0])}T00:00:00Z`) <= now.getTime(),
  );
  if (!valid.length) throw new Error("Índices NOAA no reconocidos");
  const latest = valid.at(-1);
  let official = null;
  if (bulletinHtml) {
    const dom = new JSDOM(bulletinHtml);
    const content = dom.window.document.body.textContent.replace(/\s+/g, " ");
    const date = content.match(
      /(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})/,
    );
    const status = content.match(
      /ENSO Alert System Status:\s*(El Ni[ñn]o Advisory|La Ni[ñn]a Advisory|El Ni[ñn]o Watch|La Ni[ñn]a Watch|Not Active)/i,
    );
    if (date && status) {
      const issuedAt = `${date[3]}-${String(MONTHS_EN.indexOf(date[2]) + 1).padStart(2, "0")}-${date[1].padStart(2, "0")}`;
      const names = {
        "El Niño Advisory": "El Niño confirmado",
        "La Niña Advisory": "La Niña confirmada",
        "El Niño Watch": "Vigilancia de El Niño",
        "La Niña Watch": "Vigilancia de La Niña",
        "Not Active": "Sin aviso ENSO activo",
      };
      official = {
        status: status[1],
        label: names[status[1]] || status[1],
        issuedAt,
        source: SOURCE_URLS.enso,
      };
    }
    dom.window.close();
  }
  return {
    timestamp: now.toISOString(),
    dateReported: latest[0],
    sourceDate: toDate(latest[0]),
    nino12SSTA: +latest[1],
    nino34SSTA: +latest[3],
    official,
    series: valid
      .slice(-26)
      .map((r) => ({ date: toDate(r[0]), nino12: +r[1], nino34: +r[3] })),
    metric: "Anomalía relativa semanal (°C); no es ONI ni RONI trimestral",
    source: SOURCE_URLS.indices,
  };
}

export async function loadDams(fetchUrl, store, now) {
  const ids = [
    30031, 30538, 30503, 24019, 24811, 24812, 90919, 90537, 90503, 650919,
    650538, 650503,
  ];
  const values = await Promise.all(
    ids.map((id) =>
      fetchMrid(id, now, fetchUrl, {
        store,
        days: [30031, 30538, 24019].includes(id) ? 3 : 1,
      }),
    ),
  );
  const reading = (id) => values[ids.indexOf(id)];
  const value = (id) => reading(id)?.valueedit ?? null;
  const observed = (id) => reading(id)?.loctimestamp ?? null;
  const points = (id) =>
    store
      .read(String(id))
      .filter((r) => Date.parse(r.loctimestamp) >= now - 72 * 3600000);
  return {
    timestamp: now.toISOString(),
    source: SOURCE_URLS.celec,
    mazar: {
      cotaMsnm: value(30031),
      caudalEntradaM3s: value(30538),
      unidadesLinea: value(30503),
      timestamp: observed(30031),
      caudalTimestamp: observed(30538),
      unidadesTimestamp: observed(30503),
      history: points(30031),
      inflowHistory: points(30538),
      ...assessMazar(reading(30031), store.read("30031"), now),
    },
    molino: {
      cotaMsnm: value(24019),
      caudalRealM3s: value(24811),
      caudalCuencaM3s: value(24812),
      timestamp: observed(24019),
      history: points(24019),
    },
    sopladora: {
      cotaMsnm: value(90919),
      caudalM3s: value(90537),
      unidadesLinea: value(90503),
      timestamp: observed(90919),
    },
    minasSF: {
      cotaMsnm: value(650919),
      caudalM3s: value(650538),
      unidadesLinea: value(650503),
      timestamp: observed(650919),
    },
  };
}

const numeric = (value, conversion = (v) => v, precision = 1) =>
  Number.isFinite(value) ? +conversion(value).toFixed(precision) : null;
export function parseWeather(items, store, now) {
  const valid = items.filter(
    (d) => Number.isFinite(d.dateutc) && d.dateutc <= now.getTime() + 300000,
  );
  const points = valid.map((d) => ({
    loctimestamp: new Date(d.dateutc).toISOString(),
    tempC: numeric(d.tempf, (v) => ((v - 32) * 5) / 9),
    rainRateMmHr: numeric(d.hourlyrainin, (v) => v * 25.4, 2),
    rainDailyMm: numeric(d.dailyrainin, (v) => v * 25.4, 2),
    humidity: numeric(d.humidity),
    windGustKmh: numeric(d.windgustmph, (v) => v * 1.60934),
    pressureHpa: numeric(d.baromrelin, (v) => v * 33.8639),
    uvIndex: numeric(d.uv),
    solarRadiation: numeric(d.solarradiation),
  }));
  const saved = points.length
    ? store.record("weather", points, now)
    : store.read("weather");
  const latest = saved.at(-1);
  if (!latest) throw new Error("Sin lectura de estación");
  const history = saved.filter(
    (r) => Date.parse(r.loctimestamp) >= now - 72 * 3600000,
  );
  const baseline = history.find(
    (r) =>
      Date.parse(latest.loctimestamp) - Date.parse(r.loctimestamp) >=
        3 * 3600000 &&
      Date.parse(latest.loctimestamp) - Date.parse(r.loctimestamp) <=
        4 * 3600000 &&
      Number.isFinite(r.pressureHpa),
  );
  return {
    ...latest,
    timestamp: latest.loctimestamp,
    history,
    pressureChangeHpa:
      baseline && latest.pressureHpa !== null
        ? +(latest.pressureHpa - baseline.pressureHpa).toFixed(1)
        : null,
    source: "https://ambientweather.net/",
    scope: "Una estación local de Pallatanga; no representa todo Ecuador",
  };
}

export async function loadWeather(fetchUrl, store, now, mac) {
  if (!mac)
    return {
      error: "Estación local sin conexión",
      timestamp: null,
      history: [],
    };
  try {
    const url = `https://lightning.ambientweather.net/device-data?macAddress=${encodeURIComponent(mac)}&dataKey=deviceSummaries&start=${now.getTime() - 72 * 3600000}&limit=1000`;
    const response = await fetchUrl(url);
    if (response.status !== 200) throw new Error("Estación no disponible");
    return parseWeather(JSON.parse(response.data).data || [], store, now);
  } catch {
    const fallback = parseWeather([], store, now);
    return { ...fallback, retrievalFailed: true };
  }
}

export function parseForecast(json, now) {
  if (
    !Array.isArray(json.hourly?.time) ||
    !Array.isArray(json.hourly?.precipitation)
  )
    throw new Error("Pronóstico no reconocido");
  const offset = Number(json.utc_offset_seconds);
  if (!Number.isFinite(offset))
    throw new Error("Zona horaria del pronóstico no reconocida");
  const hours = json.hourly.time
    .map((t, i) => ({
      timestamp: new Date(Date.parse(`${t}Z`) - offset * 1000).toISOString(),
      precipitationMm: numeric(json.hourly.precipitation[i], (v) => v, 2),
      precipitationProbability: numeric(
        json.hourly.precipitation_probability?.[i],
      ),
      tempC: numeric(json.hourly.temperature_2m?.[i]),
    }))
    .filter((r) => Date.parse(r.timestamp) >= now.getTime())
    .slice(0, 48);
  if (hours.length < 24) throw new Error("Pronóstico incompleto");
  return {
    retrievedAt: now.toISOString(),
    hours,
    source: "https://open-meteo.com/",
    location: "Pallatanga · cabecera cantonal",
    type: "Modelo meteorológico; no aviso oficial ni observación de estación",
  };
}
