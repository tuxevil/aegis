import { publicSchemas, errorSchema } from "./schemas.js";
const docSchema = { type: "object", additionalProperties: true };
export function registerDocumentation(
  app,
  {
    now,
    getSourceMetrics = () => ({
      attempts: 0,
      failures: 0,
      last_attempt_at: null,
      last_success_at: null,
    }),
  },
) {
  const paths = {},
    counts = { requests: 0, errors_4xx: 0, errors_5xx: 0, rate_limited: 0 },
    started = performance.now();
  const bump = (key) =>
    (counts[key] = Math.min(Number.MAX_SAFE_INTEGER, counts[key] + 1));
  app.addHook("onRoute", (options) => {
    if (
      !(Array.isArray(options.method)
        ? options.method.includes("GET")
        : options.method === "GET") ||
      options.config?.publicApiV1 !== true ||
      !options.url.startsWith("/api/v1/")
    )
      return;
    const route = options.url.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}"),
      schema = options.schema || {},
      parameters = [];
    for (const [location, spec] of [
      ["path", schema.params],
      ["query", schema.querystring],
    ])
      for (const [name, field] of Object.entries(spec?.properties || {}))
        parameters.push({
          in: location,
          name,
          required: location === "path" || (spec.required || []).includes(name),
          schema: structuredClone(field),
        });
    const responses = {};
    for (const [status, value] of Object.entries(
      schema.response || { 200: docSchema },
    )) {
      let json = structuredClone(value);
      const content = {};
      if (options.url === "/api/v1/timeline" && status === "200") {
        json = json.anyOf?.find((s) => s.type === "object") || json;
        content["text/csv"] = {
          schema: { type: "string" },
          example: '"event_id","area_name","type","status"\r\n',
        };
      }
      content["application/json"] = { schema: json };
      responses[status] = {
        description:
          status === "200"
            ? "Respuesta pública; ausencia de datos no confirma continuidad."
            : "Error fijo sin detalles privados.",
        content,
      };
    }
    paths[route] = {
      get: {
        operationId: "read_" + route.replace(/[^A-Za-z0-9]+/g, "_"),
        summary: route,
        security: [],
        parameters,
        responses,
        "x-aegis-unknown-query-rejected": true,
        "x-aegis-rate-limit": { requests: 60, window_seconds: 60 },
      },
    };
  });
  app.addHook("onResponse", async (req, reply) => {
    if (req.method !== "GET" || req.routeOptions.config.publicApiV1 !== true)
      return;
    bump("requests");
    if (reply.statusCode >= 400 && reply.statusCode < 500) bump("errors_4xx");
    if (reply.statusCode >= 500) bump("errors_5xx");
    if (reply.statusCode === 429) bump("rate_limited");
  });
  const closed = (properties, required = Object.keys(properties)) => ({
    type: "object",
    additionalProperties: false,
    required,
    properties,
  });
  const date = { type: ["string", "null"], format: "date-time" },
    integer = { type: "integer", minimum: 0 };
  const route = (url, response, handler) =>
    app.get(
      url,
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
          querystring: closed({}),
          response: {
            200: response,
            400: errorSchema,
            429: errorSchema,
            500: errorSchema,
          },
        },
      },
      async (_, reply) => {
        reply.header("Cache-Control", "no-store");
        return handler();
      },
    );
  route("/api/v1/openapi.json", docSchema, () => ({
    openapi: "3.1.0",
    info: {
      title: "AEGIS public read API",
      version: "1.0.0",
      description:
        "Rutas GET públicas habilitadas en este proceso. No certifica cobertura/frescura; datos ausentes no son cero. Funciones v5 permanecen detrás de flags y gates.",
    },
    servers: [{ url: "/" }],
    security: [],
    paths: structuredClone(paths),
    components: { schemas: structuredClone(publicSchemas) },
    "x-aegis-scope":
      "read-only; no control de infraestructura ni secretos de gestión",
  }));
  route(
    "/api/v1/health/quality",
    closed({
      generated_at: { type: "string", format: "date-time" },
      uptime_seconds: integer,
      scope: { const: "registered-public-get-only", type: "string" },
      requests: integer,
      errors_4xx: integer,
      errors_5xx: integer,
      rate_limited: integer,
      sources: closed({
        attempts: integer,
        failures: integer,
        last_attempt_at: date,
        last_success_at: date,
      }),
    }),
    () => ({
      generated_at: now().toISOString(),
      uptime_seconds: Math.floor((performance.now() - started) / 1000),
      scope: "registered-public-get-only",
      ...counts,
      sources: getSourceMetrics(),
    }),
  );
}
