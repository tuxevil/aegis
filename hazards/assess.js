import {createHash} from "node:crypto";
import {SourceRegistry,safeMode} from "./registry.js";
import {pilotArea} from "./areas.js";
import {utcMillis} from "./time.js";
import {candidateVersion} from "./candidate-version.js";
import {selectKnownCaptures} from "./knowledge-cutoff.js";

const HOUR=3600000;
export const shadowPolicy=Object.freeze({version:"rain-watch-1-experimental",stationRateMmHr:8,stationDailyMm:20,forecast24hMm:20});
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same=(a,b)=>a.normalize("NFC").trim().toLocaleLowerCase("es")===b.normalize("NFC").trim().toLocaleLowerCase("es");
function sourceMatches(source,e) {
  if(source.url===e.sourceUrl)return true;
  if(source.type!=="arcgis-layer")return false;
  try {const expected=new URL(source.url),actual=new URL(e.sourceUrl);return expected.origin===actual.origin&&[expected.pathname,expected.pathname.replace(/\/query$/,"")].includes(actual.pathname)&&!actual.username&&!actual.password;}
  catch{return false;}
}
function scopeFor(e,source,area) {
  if(e.kind==="official_warning"&&e.spatial.precision==="province"&&e.spatial.areaNames.some(n=>same(n,area.province)))return {precision:"province",name:area.province,matching:"explicit_province_mention"};
  if(e.kind==="official_warning"&&e.spatial.precision==="canton"&&e.spatial.areaNames.some(n=>same(n,area.name)))return {precision:"canton",name:area.name,matching:"explicit_canton_mention"};
  if(e.kind==="observation"&&source.id==="grid.pallatanga.weather"&&area.id==="pallatanga")return {precision:"station",name:"Una estación comunitaria de Pallatanga",matching:"configured_single_station"};
  if(e.kind==="forecast_run"&&e.spatial.precision==="point"&&source.areaIds.includes(area.id))return {precision:"point",name:`Punto de modelo aproximado de ${area.name}`,matching:"configured_model_point"};
  return null;
}
function forecastSignal(e,cutoff) {
  const start=Math.ceil(cutoff/HOUR)*HOUR,slots=new Map();
  for(let i=0;i<e.details.time.length;i++) {
    const t=utcMillis(e.details.time[i]);
    if(!Number.isFinite(t)||slots.has(t))return null;
    slots.set(t,e.details.precipitationMm[i]);
  }
  let total=0;
  // Open-Meteo precipitation at T covers (T-1h,T]. Use endpoints after start.
  for(let i=1;i<=24;i++) {
    const value=slots.get(start+i*HOUR);
    if(typeof value!=="number"||!Number.isFinite(value)||value<0)return null;
    total+=value;
  }
  return {totalMm:Math.round(total*100)/100,validFrom:new Date(start).toISOString(),validTo:new Date(start+24*HOUR).toISOString()};
}

