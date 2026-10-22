import { createHash, randomUUID } from "node:crypto";
import { provider } from "../schedules/providers.js";
import { parseEeasa, labelKey } from "../schedules/eeasa.js";
import { utcDate } from "./repositories.js";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const identifier = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const reason = (value) => {
  if (typeof value !== "string" || !value.trim() || value.length > 300)
    throw new Error("Motivo de revisión requerido");
  return value;
};
const rowFields = [
  "sector_label",
  "local_date",
  "start_at",
  "end_at",
  "original_time_string",
  "type",
  "motive",
  "parser_confidence",
];
const page = (limit, offset) => {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    throw new Error("Paginación inválida");
};
export function createSchedules(
  db,
  { synthetic, available, transaction, now },
) {
  db.function("schedule_label", { deterministic: true }, labelKey);
  const mode = Number(synthetic),
    stamp = () => utcDate(now().toISOString());
  const latestCapture = (p) =>
    db
      .prepare(
        "SELECT c.*,d.parse_error FROM schedule_captures c JOIN schedule_documents d ON d.artifact_id=c.artifact_id WHERE c.provider_id=? ORDER BY sequence DESC LIMIT 1",
      )
      .get(p);
  const head = (entry) =>
    db
      .prepare(
        "SELECT * FROM schedule_revisions WHERE entry_id=? ORDER BY revision_no DESC LIMIT 1",
      )
      .get(entry);
  function addRevision(entry, row, artifactId, captureId, present, at) {
    const previous = head(entry),
      change = previous
        ? [
            ...rowFields.filter((k) => previous[k] !== row[k]),
            ...(previous.row_present !== Number(present)
              ? ["row_present"]
              : []),
          ]
        : ["created"];
    if (previous && !change.length) return previous;
    const revision = {
      id: `sch_${randomUUID().replaceAll("-", "")}`,
      entry_id: entry,
      revision_no: (previous?.revision_no ?? 0) + 1,
      predecessor_id: previous?.id ?? null,
      artifact_id: artifactId,
      capture_id: captureId,
      ...Object.fromEntries(rowFields.map((k) => [k, row[k]])),
      row_present: Number(present),
      change_json: JSON.stringify(change),
      imported_at: at,
      synthetic: mode,
    };
    const keys = Object.keys(revision);
    db.prepare(
      `INSERT INTO schedule_revisions(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
    ).run(...keys.map((k) => revision[k]));
    return revision;
  }
  const status = (p) => {
    const capture = latestCapture(p),
      fetch = db
        .prepare("SELECT * FROM schedule_fetch_state WHERE provider_id=?")
        .get(p);
    const checked =
      [synthetic ? capture?.captured_at : null, fetch?.completed_at]
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
    const failed = Boolean(capture?.parse_error || fetch?.outcome === "failed");
    // A prior successful request cannot validate a different locally imported
    // document, nor can a failed attempt rejuvenate source evidence.
    const validatedAt = synthetic
      ? capture?.captured_at
      : ["ok", "not_modified"].includes(fetch?.outcome) &&
          fetch.artifact_id === capture?.artifact_id
        ? fetch.completed_at
        : null;
    return {
      capture,
      fetch,
      checked,
      failed,
      stale:
        !validatedAt ||
        Date.parse(stamp()) - Date.parse(validatedAt) > 6 * 3600000,
    };
  };
  const api = {
    ingest({ provider_id, body, acquisition = "local_import" }) {
      available();
      const p = provider(provider_id);
      if (!["local_import", "https"].includes(acquisition))
        throw new Error("Adquisición inválida");
      if (
        !(body instanceof Uint8Array) ||
        !body.length ||
        body.length > p.max_bytes
      )
        throw new Error("Documento excede límite o vacío");
      let parsed,
        parseError = null;
      try {
        parsed = parseEeasa(body);
      } catch (error) {
        parseError = /^[A-Z_]+$/.test(error.message)
          ? error.message
          : "FORMAT_REVIEW";
      }
      const sha = hash(body),
        artifactId = `schedoc_${hash(`${p.id}:${sha}`).slice(0, 40)}`;
      return transaction((repos) => {
        const at = stamp(),
          previous = latestCapture(p.id);
        if (previous && previous.captured_at > at)
          throw new Error("Reloj anterior a la captura");
        if (previous?.artifact_id === artifactId)
          return {
            artifact_id: artifactId,
            duplicate: true,
            parse_error: previous.parse_error,
            entries: db
              .prepare(
                "SELECT COUNT(*) AS n FROM schedule_capture_rows WHERE capture_id=?",
              )
              .get(previous.id).n,
          };
        if (!repos.sources.get(p.source_id))
          repos.sources.insert({
            id: p.source_id,
            kind: "authority",
            name: p.issuer,
            official: true,
            source_url: p.url,
            access_policy: p.access_policy,
            enabled: true,
            synthetic,
          });
        if (!repos.artifacts.get(artifactId)) {
          repos.artifacts.insert({
            id: artifactId,
            source_id: p.source_id,
            source_url: p.url,
            source_published_at: parsed?.source_published_at ?? null,
            fetched_at: at,
            sha256: sha,
            media_type: p.media_type,
            stored_ref: "sqlite:schedule_documents",
            parse_version: p.parser_version,
            extraction_status: parseError ? "review" : "parsed",
            provenance: `Registro ${p.id}; adquisición ${acquisition}; publicación pendiente de derechos y zona revisados`,
            synthetic,
          });
          db.prepare(
            "INSERT INTO schedule_documents VALUES(?,?,?,?,?,?,?)",
          ).run(
            artifactId,
            p.id,
            body,
            p.parser_version,
            acquisition,
            parseError,
            mode,
          );
        }
        const captureId = `cap_${randomUUID().replaceAll("-", "")}`;
        db.prepare("INSERT INTO schedule_captures VALUES(?,?,?,?,?)").run(
          captureId,
          p.id,
          artifactId,
          (previous?.sequence ?? 0) + 1,
          at,
        );
        if (parseError)
          return {
            artifact_id: artifactId,
            capture_id: captureId,
            duplicate: false,
            parse_error: parseError,
            entries: 0,
          };
        const seen = new Set();
        for (const row of parsed.entries) {
          let entry = db
            .prepare(
              "SELECT * FROM schedule_entries WHERE provider_id=? AND natural_key=?",
            )
            .get(p.id, row.natural_key);
          if (!entry) {
            entry = {
              id: `schedule_${hash(`${p.id}:${row.natural_key}`).slice(0, 40)}`,
            };
            db.prepare("INSERT INTO schedule_entries VALUES(?,?,?,?,?)").run(
              entry.id,
              p.id,
              row.natural_key,
              at,
              mode,
            );
          }
          seen.add(entry.id);
          const rev = addRevision(
            entry.id,
            row,
            artifactId,
            captureId,
            true,
            at,
          );
          db.prepare("INSERT INTO schedule_capture_rows VALUES(?,?,?)").run(
            captureId,
            entry.id,
            rev.id,
          );
        }
        const prior = db
          .prepare(
            "SELECT c.id FROM schedule_captures c JOIN schedule_documents d ON d.artifact_id=c.artifact_id WHERE c.provider_id=? AND c.id!=? AND d.parse_error IS NULL ORDER BY c.sequence DESC LIMIT 1",
          )
          .get(p.id, captureId);
        if (prior)
          for (const old of db
            .prepare(
              "SELECT entry_id FROM schedule_capture_rows WHERE capture_id=?",
            )
            .all(prior.id)) {
            if (!seen.has(old.entry_id))
              addRevision(
                old.entry_id,
                head(old.entry_id),
                artifactId,
                captureId,
                false,
                at,
              );
          }
        return {
          artifact_id: artifactId,
          capture_id: captureId,
          duplicate: false,
          parse_error: null,
          entries: parsed.entries.length,
        };
      });
    },
    bind({
      provider_id,
      sector_label,
      area_id,
      reference_url,
      review_reason,
      expected_binding = 0,
    }) {
      available();
      const p = provider(provider_id);
      reason(review_reason);
      if (
        !Number.isInteger(expected_binding) ||
        expected_binding < 0 ||
        !identifier(area_id) ||
        typeof sector_label !== "string" ||
        !sector_label.trim() ||
        sector_label.length > 2000
      )
        throw new Error("Correspondencia inválida");
      const ref = new URL(reference_url);
      if (
        ref.protocol !== "https:" ||
        !["www.eeasa.com.ec", "sig.eeasa.com.ec"].includes(ref.hostname) ||
        ref.port ||
        ref.username ||
        ref.password ||
        ref.search ||
        ref.hash ||
        reference_url.length > 2048
      )
        throw new Error("Referencia oficial inválida");
      return transaction(() => {
        const area = db
          .prepare("SELECT * FROM areas WHERE id=? AND synthetic=?")
          .get(area_id, mode);
        if (
          !area ||
          area.type !== "sector" ||
          !area.parent_id ||
          area.location_precision !== "generalized_sector"
        )
          throw new Error("Sector generalizado curado requerido");
        const prior = db
          .prepare(
            "SELECT * FROM schedule_bindings WHERE provider_id=? AND label_key=? ORDER BY binding_no DESC LIMIT 1",
          )
          .get(p.id, labelKey(sector_label));
        if (prior?.area_id === area_id && prior.reference_url === ref.href)
          return prior;
        if ((prior?.binding_no ?? 0) !== expected_binding)
          throw new Error(
            "Correspondencia en conflicto; requiere revisión del catálogo",
          );
        db.prepare("INSERT INTO schedule_bindings VALUES(?,?,?,?,?,?,?,?)").run(
          p.id,
          labelKey(sector_label),
          expected_binding + 1,
          area_id,
          ref.href,
          review_reason,
          stamp(),
          mode,
        );
        return { provider_id: p.id, area_id, binding_no: expected_binding + 1 };
      });
    },
    review({
      revision_id,
      decision,
      expected_review = 0,
      rights_reviewed = false,
      review_reason,
    }) {
      available();
      reason(review_reason);
      if (
        !identifier(revision_id) ||
        !["reviewed", "rejected"].includes(decision) ||
        !Number.isInteger(expected_review) ||
        expected_review < 0 ||
        typeof rights_reviewed !== "boolean"
      )
        throw new Error("Revisión inválida");
      return transaction(() => {
        const row = db
          .prepare(
            "SELECT r.*,e.provider_id FROM schedule_revisions r JOIN schedule_entries e ON e.id=r.entry_id WHERE r.id=? AND r.synthetic=?",
          )
          .get(revision_id, mode);
        if (
          !row ||
          (decision === "reviewed" && head(row.entry_id).id !== row.id)
        )
          throw new Error(
            "Revisión de cronograma desactualizada o inexistente",
          );
        const prior = db
          .prepare(
            "SELECT * FROM schedule_reviews WHERE revision_id=? ORDER BY review_no DESC LIMIT 1",
          )
          .get(row.id);
        if ((prior?.review_no ?? 0) !== expected_review)
          throw new Error("Conflicto de revisión");
        const binding = db
          .prepare(
            "SELECT b.* FROM schedule_bindings b JOIN areas a ON a.id=b.area_id WHERE b.provider_id=? AND b.label_key=? AND b.synthetic=? AND a.synthetic=? ORDER BY b.binding_no DESC LIMIT 1",
          )
          .get(row.provider_id, labelKey(row.sector_label), mode, mode);
        if (
          decision === "reviewed" &&
          (!binding ||
            !rights_reviewed ||
            !row.row_present ||
            row.parser_confidence < 1 ||
            row.type === "unknown")
        )
          throw new Error(
            "Derechos, correspondencia exacta y extracción revisables requeridos",
          );
        db.prepare("INSERT INTO schedule_reviews VALUES(?,?,?,?,?,?,?)").run(
          row.id,
          expected_review + 1,
          decision,
          binding?.area_id ?? null,
          Number(rights_reviewed),
          review_reason,
          stamp(),
        );
        return {
          revision_id: row.id,
          review_no: expected_review + 1,
          decision,
          area_id: binding?.area_id ?? null,
        };
      });
    },
    queue({ limit = 50, offset = 0 } = {}) {
      available();
      page(limit, offset);
      return db
        .prepare(
          `SELECT r.*,e.provider_id FROM schedule_revisions r JOIN schedule_entries e ON e.id=r.entry_id
        WHERE r.synthetic=? AND r.revision_no=(SELECT MAX(x.revision_no) FROM schedule_revisions x WHERE x.entry_id=r.entry_id)
        AND NOT EXISTS(SELECT 1 FROM schedule_reviews v WHERE v.revision_id=r.id) ORDER BY r.imported_at,r.id LIMIT ? OFFSET ?`,
        )
        .all(mode, limit, offset);
    },
    history(entryId, { limit = 50, offset = 0 } = {}) {
      available();
      page(limit, offset);
      if (!identifier(entryId)) throw new Error("Entrada inválida");
      return db
        .prepare(
          "SELECT * FROM schedule_revisions WHERE entry_id=? AND synthetic=? ORDER BY revision_no LIMIT ? OFFSET ?",
        )
        .all(entryId, mode, limit, offset)
        .map((row) => ({
          ...row,
          reviews: db
            .prepare(
              "SELECT * FROM schedule_reviews WHERE revision_id=? ORDER BY review_no",
            )
            .all(row.id),
        }));
    },
    document(artifactId) {
      available();
      if (!identifier(artifactId)) throw new Error("Artefacto inválido");
      const row = db
        .prepare(
          "SELECT body FROM schedule_documents WHERE artifact_id=? AND synthetic=?",
        )
        .get(artifactId, mode);
      return row ? Buffer.from(row.body) : null;
    },
    claimFetch(providerId) {
      available();
      const p = provider(providerId);
      if (synthetic)
        throw new Error("No descargar datos reales a una base sintética");
      return transaction(() => {
        const at = stamp(),
          prior = db
            .prepare("SELECT * FROM schedule_fetch_state WHERE provider_id=?")
            .get(p.id);
        if (prior && at < prior.next_allowed_at)
          throw new Error(
            "Captura limitada a una por proveedor cada 15 minutos",
          );
        const attemptId = randomUUID(),
          next = new Date(Date.parse(at) + 15 * 60000).toISOString();
        db.prepare(
          `INSERT INTO schedule_fetch_state(provider_id,attempt_id,attempted_at,next_allowed_at,outcome,artifact_id,etag,last_modified)
          VALUES(?,?,?,?,'running',?,?,?) ON CONFLICT(provider_id) DO UPDATE SET attempt_id=excluded.attempt_id,attempted_at=excluded.attempted_at,next_allowed_at=excluded.next_allowed_at,completed_at=NULL,outcome='running'`,
        ).run(
          p.id,
          attemptId,
          at,
          next,
          prior?.artifact_id ?? null,
          prior?.etag ?? null,
          prior?.last_modified ?? null,
        );
        return {
          attempt_id: attemptId,
          provider_id: p.id,
          etag: prior?.etag ?? null,
          last_modified: prior?.last_modified ?? null,
          artifact_id: prior?.artifact_id ?? null,
        };
      });
    },
    finishFetch(
      claim,
      {
        outcome,
        artifact_id = null,
        etag = null,
        last_modified = null,
        error_code = null,
      },
    ) {
      available();
      provider(claim.provider_id);
      if (
        !["ok", "not_modified", "failed"].includes(outcome) ||
        [etag, last_modified].some(
          (v) =>
            v !== null &&
            (typeof v !== "string" || v.length > 300 || /[\r\n]/.test(v)),
        ) ||
        (error_code !== null && !/^[A-Z_]{1,60}$/.test(error_code))
      )
        throw new Error("Resultado de captura inválido");
      return transaction(() => {
        const state = db
          .prepare(
            "SELECT * FROM schedule_fetch_state WHERE provider_id=? AND attempt_id=? AND outcome='running'",
          )
          .get(claim.provider_id, claim.attempt_id);
        if (!state) throw new Error("Captura expirada o completada");
        if (
          outcome !== "failed" &&
          (!artifact_id ||
            !db
              .prepare(
                "SELECT 1 FROM schedule_documents WHERE artifact_id=? AND provider_id=? AND parse_error IS NULL AND synthetic=?",
              )
              .get(artifact_id, claim.provider_id, mode))
        )
          throw new Error("Documento válido requerido");
        db.prepare(
          "UPDATE schedule_fetch_state SET completed_at=?,outcome=?,artifact_id=?,etag=?,last_modified=? WHERE provider_id=? AND attempt_id=?",
        ).run(
          stamp(),
          outcome,
          outcome === "failed" ? state.artifact_id : artifact_id,
          outcome === "failed" ? state.etag : etag,
          outcome === "failed" ? state.last_modified : last_modified,
          claim.provider_id,
          claim.attempt_id,
        );
        db.prepare(
          "INSERT INTO schedule_fetch_history VALUES(?,?,?,?,?,?,?)",
        ).run(
          claim.attempt_id,
          claim.provider_id,
          state.attempted_at,
          stamp(),
          outcome,
          artifact_id,
          error_code,
        );
        return { provider_id: claim.provider_id, outcome, artifact_id };
      });
    },
    listPublic({ area_id, from, to, type = null, limit = 21, offset = 0 }) {
      available();
      if (
        !identifier(area_id) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 51 ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 10000 ||
        (type !== null &&
          !["residential", "industrial", "maintenance", "unknown"].includes(
            type,
          ))
      )
        throw new Error("Consulta inválida");
      const lower = utcDate(from),
        upper = utcDate(to);
      if (
        lower >= upper ||
        Date.parse(upper) - Date.parse(lower) > 31 * 86400000
      )
        throw new Error("Intervalo máximo 31 días");
      const p = provider("eeasa-maintenance"),
        health = status(p.id);
      const rows = db
        .prepare(
          `SELECT r.*,v.area_id,a.name AS area_name,s.name AS issuer,art.source_url,art.sha256,art.source_published_at,art.fetched_at,d.parser_version,d.acquisition
        FROM schedule_revisions r JOIN schedule_entries e ON e.id=r.entry_id JOIN schedule_reviews v ON v.revision_id=r.id
        JOIN areas a ON a.id=v.area_id
        JOIN schedule_bindings b ON b.provider_id=e.provider_id AND b.label_key=schedule_label(r.sector_label) AND b.area_id=v.area_id
          AND b.binding_no=(SELECT MAX(z.binding_no) FROM schedule_bindings z WHERE z.provider_id=b.provider_id AND z.label_key=b.label_key)
        JOIN artifacts art ON art.id=r.artifact_id JOIN sources s ON s.id=art.source_id JOIN schedule_documents d ON d.artifact_id=art.id
        WHERE e.provider_id=? AND r.synthetic=? AND e.synthetic=? AND a.synthetic=? AND art.synthetic=? AND s.synthetic=? AND d.synthetic=?
        AND s.enabled=1 AND s.kind='authority' AND s.official=1 AND v.decision='reviewed' AND v.rights_reviewed=1 AND r.row_present=1
        AND v.review_no=(SELECT MAX(z.review_no) FROM schedule_reviews z WHERE z.revision_id=r.id)
        AND r.revision_no=(SELECT MAX(q.revision_no) FROM schedule_revisions q JOIN schedule_reviews w ON w.revision_id=q.id
          WHERE q.entry_id=r.entry_id AND w.decision='reviewed' AND w.rights_reviewed=1 AND w.review_no=(SELECT MAX(t.review_no) FROM schedule_reviews t WHERE t.revision_id=q.id))
        AND v.area_id=? AND r.start_at<? AND r.end_at>? AND (? IS NULL OR r.type=?) ORDER BY r.start_at,r.id LIMIT ? OFFSET ?`,
        )
        .all(
          p.id,
          mode,
          mode,
          mode,
          mode,
          mode,
          mode,
          area_id,
          upper,
          lower,
          type,
          type,
          limit,
          offset,
        );
      return {
        data: rows.map((row) => {
          const latest = head(row.entry_id);
          const source_status = health.failed
            ? "failed"
            : health.stale
              ? "stale"
              : !latest.row_present
                ? "missing"
                : latest.id !== row.id
                  ? "changed"
                  : "current";
          return {
            id: row.id,
            entry_id: row.entry_id,
            issuer: row.issuer,
            area_id: row.area_id,
            area_name: row.area_name,
            start_at: row.start_at,
            end_at: row.end_at,
            original_zone: p.zone,
            original_time_string: row.original_time_string,
            type: row.type,
            artifact_id: row.artifact_id,
            evidence_ids: [],
            parser_confidence: row.parser_confidence,
            review_state: "reviewed",
            effective_status:
              source_status === "current"
                ? row.revision_no > 1
                  ? "revised"
                  : "published"
                : "unverified",
            revision_no: row.revision_no,
            predecessor_id: row.predecessor_id,
            imported_at: row.imported_at,
            synthetic,
            source_url: p.url,
            source_published_at: row.source_published_at,
            sha256: row.sha256,
            fetched_at: row.fetched_at,
            last_checked_at: health.checked,
            source_status,
            latest_revision_no: latest.revision_no,
            parser_version: row.parser_version,
            acquisition: row.acquisition,
          };
        }),
        last_checked_at: health.checked,
        source_status: health.failed
          ? "failed"
          : health.stale
            ? "stale"
            : "available",
      };
    },
  };
  return Object.freeze(api);
}
