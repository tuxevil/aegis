const fields = {
  areas: "id name parent_id type location_precision code polygon_ref polygon_version synthetic",
  sources: "id kind name official source_url access_policy enabled synthetic",
  artifacts: "id source_id source_url source_published_at fetched_at sha256 media_type stored_ref parse_version extraction_status provenance synthetic",
  observations: "id source_id artifact_id area_id dedupe_key kind summary occurred_at observed_at reported_start_at source_published_at ingested_at temporal_confidence location_precision moderation_state synthetic",
  events: "id area_id type status start_at end_at start_basis end_basis last_evidence_at confidence_explanation created_at updated_at synthetic",
  evidence: "id event_id observation_id relation match_reason human_reviewed synthetic",
};
const booleans = new Set(["synthetic", "official", "enabled", "human_reviewed"]);
const nullable = new Set(["parent_id", "code", "polygon_ref", "polygon_version", "source_url", "stored_ref", "artifact_id",
  "source_published_at", "occurred_at", "observed_at", "reported_start_at", "start_at", "end_at", "last_evidence_at"]);
const identifiers = new Set(["id", "parent_id", "source_id", "artifact_id", "area_id", "event_id", "observation_id", "polygon_version"]);

export function utcDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new Error("Fecha ISO con zona requerida");
  if (new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new Error("Fecha de calendario inválida");
  }
  return new Date(value).toISOString();
}

export function createRepositories(db, { synthetic, assertWritable, onWriteFailure }) {
  const decode = row => row ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key, booleans.has(key) ? Boolean(value) : value])) : null;
  return Object.fromEntries(Object.entries(fields).map(([table, columnsString]) => {
    const columns = columnsString.split(" ");
    const insert = db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO NOTHING`);
    const byId = db.prepare(`SELECT * FROM ${table} WHERE id=?`);
    const timeFields = columns.filter(column => column.endsWith("_at"));
    const normalize = record => {
      if (!record || Object.keys(record).some(key => !columns.includes(key))) throw new Error("Campos desconocidos");
      const normalized = {};
      for (const column of columns) {
        const value = record[column];
        if (value === null && nullable.has(column)) { normalized[column] = null; continue; }
        if (booleans.has(column)) {
          if (typeof value !== "boolean") throw new Error("Booleano requerido");
          normalized[column] = Number(value);
        } else if (timeFields.includes(column)) {
          normalized[column] = utcDate(value);
        } else {
          if (typeof value !== "string" || value.length < 1 || value.length > (column.endsWith("url") ? 2048 : 2000)) throw new Error("Texto ausente o demasiado largo");
          if (identifiers.has(column) && !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error("Identificador inválido");
          if (column.endsWith("url") && !/^https:\/\//.test(value)) throw new Error("URL HTTPS requerida");
          normalized[column] = value;
        }
      }
      if (Boolean(normalized.synthetic) !== synthetic) throw new Error("No mezclar datos demo y live");
      return normalized;
    };
    return [table, Object.freeze({
      insert(record) {
        assertWritable();
        try {
          const normalized = normalize(record);
          const result = insert.run(...columns.map(column => normalized[column]));
          const stored = byId.get(normalized.id);
          if (!result.changes && columns.some(column => stored[column] !== normalized[column])) {
            throw new Error("ID duplicado con contenido distinto; no se sobrescribe evidencia");
          }
          return decode(stored);
        } catch (error) {
          onWriteFailure(error);
          throw error;
        }
      },
      get(id) { return decode(byId.get(id)); },
      // Fixed identifiers, bound values, finite pages. Dates are [from,to).
      list({ area_id = null, from = null, to = null, time = timeFields[0], limit = 100, offset = 0 } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error("Paginación inválida");
        if ((from !== null || to !== null) && !timeFields.includes(time)) throw new Error("Campo temporal inválido");
        if (area_id !== null && !columns.includes("area_id")) throw new Error("Filtro de área no disponible");
        const lower = from === null ? null : utcDate(from), upper = to === null ? null : utcDate(to);
        if (lower && upper && lower >= upper) throw new Error("Rango temporal inválido");
        const conditions = [], values = [];
        if (area_id !== null) { conditions.push("area_id=?"); values.push(area_id); }
        if (lower) { conditions.push(`${time}>=?`); values.push(lower); }
        if (upper) { conditions.push(`${time}<?`); values.push(upper); }
        const order = timeFields.includes(time) ? `${time},id` : "id";
        return db.prepare(`SELECT * FROM ${table}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...values, limit, offset).map(decode);
      },
    })];
  }));
}
