import { utcDate } from "./repositories.js";
export function createTimeline(db, { synthetic, available, now, getReader }) {
  const safeId = (v) =>
    typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
  return {
    list({
      area_id,
      from,
      to,
      known_at = now().toISOString(),
      limit = 20,
      offset = 0,
    }) {
      available();
      if (
        !safeId(area_id) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 10000
      )
        throw Error("Consulta temporal inválida");
      const lower = utcDate(from),
        upper = utcDate(to),
        known = utcDate(known_at);
      if (
        lower >= upper ||
        Date.parse(upper) - Date.parse(lower) > 90 * 86400000 ||
        known > now().toISOString()
      )
        throw Error("Rango temporal inválido");
      const reader = getReader(),
        rows = db
          .prepare(
            `SELECT r.*,a.name AS area_name FROM correlation_revisions r
 JOIN events e ON e.id=r.event_id JOIN areas a ON a.id=e.area_id
 WHERE e.synthetic=? AND e.area_id=? AND r.recorded_at<=?
 AND r.revision=(SELECT MAX(p.revision) FROM correlation_revisions p WHERE p.event_id=r.event_id AND p.recorded_at<=?)
 AND (json_extract(r.snapshot_json,'$.event.start_at') IS NULL OR
 (json_extract(r.snapshot_json,'$.event.start_at')<? AND (json_extract(r.snapshot_json,'$.event.end_at') IS NULL OR json_extract(r.snapshot_json,'$.event.end_at')>=?)))
 ORDER BY r.recorded_at DESC,r.event_id LIMIT ? OFFSET ?`,
          )
          .all(
            Number(synthetic),
            area_id,
            known,
            known,
            upper,
            lower,
            limit,
            offset,
          );
      const data = [];
      for (const revision of rows) {
        const current = reader.getEvent(revision.event_id);
        if (!current) continue;
        const snapshot = JSON.parse(revision.snapshot_json),
          event = snapshot.event;
        const groups = snapshot.facts.groups || [],
          included = new Set(groups.map((g) => g.observation_id));
        const publicEvidence = reader.listEvidence(event.id, {
          limit: 500,
          offset: 0,
        });
        const ids = publicEvidence.map((e) => e.id),
          links = ids.length
            ? db
                .prepare(
                  `SELECT id,observation_id FROM evidence WHERE id IN (${ids.map(() => "?").join(",")})`,
                )
                .all(...ids)
            : [];
        const lookup = new Map(links.map((l) => [l.id, l.observation_id]));
        const allowed = new Set(links.map((l) => l.observation_id)),
          held = Boolean(
            db
              .prepare(
                "SELECT review_hold FROM correlation_cases WHERE event_id=?",
              )
              .get(event.id)?.review_hold,
          );
        const redacted =
          held ||
          groups.some((g) => g.active && !allowed.has(g.observation_id));
        const state = redacted
          ? {
              ...event,
              status: "unknown",
              start_at: null,
              end_at: null,
              start_basis: "unknown",
              end_basis: "unknown",
            }
          : event;
        const evidence = publicEvidence
          .filter(
            (e) =>
              included.has(lookup.get(e.id)) &&
              e.ingested_at <= revision.recorded_at,
          )
          .slice(0, 100)
          .map((e) => ({
            source_name: e.source_name,
            source_url: e.source_url,
            source_published_at: e.source_published_at,
            ingested_at: e.ingested_at,
            relation: e.relation,
          }));
        const duration =
          state.type !== "scheduled" &&
          state.status === "ended" &&
          state.start_at &&
          state.end_at &&
          state.start_basis !== "unknown" &&
          state.end_basis !== "unknown"
            ? Math.max(
                0,
                (Date.parse(state.end_at) - Date.parse(state.start_at)) / 1000,
              )
            : null;
        data.push({
          event_id: event.id,
          area_id: event.area_id,
          area_name: revision.area_name,
          type: state.type,
          status: state.status,
          start_at: state.start_at,
          end_at: state.end_at,
          start_basis: state.start_basis,
          end_basis: state.end_basis,
          recorded_at: revision.recorded_at,
          revision: revision.revision,
          duration_seconds: duration,
          evidence,
          synthetic,
          coverage: "unknown",
          redacted,
        });
      }
      return {
        data,
        next_offset:
          rows.length === limit && offset + limit <= 10000
            ? offset + limit
            : null,
        known_at: known,
        from: lower,
        to: upper,
      };
    },
  };
}
export function timelineCsv(rows) {
  const columns = [
    "event_id",
    "area_name",
    "type",
    "status",
    "start_at",
    "end_at",
    "recorded_at",
    "revision",
    "duration_seconds",
    "synthetic",
    "sources",
  ];
  const cell = (value) => {
    let s = value === null || value === undefined ? "" : String(value);
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    columns.map(cell).join(",") +
    "\r\n" +
    rows
      .map((row) =>
        columns
          .map((key) =>
            cell(
              key === "sources"
                ? row.evidence
                    .map((e) => e.source_url)
                    .filter(Boolean)
                    .join(" | ")
                : row[key],
            ),
          )
          .join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
