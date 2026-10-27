// Amaru API exploratory probe: one authorized read-only GET, no retries.
// Requires AMARU_API_KEY in local process environment. Never log the key or the full URL.
// No WAHA interactions, messages, or alerts. Use only the owner's granted API key.
import {pathToFileURL} from "node:url";

export const AMARU_ENDPOINT = "https://amaruapp.com/api/v1/status.php";
export const GUAYAQUIL_SAMPLE = Object.freeze({lat:-2.17,lon:-79.92});

export function buildRequestUrl(key, location=GUAYAQUIL_SAMPLE) {
  if(typeof key!=="string" || !/^amaru_[A-Za-z0-9_-]{8,}$/.test(key)) throw new Error("missing_or_invalid_api_key_format");
  for(const dim of ["lat","lon"])if(!Number.isFinite(location[dim]))throw new Error("invalid_coordinates");
  if(Math.abs(location.lat)>90||Math.abs(location.lon)>180)throw new Error("invalid_coordinates");
  const url=new URL(AMARU_ENDPOINT);
  url.searchParams.set("lat",String(location.lat));
  url.searchParams.set("lon",String(location.lon));
  // Amaru documents authentication via query string. HTTPS hides the query in transit
  // but the provider itself may log it, so never expose the full URL in app logs.
  url.searchParams.set("key",key);
  return url;
}

const safeFieldNames=o=>o&&typeof o==="object"&&!Array.isArray(o)
  ?Object.keys(o).filter(s=>/^[a-zA-Z_][a-zA-Z_0-9]{0,79}$/.test(s)&&
    !/(key|token|secret|password|authorization|credential)/i.test(s)).slice(0,60):[];
const safeNumber=v=>typeof v==="number"&&Number.isFinite(v)?v:null;
const safeText=v=>typeof v==="string"&&v.length<=70&&/^[\p{L}0-9 \t._\-]+$/u.test(v)?v:null;
const asRecord=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};

export function summarizeResponse(payload,{httpStatus=200}={}) {
  const p=asRecord(payload);
  const risk=asRecord(p.riesgo);
  const climate=asRecord(p.clima);
  const area=asRecord(p.ubicacion);
  const gated=p.solo_en_planes_de_pago;
  return {
    source:"Amaru",reportKind:"SINGLE_READ_ONLY_SAMPLE",
    httpStatus,
    schemaObserved:{
      topLevelFields:safeFieldNames(p),
      riskFields:safeFieldNames(risk),
      climateFields:safeFieldNames(climate),
      hasPaywalledFieldsIndicator:gated!==undefined,
      hasRiverObject:p.riesgo_fluvial!==undefined||p.rios!==undefined,
      hasCommunityReportCount:p.reportes_cercanos_12h!==undefined||p.reportes!==undefined
    },
    location:{lat:safeNumber(area.lat),lon:safeNumber(area.lon),elevationM:safeNumber(area.elevacion_m)},
    climate:{temperatureC:safeNumber(climate.temp_c),rainMmPerHour:safeNumber(climate.lluvia_mm),
      intensity:safeText(climate.intensidad)},
    risk:{index:safeNumber(risk.indice),level:safeText(risk.nivel)},
    note:"Una muestra NO valida prediccion, exactitud geográfica, latencia ni permiso de redistribución. No es alerta oficial."
  };
}

export async function probeAmaru({key,fetchImpl=fetch,location=GUAYAQUIL_SAMPLE,timeoutMs=12000}={}) {
  const u=buildRequestUrl(key,location);
  const start=Date.now();
  try {
    const response=await fetchImpl(u.toString(),{
      method:"GET",redirect:"manual",headers:{accept:"application/json"},
      signal:AbortSignal.timeout(timeoutMs)
    });
    // Don't report response.url or body (some providers echo request credentials).
    if(response.status>=300&&response.status<400)throw new Error("redirect_refused");
    if(response.status===401)throw new Error("unauthorized_401");
    if(response.status===403)throw new Error("forbidden_403");
    if(response.status===429)throw new Error("quota_or_rate_limit_429");
    if(!response.ok)throw new Error("http_"+response.status);
    const declared=Number(response.headers.get("content-length"));
    if(declared>150_000)throw new Error("payload_size_limit");
    const raw=await response.text();
    if(Buffer.byteLength(raw)>150_000)throw new Error("payload_size_limit");
    let payload;
    try{payload=JSON.parse(raw)}catch{throw new Error("invalid_json")}
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new Error("invalid_json_shape");
    if("error" in payload||"erro" in payload)throw new Error("provider_reported_error");
    if(!("clima" in payload)&&!("riesgo" in payload))throw new Error("unexpected_response_shape");
    return {...summarizeResponse(payload,{httpStatus:response.status}),
      queriedAt:new Date().toISOString(),queryLocation:location,
      elapsedMs:Date.now()-start,result:"sample_obtained"};
  } catch(err){
    // Never return exceptions' raw message (it might contain an authentication URL).
    const known = new Set(["redirect_refused","unauthorized_401","forbidden_403",
      "quota_or_rate_limit_429","payload_size_limit","invalid_json",
      "invalid_json_shape","provider_reported_error","unexpected_response_shape"]);
    const message=String(err?.message||"");
    const code=known.has(message)?message:/^http_[45][0-9]{2}$/.test(message)?message
      :err?.name==="TimeoutError"?"timeout":"network_or_unknown_error";
    return {source:"Amaru",reportKind:"SINGLE_READ_ONLY_SAMPLE",result:"unverified",
      queriedAt:new Date().toISOString(),queryLocation:location,
      elapsedMs:Date.now()-start,errorCode:code,
      note:"No se obtuvo una respuesta utilizable; revisar clave, dominio registrado, endpoint, conectividad y cuota. No implica riesgo bajo."};
  }
}

export async function main(args=process.argv.slice(2)) {
  if(args.length)throw new Error("Sin argumentos: usar AMARU_API_KEY como variable de entorno.");
  if(!process.env.AMARU_API_KEY)throw new Error("Falta AMARU_API_KEY. No escribirla en el comando.");
  const r=await probeAmaru({key:process.env.AMARU_API_KEY});
  process.stdout.write(JSON.stringify(r,null,2)+"\n");
  if(r.result!=="sample_obtained")process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(err=>{console.error(
    err.message==="Falta AMARU_API_KEY. No escribirla en el comando."?
      err.message:"Error de configuración de sonda; no se imprimen secretos.");
    process.exitCode=1;
  });
}
