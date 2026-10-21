// Public v1 DTOs: closed objects, generalized areas, no raw source payloads.
const id = { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-zA-Z0-9_-]+$" };
const text = { type: "string", minLength: 1, maxLength: 2000 };
const date = { type: "string", format: "date-time" };
const nullableDate = { ...date, type: ["string", "null"] };
const nullableId = { ...id, type: ["string", "null"] };
const enumeration = (...values) => ({ type: "string", enum: values });
const object = (properties) => ({
  type: "object", additionalProperties: false,
  required: Object.keys(properties), properties,
});
const ids = { type: "array", maxItems: 100, uniqueItems: true, items: id };
const marker = { type: "boolean" };

export const areaSchema = object({
  id, name: text, parent_id: nullableId,
  type: enumeration("province", "canton", "parish", "sector"),
  location_precision: enumeration("administrative_area", "generalized_sector"),
  code: { type: ["string", "null"], maxLength: 32 },
  polygon_ref: { type: ["string", "null"], maxLength: 256 },
  polygon_version: nullableId, synthetic: marker,
});

export const evidenceSchema = object({
  id, area_id: id, source_id: id, source_name: text,
  source_kind: enumeration("authority", "news", "social", "citizen", "sensor"),
  source_url: { type: ["string", "null"], format: "uri", pattern: "^https://", maxLength: 2048 },
  artifact_id: nullableId, summary: text,
  relation: enumeration("support", "refute", "retraction"),
  source_published_at: nullableDate, observed_at: nullableDate,
  reported_start_at: nullableDate, ingested_at: date,
  temporal_confidence: enumeration("exact", "approximate", "unknown"),
  location_precision: enumeration("administrative_area", "generalized_sector"),
  synthetic: marker,
});

export const eventSchema = object({
  id, area_id: id, type: enumeration("scheduled", "unplanned", "unknown"),
  status: enumeration("reported", "corroborated", "official", "ended", "unknown"),
  start_at: nullableDate, end_at: nullableDate,
  start_basis: enumeration("observed", "reported", "official", "unknown"),
  end_basis: enumeration("observed", "reported", "official", "unknown"),
  last_evidence_at: nullableDate, evidence_ids: ids, confidence_explanation: text,
  created_at: date, updated_at: date, synthetic: marker,
});

export const scheduleSchema = object({
  id, issuer: text, area_id: id, start_at: date, end_at: date,
  original_zone: { type: "string", const: "America/Guayaquil" },
  original_time_string: text,
  type: enumeration("residential", "industrial", "maintenance", "unknown"),
  artifact_id: id, evidence_ids: ids,
  parser_confidence: { type: "number", minimum: 0, maximum: 1 },
  review_state: enumeration("pending", "reviewed", "rejected"),
  effective_status: enumeration("published", "revised", "cancelled", "unverified"),
  revision_no: { type: "integer", minimum: 1 }, predecessor_id: nullableId,
  imported_at: date, synthetic: marker,
});

export const errorSchema = object({ error: object({
  code: enumeration("INVALID_REQUEST", "NOT_FOUND", "RATE_LIMITED", "INTERNAL_ERROR"),
  message: text,
}) });

export const publicSchemas = {
  area: areaSchema, evidence: evidenceSchema, event: eventSchema,
  schedule: scheduleSchema, error: errorSchema,
};
