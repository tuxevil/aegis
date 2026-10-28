// Pure, deterministic rules. No network, clock, model, private receipt or source text in audit output.
export const RULE_VERSION = "correlation-1";
export const WINDOW_MS = 60 * 60 * 1000;
export const MAX_CLAIMS = 500;
export const eventTime = observation => observation.temporal_confidence === "exact"
  ? observation.occurred_at || observation.observed_at || observation.reported_start_at : null;

export function canonicalUrl(value) {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("URL canónica debe ser texto");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || value.length > 2048) throw new Error("URL canónica HTTPS sin credenciales requerida");
  url.hash = "";
  for (const name of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(name)) url.searchParams.delete(name);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}

// Connected components: same origin, source, article URL, content hash OR copied
// summary joins groups transitively, even if an intermediary later retracts.
export function independentGroups(claims) {
  const parent = claims.map((_, i) => i), keys = new Map();
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const [i, claim] of claims.entries()) {
    const aliases = [`source:${claim.source_id}`];
    if (claim.origin_key) aliases.push(`origin:${claim.origin_key}`);
    if (claim.canonical_url) aliases.push(`url:${claim.canonical_url}`);
    if (claim.article_url) aliases.push(`url:${claim.article_url}`);
    if (claim.sha256) aliases.push(`hash:${claim.sha256}`);
    // Conservative: identical generic summaries can undercount, never add certainty.
    aliases.push(`text:${claim.summary.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()}`);
    for (const key of aliases) {
      if (keys.has(key)) parent[root(i)] = root(keys.get(key));
      else keys.set(key, i);
    }
  }
  return claims.map((_, i) => root(i));
}

export function deriveEvent(event, claims) {
  const groups = independentGroups(claims), removed = new Set(claims.filter(c => c.publishable).map(c => c.replaces).filter(Boolean));
  const groupByObservation = new Map(claims.map((c,i) => [c.observation_id,groups[i]]));
  const active = claims.filter(c => !removed.has(c.observation_id) && c.signal !== "retraction" && c.publishable);
  const activeIds = new Set(active.map(c => c.observation_id));
  const supports = active.filter(c => c.signal === "outage" && c.area_id === event.area_id);
  const count = list => new Set(list.filter(c => c.origin_reviewed && c.origin_key && c.source_kind !== "citizen" && eventTime(c)
    && (c.source_kind === "sensor" || (c.artifact_id && c.extraction_status === "parsed")))
    .map(c => groupByObservation.get(c.observation_id))).size;
  const starts = supports.filter(eventTime).sort((a, b) => eventTime(a).localeCompare(eventTime(b)) || a.observation_id.localeCompare(b.observation_id));
  const first = starts[0], last = starts.at(-1);
  const restores = active.filter(c => c.signal === "restored");
  const fullRestores = restores.filter(c => c.area_id === event.area_id && eventTime(c) && last && eventTime(c) > eventTime(last));
  const refutes = active.filter(c => c.signal === "refute");
  const independent = count(supports), restoredOrigins = count(fullRestores);
  const official = supports.some(c => c.competent && first && last
    && eventTime(first) >= c.competence_from && eventTime(last) < c.competence_to);
  let status = supports.length ? official ? "official" : independent >= 2 ? "corroborated" : "reported" : "unknown";
  let end = null;
  const disputed = refutes.length > 0 || restores.length > 0;
  if (disputed) {
    // A partial/ambiguous or lone restoration never closes an entire area.
    const qualified = fullRestores.filter(c => c.competent);
    if (!refutes.length && first && starts.length === supports.length && (qualified.length || restoredOrigins >= 2)) {
      status = "ended";
      // Earliest official assertion, or the second independent assertion, is the
      // earliest reproducible closing evidence; not an inferred silence timeout.
      const ordered = (qualified.length ? qualified : fullRestores).slice().sort((a, b) => eventTime(a).localeCompare(eventTime(b)) || a.observation_id.localeCompare(b.observation_id));
      if (qualified.length) end = ordered[0];
      else {
        const seen = new Set();
        for (const claim of ordered) {
          if (!claim.origin_reviewed || !claim.origin_key || claim.source_kind === "citizen"
            || (claim.source_kind !== "sensor" && (!claim.artifact_id || claim.extraction_status !== "parsed"))) continue;
          seen.add(groupByObservation.get(claim.observation_id));
          if (seen.size >= 2) { end = claim; break; }
        }
      }
    } else status = "unknown";
  }
  const facts = {
    rule_version: RULE_VERSION, independent_origins: independent, restoration_origins: restoredOrigins,
    active_supports: supports.length, refutations: refutes.length,
    partial_restorations: restores.filter(c => c.area_id !== event.area_id).length,
    imprecise_times: active.filter(c => !eventTime(c)).length,
    retracted_observations: [...removed].sort(),
    groups: claims.map((c, i) => ({ observation_id: c.observation_id, group: groups[i], active: activeIds.has(c.observation_id) })),
  };
  const basis = c => c?.competent ? "official" : c?.observed_at && !c.occurred_at ? "observed" : c ? "reported" : "unknown";
  return { status, start_at: first ? eventTime(first) : null, end_at: end ? eventTime(end) : null,
    start_basis: basis(first), end_basis: basis(end),
    last_evidence_at: claims.map(c => c.ingested_at).sort().at(-1) || null,
    confidence_explanation: `Regla ${RULE_VERSION}; ${supports.length} evidencias activas, ${independent} orígenes independientes revisados; ${refutes.length} contradicciones, ${facts.partial_restorations} reposiciones parciales, ${facts.imprecise_times} tiempos imprecisos. Cobertura limitada a la zona indicada; no implica suministro normal fuera de ella.`,
    facts,
  };
}
