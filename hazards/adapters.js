import {inspectPayload} from "../scripts/probe-aegis-sources.mjs";
import {inspectWarningValidity} from "./warning-validity.js";
import {extractPdfText} from "./pdf-text.js";

const months=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const clean=value=>typeof value==="string"?value.slice(0,2000):null;
function localTime(day,month,year,hour,minute="00") {
  if(!months.includes(month.toLowerCase())) return null;
  const local=`${year}-${String(months.indexOf(month.toLowerCase())+1).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00`;
  const time=Date.parse(local+"Z");
  if(!Number.isFinite(time) || new Date(time).toISOString().slice(0,19)!==local) return null;
  return new Date(time+5*3600000).toISOString();
}

export function parseInamhiText(text) {
  if(typeof text!=="string" || text.length>100000) throw new Error("invalid_bulletin_text");
  const normalized=text.replace(/\s+/g," ");
  const number=normalized.match(/Bolet[ií]n Meteorol[oó]gico\s+(?:Nro\.?|N[.º°]+)\s*(\d+)/i);
  const issue=normalized.match(/Fecha y hora de emisi[oó]n:\s*[a-záéíóú]+,?\s*(\d{1,2}) de ([a-z]+) de (\d{4}),?\s*(\d{1,2}):(\d{2})/i);
  const validity=normalized.match(/Vigencia:\s*desde\s*(\d{1,2})H(\d{2}) del (\d{1,2}) hasta las (\d{1,2})H(\d{2}) del (\d{1,2}) de ([a-z]+) de (\d{4})/i);
  const sourceRiskLevel=normalized.match(/NIVEL AMENAZA:\s*(.*?)\s*FEN[ÓO]MENO:/i)?.[1]||null;
  return {
    bulletinNumber:number?Number(number[1]):null,
    issuedAt:issue?localTime(issue[1],issue[2],issue[3],issue[4],issue[5]):null,
    validFrom:validity?localTime(validity[3],validity[7],validity[8],validity[1],validity[2]):null,
    validTo:validity?localTime(validity[6],validity[7],validity[8],validity[4],validity[5]):null,
    originalTimeText:[issue?.[0],validity?.[0]].filter(Boolean).join("; ").slice(0,400)||null,
    sourceRiskLevel:clean(sourceRiskLevel),
    phenomena:["LLUVIAS","TORMENTAS ELÉCTRICAS","RÁFAGAS DE VIENTO"].filter(p=>normalized.toUpperCase().includes(p)),
    // Only an explicit province name; no inferred city or map intersection.
    areaNames:["Guayas","Chimborazo","Los Ríos","Esmeraldas","El Oro","Bolívar","Cotopaxi","Pichincha","Cañar","Azuay","Loja","Manabí","Santa Elena","Carchi","Imbabura","Sucumbíos","Orellana","Napo","Pastaza","Morona Santiago","Zamora Chinchipe"]
      .filter(name=>new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`,"iu").test(normalized)),
  };
}

export function baseEnvelope(source,capture,raw) {
  const synthetic=raw.recordOrigin==="synthetic_fixture";
  return {schemaVersion:"1.0",recordOrigin:raw.recordOrigin,sourceId:source.id,kind:"official_warning",sourceUrl:source.url,
    retrievedAt:synthetic?null:capture.retrievedAt,
    raw:{sha256:synthetic?null:raw.sha256,byteLength:raw.byteLength,mediaType:capture.mediaType,
      storageKey:synthetic?null:raw.storageKey,etag:capture.etag??null,lastModified:capture.lastModified??null},
    time:{issuedAt:null,validFrom:null,validTo:null,firstSeenAt:synthetic?null:raw.firstSeenAt,
      runInitializedAt:null,availabilityVerifiedAt:null,sourceTimeZone:"UTC"},
    spatial:{precision:"unknown",areaNames:[],crs:null,geometryRef:null},licensing:source.licensing,
    quality:{dataStatus:"unknown",warnings:[],blockers:[],parserVersion:"multihazard-1.0.0",completenessRatio:null},details:{}};
}

export class InamhiPdfAdapter {
  constructor({extractText=extractPdfText}={}) { this.extractText=extractText; }
  async normalize(bytes,source,capture,raw) {
    inspectPayload("pdf",bytes);
    if(capture.mediaType!=="application/pdf") throw new Error("unexpected_media_type");
    const parsed=parseInamhiText(await this.extractText(bytes));
    const e=baseEnvelope(source,capture,raw);
    Object.assign(e.time,{issuedAt:parsed.issuedAt,validFrom:parsed.validFrom,validTo:parsed.validTo,
      sourceTimeZone:"America/Guayaquil",originalTimeText:parsed.originalTimeText});
    e.spatial.areaNames=parsed.areaNames;
    e.spatial.precision=parsed.areaNames.length?"province":"unknown";
    const validity=inspectWarningValidity({...e.time,retrievedAt:capture.retrievedAt},new Date(capture.retrievedAt));
    e.quality.dataStatus=validity.dataStatus==="valid"?"partial":validity.dataStatus;
    e.quality.blockers=[...validity.blockers,"map_not_reviewed"];
    if(parsed.bulletinNumber===null || !parsed.sourceRiskLevel || !parsed.phenomena.length) {
      e.quality.dataStatus="unknown";e.quality.blockers.push("incomplete_bulletin_text");
    }
    e.details={bulletinNumber:parsed.bulletinNumber,authority:"INAMHI",sourceRiskLevel:parsed.sourceRiskLevel,
      phenomena:parsed.phenomena,areasMentioned:parsed.areaNames,mapReviewed:false};
    return e;
  }
}

export class SngrArcgisAdapter {
  async normalize(bytes,source,capture,raw) {
    inspectPayload("arcgis-query",bytes);
    const payload=JSON.parse(bytes);
    const e=baseEnvelope(source,capture,raw);e.kind="static_exposure";
    const features=payload.features.map(f=>{
      const a=f.attributes||{};
      return {objectId:Number.isInteger(a.objectid??a.FID)?a.objectid??a.FID:null,
        categoryRaw:clean(a.susc_total??a.sui),cantonCode:clean(a.dpa_canton),cantonName:clean(a.dpa_descan),hazardRaw:clean(a.tipo_amen)};
    });
    e.details={features,exceededTransferLimit:typeof payload.exceededTransferLimit==="boolean"?payload.exceededTransferLimit:null,
      sourceCrs:payload.spatialReference?.latestWkid??payload.spatialReference?.wkid??null,geometryIncluded:false};
    e.quality.dataStatus="partial";
    e.quality.blockers=["sample_only_no_geometry","licensing_pending"];
    if(!features.length) {e.quality.dataStatus="unknown";e.quality.blockers.push("empty_sample");}
    if(payload.exceededTransferLimit===true) e.quality.blockers.push("transfer_limit");
    if(features.some(f=>!f.cantonCode || !f.categoryRaw)) e.quality.blockers.push("missing_spatial_attributes");
    e.quality.warnings=["Static susceptibility is not a prediction or observed flood"];
    return e;
  }
}

export class OpenMeteoSingleRunsAdapter {
  async normalize(bytes,source,capture,raw) {
    inspectPayload("forecast",bytes);
    const p=JSON.parse(bytes);
    if(p.hourly_units?.precipitation!=="mm" || p.utc_offset_seconds!==0 || !p.hourly.time.length) throw new Error("invalid_forecast_units_or_timezone");
    const e=baseEnvelope(source,capture,raw);e.kind="forecast_run";
    const run=new URL(source.url).searchParams.get("run");
    if(!run || !Number.isFinite(Date.parse(run+"Z"))) throw new Error("missing_model_run");
    const runInitializedAt=new Date(run+"Z").toISOString();
    e.time.runInitializedAt=runInitializedAt;
    // Verified only now, never backdated to the initialization or a guessed lag.
    e.time.availabilityVerifiedAt=raw.recordOrigin==="captured_source"?capture.retrievedAt:null;
    e.spatial.precision="point";e.spatial.areaNames=[source.forecastArea==="pallatanga"?"Pallatanga · punto de modelo aproximado":"Guayaquil · punto de modelo aproximado"];
    const echoedModel=clean(p.model??(typeof p.models==="string"?p.models:null));
    if(source.modelSelectionVerified&&echoedModel&&echoedModel!==source.requestedModel)throw new Error("forecast_model_mismatch");
    const selected=source.modelSelectionVerified&&new URL(source.url).searchParams.get("models")===source.requestedModel?source.requestedModel:null;
    const model=echoedModel||selected;
    e.details={providerModel:model,modelIdentityBasis:echoedModel?"response_field":selected?"explicit_request":"unknown",runInitializedAt,time:p.hourly.time.map(t=>new Date(t+"Z").toISOString()),
      precipitationMm:p.hourly.precipitation,unit:"mm"};
    e.quality.dataStatus="partial";
    e.quality.blockers=["historical_availability_not_proven"];
    if(!model) e.quality.blockers.push("model_identity_unknown");
    if(p.hourly.precipitation.includes(null)) e.quality.blockers.push("missing_forecast_values");
    if(Date.parse(runInitializedAt)>Date.parse(capture.retrievedAt)) {e.quality.dataStatus="invalid";e.quality.blockers.push("future_model_run");}
    return e;
  }
}