// Shadow-only proposals. No event confirmation, delivery, risk probability or
// assumption of no risk when no candidate can be supported.
export function assessHazard({records,asOf,area:areaId,recordOrigin="captured_source",registry=new SourceRegistry()}={}) {
  const area=pilotArea(areaId);if(!area)throw new Error("unknown_pilot_area");
  const selection=selectKnownCaptures(records,asOf,{recordOrigin}),cutoff=utcMillis(asOf);
  const byId=new Map(records.filter(r=>r&&typeof r.id==="string").map(r=>[r.id,r])),latest=new Map(),ambiguous=new Set(),excluded=[...selection.excluded],contexts=[];
  for(const ref of selection.known) {
    const record=byId.get(ref.captureId),e=record.envelope;
    const key=[e.sourceId,e.kind,e.kind==="official_warning"?e.details.bulletinNumber:e.kind==="forecast_run"?e.details.runInitializedAt:e.kind==="observation"?e.details.measuredAt:record.id].join(":");
    const prior=latest.get(key);
    if(prior&&prior.ref.sequence===ref.sequence&&prior.ref.knownAt===ref.knownAt)ambiguous.add(key);
    latest.set(key,{ref,e,record});
  }
  const candidates=[];
  for(const [key,{ref,e,record}] of latest) {
    const reject=reason=>excluded.push({captureId:ref.captureId,reason});
    if(ambiguous.has(key)){reject("ambiguous_revision_order");continue;}
    let source;
    try {source=registry.get(e.sourceId);}catch {reject("source_not_registered");continue;}
    if(!sourceMatches(source,e)){reject("source_url_not_registered");continue;}
    const allowedKinds={pdf:"official_warning",forecast:"forecast_run","local-observation":"observation","arcgis-query":"static_exposure","arcgis-layer":"static_exposure"};
    if(allowedKinds[source.type]!==e.kind){reject("source_kind_mismatch");continue;}
    if(e.kind==="static_exposure") {
      const matched=e.details.features.filter(f=>f.cantonCode===area.dpaCode);
      if(matched.length)contexts.push({evidenceClass:"STATIC_EXPOSURE",contextType:"static_susceptibility",recordOrigin,sourceId:e.sourceId,captureId:ref.captureId,
        featureCount:matched.length,completeness:"unverified_for_assessment",notForPrediction:true,publicationBlocked:true});
      continue;
    }
    if(cutoff-utcMillis(record.retrievedAt)>source.ttlMs){reject("capture_stale_at_cutoff");continue;}
    const scope=scopeFor(e,source,area);
    if(!scope){reject("territory_not_supported");continue;}
    const sourceRef={captureId:record.id,sourceId:e.sourceId,sha256:record.sha256,sourceUrl:e.sourceUrl,knownAt:ref.knownAt,
      issuedAt:e.time.issuedAt,retrievedAt:record.retrievedAt,processedAt:record.processedAt};
    const limitations=[...e.quality.blockers,"Human editorial review required","Geography and data rights not certified for publication",
      "No calibrated probability of damage or disaster",...(recordOrigin==="synthetic_fixture"?["SYNTHETIC TEST — never a real warning"]:[])];
    if(recordOrigin!=="synthetic_fixture"&&["unknown","invalid","stale"].includes(e.quality.dataStatus)){reject("source_quality_not_usable");continue;}
    let proposal;
    if(e.kind==="official_warning") {
      const from=utcMillis(e.time.validFrom),to=utcMillis(e.time.validTo),issued=utcMillis(e.time.issuedAt);
      if(!Number.isFinite(from)||!Number.isFinite(to)||!Number.isFinite(issued)||issued>to||from>=to||to<=cutoff||!e.details.bulletinNumber||!e.details.sourceRiskLevel||!e.details.phenomena.length){reject("official_warning_expired_or_incomplete");continue;}
      proposal={messageClass:"OFFICIAL",evidenceClass:"OFFICIAL",phenomenon:"meteorological_warning",ruleId:"official-warning-known-unexpired",
        validFrom:e.time.validFrom,validTo:e.time.validTo,sourceRiskLevel:e.details.sourceRiskLevel,
        reasons:["Primary INAMHI warning is known and unexpired; its stated validity is preserved",`Source geographic precision: ${scope.precision}`],
        facts:{authority:e.details.authority,bulletinNumber:e.details.bulletinNumber,phenomena:[...e.details.phenomena]},
        familyKey:`${e.sourceId}:${e.details.bulletinNumber}:${area.id}`};
    } else if(e.kind==="forecast_run") {
      const signal=forecastSignal(e,cutoff);
      contexts.push({messageClass:"FORECAST",evidenceClass:"FORECAST",contextType:"model_forecast",recordOrigin,scope,
        facts:{providerModel:e.details.providerModel,runInitializedAt:e.time.runInitializedAt,forecast24hMm:signal?.totalMm??null},sourceRefs:[sourceRef],publicationBlocked:true});
      if(!signal){reject("forecast_24h_coverage_unknown");continue;}
      if(signal.totalMm<shadowPolicy.forecast24hMm){reject("forecast_rule_not_triggered_not_all_clear");continue;}
      proposal={messageClass:"AEGIS_ASSESSMENT",evidenceClass:"FORECAST",phenomenon:"rainfall_watch",ruleId:"experimental-model-rain-24h",
        validFrom:signal.validFrom,validTo:signal.validTo,sourceRiskLevel:null,
        reasons:["Experimental monitoring rule: model precipitation >=20 mm over 24 complete hourly slots"],
        facts:{providerModel:e.details.providerModel,runInitializedAt:e.time.runInitializedAt,availabilityVerifiedAt:e.time.availabilityVerifiedAt,
          simulatedAvailabilityAt:recordOrigin==="synthetic_fixture"?record.fixtureForecastAvailabilityAt:null,forecast24hMm:signal.totalMm,
          precipitationTimeConvention:"preceding_hour_sum"},
        familyKey:`${e.sourceId}:${e.time.runInitializedAt}:${area.id}:${signal.validFrom}`};
      limitations.push("Point model is not a street-level flood forecast");
    } else if(e.kind==="observation") {
      const measured=utcMillis(e.details.measuredAt),age=cutoff-measured;
      if(!Number.isFinite(measured)||age<0||age>=HOUR||e.details.upstreamFailed){reject("station_measurement_not_current");continue;}
      const rate=e.details.rainRateMmHr,daily=e.details.rainDailyMm;
      contexts.push({messageClass:"OBSERVATION",evidenceClass:"OBSERVATION",contextType:"station_observation",recordOrigin,scope,
        facts:{measuredAt:e.details.measuredAt,rainRateMmHr:rate,rainDailyMm:daily},sourceRefs:[sourceRef],publicationBlocked:true});
      if(!((rate!==null&&rate>=shadowPolicy.stationRateMmHr)||(daily!==null&&daily>=shadowPolicy.stationDailyMm))){reject("station_rule_not_triggered_not_all_clear");continue;}
      proposal={messageClass:"AEGIS_ASSESSMENT",evidenceClass:"OBSERVATION",phenomenon:"rainfall_watch",ruleId:"experimental-station-rain",
        validFrom:e.details.measuredAt,validTo:new Date(measured+HOUR).toISOString(),sourceRiskLevel:null,
        reasons:["Experimental monitoring rule: >=8 mm/h or >=20 mm in the station day"],
        facts:{measuredAt:e.details.measuredAt,rainRateMmHr:rate,rainDailyMm:daily},familyKey:`${e.sourceId}:${e.details.measuredAt}:${area.id}`};
      limitations.push("Single station does not represent the canton, basin or slope stability");
    } else {reject("unsupported_dynamic_evidence");continue;}
    const policyVersion=proposal.messageClass==="OFFICIAL"?"official-warning-known-1":shadowPolicy.version;
    const familyId=hash(proposal.familyKey);
    delete proposal.familyKey;
    const candidate={...proposal,familyId,recordOrigin,areaId:area.id,dpaCode:area.dpaCode,
      scope,policyVersion,severity:"watch",status:"draft",confidenceInEvidence:"partial",limitations:[...new Set(limitations)],
      sourceRefs:[sourceRef],recommendations:[{text:"Consulte la fuente original y siga las indicaciones oficiales.",sourceUrl:e.sourceUrl}],
      sourceQuality:{dataStatus:e.quality.dataStatus,parserVersion:e.quality.parserVersion,warnings:[...e.quality.warnings]},
      evaluatedAt:asOf,publicationBlocked:true,...safeMode};
    const revisionHash=hash(candidateVersion(candidate));
    candidates.push({...candidate,id:hash({familyId,revisionHash}),revisionHash});
  }
  candidates.sort((a,b)=>a.id.localeCompare(b.id,"en"));
  return {...safeMode,recordOrigin,asOf,areaId:area.id,status:candidates.length?"partial":"unknown",candidates,contexts,excluded,
    policy:shadowPolicy,notice:"Missing or untriggered evidence never establishes low risk or all-clear",publicationBlocked:true};
}

export async function assessArchive({store,asOf,area}={}) {
  if(!store||store.namespace!=="sources")throw new Error("source_store_required");
  await store.verify();
  return assessHazard({records:await store.records(),asOf,area,recordOrigin:store.origin});
}
