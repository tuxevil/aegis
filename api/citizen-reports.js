import { errorSchema } from "./schemas.js";
import { REPORT_POLICY, reportError } from "../reports/policy.js";
import { createReportGuard } from "../reports/abuse.js";
const id = { type: "string", pattern: "^[a-zA-Z0-9_-]{1,128}$" };
const date = { type: "string", format: "date-time" };
const token = { type: "string", pattern: "^[a-zA-Z0-9_-]{43}$" };
const closed = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const owner = closed({ report_id: id, revision: { type: "integer", minimum: 1 },
  status: { type: "string", enum: ["pending", "approved", "rejected", "withdrawn"] },
  created_at: date, updated_at: date, received_at: date, area_id: id, area_name: { type: "string", maxLength: 2000 },
  declaration: { type: "string", enum: ["outage", "restored"] }, reported_start_at: { ...date, type: ["string", "null"] }, synthetic: { type: "boolean" },
});
const input = {
  area_id: id, area_confirmed: { type: "boolean", const: true }, consent: { type: "boolean", const: true },
  consent_version: { type: "string", const: REPORT_POLICY.consent_version },
  declaration: owner.properties.declaration, reported_start_at: owner.properties.reported_start_at,
};
const messages = {
  INVALID_REQUEST: "Solicitud inválida; confirma sector, consentimiento y fecha.", NOT_FOUND: "Reporte o código no disponible.",
  RATE_LIMITED: "Límite temporal alcanzado. Inténtalo más tarde.", CONFLICT: "El reporte cambió o ya existe un envío equivalente. Consulta tu código privado.",
  FORBIDDEN: "Solicitud no permitida.", VERIFICATION_REQUIRED: "Renueva la comprobación y espera un segundo antes de enviar.",
  PAYLOAD_TOO_LARGE: "Solicitud demasiado grande.", INTERNAL_ERROR: "No se pudo procesar el reporte.",
};

export function isCitizenReportRequest(req) {
  return req.routeOptions.config.citizenReportMethods?.includes(req.method) === true;
}

