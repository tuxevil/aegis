import { JSDOM } from "jsdom";
import { createHash } from "node:crypto";
import { canonicalUrl } from "../storage/correlation-rules.js";
const hash = (v) => createHash("sha256").update(v).digest("hex");
export function parseFeed(body, provider, now = new Date()) {
  if (!Buffer.isBuffer(body) || body.length > 262144 || !body.length)
    throw Error("Feed excede límite");
  const xml = body.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error("DTD no permitida");
  const dom = new JSDOM(xml, { contentType: "application/xml" });
  try {
    const doc = dom.window.document,
      root = doc.documentElement.localName;
    if (!["rss", "feed"].includes(root))
      throw Error("Formato RSS/Atom desconocido");
    const entries = [
      ...doc.querySelectorAll(
        root === "rss" ? "rss > channel > item" : "feed > entry",
      ),
    ];
    if (entries.length > 100) throw Error("Demasiadas entradas");
    return entries.map((item) => {
      const text = (name) => item.querySelector(name)?.textContent.trim() || "";
      const title = text("title");
      if (!title || title.length > 300) throw Error("Título requiere revisión");
      const raw =
        root === "rss"
          ? text("link")
          : item
              .querySelector('link[rel="alternate"],link:not([rel])')
              ?.getAttribute("href");
      const url = canonicalUrl(raw);
      if (!url || new URL(url).origin !== provider.origin)
        throw Error("Enlace fuera del proveedor");
      const rawDate =
        root === "rss" ? text("pubDate") : text("published") || text("updated");
      const published =
        rawDate && Number.isFinite(Date.parse(rawDate))
          ? new Date(rawDate).toISOString()
          : null;
      const age = published ? now.getTime() - Date.parse(published) : null;
      const normalized = title
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      const category = /restablec|repon|restitu/.test(normalized)
        ? "restoration"
        : /mantenim|programad/.test(normalized)
          ? "maintenance"
          : /corte|interrup|apag[oó]n/.test(normalized)
            ? "outage"
            : "unknown";
      return {
        url,
        title,
        published_at: published,
        category,
        temporal_state:
          age === null
            ? "unknown"
            : age < -300000
              ? "future"
              : age > 7 * 86400000
                ? "old"
                : "recent",
        content_hash: hash(normalized),
        revision_hash: hash(JSON.stringify([title, published])),
      };
    });
  } finally {
    dom.window.close();
  }
}
