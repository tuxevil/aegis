// Read-only publication boundary. Public DTOs never reuse raw repository rows.
const ancestry = `WITH RECURSIVE tree(root,id,depth) AS (
  SELECT id,id,0 FROM areas UNION SELECT tree.root,a.id,tree.depth+1 FROM tree JOIN areas a ON a.parent_id=tree.id WHERE tree.depth<3
)`;
const visible = `FROM evidence l
  JOIN observations o ON o.id=l.observation_id
  JOIN sources s ON s.id=o.source_id
  LEFT JOIN artifacts a ON a.id=o.artifact_id
  WHERE l.human_reviewed=1 AND o.moderation_state='approved'
  AND s.enabled=1 AND s.access_policy='public'
  AND l.synthetic=? AND o.synthetic=? AND s.synthetic=?
  AND (a.id IS NULL OR a.synthetic=?)`;
const reference = `EXISTS(SELECT 1 FROM tree t JOIN areas parent ON parent.id=t.root
  JOIN areas province ON province.id=parent.parent_id
  WHERE t.id=areas.id AND parent.type='canton' AND parent.name='Pallatanga'
  AND province.type='province' AND province.name IN ('Chimborazo','Chimborazo (ámbito de demo)'))`;
const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const emptyReader = Object.freeze({
  synthetic: false, listAreas: () => [], listEvents: () => [], listEvidence: () => [], getEvent: () => null,
});

export function createPublicReader(db, { synthetic, available }) {
  db.function("public_search", { deterministic: true }, normalize);
  const mode = Number(synthetic), modes = [mode, mode, mode, mode];
  const publicLinks = (eventId, { limit = 21, offset = 0 } = {}) => db.prepare(`
    SELECT l.id,o.area_id,o.source_id,s.name AS source_name,s.kind AS source_kind,
    COALESCE(a.source_url,s.source_url) AS source_url,o.artifact_id,o.summary,l.relation,
    COALESCE(o.source_published_at,a.source_published_at) AS source_published_at,o.observed_at,o.reported_start_at,o.ingested_at,
    o.temporal_confidence,o.location_precision,o.synthetic ${visible}
    AND l.event_id=? ORDER BY o.ingested_at,l.id LIMIT ? OFFSET ?
  `).all(...modes, eventId, limit, offset).map(row => ({ ...row, synthetic: Boolean(row.synthetic),
    source_url: safePublicUrl(row.source_url),
  }));
  const publishEvent = row => ({ ...row,
    ...db.prepare(`${ancestry} SELECT areas.name AS area_name,
      CASE WHEN ${reference} THEN 'pallatanga-canton' ELSE NULL END AS map_ref FROM areas WHERE id=?`).get(row.area_id),
    synthetic: Boolean(row.synthetic),
    evidence_ids: publicLinks(row.id, { limit: 100 }).map(link => link.id),
  });
  const eventVisibility = `EXISTS(SELECT 1 ${visible} AND l.event_id=e.id)
    AND (e.status!='official' OR EXISTS(SELECT 1 ${visible} AND l.event_id=e.id
      AND l.relation='support' AND s.kind='authority' AND s.official=1))`;
  const visibilityValues = [...modes, ...modes];
  return Object.freeze({
    synthetic,
    listAreas({ q = "", parent_id = null, type = null, limit = 21, offset = 0 } = {}) {
      available();
      const conditions = ["areas.synthetic=?"], values = [mode];
      if (q) {
        conditions.push(`EXISTS(SELECT 1 FROM tree t JOIN areas ancestor ON ancestor.id=t.root
          WHERE t.id=areas.id AND public_search(ancestor.name) LIKE ? ESCAPE '\\')`);
        values.push(`%${normalize(q).replace(/[\\%_]/g, "\\$&")}%`);
      }
      if (parent_id) { conditions.push("areas.parent_id=?"); values.push(parent_id); }
      if (type) { conditions.push("areas.type=?"); values.push(type); }
      return db.prepare(`${ancestry} SELECT areas.*,
        CASE WHEN ${reference} THEN 'pallatanga-canton' ELSE NULL END AS map_ref
        FROM areas WHERE ${conditions.join(" AND ")} ORDER BY areas.name,areas.id LIMIT ? OFFSET ?`)
        .all(...values, limit, offset).map(row => ({ ...row, synthetic: Boolean(row.synthetic) }));
    },
    listEvents({ area_id = null, layer = null, from = null, to = null, bbox = null, limit = 21, offset = 0 } = {}) {
      available();
      // Only a vetted coarse canton reference can participate in bbox filtering.
      if (bbox && !(bbox[0] <= -78.97 && bbox[2] >= -78.97 && bbox[1] <= -2 && bbox[3] >= -2)) return [];
      const conditions = ["e.synthetic=?", eventVisibility], values = [mode, ...visibilityValues];
      if (area_id) {
        conditions.push("e.area_id IN (SELECT id FROM tree WHERE root=?)"); values.push(area_id);
      }
      if (from) { conditions.push("e.updated_at>=?"); values.push(from); }
      if (to) { conditions.push("e.updated_at<?"); values.push(to); }
      if (layer) {
        const kinds = { official: "'authority'", citizen: "'citizen','sensor'", osint: "'news','social'" }[layer];
        if (!kinds) throw new Error("Capa no admitida");
        conditions.push(`EXISTS(SELECT 1 ${visible} AND l.event_id=e.id AND s.kind IN (${kinds}))`);
        values.push(...modes);
      }
      if (bbox) conditions.push(`e.area_id IN (SELECT areas.id FROM areas WHERE ${reference})`);
      return db.prepare(`${ancestry} SELECT e.* FROM events e WHERE ${conditions.join(" AND ")}
        ORDER BY e.updated_at DESC,e.id LIMIT ? OFFSET ?`).all(...values, limit, offset).map(publishEvent);
    },
    getEvent(id) {
      available();
      const row = db.prepare(`SELECT e.* FROM events e WHERE e.id=? AND e.synthetic=? AND ${eventVisibility}`)
        .get(id, mode, ...visibilityValues);
      return row ? publishEvent(row) : null;
    },
    listEvidence(id, page) { available(); return publicLinks(id, page); },
  });
}

function safePublicUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
