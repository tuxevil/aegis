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
import {registerHazardRoutes,hazardPaths} from "./hazards/routes.js";
import {HazardPublicReader} from "./hazards/public-reader.js";
import {registerAlertAdminRoutes} from "./alerts/admin-routes.js";
import {AlertJournal} from "./alerts/journal.js";
import {EditorialService} from "./alerts/editorial.js";
import {DryRunOutbox} from "./alerts/outbox.js";
import {archiveEvidenceVerifier} from "./alerts/evidence.js";
import {TerritoryPreviewReader} from "./hazards/territory-preview.js";
import {RawArtifactStore} from "./hazards/artifact-store.js";
import {ZoneSubscriptions} from "./alerts/subscriptions.js";
import {registerSubscriptionRoutes} from "./alerts/subscription-routes.js";

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
  hazardsEnabled = process.env.HAZARDS_ENABLED === "true",
  hazardReader = null,
  alertsAdminEnabled = process.env.ALERTS_ADMIN_ENABLED === "true",
  alertsAdminCredentials = null,
  alertsAdminServices = null,
  zoneSubscriptionsEnabled = process.env.ZONE_SUBSCRIPTIONS_ENABLED === "true",
  zoneSubscriptionService = null,
} = {}) {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1", "::1", "::ffff:127.0.0.1"],
  });
  // Preserve the existing public-dashboard policy. No private station identifier is returned.
  app.addHook("onRequest", async (req, reply) => {
    const endpoint = req.url.split("?")[0];
    if (!endpoint.startsWith("/api/") || localIP(req.ip)) return;
    if (zoneSubscriptionsEnabled && req.routeOptions.config.aegisSubscriptions === true) return;
    if (alertsAdminEnabled && req.routeOptions.config.aegisAlertAdmin === true) return;
    if (hazardsEnabled && req.method === "GET" && hazardPaths.includes(endpoint) && req.routeOptions.config.aegisPublicRead === true) return;
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
  if (hazardsEnabled) await registerHazardRoutes(app,{reader:hazardReader||new HazardPublicReader({dataDir:process.env.DATA_DIR||path.join(directory,".data"),now})});
  const subscriptionService=zoneSubscriptionsEnabled?(zoneSubscriptionService||new ZoneSubscriptions({
    journal:new AlertJournal(process.env.DATA_DIR||path.join(directory,".data"),{kind:"subscriptions"}),now:()=>now().toISOString()})):null;
  if (alertsAdminEnabled) {
    const alertNow=()=>now().toISOString();
    let credentials=alertsAdminCredentials;
    if(credentials===null) {
      try {credentials=JSON.parse(process.env.ALERTS_ADMIN_CREDENTIALS_JSON||"null");}
      catch {throw new Error("invalid_admin_credentials");}
    }
    let services=alertsAdminServices;
    if(!services) {
      const dataDir=process.env.DATA_DIR||path.join(directory,".data");
      const sourceStore=new RawArtifactStore(dataDir,{readOnly:true}),journal=new AlertJournal(dataDir);
      const verifyEvidence=archiveEvidenceVerifier(sourceStore);
      services={sourceStore,territoryReader:new TerritoryPreviewReader({store:new RawArtifactStore(dataDir,{namespace:"layers",readOnly:true}),now:alertNow}),editorial:new EditorialService({journal,verifyEvidence,now:alertNow}),outbox:new DryRunOutbox({journal,verifyEvidence,now:alertNow})};
    }
    await registerAlertAdminRoutes(app,{...services,credentials,now:alertNow,zoneSubscriptions:subscriptionService});
  }
  if (zoneSubscriptionsEnabled) await registerSubscriptionRoutes(app,{service:subscriptionService});
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
      .send(fs.readFileSync(path.join(directory, "frontend.html"),"utf8").replace("<!-- HAZARDS_NAV -->",[hazardsEnabled?'<a href="/hazards/">Multiamenaza · fuentes</a>':"",zoneSubscriptionsEnabled?'<a href="/ciudades/">Ciudades · preferencias</a>':""].filter(Boolean).join(" ")));
  app.get("/", serveUI);
  app.get("/ui", serveUI);
  const assets = {
    "app.js": "text/javascript",
    "style.css": "text/css",
    "social.png": "image/png",
    "favicon.svg": "image/svg+xml",
  };
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
