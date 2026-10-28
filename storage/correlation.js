import {feedSourceAllowed} from "./feeds.js";
import { createHash } from "node:crypto";
import { utcDate } from "./repositories.js";
import { RULE_VERSION, WINDOW_MS, MAX_CLAIMS, canonicalUrl, eventTime, deriveEvent } from "./correlation-rules.js";

const id = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const digest = value => createHash("sha256").update(value).digest("hex");
const fields = ["observation_id", "type", "signal", "event_id", "origin_key", "origin_reviewed", "canonical_url", "replaces", "competence", "review_reason"];

// Trusted local operator boundary. Never registered as an HTTP mutation route.
// Methods prepare lazily so old-schema snapshot verification can still open v1/v2.
export function createCorrelation(db, { synthetic, available, transaction, now }) {
  const mode = Number(synthetic);
  const covers = (ancestor, area) => Boolean(db.prepare(`WITH RECURSIVE parents(id,parent_id,depth) AS (
    SELECT id,parent_id,0 FROM areas WHERE id=? UNION ALL
    SELECT a.id,a.parent_id,p.depth+1 FROM areas a JOIN parents p ON a.id=p.parent_id WHERE p.depth<3
  ) SELECT 1 FROM parents WHERE id=?`).get(area, ancestor));
  const observation = observationId => db.prepare(`SELECT o.*,s.kind AS source_kind,s.official,s.enabled,s.access_policy,
    s.synthetic AS source_synthetic,a.sha256,a.source_url AS artifact_url,a.extraction_status,a.synthetic AS artifact_synthetic
    FROM observations o JOIN sources s ON s.id=o.source_id LEFT JOIN artifacts a ON a.id=o.artifact_id WHERE o.id=?`).get(observationId);
  const load = eventId => db.prepare(`SELECT c.*,o.*,s.kind AS source_kind,s.official,s.enabled,s.access_policy,
    s.synthetic AS source_synthetic,a.sha256,a.source_url AS artifact_url,a.extraction_status,a.synthetic AS artifact_synthetic
    FROM correlation_claims c JOIN observations o ON o.id=c.observation_id
    JOIN sources s ON s.id=o.source_id LEFT JOIN artifacts a ON a.id=o.artifact_id
    WHERE c.event_id=? ORDER BY c.recorded_at,c.observation_id LIMIT ?`).all(eventId, MAX_CLAIMS + 1).map(c => {
      const exact = eventTime(c);
      return { ...c, article_url: c.artifact_url ? canonicalUrl(c.artifact_url) : null,
        publishable: feedSourceAllowed(db,c.source_id,now) && c.moderation_state === "approved" && c.enabled === 1 && c.access_policy === "public"
          && c.synthetic === mode && c.source_synthetic === mode && (c.artifact_id === null || c.artifact_synthetic === mode),
        competent: c.source_kind === "authority" && c.official === 1 && c.artifact_id !== null
          && c.extraction_status === "parsed" && exact !== null && c.competence_area !== null
          && covers(c.competence_area, c.area_id) && exact >= c.competence_from && exact < c.competence_to,
      };
    });
  const getCase = eventId => db.prepare(`SELECT e.*,c.anchor_at,c.kind AS correlation_kind,c.review_hold FROM events e JOIN correlation_cases c ON c.event_id=e.id WHERE e.id=? AND e.synthetic=?`).get(eventId, mode);
  const revisions = (eventId, limit = 50, offset = 0) => {
    available();
    if (!id(eventId) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error("Paginación de revisiones inválida");
    return db.prepare(`SELECT * FROM correlation_revisions WHERE event_id=? ORDER BY revision LIMIT ? OFFSET ?`).all(eventId, limit, offset)
      .map(({ snapshot_json, ...row }) => ({ ...row, snapshot: JSON.parse(snapshot_json) }));
  };
  function recalculate(eventId, reason) {
    const event = getCase(eventId);
    if (!event) throw new Error("Evento del motor no encontrado");
    const claims = load(eventId);
    if (claims.length > MAX_CLAIMS) throw new Error("Evento excede límite de evidencias; revisión manual requerida");
    const { facts, ...state } = deriveEvent(event, claims);
    if (event.review_hold) {
      Object.assign(state, { status:"unknown", start_at:null, end_at:null, start_basis:"unknown", end_basis:"unknown",
        confidence_explanation:`Regla ${RULE_VERSION}; publicación de la afirmación suspendida por revisión local. La evidencia e historia se conservan; no confirma corte ni reposición.` });
      facts.review_hold = true;
    }
    const stamp = utcDate(now().toISOString());
    if (stamp < event.updated_at) throw new Error("Reloj anterior a la última revisión");
    const { anchor_at, correlation_kind, review_hold, ...previous } = event;
    const next = { ...previous, ...state, updated_at: stamp };
    const revision = db.prepare("SELECT COALESCE(MAX(revision),0)+1 AS n FROM correlation_revisions WHERE event_id=?").get(eventId).n;
    db.prepare(`UPDATE events SET status=?,start_at=?,end_at=?,start_basis=?,end_basis=?,last_evidence_at=?,confidence_explanation=?,updated_at=? WHERE id=?`)
      .run(state.status,state.start_at,state.end_at,state.start_basis,state.end_basis,state.last_evidence_at,state.confidence_explanation,stamp,eventId);
    db.prepare("INSERT INTO correlation_revisions VALUES (?,?,?,?,?,?)")
      .run(eventId,revision,RULE_VERSION,stamp,reason,JSON.stringify({ event: next, facts }));
    return { event: next, revision, facts };
  }
  return Object.freeze({
    revisions,
    project(eventId){
      available();if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='correlation_cases'").get())return null;
      const event=getCase(eventId);if(!event)return null;
      const claims=load(eventId),{facts,...state}=deriveEvent(event,claims);
      state.last_evidence_at=claims.filter(c=>c.publishable).map(c=>c.ingested_at).sort().at(-1)||null;
      if(event.review_hold)Object.assign(state,{status:"unknown",start_at:null,end_at:null,start_basis:"unknown",end_basis:"unknown",confidence_explanation:"Publicación suspendida por revisión; evidencia e historia conservadas."});
      return state;
    },
    decisions(eventId, limit = 50, offset = 0) {
      available();
      if (!id(eventId) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error("Paginación de decisiones inválida");
      return db.prepare("SELECT observation_id,event_id,recorded_at,input_json FROM correlation_claims WHERE event_id=? ORDER BY recorded_at,observation_id LIMIT ? OFFSET ?")
        .all(eventId,limit,offset).map(({input_json,...row}) => ({...row,decision:JSON.parse(input_json)}));
    },
    submit(input) {
      available();
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !fields.includes(k))) throw new Error("Campos de correlación inválidos");
      const normalized = {
        observation_id: input.observation_id, type: input.type, signal: input.signal,
        event_id: input.event_id ?? null, origin_key: input.origin_key ?? null, origin_reviewed: input.origin_reviewed === undefined ? false : input.origin_reviewed,
        canonical_url: input.canonical_url === undefined || input.canonical_url === null ? null : canonicalUrl(input.canonical_url),
        replaces: input.replaces ?? null, competence: null, review_reason: input.review_reason,
      };
      if (!id(normalized.observation_id) || !["scheduled","unplanned","unknown"].includes(normalized.type)
        || !["outage","restored","refute","retraction"].includes(normalized.signal)
        || (normalized.event_id !== null && !id(normalized.event_id)) || (normalized.replaces !== null && !id(normalized.replaces))
        || typeof normalized.origin_reviewed !== "boolean"
        || (normalized.origin_key !== null && (typeof normalized.origin_key !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(normalized.origin_key)))
        || (normalized.origin_reviewed && !normalized.origin_key)
        || typeof normalized.review_reason !== "string" || !normalized.review_reason.trim() || normalized.review_reason.length > 300
        || (normalized.signal === "retraction" && !normalized.replaces)) throw new Error("Entrada de correlación inválida");
      if (input.competence !== undefined && input.competence !== null) {
        const c = input.competence;
        if (typeof c !== "object" || Object.keys(c).some(k => !["area_id","from","to"].includes(k)) || !id(c.area_id)) throw new Error("Competencia inválida");
        normalized.competence = { area_id:c.area_id, from:utcDate(c.from), to:utcDate(c.to) };
        if (normalized.competence.from >= normalized.competence.to) throw new Error("Vigencia inválida");
      }
      const inputJson = JSON.stringify(normalized);
      return transaction(repos => {
        const prior = db.prepare("SELECT event_id,input_json FROM correlation_claims WHERE observation_id=?").get(normalized.observation_id);
        if (prior) {
          if (prior.input_json !== inputJson) throw new Error("Observación ya correlacionada con contenido distinto; agregar corrección");
          const latest = db.prepare("SELECT revision,snapshot_json FROM correlation_revisions WHERE event_id=? ORDER BY revision DESC LIMIT 1").get(prior.event_id);
          return { ...JSON.parse(latest.snapshot_json), revision:latest.revision };
        }
        const o = observation(normalized.observation_id);
        if (!o || o.synthetic !== mode || o.source_synthetic !== mode || (o.artifact_id !== null && o.artifact_synthetic !== mode)
          || o.moderation_state !== "approved" || !o.enabled || o.access_policy !== "public") throw new Error("Observación no aprobada/publicable");
        // Raw receipt-backed reports stay private under PR-04 aggregation/retention.
        if (o.source_kind === "citizen" || db.prepare("SELECT 1 FROM citizen_reports WHERE observation_id=?").get(o.id)) throw new Error("Reportes privados requieren agregación; no correlacionar recibos individuales");
        if (o.artifact_url) canonicalUrl(o.artifact_url); // Fail closed before committing an unusable provenance URL.
        let target = null;
        if (normalized.replaces) {
          target = db.prepare("SELECT * FROM correlation_claims WHERE observation_id=?").get(normalized.replaces);
          if (!target || target.signal === "retraction" || db.prepare("SELECT 1 FROM correlation_claims WHERE replaces=?").get(normalized.replaces)) throw new Error("Corrección sin predecesor activo");
          if (normalized.event_id && normalized.event_id !== target.event_id) throw new Error("Predecesor pertenece a otro evento");
          normalized.event_id = target.event_id;
        }
        const time = eventTime(o);
        let event = normalized.event_id ? getCase(normalized.event_id) : null;
        let match = "nueva zona/tipo/ventana; sin fusión ambigua";
        if (normalized.event_id && !event) throw new Error("Evento del motor no encontrado");
        if (!event && time && normalized.signal === "outage") {
          const candidates = db.prepare(`SELECT e.*,c.anchor_at,c.kind AS correlation_kind,c.review_hold FROM events e JOIN correlation_cases c ON c.event_id=e.id
            WHERE e.area_id=? AND e.type=? AND c.kind=? AND e.synthetic=? AND c.review_hold=0 AND e.status!='ended' AND c.anchor_at>=? AND c.anchor_at<=?
            ORDER BY c.anchor_at,e.id LIMIT 2`).all(o.area_id,normalized.type,o.kind,mode,new Date(Date.parse(time)-WINDOW_MS).toISOString(),new Date(Date.parse(time)+WINDOW_MS).toISOString());
          if (candidates.length === 1) { event = candidates[0]; match = "misma zona y tipo; ±60 minutos del ancla fija"; }
          if (candidates.length > 1) match = "múltiples candidatos; evento separado para revisión";
        }
        if (event) {
          if (event.type !== normalized.type || (normalized.signal !== "retraction" && event.correlation_kind !== o.kind)) throw new Error("Tipos o señales semánticas incompatibles");
          const partial = normalized.signal === "restored" && covers(event.area_id,o.area_id);
          if (event.area_id !== o.area_id && !partial && normalized.signal !== "retraction") throw new Error("Zonas incompatibles; corregir zona requiere nuevo evento");
          if (!target && normalized.signal === "outage" && (!time || !event.anchor_at || Math.abs(Date.parse(time)-Date.parse(event.anchor_at)) > WINDOW_MS)) throw new Error("Tiempo incompatible o impreciso; mantener separado");
          match = normalized.event_id ? "asociación local revisada; zona/tipo validados" : match;
        } else {
          if (normalized.signal !== "outage") throw new Error("Reposición/refutación requiere evento explícito");
          const stamp = utcDate(now().toISOString());
          event = repos.events.insert({ id:`evt_${digest(o.id).slice(0,32)}`,area_id:o.area_id,type:normalized.type,status:"unknown",
            start_at:null,end_at:null,start_basis:"unknown",end_basis:"unknown",last_evidence_at:null,
            confidence_explanation:"Pendiente de correlación",created_at:stamp,updated_at:stamp,synthetic });
          db.prepare("INSERT INTO correlation_cases(event_id,anchor_at,kind,rule_version) VALUES (?,?,?,?)").run(event.id,time,o.kind,RULE_VERSION);
        }
        const c = normalized.competence;
        if (c && !db.prepare("SELECT 1 FROM areas WHERE id=? AND synthetic=?").get(c.area_id,mode)) throw new Error("Ámbito de competencia no encontrado");
        if (db.prepare("SELECT COUNT(*) AS n FROM correlation_claims WHERE event_id=?").get(event.id).n >= MAX_CLAIMS) throw new Error("Límite de 500 evidencias por evento");
        db.prepare(`INSERT INTO correlation_claims VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(o.id,event.id,normalized.signal,
          normalized.origin_key,Number(normalized.origin_reviewed),normalized.canonical_url,normalized.replaces,
          c?.area_id ?? null,c?.from ?? null,c?.to ?? null,normalized.review_reason,inputJson,utcDate(now().toISOString()));
        repos.evidence.insert({ id:`evd_${digest(o.id).slice(0,32)}`,event_id:event.id,observation_id:o.id,
          relation:normalized.signal === "retraction" ? "retraction" : normalized.signal === "refute" ? "refute" : "support",
          match_reason:`${RULE_VERSION}: ${match}; señal ${normalized.signal}`,human_reviewed:true,synthetic });
        return recalculate(event.id,normalized.replaces ? "correction/retraction" : match);
      });
    },
    recalculate(eventId) {
      available();
      if (!id(eventId)) throw new Error("Evento inválido");
      return transaction(() => recalculate(eventId,"operator recalculation"));
    },
    hold(eventId, reason = "operator safety hold") {
      available();
      if (!id(eventId) || typeof reason !== "string" || !reason.trim() || reason.length > 300) throw new Error("Suspensión inválida");
      return transaction(() => {
        if (!getCase(eventId)) throw new Error("Evento del motor no encontrado");
        db.prepare("UPDATE correlation_cases SET review_hold=1 WHERE event_id=?").run(eventId);
        return recalculate(eventId,reason);
      });
    },
  });
}
