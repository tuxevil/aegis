import { feedProvider } from "./providers.js";
async function read(url, { fetchImpl, headers = {}, types, max = 262144 }) {
  const response = await fetchImpl(url, {
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(10000),
    headers: { "user-agent": "AEGIS/5 source-review", ...headers },
  });
  if (response.url && response.url !== url)
    throw Error("Redirect no permitido");
  if (response.status === 304) return { not_modified: true };
  if (
    response.status !== 200 ||
    !types.test(response.headers.get("content-type") || "")
  )
    throw Error("Respuesta requiere revisión");
  if (Number(response.headers.get("content-length")) > max) {
    await response.body?.cancel();
    throw Error("Límite de cuerpo");
  }
  if (!response.body) throw Error("Cuerpo ausente");
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw Error("Límite de cuerpo");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const safe = (name) => {
    const v = response.headers.get(name);
    return v && v.length <= 300 && !/[\r\n]/.test(v) ? v : null;
  };
  return {
    body: Buffer.concat(chunks),
    etag: safe("etag"),
    last_modified: safe("last-modified"),
  };
}
export function robotsPolicy(text, url) {
  let agents = [],
    rules = [],
    started = false;
  const groups = [];
  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.split("#")[0].trim(),
      at = cleaned.indexOf(":");
    if (at < 0) continue;
    const key = cleaned.slice(0, at).trim().toLowerCase(),
      value = cleaned.slice(at + 1).trim();
    if (key === "user-agent") {
      if (started) {
        groups.push({ agents, rules });
        agents = [];
        rules = [];
        started = false;
      }
      agents.push(value.toLowerCase());
    } else if (agents.length) {
      started = true;
      rules.push([key, value]);
    }
  }
  groups.push({ agents, rules });
  const specific = groups.filter((g) =>
      g.agents.some((a) => a !== "*" && "aegis".includes(a)),
    ),
    matched = specific.length
      ? specific
      : groups.filter((g) => g.agents.includes("*"));
  let delay = 3600;
  for (const group of matched)
    for (const [key, value] of group.rules) {
      if (key === "disallow" && value) {
        if (
          value.includes("*") ||
          value.includes("$") ||
          new URL(url).pathname.startsWith(value)
        )
          throw Error("Robots requiere revisión");
      }
      if (key === "crawl-delay") {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > 86400)
          throw Error("Robots requiere revisión");
        delay = Math.max(delay, n);
      }
    }
  return delay;
}
export async function captureFeed(
  store,
  id,
  { fetchImpl = globalThis.fetch, rightsReviewed = false } = {},
) {
  if (rightsReviewed !== true)
    throw Error("Revisar permisos de fuente antes de captura");
  const provider = feedProvider(id),
    claim = store.feeds.claim(id);
  try {
    const robots = await read(`${provider.origin}/robots.txt`, {
      fetchImpl,
      types: /^text\/plain(?:\s*;|$)/i,
      max: 32768,
    });
    if (!robots.body) throw Error("Robots no verificable");
    const delay = robotsPolicy(robots.body.toString("utf8"), provider.url);
    store.feeds.defer(id, delay);
    const headers = {};
    if (claim.etag) headers["if-none-match"] = claim.etag;
    if (claim.last_modified) headers["if-modified-since"] = claim.last_modified;
    const result = await read(provider.url, {
      fetchImpl,
      headers,
      types:
        /^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:\s*;|$)/i,
    });
    if (result.not_modified && !claim.document_hash)
      throw Error("304 sin documento");
    const ingested = result.not_modified
      ? null
      : store.feeds.ingest(id, result.body);
    return store.feeds.finish(id, {
      ...result,
      etag: result.etag ?? claim.etag,
      last_modified: result.last_modified ?? claim.last_modified,
      body: undefined,
      document_hash: ingested?.document_hash ?? claim.document_hash,
      status: "ok",
    });
  } catch {
    store.feeds.finish(id, { status: "failed" });
    throw Error("Captura de feed fallida; historial conservado");
  }
}
