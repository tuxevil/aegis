import {validateEnvelope} from "./envelope.js";
import {utcMillis} from "./time.js";
import {safeMode} from "./registry.js";

// Strict "known by AEGIS" selection, not an assessment or a publication gate.
// Publication/issue dates alone never backdate an actual capture or interpretation.
export function selectKnownCaptures(records,asOf,{recordOrigin="captured_source"}={}) {
  const cutoff=utcMillis(asOf);
  if(!Number.isFinite(cutoff))throw new TypeError("invalid_as_of_utc");
  if(!Array.isArray(records)||records.length>10000||!["captured_source","synthetic_fixture"].includes(recordOrigin))throw new TypeError("invalid_replay_input");
  const byId=new Map();
  for(const record of records)if(typeof record?.id==="string") {
    if(byId.has(record.id))throw new TypeError("duplicate_capture_id");byId.set(record.id,record);
  }
  const known=[],excluded=[];
  for(let index=0;index<records.length;index++) {
    const record=records[index];
    const reject=reason=>excluded.push({captureId:typeof record?.id==="string"?record.id:null,index,reason});
    let e=record?.envelope;
    try {validateEnvelope(e);}catch {reject("invalid_envelope");continue;}
    if(e.recordOrigin!==recordOrigin){reject("origin_mismatch");continue;}
    if(Object.values({issued:e.time.issuedAt,from:e.time.validFrom,to:e.time.validTo,first:e.time.firstSeenAt,run:e.time.runInitializedAt,availability:e.time.availabilityVerifiedAt})
      .some(value=>value!==null&&!Number.isFinite(utcMillis(value)))){reject("invalid_source_timestamp");continue;}
    if(typeof record.id!=="string"||!record.id||record.id.length>128||record.sourceId!==e.sourceId||!["capture","reprocess"].includes(record.operation)||!Number.isSafeInteger(record.sequence)||record.sequence<1||!/^[a-f0-9]{64}$/.test(record.sha256)) {
      reject("invalid_capture_identity");continue;
    }
    const retrieved=utcMillis(record.retrievedAt),processed=utcMillis(record.processedAt);
    if(!Number.isFinite(retrieved)||!Number.isFinite(processed)){reject("missing_capture_or_processing_time");continue;}
    if(processed<retrieved){reject("incoherent_processing_clock");continue;}
    if(recordOrigin==="captured_source" && (e.raw.sha256!==record.sha256||e.retrievedAt!==record.retrievedAt||utcMillis(e.time.firstSeenAt)>retrieved)) {
      reject("capture_provenance_mismatch");continue;
    }
    if(record.operation==="reprocess") {
      const original=byId.get(record.captureRef);
      const parentProcessed=original?.processedAt==null?null:utcMillis(original.processedAt);
      if(!original||original.id===record.id||original.sha256!==record.sha256||original.sourceId!==record.sourceId||original.retrievedAt!==record.retrievedAt||
        original.envelope?.recordOrigin!==recordOrigin||!Number.isSafeInteger(original.sequence)||original.sequence>=record.sequence||
        (parentProcessed!==null&&(!Number.isFinite(parentProcessed)||parentProcessed>processed||parentProcessed<retrieved))) {
        reject("invalid_reprocessing_reference");continue;
      }
    }
    const knownAt=Math.max(retrieved,processed);
    if(knownAt>cutoff){reject("not_known_at_cutoff");continue;}
    if(e.kind==="forecast_run") {
      const run=utcMillis(e.time.runInitializedAt),availability=utcMillis(recordOrigin==="synthetic_fixture"?record.fixtureForecastAvailabilityAt:e.time.availabilityVerifiedAt);
      if(!Number.isFinite(run)||!Number.isFinite(availability)){reject("forecast_availability_unverified");continue;}
      if(run>availability||availability>retrieved){reject("incoherent_forecast_clock");continue;}
      if(run>cutoff||availability>cutoff){reject("forecast_unavailable_at_cutoff");continue;}
      if(!e.details.providerModel){reject("model_identity_unknown");continue;}
    }
    if(e.time.issuedAt!==null&&utcMillis(e.time.issuedAt)>retrieved+300000){reject("incoherent_issue_clock");continue;}
    const from=e.time.validFrom===null?null:utcMillis(e.time.validFrom),to=e.time.validTo===null?null:utcMillis(e.time.validTo);
    if(from!==null&&to!==null&&to<=from){reject("invalid_validity_window");continue;}
    known.push({captureId:record.id,sourceId:record.sourceId,sha256:record.sha256,sequence:record.sequence,kind:e.kind,recordOrigin,
      knownAt:new Date(knownAt).toISOString(),retrievedAt:record.retrievedAt,processedAt:record.processedAt,
      issuedAt:e.time.issuedAt,validFrom:e.time.validFrom,validTo:e.time.validTo,
      activeAtCutoff:from!==null&&to!==null?from<=cutoff&&cutoff<to:null,
      dataStatus:e.quality.dataStatus,contextOnly:e.kind==="static_exposure",publicationBlocked:true});
  }
  known.sort((a,b)=>utcMillis(a.knownAt)-utcMillis(b.knownAt)||a.sequence-b.sequence||a.captureId.localeCompare(b.captureId,"en"));
  return {...safeMode,recordOrigin,asOf,known,excluded,publicationBlocked:true};
}
