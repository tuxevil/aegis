import {
  createECDH,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export const PUSH_CONSENT_VERSION = "watch-2026-10-22";
export function pushError(code, status = 400) {
  const error = new Error(code);
  error.pushCode = code;
  error.statusCode = status;
  return error;
}
export function bytes(value, length) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw pushError("INVALID_REQUEST");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== length || decoded.toString("base64url") !== value)
    throw pushError("INVALID_REQUEST");
  return decoded;
}
export function readPushConfig(env = process.env) {
  const origin = env.WATCH_ORIGIN;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== "https:") throw Error();
  } catch {
    throw new Error("Configurar WATCH_ORIGIN como origen HTTPS canónico");
  }
  const storageKey = bytes(env.PUSH_STORAGE_KEY, 32),
    privateKey = bytes(env.VAPID_PRIVATE_KEY, 32),
    publicKey = bytes(env.VAPID_PUBLIC_KEY, 65);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateKey);
  if (!ecdh.getPublicKey().equals(publicKey))
    throw new Error("Par VAPID inválido");
  return Object.freeze({
    origin,
    storageKey,
    publicKey: publicKey.toString("base64url"),
    privateKey: privateKey.toString("base64url"),
    delivery: env.PUSH_DELIVERY === "true",
  });
}
export function endpoint(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).some(
      (k) => !["endpoint", "expirationTime", "keys"].includes(k),
    )
  )
    throw pushError("INVALID_REQUEST");
  let url;
  try {
    url = new URL(value.endpoint);
  } catch {
    throw pushError("INVALID_REQUEST");
  }
  const paths = {
    "fcm.googleapis.com": /^\/(?:fcm\/send|wp)\/[A-Za-z0-9_:\-]+$/,
    "updates.push.services.mozilla.com": /^\/wpush\/v[12]\/[A-Za-z0-9_\-]+$/,
    "web.push.apple.com": /^\/[A-Za-z0-9_\/\-]+$/,
  };
  if (
    typeof value.endpoint !== "string" ||
    value.endpoint.length > 2048 ||
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !paths[url.hostname]?.test(url.pathname)
  )
    throw pushError("INVALID_REQUEST");
  if (
    value.expirationTime !== null &&
    value.expirationTime !== undefined &&
    (!Number.isSafeInteger(value.expirationTime) || value.expirationTime <= 0)
  )
    throw pushError("INVALID_REQUEST");
  if (
    !value.keys ||
    Object.keys(value.keys).some((k) => !["p256dh", "auth"].includes(k))
  )
    throw pushError("INVALID_REQUEST");
  const key = bytes(value.keys.p256dh, 65);
  bytes(value.keys.auth, 16);
  try {
    const peer = createECDH("prime256v1");
    peer.generateKeys();
    peer.computeSecret(key);
  } catch {
    throw pushError("INVALID_REQUEST");
  }
  return {
    endpoint: url.href,
    expirationTime: value.expirationTime ?? null,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
  };
}
export function vault(key) {
  if (!(key instanceof Uint8Array) || key.length !== 32)
    throw new Error("PUSH_STORAGE_KEY de 32 bytes requerida");
  return {
    fingerprint: createHash("sha256").update(key).digest("hex"),
    seal(value, aad) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(aad));
      const body = Buffer.concat([
        cipher.update(JSON.stringify(value)),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString(
        "base64url",
      );
    },
    open(value, aad) {
      try {
        const data = Buffer.from(value, "base64url"),
          cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
        cipher.setAAD(Buffer.from(aad));
        cipher.setAuthTag(data.subarray(12, 28));
        return JSON.parse(
          Buffer.concat([
            cipher.update(data.subarray(28)),
            cipher.final(),
          ]).toString(),
        );
      } catch {
        throw new Error("No se puede abrir almacenamiento Push");
      }
    },
  };
}
export const cancellationText = (value) =>
  /\b(?:se cancela|cancelad[oa])\b/i.test(value) &&
  !/\b(?:no|sin)\b/i.test(value);
export function dueTime(now, prefs) {
  // Ecuador continental: the same reviewed zone as official schedules.
  let date = new Date(now.getTime() - 5 * 3600000),
    hour = date.getUTCHours();
  const quiet =
    prefs.quiet_start === prefs.quiet_end
      ? false
      : prefs.quiet_start < prefs.quiet_end
        ? hour >= prefs.quiet_start && hour < prefs.quiet_end
        : hour >= prefs.quiet_start || hour < prefs.quiet_end;
  if (prefs.mode === "digest") {
    const target = new Date(date);
    target.setUTCHours(prefs.digest_hour, 0, 0, 0);
    if (target < date) target.setUTCDate(target.getUTCDate() + 1);
    date = target;
    hour = date.getUTCHours();
  }
  if (quiet && prefs.mode !== "digest") {
    if (prefs.quiet_start > prefs.quiet_end && hour >= prefs.quiet_start)
      date.setUTCDate(date.getUTCDate() + 1);
    date.setUTCHours(prefs.quiet_end, 0, 0, 0);
  }
  return new Date(date.getTime() + 5 * 3600000).toISOString();
}
