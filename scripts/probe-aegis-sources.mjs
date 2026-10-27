// Sonda exploratoria de fuentes de AEGIS. READ ONLY. No transmite alertas ni publica WhatsApp.
// Node >=22. A ejecutar expresamente con --live en un LXC/staging con salida a internet.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const poly = "https://sgrportal.gestionderiesgos.gob.ec/server/rest/services";
const oneQuery = new URL(poly + "/Hosted/MULTIAMENAZAS_SGR/FeatureServer/0/query");
for(const [k,v] of Object.entries({
  where:"1=1",outFields:"objectid,tipo_amen,susc_total,dpa_canton,dpa_descan",
  returnGeometry:"false",resultRecordCount:"1",f:"json"
})) oneQuery.searchParams.set(k,v);

const floodQuery = new URL(poly + "/Susceptibilidad_de_Inundaciones/MapServer/0/query");
for(const [k,v] of Object.entries({
  where:"1=1",outFields:"FID,sui,dpa_canton,dpa_descan",
  returnGeometry:"false",resultRecordCount:"1",f:"json"
})) floodQuery.searchParams.set(k,v);

const weather = new URL("https://single-runs-api.open-meteo.com/v1/forecast");
for(const [k,v] of Object.entries({
  latitude:"-2.19",longitude:"-79.88",run:"2026-10-25T00:00",
  hourly:"precipitation",forecast_days:"3",timezone:"UTC"
})) weather.searchParams.set(k,v);

export const probes = [
  {id:"inamhi.warning.pdf",type:"pdf",url:"https://www.inamhi.gob.ec/pronostico/advertencia.pdf",maxBytes:2_000_000},
  {id:"sngr.multihazard.metadata",type:"layer",url:poly+"/Hosted/MULTIAMENAZAS_SGR/FeatureServer/0?f=pjson",maxBytes:1_000_000},
  {id:"sngr.multihazard.single",type:"arcgis-query",url:oneQuery.href,maxBytes:200_000},
  {id:"sngr.flood.metadata",type:"layer",url:poly+"/Susceptibilidad_de_Inundaciones/MapServer/0?f=pjson",maxBytes:1_000_000},
  {id:"sngr.flood.single",type:"arcgis-query",url:floodQuery.href,maxBytes:200_000},
  {id:"openmeteo.singlerun.test",type:"forecast",url:weather.href,maxBytes:400_000}
];

