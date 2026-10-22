import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HistoryStore } from "./history.js";
import {
  fetchPublic,
  loadDams,
  loadWeather,
  parseCenace,
  parseEnso,
  parseForecast,
  SOURCE_URLS,
} from "./sources.js";
import { buildAssessment } from "./assessment.js";
import { readFeatureFlags } from "./feature-flags.js";
import { isPublicV1Request, registerPublicV1 } from "./api/public-v1.js";
import { emptyReader } from "./storage/public-reader.js";
import { isCitizenReportRequest } from "./api/citizen-reports.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const localIP = (ip) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
function originHost(value) {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).host;
  } catch {
    return null;
  }
}

export async function createApp({
  fetchUrl = fetchPublic,
  store = new HistoryStore(
    process.env.DATA_DIR || path.join(directory, ".data"),
  ),
  now = () => new Date(),
  mac = process.env.AMBIENT_MAC,
  flags = readFeatureFlags(),
  reportsOrigin = process.env.REPORTS_ORIGIN,
  openV5Store = async () => {
    const { openStore } = await import("./storage/sqlite-store.js");
    return openStore({ now });
  },
} = {}) {
  const features = readFeatureFlags(flags);
  if (features.OFFICIAL_SCHEDULES && (!features.PUBLIC_API_V1 || !features.SQLITE_STORAGE || features.BLACKOUT_DEMO)) throw new Error("OFFICIAL_SCHEDULES requiere API pública y SQLite sin demo de mapa");
  if (features.BLACKOUT_MAP && !features.PUBLIC_API_V1) throw new Error("BLACKOUT_MAP requiere PUBLIC_API_V1");
  if (features.BLACKOUT_DEMO && (!features.BLACKOUT_MAP || features.SQLITE_STORAGE)) {
    throw new Error("BLACKOUT_DEMO requiere BLACKOUT_MAP y SQLITE_STORAGE apagado; demo aislada en memoria");
  }
  if (features.CITIZEN_REPORTS && (!features.BLACKOUT_MAP || !features.BLACKOUT_DEMO && !features.SQLITE_STORAGE)) {
    throw new Error("CITIZEN_REPORTS requiere mapa y SQLite live o demo aislada");
  }
  if (features.CITIZEN_REPORTS && !features.BLACKOUT_DEMO) {
    let valid = false;
    try { const url = new URL(reportsOrigin); valid = url.origin === reportsOrigin && url.protocol === "https:"; } catch { /* Fail closed. */ }
    if (!valid) throw new Error("Configurar REPORTS_ORIGIN como origen HTTPS canónico antes de habilitar reportes live");
  }
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1", "::1", "::ffff:127.0.0.1"],
  });
  // Preserve the existing public-dashboard policy. No private station identifier is returned.
  app.addHook("onRequest", async (req, reply) => {
    const endpoint = req.url.split("?")[0];
    if (features.PUBLIC_API_V1 && isPublicV1Request(req)) return;
    if (features.CITIZEN_REPORTS && isCitizenReportRequest(req)) return;
    if (!endpoint.startsWith("/api/") || localIP(req.ip)) return;
    if (endpoint === "/api/status") {
      const host = originHost(req.headers.host || "");
      if (
        host &&
        [req.headers.origin, req.headers.referer].some(
          (v) => v && originHost(v) === host,
        )
      )
        return;
    }
    return reply
      .code(403)
      .send({ error: "Acceso al panorama desde el dashboard" });
  });
  let publicReader = emptyReader;
  let reportStore;
  if (features.SQLITE_STORAGE) {
    // Optional storage is never used in place of the v4 HistoryStore.
    const v5Store = await openV5Store();
    app.decorate("v5Store", v5Store);
    app.addHook("onClose", async () => v5Store.close());
    publicReader = v5Store.publicReader || emptyReader;
    reportStore = v5Store;
  }
  if (features.BLACKOUT_DEMO) {
    const { openStore } = await import("./storage/sqlite-store.js");
    const demoStore = await openStore({ directory: ":memory:", synthetic: true, now });
    try {
      demoStore.writeBatch(JSON.parse(fs.readFileSync(path.join(directory, "demo/blackout.json"), "utf8")));
    } catch (error) { demoStore.close(); throw error; }
    app.addHook("onClose", async () => demoStore.close());
    publicReader = demoStore.publicReader;
    reportStore = demoStore;
  }
  if (features.PUBLIC_API_V1) await registerPublicV1(app, { now, blackout: features.BLACKOUT_MAP, reader: publicReader,
    schedules: features.OFFICIAL_SCHEDULES ? reportStore : null,
    reporting: features.CITIZEN_REPORTS ? { store: reportStore, origin: reportsOrigin } : null,
  });
  const caches = new Map();
  const inflight = new Map();
  const getText = async (url, options) => {
    const result = await fetchUrl(url, options);
    if (result.status !== 200) throw new Error("Fuente no disponible");
    return result.data;
  };
  const loaders = {
    dams: [600000, (date) => loadDams(fetchUrl, store, date)],
    weather: [300000, (date) => loadWeather(fetchUrl, store, date, mac)],
    cenace: [
      600000,
      async (date) =>
        parseCenace(
          await getText(SOURCE_URLS.cenace, { rejectUnauthorized: false }),
          date,
        ),
    ],
    enso: [
      3600000,
      async (date) => {
        const [indices, bulletin] = await Promise.allSettled([
          getText(SOURCE_URLS.indices),
          getText(SOURCE_URLS.enso),
        ]);
        if (indices.status !== "fulfilled")
          throw new Error("NOAA no disponible");
        return parseEnso(
          indices.value,
          bulletin.status === "fulfilled" ? bulletin.value : null,
          date,
        );
      },
    ],
    forecast: [
      1800000,
      async (date) =>
        parseForecast(JSON.parse(await getText(SOURCE_URLS.forecast)), date),
    ],
  };
  async function load(name) {
    const date = now();
    const [ttl, loader] = loaders[name];
    const cached = caches.get(name);
    if (cached && date.getTime() - cached.at < (cached.ttl ?? ttl))
      return cached.data;
    if (inflight.has(name)) return inflight.get(name);
    const pending = (async () => {
      try {
        const data = await loader(date);
        caches.set(name, { at: date.getTime(), data });
        return data;
      } catch {
        // Keep source dates intact, explicitly signal a failed refresh.
        const data = cached
          ? { ...cached.data, retrievalFailed: true }
          : {
              error: "Fuente temporalmente no disponible",
              retrievalFailed: true,
            };
        caches.set(name, { at: date.getTime(), data, ttl: 60000 });
        return data;
      } finally {
        inflight.delete(name);
      }
    })();
    inflight.set(name, pending);
    return pending;
  }
  for (const name of Object.keys(loaders))
    app.get(`/api/${name}`, async () => load(name));
  app.get("/api/status", async () => {
    const names = Object.keys(loaders);
    const values = await Promise.all(names.map(load));
    const data = Object.fromEntries(names.map((name, i) => [name, values[i]]));
    const date = now();
    return {
      timestamp: date.toISOString(),
      ...data,
      assessment: buildAssessment(data, date),
    };
  });
  const serveUI = (_, reply) =>
    reply
      .header("Cache-Control", "no-cache")
      .type("text/html")
      .send(fs.readFileSync(path.join(directory, "frontend.html")));
  app.get("/", serveUI);
  app.get("/ui", serveUI);
  if (features.BLACKOUT_MAP) app.get("/map", (_, reply) => reply
    .header("Cache-Control", "no-store")
    .header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
    .header("Referrer-Policy", "no-referrer")
    .type("text/html").send(fs.readFileSync(path.join(directory, "public/blackout.html"), "utf8").replace("<!-- reports-link -->",
      features.CITIZEN_REPORTS ? '<a id="reports-link" class="secondary report-link" href="/report">Reportar o gestionar un reporte →</a>' : "")
      .replace("<!-- report-availability -->", features.CITIZEN_REPORTS
        ? "Los reportes requieren revisión y solo se consultan agregados por sector. Las notificaciones aún no están habilitadas."
        : "Reportar, suscribirse y recibir notificaciones se habilitarán en etapas posteriores.")));
  if (features.CITIZEN_REPORTS) app.get("/report", (_, reply) => reply.header("Cache-Control", "no-store")
    .header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
    .header("Referrer-Policy", "no-referrer").type("text/html").send(fs.readFileSync(path.join(directory, "public/report.html"))));
  const assets = {
    "app.js": "text/javascript",
    "style.css": "text/css",
    "social.png": "image/png",
    "favicon.svg": "image/svg+xml",
  };
  if (features.BLACKOUT_MAP) Object.assign(assets, {
    "blackout.js": "text/javascript", "blackout.css": "text/css", "blackout-map.js": "text/javascript",
    "map/ecuador.geojson": "application/geo+json",
  });
  if (features.CITIZEN_REPORTS) Object.assign(assets, { "report.js": "text/javascript", "report.css": "text/css" });
  for (const [file, type] of Object.entries(assets))
    app.get(`/assets/${file}`, (_, reply) => {
      const asset = path.join(directory, "public", file);
      if (!fs.existsSync(asset)) return reply.code(404).send();
      return reply
        .header(
          "Cache-Control",
          ["app.js", "style.css"].includes(file)
            ? "no-cache"
            : "public, max-age=3600",
        )
        .type(type)
        .send(fs.readFileSync(asset));
    });
  app.get("/assets/chart.js", (_, reply) =>
    reply
      .type("text/javascript")
      .header("Cache-Control", "public, max-age=86400")
      .send(
        fs.readFileSync(
          path.join(directory, "node_modules/chart.js/dist/chart.umd.js"),
        ),
      ),
  );
  return app;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await createApp();
  await app.listen({ port: Number(process.env.PORT || 3010), host: "0.0.0.0" });
  console.log(`AEGIS Grid disponible en puerto ${process.env.PORT || 3010}`);
}
