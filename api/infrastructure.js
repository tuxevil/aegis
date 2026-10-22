import {CELEC_REFRESH_FAILURE} from "../celec.js";
import { errorSchema } from "./schemas.js";
export const INFRA_REFERENCES = Object.freeze({
  safety_m: 2115,
  design_min_m: 2098,
  design_max_m: 2153,
  unit: "m",
  volume_model: "unavailable",
  geometry: "illustrative-no-dem",
});
export function projectInfrastructure(data, history, now) {
  const value = Number.isFinite(data?.mazar?.cotaMsnm)
      ? data.mazar.cotaMsnm
      : null,
    timestamp = data?.mazar?.timestamp ?? null;
  const dated = timestamp && Number.isFinite(Date.parse(timestamp)),
    age = dated ? now.getTime() - Date.parse(timestamp) : null;
  const state =
    value === null || !dated
      ? "missing"
      : (data.retrievalFailed || data[CELEC_REFRESH_FAILURE])
        ? "failed"
        : age > 2 * 3600000 || age < -300000
          ? "stale"
          : "current";
  const observations = history
    .read("30031")
    .filter(
      (p) =>
        Number.isFinite(p.valueedit) &&
        Number.isFinite(Date.parse(p.loctimestamp)) &&
        Date.parse(p.loctimestamp) <= now.getTime() + 300000 &&
        now.getTime() - Date.parse(p.loctimestamp) <= 72 * 3600000,
    )
    .slice(-200)
    .map((p) => ({ value_m: p.valueedit, observed_at: p.loctimestamp }));
  return {
    generated_at: now.toISOString(),
    measurement: {
      value_m: value,
      observed_at: dated ? timestamp : null,
      state,
      source_url: "https://generacioncsr.celec.gob.ec/",
    },
    observations,
    references: { ...INFRA_REFERENCES },
    synthetic: false,
    limitations:
      "Esquema ilustrativo sin DEM ni batimetría. Cota no equivale a volumen ni reserva eléctrica; 2115 m no predice un apagón.",
  };
}
const date = { type: "string", format: "date-time" },
  nullableDate = { ...date, type: ["string", "null"] },
  number = { type: "number" };
export function registerInfrastructure(app, { loadDams, history, now }) {
  app.get(
    "/api/v1/infrastructure",
    {
      config: {
        publicApiV1: true,
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
      preValidation: async (req) => {
        if (Object.keys(req.query).length) {
          const e = Error();
          e.statusCode = 400;
          throw e;
        }
      },
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: [
              "generated_at",
              "measurement",
              "observations",
              "references",
              "synthetic",
              "limitations",
            ],
            properties: {
              generated_at: date,
              measurement: {
                type: "object",
                additionalProperties: false,
                required: ["value_m", "observed_at", "state", "source_url"],
                properties: {
                  value_m: { type: ["number", "null"] },
                  observed_at: nullableDate,
                  state: {
                    type: "string",
                    enum: ["current", "stale", "missing", "failed"],
                  },
                  source_url: {
                    type: "string",
                    const: "https://generacioncsr.celec.gob.ec/",
                  },
                },
              },
              observations: {
                type: "array",
                maxItems: 200,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["value_m", "observed_at"],
                  properties: { value_m: number, observed_at: date },
                },
              },
              references: {
                type: "object",
                additionalProperties: false,
                required: Object.keys(INFRA_REFERENCES),
                properties: Object.fromEntries(
                  Object.entries(INFRA_REFERENCES).map(([key, value]) => [
                    key,
                    { type: typeof value, const: value },
                  ]),
                ),
              },
              synthetic: { type: "boolean" },
              limitations: { type: "string", maxLength: 500 },
            },
          },
          400: errorSchema,
          429: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (_, reply) => {
      reply.header("Cache-Control", "no-store");
      return projectInfrastructure(await loadDams(), history, now());
    },
  );
}
