import { errorSchema } from "./schemas.js";
import { timelineCsv } from "../storage/timeline.js";
const date = { type: "string", format: "date-time" },
  nullable = { ...date, type: ["string", "null"] },
  text = { type: "string", maxLength: 2000 },
  kind = { type: "string" },
  id = { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" };
export const timelineItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "event_id",
    "area_id",
    "area_name",
    "type",
    "status",
    "start_at",
    "end_at",
    "start_basis",
    "end_basis",
    "recorded_at",
    "revision",
    "duration_seconds",
    "evidence",
    "synthetic",
    "coverage",
    "redacted",
  ],
  properties: {
    event_id: id,
    area_id: id,
    area_name: text,
    type: { type: "string", enum: ["scheduled", "unplanned", "unknown"] },
    status: {
      type: "string",
      enum: ["reported", "corroborated", "official", "ended", "unknown"],
    },
    start_at: nullable,
    end_at: nullable,
    start_basis: kind,
    end_basis: kind,
    recorded_at: date,
    revision: { type: "integer" },
    duration_seconds: { type: ["number", "null"] },
    synthetic: { type: "boolean" },
    coverage: { const: "unknown", type: "string" },
    redacted: { type: "boolean" },
    evidence: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "source_name",
          "source_url",
          "source_published_at",
          "ingested_at",
          "relation",
        ],
        properties: {
          source_name: text,
          source_url: { type: ["string", "null"], maxLength: 2048 },
          source_published_at: nullable,
          ingested_at: date,
          relation: kind,
        },
      },
    },
  },
};
export function registerTimeline(app, { store, now }) {
  const properties = {
    area_id: id,
    from: date,
    to: date,
    known_at: date,
    limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    offset: { type: "integer", minimum: 0, maximum: 10000, default: 0 },
    format: { type: "string", enum: ["json", "csv"], default: "json" },
  };
  app.get(
    "/api/v1/timeline",
    {
      config: {
        publicApiV1: true,
        rateLimit: { max: 60, timeWindow: "1 minute" },
      },
      preValidation: async (req) => {
        if (Object.keys(req.query).some((k) => !Object.hasOwn(properties, k))) {
          const e = Error();
          e.statusCode = 400;
          throw e;
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
            anyOf: [
              { type: "string" },
              {
                type: "object",
                additionalProperties: false,
                required: ["data", "meta"],
                properties: {
                  data: {
                    type: "array",
                    maxItems: 50,
                    items: timelineItemSchema,
                  },
                  meta: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "known_at",
                      "from",
                      "to",
                      "generated_at",
                      "next_offset",
                      "synthetic",
                      "coverage",
                    ],
                    properties: {
                      known_at: date,
                      from: date,
                      to: date,
                      generated_at: date,
                      next_offset: { type: ["integer", "null"] },
                      synthetic: { type: "boolean" },
                      coverage: { type: "string", const: "unknown" },
                    },
                  },
                },
              },
            ],
          },
          400: errorSchema,
          429: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (req, reply) => {
      let result;
      try {
        result = store.timeline.list(req.query);
      } catch {
        const error = Error();
        error.statusCode = 400;
        throw error;
      }
      reply.header("Cache-Control", "no-store");
      if (req.query.format === "csv") {
        reply
          .type("text/csv; charset=utf-8")
          .header(
            "Content-Disposition",
            'attachment; filename="aegis-timeline.csv"',
          );
        return timelineCsv(result.data, result);
      }
      const { data, ...meta } = result;
      return {
        data,
        meta: {
          ...meta,
          generated_at: now().toISOString(),
          synthetic: store.info().synthetic,
          coverage: "unknown",
        },
      };
    },
  );
}
