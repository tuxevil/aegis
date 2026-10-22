import { registerInfrastructure } from "./infrastructure.js";
import { registerTimeline } from "./timeline.js";
import { registerSubscriptionsApi } from "./subscriptions.js";
import { registerSchedulesApi } from "./schedules.js";
import { errorSchema } from "./schemas.js";
import { registerBlackoutApi } from "./blackout.js";
import { registerCitizenReports } from "./citizen-reports.js";

// This metadata belongs to registered routes, never to a URL prefix.
export function isPublicV1Request(req) {
  return req.method === "GET" && req.routeOptions.config.publicApiV1 === true;
}

export async function registerPublicV1(app, { now, blackout = false, reader, reporting = null, schedules = null, subscriptions = null, timeline = null, infrastructure = null }) {
  await app.register(async (publicApi) => {
    publicApi.setErrorHandler((error, req, reply) => {
      const status = error.validation || error.statusCode === 400 ? 400 : error.statusCode === 404 ? 404 : error.statusCode === 429 ? 429 : 500;
      reply.header("Cache-Control", "no-store").code(status).send({ error: {
        code: status === 400 ? "INVALID_REQUEST" : status === 404 ? "NOT_FOUND" : status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
        message: status === 400 ? "Solicitud inválida" : status === 404 ? "Registro no disponible" : status === 429 ? "Demasiadas solicitudes" : "Servicio no disponible",
      } });
    });
    publicApi.get("/api/v1/health/public", {
      config: { publicApiV1: true, rateLimit: { max: 60, timeWindow: "1 minute" } },
      preValidation: async (req) => {
        if (Object.keys(req.query).length) {
          const error = new Error("Unexpected query");
          error.statusCode = 400;
          throw error;
        }
      },
      schema: {
        querystring: { type: "object", additionalProperties: false, properties: {} },
        response: {
          200: {
            type: "object", additionalProperties: false,
            required: ["api_version", "status", "timestamp", "coverage"],
            properties: {
              api_version: { const: "1", type: "string" },
              status: { const: "foundation", type: "string" },
              timestamp: { type: "string", format: "date-time" },
              coverage: { const: "unknown", type: "string" },
            },
          },
          400: errorSchema, 429: errorSchema, 500: errorSchema,
        },
      },
    }, async () => ({
      api_version: "1", status: "foundation", timestamp: now().toISOString(), coverage: "unknown",
    }));
    if (infrastructure) registerInfrastructure(publicApi, infrastructure);
    if (timeline) registerTimeline(publicApi, { store: timeline, now });
    if (subscriptions) await registerSubscriptionsApi(publicApi, { ...subscriptions, now });
    if (schedules) registerSchedulesApi(publicApi, { store:schedules, now });
    if (blackout) registerBlackoutApi(publicApi, { reader, now });
    if (reporting) await registerCitizenReports(publicApi, { ...reporting, now });
  });
}
