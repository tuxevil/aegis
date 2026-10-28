import { provider } from "./providers.js";
// Single bounded request to a registry-owned URL, never a citizen-supplied URL.
export async function downloadSchedule(
  providerId,
  { fetchImpl = globalThis.fetch, etag = null, last_modified = null } = {},
) {
  const p = provider(providerId),
    headers = {
      accept: "text/html",
      "user-agent": "AEGIS/5 manual-source-review",
    };
  if (etag) headers["if-none-match"] = etag;
  if (last_modified) headers["if-modified-since"] = last_modified;
  const response = await fetchImpl(p.url, {
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(10000),
    headers,
  });
  const header = (name) => {
    const value = response.headers.get(name);
    return value && value.length <= 300 && !/[\r\n]/.test(value) ? value : null;
  };
  if (response.url && response.url !== p.url)
    throw new Error("REDIRECT_REJECTED");
  if (response.status === 304)
    return {
      not_modified: true,
      etag: header("etag") ?? etag,
      last_modified: header("last-modified") ?? last_modified,
    };
  if (response.status !== 200) throw new Error("HTTP_FAILURE");
  if (
    !/^text\/html(?:\s*;|$)/i.test(response.headers.get("content-type") || "")
  )
    throw new Error("CONTENT_TYPE_REVIEW");
  const length = Number(response.headers.get("content-length"));
  if (length > p.max_bytes) {
    await response.body?.cancel();
    throw new Error("BODY_LIMIT");
  }
  if (!response.body) throw new Error("BODY_EMPTY");
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > p.max_bytes) throw new Error("BODY_LIMIT");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("BODY_EMPTY");
  return {
    not_modified: false,
    body: Buffer.concat(chunks),
    etag: header("etag"),
    last_modified: header("last-modified"),
  };
}
export async function captureSchedule(
  store,
  providerId,
  { fetchImpl = globalThis.fetch } = {},
) {
  const claim = store.schedules.claimFetch(providerId);
  try {
    const result = await downloadSchedule(providerId, { fetchImpl, ...claim });
    if (result.not_modified) {
      if (!claim.artifact_id) throw new Error("UNEXPECTED_NOT_MODIFIED");
      store.schedules.ingest({
        provider_id: providerId,
        body: store.schedules.document(claim.artifact_id),
        acquisition: "https",
      });
      return store.schedules.finishFetch(claim, {
        outcome: "not_modified",
        artifact_id: claim.artifact_id,
        etag: result.etag,
        last_modified: result.last_modified,
      });
    }
    const ingested = store.schedules.ingest({
      provider_id: providerId,
      body: result.body,
      acquisition: "https",
    });
    if (ingested.parse_error) {
      return store.schedules.finishFetch(claim, {
        outcome: "failed",
        error_code: ingested.parse_error,
      });
    }
    return store.schedules.finishFetch(claim, {
      outcome: "ok",
      artifact_id: ingested.artifact_id,
      etag: result.etag,
      last_modified: result.last_modified,
    });
  } catch (error) {
    store.schedules.finishFetch(claim, {
      outcome: "failed",
      error_code: /^[A-Z_]{1,60}$/.test(error.message)
        ? error.message
        : "FETCH_FAILED",
    });
    throw new Error("Captura fallida; se conserva la programación anterior");
  }
}
