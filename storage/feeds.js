import { createHash } from "node:crypto";
import { feedProvider } from "../feeds/providers.js";
import { utcDate } from "./repositories.js";
import { parseFeed } from "../feeds/parser.js";
const hash = (v) => createHash("sha256").update(v).digest("hex");
export function createFeeds(
  db,
  { synthetic, now, available, transaction, getRepositories },
) {
  function permitted(provider_id) {
    const p = db
      .prepare(
        "SELECT * FROM feed_permissions WHERE provider_id=? ORDER BY id DESC LIMIT 1",
      )
      .get(provider_id);
    return Boolean(p && p.decision === "approved" && p.valid_until > stamp());
  }
  const mode = Number(synthetic),
    stamp = () => now().toISOString(),
    id = (value) => `feed_${hash(value)}`;
  return {
    permission(provider_id) {
      available();
      feedProvider(provider_id);
      return permitted(provider_id);
    },
    grant({ provider_id, decision, valid_until, evidence_url, reason }) {
      feedProvider(provider_id);
      let url;
      try {
        url = new URL(evidence_url);
      } catch {
        throw Error("Evidencia HTTPS requerida");
      }
      if (
        !["approved", "rejected"].includes(decision) ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        evidence_url.length > 2048 ||
        typeof reason !== "string" ||
        !reason.trim() ||
        reason.length > 500
      )
        throw Error("Permiso inválido");
      const until = utcDate(valid_until);
      if (
        until <= stamp() ||
        Date.parse(until) - now().getTime() > 180 * 86400000
      )
        throw Error("Vigencia 1–180 días requerida");
      return transaction(() => {
        db.prepare(
          "INSERT INTO feed_permissions(provider_id,decision,valid_until,evidence_url,reason,reviewed_at) VALUES(?,?,?,?,?,?)",
        ).run(provider_id, decision, until, evidence_url, reason, stamp());
        db.prepare("UPDATE sources SET enabled=? WHERE id=?").run(
          Number(decision === "approved"),
          `news_${provider_id}`,
        );
        return { decision, valid_until: until };
      });
    },
    claim(provider_id) {
      feedProvider(provider_id);
      if (synthetic) throw Error("Captura real prohibida en demo");
      if (!permitted(provider_id))
        throw Error("Permiso de fuente pendiente o vencido");
      return transaction(() => {
        const prior = db
          .prepare("SELECT * FROM feed_state WHERE provider_id=?")
          .get(provider_id);
        if (prior?.next_allowed_at > stamp()) throw Error("Cooldown de fuente");
        db.prepare(
          "INSERT INTO feed_state(provider_id,attempted_at,next_allowed_at,status) VALUES(?,?,?,'running') ON CONFLICT(provider_id) DO UPDATE SET attempted_at=excluded.attempted_at,next_allowed_at=excluded.next_allowed_at,status='running'",
        ).run(
          provider_id,
          stamp(),
          new Date(now().getTime() + 3600000).toISOString(),
        );
        return prior || {};
      });
    },
    defer(provider_id, seconds) {
      return transaction(() =>
        db
          .prepare(
            "UPDATE feed_state SET next_allowed_at=? WHERE provider_id=?",
          )
          .run(
            new Date(now().getTime() + seconds * 1000).toISOString(),
            provider_id,
          ),
      );
    },
    finish(provider_id, result) {
      return transaction(() => {
        db.prepare(
          "UPDATE feed_state SET status=?,etag=CASE WHEN ?='ok' THEN ? ELSE etag END,last_modified=CASE WHEN ?='ok' THEN ? ELSE last_modified END,document_hash=CASE WHEN ?='ok' THEN ? ELSE document_hash END WHERE provider_id=?",
        ).run(
          result.status,
          result.status,
          result.etag ?? null,
          result.status,
          result.last_modified ?? null,
          result.status,
          result.document_hash ?? null,
          provider_id,
        );
        return { status: result.status };
      });
    },
    ingest(provider_id, body) {
      const provider = feedProvider(provider_id),
        items = parseFeed(body, provider, now()),
        document_hash = hash(body),
        document_id = id(`${provider_id}:${document_hash}`);
      return transaction(() => {
        db.prepare(
          "INSERT OR IGNORE INTO feed_documents VALUES(?,?,?,?,?)",
        ).run(document_id, provider_id, document_hash, stamp(), mode);
        const insert = db.prepare(
          "INSERT OR IGNORE INTO feed_items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        );
        let added = 0;
        for (const item of items)
          added += insert.run(
            id(`${provider_id}:${item.url}:${item.revision_hash}`),
            provider_id,
            item.url,
            item.title,
            item.published_at,
            stamp(),
            document_id,
            item.category,
            item.temporal_state,
            item.content_hash,
            item.revision_hash,
            mode,
          ).changes;
        return { document_hash, added };
      });
    },
    queue({ limit = 50, offset = 0 } = {}) {
      available();
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 100000
      )
        throw Error("Paginación inválida");
      return db
        .prepare(
          `SELECT i.*, (SELECT COUNT(*) FROM feed_items d WHERE d.content_hash=i.content_hash) AS copies,
 (SELECT MIN(published_at) FROM feed_items d WHERE d.provider_id=i.provider_id AND d.url=i.url) AS first_published_at
 FROM feed_items i WHERE i.synthetic=? AND NOT EXISTS(SELECT 1 FROM feed_reviews r WHERE r.item_id=i.id) ORDER BY first_seen_at,id LIMIT ? OFFSET ?`,
        )
        .all(mode, limit, offset);
    },
    review(value) {
      if (
        !value ||
        Object.keys(value).some(
          (k) =>
            ![
              "item_id",
              "decision",
              "rights_reviewed",
              "area_id",
              "occurred_at",
              "summary",
              "reason",
            ].includes(k),
        ) ||
        !["approved", "rejected"].includes(value.decision) ||
        typeof value.reason !== "string" ||
        !value.reason.trim() ||
        value.reason.length > 300
      )
        throw Error("Revisión inválida");
      return transaction(() => {
        const item = db
          .prepare("SELECT * FROM feed_items WHERE id=? AND synthetic=?")
          .get(value.item_id, mode);
        if (
          !item ||
          db.prepare("SELECT 1 FROM feed_reviews WHERE item_id=?").get(item.id)
        )
          throw Error("Revisión inexistente o ya decidida");
        let observation_id = null;
        if (value.decision === "approved") {
          if (
            !permitted(item.provider_id) ||
            value.rights_reviewed !== true ||
            typeof value.summary !== "string" ||
            !value.summary.trim() ||
            value.summary.length > 500
          )
            throw Error("Derechos y resumen propio revisados requeridos");
          const repos = getRepositories(),
            area = repos.areas.get(value.area_id);
          if (!area || area.synthetic !== synthetic)
            throw Error("Área debe revisarse explícitamente");
          const provider = feedProvider(item.provider_id),
            source_id = `news_${provider.id}`;
          const source = {
            id: source_id,
            kind: "news",
            name: provider.name,
            official: false,
            source_url: provider.origin,
            access_policy: "public",
            enabled: true,
            synthetic,
          };
          if (!repos.sources.get(source_id)) repos.sources.insert(source);
          const artifact_id = id(`artifact:${item.id}`);
          repos.artifacts.insert({
            id: artifact_id,
            source_id,
            source_url: item.url,
            source_published_at: item.published_at,
            fetched_at: item.first_seen_at,
            sha256: item.revision_hash,
            media_type: "application/xml",
            stored_ref: null,
            parse_version: "feed-1",
            extraction_status: "parsed",
            provenance:
              "Metadatos RSS/Atom, sin descargar artículo; derechos y zona revisados localmente",
            synthetic,
          });
          observation_id = id(`observation:${item.id}`);
          repos.observations.insert({
            id: observation_id,
            source_id,
            artifact_id,
            area_id: area.id,
            dedupe_key: item.id,
            kind: item.category,
            summary: value.summary,
            occurred_at: value.occurred_at ?? null,
            observed_at: null,
            reported_start_at: null,
            source_published_at: item.published_at,
            ingested_at: stamp(),
            temporal_confidence: value.occurred_at ? "exact" : "unknown",
            location_precision: area.location_precision,
            moderation_state: "approved",
            synthetic,
          });
        }
        db.prepare("INSERT INTO feed_reviews VALUES(?,?,?,?,?,?)").run(
          id(`review:${item.id}`),
          item.id,
          value.decision,
          stamp(),
          value.reason,
          observation_id,
        );
        return { observation_id, decision: value.decision };
      });
    },
    history(item_id) {
      available();
      return db
        .prepare("SELECT * FROM feed_reviews WHERE item_id=?")
        .all(item_id);
    },
  };
}
