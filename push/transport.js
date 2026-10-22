import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import webPush from "web-push";
import { endpoint } from "./policy.js";
function publicAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(address))
    return !/^(?:0*:)*0*1$|^::$|^f[cd]|^fe[89ab]|^ff|^::ffff:/i.test(address);
  return false;
}
export function createPushTransport(config) {
  const agent = new https.Agent({
    keepAlive: false,
    lookup(host, options, callback) {
      dns.lookup(host, { all: true }, (error, records) => {
        if (error) return callback(new Error("PUSH_DNS"));
        const accepted = records.filter((r) => publicAddress(r.address));
        if (!accepted.length) return callback(new Error("PUSH_DNS"));
        if (options.all) return callback(null, accepted);
        callback(null, accepted[0].address, accepted[0].family);
      });
    },
  });
  return async (browser, payload, { ttl = 300 } = {}) => {
    endpoint(browser);
    const data = Buffer.from(JSON.stringify(payload));
    if (data.length > 3000) throw new Error("PUSH_PAYLOAD_LIMIT");
    const details = webPush.generateRequestDetails(browser, data, {
      TTL: ttl,
      urgency: "low",
      topic: payload.tag,
      vapidDetails: {
        subject: config.origin,
        publicKey: config.publicKey,
        privateKey: config.privateKey,
      },
      contentEncoding: "aes128gcm",
    });
    return new Promise((resolve) => {
      let settled = false;
      const done = (result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      };
      const request = https.request(
        details.endpoint,
        { method: details.method, headers: details.headers, agent },
        (response) => {
          let size = 0;
          response.on("data", (chunk) => {
            size += chunk.length;
            if (size > 4096) response.destroy();
          });
          const status = response.statusCode;
          response.on("end", () =>
            done({
              status,
              retryAfter: /^\d+$/.test(response.headers["retry-after"] || "")
                ? Math.min(3600, Number(response.headers["retry-after"]))
                : 0,
            }),
          );
          response.on("error", () => done({ status: 0 }));
        },
      );
      const timer = setTimeout(() => {
        request.destroy();
        done({ status: 0 });
      }, 10000);
      timer.unref();
      request.on("error", () => done({ status: 0 }));
      request.end(details.body);
    });
  };
}
export async function dispatchPush(
  store,
  config,
  { transport = null, limit = 10, shouldStop = () => false } = {},
) {
  if (!config.delivery) throw new Error("PUSH_DELIVERY permanece desactivado");
  if (!Number.isInteger(limit) || limit < 1 || limit > 10)
    throw new Error("Límite de envío inválido");
  if (store.info().synthetic && !transport)
    throw new Error("No enviar fixtures a proveedores reales");
  const send = transport || createPushTransport(config);
  let completed = 0;
  for (let index = 0; index < limit; index++) {
    if (shouldStop()) break;
    const job = store.subscriptions.claim();
    if (!job) break;
    let result;
    try {
      result = await send(job.browser, job.payload, { ttl: job.ttl });
    } catch {
      result = { status: 0 };
    }
    completed += store.subscriptions.finish(
      job.lease_id,
      result.status,
      result.retryAfter,
    ).completed;
  }
  return { completed };
}

// One bounded cycle at a time. Enrollment and PWA do not activate this sender.
export function startPushWorker(store, config, { intervalMs = 60000 } = {}) {
  if (!config.delivery || store.info().synthetic)
    throw new Error("Worker Push requiere entrega explícita y base live");
  let stopped = false,
    offset = 0,
    timer,
    pending = Promise.resolve();
  const cycle = () => {
    if (stopped) return;
    pending = (async () => {
      try {
        store.subscriptions.prune();
        const result = store.subscriptions.enqueue({ limit: 100, offset });
        offset = result.next_offset ?? 0;
        if (!stopped)
          await dispatchPush(store, config, { shouldStop: () => stopped });
      } catch {
        console.error(
          "AEGIS Push: ciclo no disponible; revisar cola/configuración de forma local",
        );
      } finally {
        if (!stopped) {
          timer = setTimeout(cycle, intervalMs);
          timer.unref();
        }
      }
    })();
  };
  timer = setTimeout(cycle, 1000);
  timer.unref();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await pending;
  };
}