export function inspectPayload(type, bytes) {
  if(type === "pdf") {
    if(bytes.subarray(0,5).toString("ascii") !== "%PDF-") throw new Error("not_pdf_magic");
    return {contentKind:"pdf",pdfMagic:true,parsedBulletin:false};
  }
  let j;
  try { j=JSON.parse(bytes.toString("utf8")); }
  catch {throw new Error("invalid_json");}
  if(j && typeof j === "object" && "error" in j) throw new Error("provider_json_error");
  if(type === "layer") {
    if(typeof j.geometryType !== "string" || !Array.isArray(j.fields)) throw new Error("invalid_layer_metadata");
    return {contentKind:"arcgis_layer",geometryType:j.geometryType,
      maxRecordCount:j.maxRecordCount??null,
      supportsPagination:j.advancedQueryCapabilities?.supportsPagination??null,
      fieldNames:j.fields.map(f=>f.name).filter(x=>typeof x==="string").slice(0,100)};
  }
  if(type === "arcgis-query") {
    if(!Array.isArray(j.features)) throw new Error("invalid_arcgis_query");
    if(j.features.length>1) throw new Error("query_exceeded_1_record");
    return {contentKind:"arcgis_query",returnedCount:j.features.length,
      attributeKeys:Object.keys(j.features[0]?.attributes||{}).slice(0,30),
      exceededTransferLimit:j.exceededTransferLimit??null};
  }
  if(type === "forecast") {
    if(!Array.isArray(j.hourly?.time)||!Array.isArray(j.hourly?.precipitation)) throw new Error("missing_forecast_arrays");
    if(j.hourly.time.length!==j.hourly.precipitation.length) throw new Error("forecast_length_mismatch");
    if(j.hourly.precipitation.some(v=>v!==null && (typeof v!=="number" || !Number.isFinite(v) || v<0)))
      throw new Error("invalid_precipitation");
    const times=j.hourly.time.map(t=>typeof t==="string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t) ? Date.parse(t+"Z") : NaN);
    if(times.some((t,i)=>!Number.isFinite(t) || (i>0 && t<=times[i-1])))
      throw new Error("invalid_forecast_times");
    return {contentKind:"forecast",points:j.hourly.time.length,
      keys:Object.keys(j.hourly),precipitationUnit:j.hourly_units?.precipitation??null,
      modelIdentityKnown: typeof j.model === "string" || typeof j.models === "string"};
  }
  throw new Error("unsupported_payload_kind");
}

async function boundedRead(response,maxBytes) {
  const declared=Number(response.headers.get("content-length"));
  if(Number.isFinite(declared)&&declared>maxBytes) throw new Error("body_too_large_declared");
  const chunks=[];let total=0;
  for await (const chunk of response.body||[]) {
    total+=chunk.length;
    if(total>maxBytes) throw new Error("body_too_large_stream");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks,total);
}

export async function probeOne(item,{httpFetch=fetch,timeoutMs=12000}={}) {
  const started=Date.now();
  const base={sourceId:item.id,attemptedAt:new Date(started).toISOString(),readOnly:true};
  try {
    // All endpoints are hardcoded; do not follow redirects to unknown hosts.
    const response=await httpFetch(item.url,{method:"GET",redirect:"manual",
      signal:AbortSignal.timeout(timeoutMs),headers:{accept:item.type==="pdf"?"application/pdf":"application/json"}});
    Object.assign(base, {
      httpStatus:response.status,
      observedContentType:response.headers.get("content-type"),
      lastModified:response.headers.get("last-modified"),
      etag:response.headers.get("etag"),
      serverDate:response.headers.get("date"),
      retryAfter:response.headers.get("retry-after"),
    });
    if(response.status>=300&&response.status<400)
      throw new Error("redirect_not_followed_"+response.status);
    if(response.status===429)throw new Error("rate_limited_429");
    if(!response.ok)throw new Error("http_"+response.status);
    const bytes=await boundedRead(response,item.maxBytes);
    Object.assign(base,{byteLength:bytes.length,
      sha256:createHash("sha256").update(bytes).digest("hex")});
    // Keep numeric provider codes, never arbitrary remote messages or details.
    if(item.type!=="pdf") {
      try {
        const payload=JSON.parse(bytes.toString("utf8"));
        if(Number.isInteger(payload?.error?.code)) base.providerErrorCode=payload.error.code;
      } catch { /* inspectPayload reports invalid JSON below */ }
    }
    const inspection=inspectPayload(item.type,bytes);
    return {...base,status:"reachable",httpStatus:response.status,
      elapsedMs:Date.now()-started,byteLength:bytes.length,
      sha256:createHash("sha256").update(bytes).digest("hex"),
      observedContentType:response.headers.get("content-type"),
      lastModified:response.headers.get("last-modified"),
      etag:response.headers.get("etag"),inspection};
  } catch(error) {
    return {...base,status:"unverified",elapsedMs:Date.now()-started,
      errorCode: error?.name==="TimeoutError" ? "timeout" :
        /^(not_pdf_magic|invalid_json|provider_json_error|invalid_layer_metadata|invalid_arcgis_query|query_exceeded_1_record|missing_forecast_arrays|forecast_length_mismatch|invalid_precipitation|invalid_forecast_times|unsupported_payload_kind|body_too_large_declared|body_too_large_stream|rate_limited_429|http_\d{3}|redirect_not_followed_\d{3})$/.test(error?.message)
          ? error.message : "network_or_read_error"};
  }
}

export async function probeAll({httpFetch=fetch,timeoutMs=12000}={}) {
  const results=[];
  const pausedHosts=new Set();
  for(const item of probes) {
    const host=new URL(item.url).hostname;
    if(pausedHosts.has(host)) {
      results.push({sourceId:item.id,readOnly:true,status:"unverified",errorCode:"provider_paused"});
      continue;
    }
    const result=await probeOne(item,{httpFetch,timeoutMs});
    results.push(result);
    if([403,429].includes(result.httpStatus)) pausedHosts.add(host);
  }
  return results;
}

export async function main(args=process.argv.slice(2)) {
  const live=args.includes("--live");
  const outputArg=args.find(a=>a.startsWith("--out="));
  if(args.some(a=>a!=="--live"&&!a.startsWith("--out=")))
    throw new Error("Args esperados: --live [--out=/ruta/resultado.json]");
  if(!live) {
    console.error("Modo seguro: no se hacen consultas. Para sondear SOLO las URLs predefinidas: node scripts/probe-aegis-sources.mjs --live");
    return;
  }
  // Ejecutar en serie: mínimo impacto; no hay callbacks de publicación ni credenciales.
  const results=await probeAll();
  const report={reportKind:"AEGIS_READ_ONLY_SOURCE_PROBE",producedAt:new Date().toISOString(),
    alertsPublishEnabled:false,dispatchMode:"DRY_RUN",
    note:"Proof of request/structure only; NOT approval for license or production alerts.",
    results};
  const payload=JSON.stringify(report,null,2)+"\n";
  if(outputArg)await writeFile(outputArg.slice("--out=".length),payload,{flag:"wx",mode:0o600});
  process.stdout.write(payload);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(e=>{console.error(String(e));process.exitCode=1;});
}