export async function registerCitizenReports(app, { store, now, origin, guard = createReportGuard({ now }) }) {
  const repository = store.reports;
  await app.register(async reports => {
    reports.setErrorHandler((error, req, reply) => {
      const status = error.validation ? 400 : [400, 403, 404, 409, 413, 429].includes(error.statusCode) ? error.statusCode : 500;
      const code = error.reportCode || ({ 400: "INVALID_REQUEST", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 413: "PAYLOAD_TOO_LARGE", 429: "RATE_LIMITED", 500: "INTERNAL_ERROR" })[status];
      reply.header("Cache-Control", "no-store").code(status).send({ error: { code, message: messages[code] || messages.INTERNAL_ERROR } });
    });
    reports.addHook("onRequest", async req => {
      if (!isCitizenReportRequest(req)) return;
      if (req.headers["x-aegis-request"] !== "citizen-report" || req.headers["sec-fetch-site"] === "cross-site") throw reportError("FORBIDDEN", 403);
      const allowedOrigin = origin || new URL(`${req.protocol}://${req.headers.host}`).origin; // Demo only may use same-host origin.
      if ((req.method !== "GET" || req.headers.origin) && req.headers.origin !== allowedOrigin) throw reportError("FORBIDDEN", 403);
      if (req.method !== "GET" && !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) throw reportError("INVALID_REQUEST");
      guard.attempt(req.ip);
    });
    function route(method, url, { body, query, response, publicGet = false, status = 200 }, handle) {
      reports.route({ method, url, bodyLimit: 4096,
        config: { ...(publicGet ? { publicApiV1: true } : { citizenReportMethods: [method] }), rateLimit: { max: 60, timeWindow: "1 minute" } },
        preValidation: async req => {
          if (Object.keys(req.query).some(key => !Object.hasOwn(query || {}, key))) throw reportError("INVALID_REQUEST");
          if (body && (!req.body || Array.isArray(req.body) || typeof req.body !== "object" || Object.keys(req.body).some(key => !Object.hasOwn(body.properties, key)))) throw reportError("INVALID_REQUEST");
          if (req.body && Object.hasOwn(body?.properties || {}, "consent") && (req.body.consent !== true || req.body.area_confirmed !== true)) throw reportError("INVALID_REQUEST");
        },
        schema: {
          ...(body ? { body } : {}), querystring: closed(query || {}, []),
          ...(url.includes(":id") ? { params: closed({ id }) } : {}),
          response: { [status]: response, 400: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 413: errorSchema, 429: errorSchema, 500: errorSchema },
        },
        handler: async (req, reply) => {
          reply.header("Cache-Control", "no-store").code(status);
          const bearer = /^Bearer ([a-zA-Z0-9_-]{43})$/.exec(req.headers.authorization || "")?.[1];
          if (url.includes(":id") && !bearer) throw reportError("NOT_FOUND", 404);
          return handle(req, bearer);
        },
      });
    }
    route("GET", "/api/v1/reports/config", { publicGet: true,
      response: closed({ synthetic: { type: "boolean" }, policy: closed(Object.fromEntries(Object.keys(REPORT_POLICY).map(key => [key, { type: "string" }]))) }),
    }, () => ({ synthetic: repository.synthetic, policy: REPORT_POLICY }));
    route("POST", "/api/v1/report-challenges", { body: closed({}), response: closed({ challenge_id: { type: "string" }, question: { type: ["string", "null"] }, expires_at: date, min_wait_seconds: { type: "integer" } }) }, req => guard.issue(req.ip));
    route("POST", "/api/v1/reports", { status: 201, body: closed({ ...input,
      request_id: { type: "string", format: "uuid" }, receipt_token: token,
      challenge_id: { type: "string", pattern: "^[a-zA-Z0-9_-]{32}$" }, answer: { type: "string", maxLength: 2 }, website: { type: "string", maxLength: 100 },
    }), response: owner }, req => {
      const value = repository.validate(req.body);
      const previous = repository.replay(req.body, value);
      if (previous) return previous;
      guard.check(req.ip, req.body, value.hash);
      const result = repository.create(req.body, value);
      guard.consume(req.ip, req.body.challenge_id, value.hash);
      return result;
    });
    route("GET", "/api/v1/reports/:id", { response: owner }, (req, bearer) => repository.owner(req.params.id, bearer));
    route("PATCH", "/api/v1/reports/:id", { body: closed({ ...input,
      expected_revision: { type: "integer", minimum: 1 }, reason: { type: "string", enum: ["wrong_area", "wrong_time", "changed_state", "other"] },
    }), response: owner }, (req, bearer) => {
      repository.owner(req.params.id, bearer);
      return repository.correct(req.params.id, bearer, req.body.expected_revision, repository.validate(req.body));
    });
    route("DELETE", "/api/v1/reports/:id", { body: closed({ expected_revision: { type: "integer", minimum: 1 } }), response: owner },
      (req, bearer) => repository.withdraw(req.params.id, bearer, req.body.expected_revision));
    route("GET", "/api/v1/report-summary", { publicGet: true, query: { area_id: id },
      response: closed({ area_id: id, suppressed: { type: "boolean" }, approved_reports: { type: ["integer", "null"] },
        outage_reports: { type: ["integer", "null"] }, restoration_reports: { type: ["integer", "null"] },
        coverage: { type: "string", const: "unknown" }, synthetic: { type: "boolean" }, generated_at: date }),
    }, req => {
      if (!req.query.area_id) throw reportError("INVALID_REQUEST");
      return repository.summary(req.query.area_id);
    });
    repository.prune();
    const timer = setInterval(() => { guard.prune(); try { repository.prune(); } catch { /* Busy backup: retry next minute. */ } }, 60000);
    timer.unref();
    reports.addHook("onClose", async () => { clearInterval(timer); guard.close(); });
  });
}
