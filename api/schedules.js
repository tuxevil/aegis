import { scheduleSchema, errorSchema } from "./schemas.js";
const id = { type: "string", pattern: "^[a-zA-Z0-9_-]{1,128}$" },
  date = { type: "string", format: "date-time" };
const view = {
  ...scheduleSchema,
  required: [
    ...scheduleSchema.required,
    "entry_id",
    "area_name",
    "source_url",
    "sha256",
    "fetched_at",
    "source_published_at",
    "last_checked_at",
    "source_status",
    "latest_revision_no",
    "parser_version",
    "acquisition",
  ],
  properties: {
    ...scheduleSchema.properties,
    acquisition: { type: "string", enum: ["local_import", "https"] },
    entry_id: id,
    area_name: { type: "string", maxLength: 2000 },
    source_url: {
      type: "string",
      const: "https://www.eeasa.com.ec/trabajos-programadas/",
    },
    sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    fetched_at: date,
    source_published_at: { anyOf: [date, { type: "null" }] },
    last_checked_at: { anyOf: [date, { type: "null" }] },
    source_status: {
      type: "string",
      enum: ["current", "missing", "changed", "failed", "stale"],
    },
    latest_revision_no: { type: "integer", minimum: 1 },
    parser_version: { type: "string", const: "eeasa-html-1" },
  },
};
const properties = {
  area_id: id,
  from: date,
  to: date,
  type: scheduleSchema.properties.type,
  limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
  offset: { type: "integer", minimum: 0, maximum: 10000, default: 0 },
};
const metaProperties = {
  api_version: { type: "string", const: "1" },
  synthetic: { type: "boolean" },
  coverage: { type: "string", const: "unknown" },
  generated_at: date,
  last_checked_at: { anyOf: [date, { type: "null" }] },
  source_status: { type: "string", enum: ["failed", "stale", "available"] },
  limit: { type: "integer" },
  offset: { type: "integer" },
  next_offset: { type: ["integer", "null"] },
};
export function registerSchedulesApi(app, { store, now }) {
  app.get(
    "/api/v1/schedules",
    {
      config: {
        publicApiV1: true,
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
      preValidation: async (req) => {
        if (Object.keys(req.query).some((k) => !Object.hasOwn(properties, k))) {
          const error = new Error("Invalid query");
          error.statusCode = 400;
          throw error;
        }
      },
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["area_id", "from", "to"],
          properties,
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["data", "meta"],
            properties: {
              data: { type: "array", maxItems: 50, items: view },
              meta: {
                type: "object",
                additionalProperties: false,
                required: Object.keys(metaProperties),
                properties: metaProperties,
              },
            },
          },
          400: errorSchema,
          429: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      let result;
      try {
        result = store.schedules.listPublic({
          ...req.query,
          limit: req.query.limit + 1,
        });
      } catch (error) {
        if (/inválid|máximo|Fecha|calendario/.test(error.message))
          error.statusCode = 400;
        throw error;
      }
      const more = result.data.length > req.query.limit;
      result.data = result.data.slice(0, req.query.limit);
      return {
        data: result.data,
        meta: {
          api_version: "1",
          synthetic: store.info().synthetic,
          coverage: "unknown",
          generated_at: now().toISOString(),
          last_checked_at: result.last_checked_at,
          source_status: result.source_status,
          limit: req.query.limit,
          offset: req.query.offset,
          next_offset:
            more && req.query.offset + req.query.limit <= 10000
              ? req.query.offset + req.query.limit
              : null,
        },
      };
    },
  );
}
