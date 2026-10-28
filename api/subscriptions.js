import { createHash } from "node:crypto";
import { createReportGuard } from "../reports/abuse.js";
import { pushError, PUSH_CONSENT_VERSION } from "../push/policy.js";
import { errorSchema } from "./schemas.js";
const closed = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const id = { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" },
  token = { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
  date = { type: "string", format: "date-time" },
  nilDate = { anyOf: [date, { type: "null" }] };
const prefs = closed({
  mode: { type: "string", enum: ["digest", "immediate"] },
  quiet_start: { type: "integer", minimum: 0, maximum: 23 },
  quiet_end: { type: "integer", minimum: 0, maximum: 23 },
  digest_hour: { type: "integer", minimum: 0, maximum: 23 },
  scheduled: { type: "boolean" },
  changes: { type: "boolean" },
  cancellations: { type: "boolean" },
});
const area = closed({
  area_id: id,
  alias: { type: "string", minLength: 1, maxLength: 30 },
});
const browser = {
  anyOf: [
    { type: "null" },
    closed({
      endpoint: { type: "string", maxLength: 2048 },
      expirationTime: { type: ["integer", "null"] },
      keys: closed({
        p256dh: { type: "string", maxLength: 87 },
        auth: { type: "string", maxLength: 22 },
      }),
    }),
  ],
};
const input = {
  areas: { type: "array", minItems: 1, maxItems: 5, items: area },
  preferences: prefs,
  browser,
  push_consent: { type: "boolean" },
  consent: { type: "boolean", const: true },
  consent_version: { type: "string", const: PUSH_CONSENT_VERSION },
};
const owner = closed({
  id,
  revision: { type: "integer" },
  status: { type: "string", enum: ["active", "revoked"] },
  areas: {
    type: "array",
    maxItems: 5,
    items: closed({
      ...area.properties,
      area_name: { type: "string", maxLength: 2000 },
    }),
  },
  preferences: { anyOf: [prefs, { type: "null" }] },
  push_consent: { type: "boolean" },
  push_registered: { type: "boolean" },
  endpoint_state: { type: "string", enum: ["none", "active", "invalid"] },
  created_at: date,
  updated_at: date,
  expires_at: date,
  last_accepted_at: nilDate,
  synthetic: { type: "boolean" },
});
export const isSubscriptionRequest = (req) =>
  req.routeOptions.config.subscriptionMethods?.includes(req.method) === true;
export async function registerSubscriptionsApi(app, { store, config, now }) {
  await app.register(async (api) => {
    const repository = store.subscriptions,
      guard = createReportGuard({ now }),
      managementGuard=createReportGuard({now,maxAttempts:600}),
      deliveryGuard=createReportGuard({now,maxAttempts:6000});
    const sweep = setInterval(() => {guard.prune();managementGuard.prune();deliveryGuard.prune();}, 60000);
    sweep.unref();
    api.addHook("onClose", async () => {
      clearInterval(sweep);
      guard.close();managementGuard.close();deliveryGuard.close();
    });
    api.setErrorHandler((error, req, reply) => {
      let status = error.statusCode || 500;
      if (error.validation) status = 400;
      if (![400, 403, 404, 409, 413, 429, 503].includes(status)) status = 500;
      const code =
        {
          400: "INVALID_REQUEST",
          403: "FORBIDDEN",
          404: "NOT_FOUND",
          409: "CONFLICT",
          413: "PAYLOAD_TOO_LARGE",
          429: "RATE_LIMITED",
          503: "RATE_LIMITED",
        }[status] || "INTERNAL_ERROR";
      reply
        .header("Cache-Control", "no-store")
        .code(status)
        .send({
          error: {
            code,
            message:
              status === 404
                ? "Suscripción no disponible"
                : status === 429 || status === 503
                  ? "Intenta más tarde"
                  : status === 500
                    ? "Servicio no disponible"
                    : "Solicitud no válida",
          },
        });
    });
    api.addHook("onRequest", async (req) => {
      if (!isSubscriptionRequest(req)) return;
      if (
        req.headers["x-aegis-request"] !== "sector-watch" ||
        req.headers["sec-fetch-site"] === "cross-site" ||
        ((req.method !== "GET" || req.headers.origin) &&
          req.headers.origin !== config.origin)
      )
        throw pushError("FORBIDDEN", 403);
      if (
        req.method !== "GET" &&
        !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")
      )
        throw pushError("INVALID_REQUEST");
      const url=req.routeOptions.url;
      (url === "/api/v1/push/validate" ? deliveryGuard : ["/api/v1/subscriptions","/api/v1/subscription-challenges"].includes(url) ? guard : managementGuard).attempt(req.ip);
    });
    function route(
      method,
      url,
      { body, response, status = 200, publicGet = false },
      handle,
    ) {
      api.route({
        method,
        url,
        bodyLimit: 8192,
        config: {
          ...(publicGet
            ? { publicApiV1: true }
            : { subscriptionMethods: [method] }),
          rateLimit: { max: 60, timeWindow: "1 minute" },
        },
        preValidation: async (req) => {
          if (Object.keys(req.query).length) throw pushError("INVALID_REQUEST");
          if (
            body &&
            (!req.body ||
              Array.isArray(req.body) ||
              typeof req.body !== "object" ||
              Object.keys(req.body).some(
                (k) => !Object.hasOwn(body.properties, k),
              ))
          )
            throw pushError("INVALID_REQUEST");
          if (body?.properties.consent) repository.validate(req.body);
        },
        schema: {
          querystring: closed({}),
          ...(body ? { body } : {}),
          ...(url.includes(":id") ? { params: closed({ id }) } : {}),
          response: {
            [status]: response,
            400: errorSchema,
            403: errorSchema,
            404: errorSchema,
            409: errorSchema,
            413: errorSchema,
            429: errorSchema,
            503: errorSchema,
            500: errorSchema,
          },
        },
        handler: async (req, reply) => {
          reply.header("Cache-Control", "no-store").code(status);
          const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
            req.headers.authorization || "",
          )?.[1];
          if (url.includes(":id") && !bearer) throw pushError("NOT_FOUND", 404);
          return handle(req, bearer);
        },
      });
    }
    route(
      "GET",
      "/api/v1/push/public-key",
      {
        publicGet: true,
        response: closed({
          public_key: { type: "string" },
          consent_version: { type: "string" },
          max_sectors: { type: "integer" },
          delivery_enabled: { type: "boolean" },
          synthetic: { type: "boolean" },
          policy: { type: "string" },
        }),
      },
      () => ({
        public_key: config.publicKey,
        consent_version: PUSH_CONSENT_VERSION,
        max_sectors: 5,
        delivery_enabled: config.delivery,
        synthetic: store.info().synthetic,
        policy:
          "Preferencias seudónimas y endpoint cifrado. Código privado solo en memoria. Baja elimina datos activos; backups privados pueden conservar versiones anteriores. Expira en 180 días. Fuente y geografía deben estar revisadas antes de avisar.",
      }),
    );
    route(
      "POST",
      "/api/v1/push/validate",
      {
        body: closed({
          browser,
          job_ids: { type: "array", minItems: 1, maxItems: 3, items: id },
        }),
        response: closed({ current: { type: "boolean" } }),
      },
      (req) => repository.validateDelivery(req.body),
    );
    route(
      "POST",
      "/api/v1/subscription-challenges",
      {
        body: closed({}),
        response: closed({
          challenge_id: { type: "string" },
          question: { type: ["string", "null"] },
          expires_at: date,
          min_wait_seconds: { type: "integer" },
        }),
      },
      (req) => guard.issue(req.ip),
    );
    route(
      "POST",
      "/api/v1/subscriptions",
      {
        status: 201,
        body: closed({
          ...input,
          management_token: token,
          request_id: { type: "string", format: "uuid" },
          challenge_id: { type: "string", pattern: "^[A-Za-z0-9_-]{32}$" },
          answer: { type: "string", maxLength: 2 },
          website: { type: "string", maxLength: 100 },
        }),
        response: owner,
      },
      (req) => {
        const value = repository.validate(req.body),
          prior = repository.replay(req.body, value);
        if (prior) return prior;
        const digest = createHash("sha256")
          .update(JSON.stringify(value))
          .digest("hex");
        guard.check(req.ip, req.body, digest);
        const result = repository.create(req.body, value);
        guard.consume(req.ip, req.body.challenge_id, digest);
        return result;
      },
    );
    route(
      "GET",
      "/api/v1/subscriptions/:id",
      { response: owner },
      (req, bearer) => repository.owner(req.params.id, bearer),
    );
    route(
      "PATCH",
      "/api/v1/subscriptions/:id",
      {
        body: closed({
          ...input,
          expected_revision: { type: "integer", minimum: 1 },
        }),
        response: owner,
      },
      (req, bearer) =>
        repository.update(
          req.params.id,
          bearer,
          req.body.expected_revision,
          repository.validate(req.body),
        ),
    );
    route(
      "DELETE",
      "/api/v1/subscriptions/:id",
      { body: closed({}), response: owner },
      (req, bearer) => repository.revoke(req.params.id, bearer),
    );
    route(
      "POST",
      "/api/v1/subscriptions/:id/test",
      {
        body: closed({ request_id: { type: "string", format: "uuid" } }),
        response: closed({ queued: { type: "boolean" } }),
      },
      (req, bearer) =>
        repository.requestTest(req.params.id, bearer, req.body.request_id),
    );
  });
}
