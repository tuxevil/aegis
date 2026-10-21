import { areaSchema, eventSchema, evidenceSchema, errorSchema } from "./schemas.js";
import { utcDate } from "../storage/repositories.js";

const id = { type: "string", pattern: "^[a-zA-Z0-9_-]{1,128}$" };
const date = { type: "string", format: "date-time" };
const pagination = {
  limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
  offset: { type: "integer", minimum: 0, maximum: 10000, default: 0 },
};
const areaView = { ...areaSchema, required: [...areaSchema.required, "map_ref"], properties: {
  ...areaSchema.properties, map_ref: { type: ["string", "null"], enum: ["pallatanga-canton", null] },
} };
const eventView = { ...eventSchema, required: [...eventSchema.required, "area_name", "map_ref"], properties: {
  ...eventSchema.properties, area_name: { type: "string", maxLength: 2000 }, map_ref: areaView.properties.map_ref,
} };
const metaSchema = {
  type: "object", additionalProperties: false,
  required: ["api_version", "mode", "synthetic", "coverage", "generated_at", "limit", "offset", "next_offset"],
  properties: {
    api_version: { type: "string", const: "1" }, mode: { type: "string", enum: ["demo", "live"] },
    synthetic: { type: "boolean" }, coverage: { type: "string", const: "unknown" }, generated_at: date,
    limit: { type: "integer" }, offset: { type: "integer" }, next_offset: { type: ["integer", "null"] },
  },
};
const envelopeSchema = data => ({ type: "object", additionalProperties: false, required: ["data", "meta"], properties: { data, meta: metaSchema } });
function invalid() { const error = new Error("Invalid public query"); error.statusCode = 400; throw error; }

export function registerBlackoutApi(app, { reader, now }) {
  const envelope = (data, query = {}, hasNext = false) => ({ data, meta: {
    api_version: "1", mode: reader.synthetic ? "demo" : "live", synthetic: reader.synthetic,
    coverage: "unknown", generated_at: now().toISOString(), limit: query.limit || 20,
    offset: query.offset || 0, next_offset: hasNext && query.offset + query.limit <= 10000 ? query.offset + query.limit : null,
  } });
  function register(url, properties, itemSchema, handler, single = false) {
    app.get(url, {
      config: { publicApiV1: true, rateLimit: { max: 60, timeWindow: "1 minute" } },
      preValidation: async req => {
        if (Object.keys(req.query).some(key => !Object.hasOwn(properties, key))) invalid();
      },
      schema: {
        querystring: { type: "object", additionalProperties: false, properties },
        ...(url.includes(":id") ? { params: { type: "object", required: ["id"], properties: { id } } } : {}),
        response: { 200: envelopeSchema(single ? itemSchema : { type: "array", maxItems: 50, items: itemSchema }),
          400: errorSchema, 404: errorSchema, 429: errorSchema, 500: errorSchema },
      },
    }, async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const query = { ...req.query };
      try {
        if (query.from) query.from = utcDate(query.from);
        if (query.to) query.to = utcDate(query.to);
      } catch { invalid(); }
      if (query.from && query.to && (query.from >= query.to || Date.parse(query.to) - Date.parse(query.from) > 90 * 86400000)) invalid();
      if (query.bbox) {
        const bbox = query.bbox.split(",").map(Number);
        if (bbox.length !== 4 || bbox.some(n => !Number.isFinite(n)) || bbox[0] < -93 || bbox[1] < -6
          || bbox[2] > -74 || bbox[3] > 3 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) invalid();
        query.bbox = bbox;
      }
      const result = handler(req.params, { ...query, limit: (query.limit || 20) + 1 });
      if (single) {
        if (!result) { const error = new Error("Not published"); error.statusCode = 404; throw error; }
        return envelope(result);
      }
      return envelope(result.slice(0, query.limit), query, result.length > query.limit);
    });
  }
  register("/api/v1/areas", { ...pagination, q: { type: "string", maxLength: 100 }, parent_id: id,
    type: { type: "string", enum: ["province", "canton", "parish", "sector"] } }, areaView,
  (_, query) => reader.listAreas(query));
  register("/api/v1/outages", { ...pagination, area_id: id, from: date, to: date,
    layer: { type: "string", enum: ["official", "citizen", "osint"] },
    bbox: { type: "string", minLength: 7, maxLength: 100, pattern: "^-?[0-9.]+,-?[0-9.]+,-?[0-9.]+,-?[0-9.]+$" },
  }, eventView, (_, query) => reader.listEvents(query));
  register("/api/v1/events/:id", {}, eventView, params => reader.getEvent(params.id), true);
  register("/api/v1/events/:id/evidence", pagination, evidenceSchema,
    (params, query) => reader.getEvent(params.id) ? reader.listEvidence(params.id, query) : []);
}
