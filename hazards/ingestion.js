import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {SourceRegistry,safeMode} from "./registry.js";
import {SourceHttp} from "./http.js";
import {InamhiPdfAdapter,SngrArcgisAdapter,OpenMeteoSingleRunsAdapter} from "./adapters.js";

const adapters={pdf:()=>new InamhiPdfAdapter(),"arcgis-query":()=>new SngrArcgisAdapter(),forecast:()=>new OpenMeteoSingleRunsAdapter()};
const errorCodes=new Set(["not_pdf_magic","unexpected_media_type","invalid_json","provider_json_error","invalid_arcgis_query",
  "query_exceeded_1_record","missing_forecast_arrays","forecast_length_mismatch","invalid_precipitation","invalid_forecast_times",
  "invalid_forecast_units_or_timezone","missing_model_run","forecast_model_mismatch","pdf_extraction_failed","pdf_extraction_timeout",
  "body_too_large","empty_body","timeout","network_or_read_error","source_cooldown","source_busy",
  "invalid_source_envelope","store_busy","store_capacity_exceeded","artifact_corrupt"]);

export class IngestionService {
  constructor({store,registry=new SourceRegistry(),http,now=()=>new Date(),networkEnabled=false,allowPendingLicense=false,adapterOverrides={}}) {
    if(!store) throw new Error("store_required");
    Object.assign(this,{store,registry,now,networkEnabled,allowPendingLicense,adapterOverrides});
    this.http=http||new SourceHttp({registry,now});
  }
  async ingest(sourceId,request) {
    const source=request===undefined?this.registry.get(sourceId):this.registry.forecastSource(sourceId,request);
    if(source.type==="forecast"&&Date.parse(new URL(source.url).searchParams.get("run")+"Z")>this.now().getTime())throw new Error("future_model_run");
    if(source.internal) throw new Error("specialized_connector_required");
    if(!this.networkEnabled) throw new Error("network_opt_in_required");
    if(this.store.origin!=="captured_source") throw new Error("live_fixture_mixing_forbidden");
    if(source.licensing.status!=="verified" && !this.allowPendingLicense) throw new Error("research_archive_opt_in_required");
    if(this.store.readOnly)throw new Error("read_only_store");
    await this.store.initialize();
    const sourceHost=new URL(source.url).hostname;
    const leaseFile=path.join(this.store.root,"ingestion-"+createHash("sha256").update(sourceHost).digest("hex")+".lock");
    let lease;
    try {lease=await fs.open(leaseFile,"wx",0o600);}
    catch(error) {if(error.code==="EEXIST")return {...safeMode,sourceId,status:"unknown",errorCode:"source_busy"};throw error;}
    try {
      const captures=await this.store.records(),failures=await this.store.records("failures");
      if(captures.length>=this.store.maxCaptures||failures.length>=this.store.maxCaptures)return {...safeMode,sourceId,status:"unknown",errorCode:"store_capacity_exceeded"};
      const paused=failures.some(f=>{
        try {return new URL(this.registry.get(f.sourceId).url).hostname===sourceHost && Date.parse(f.retryAt)>this.now().getTime();}
        catch {return false;}
      }) || captures.some(r=>r.sourceId===sourceId && r.operation!=="reprocess" && Date.parse(r.retrievedAt)+source.cooldownMs>this.now().getTime());
      if(paused) return {...safeMode,sourceId,status:"unknown",errorCode:"source_cooldown"};
      try { return await this.capture(source,await this.http.get(sourceId,request)); }
      catch(error) {
        const code=errorCodes.has(error.message)||/^http_\d{3}$/.test(error.message)?error.message:"ingestion_failed";
        await this.store.failure({sourceId,at:this.now().toISOString(),code,
          retryAt:this.http.nextAllowedAt?.(sourceId)||new Date(this.now().getTime()+source.cooldownMs).toISOString()});
        return {...safeMode,sourceId,status:"unknown",errorCode:code};
      }
    } finally {await lease.close();await fs.unlink(leaseFile);}
  }
  async importFixture(sourceId,bytes,{mediaType,retrievedAt=this.now().toISOString()}={}) {
    if(this.store.origin!=="synthetic_fixture") throw new Error("live_fixture_mixing_forbidden");
    return this.capture(this.registry.get(sourceId),{bytes,retrievedAt,mediaType});
  }
  async capture(source,capture) {
    const adapter=this.adapterOverrides[source.id]||adapters[source.type]();
    const record=await this.store.capture({bytes:capture.bytes,sourceId:source.id,retrievedAt:capture.retrievedAt,
      operation:capture.operation||"capture",captureRef:capture.captureRef||null,
      transport:capture.operation==="reprocess"?null:{httpStatus:Number.isInteger(capture.httpStatus)?capture.httpStatus:null,
        elapsedMs:Number.isFinite(capture.elapsedMs)?capture.elapsedMs:null},
      normalize:async raw=>{
        const e=await adapter.normalize(capture.bytes,source,capture,raw);
        if(raw.recordOrigin==="synthetic_fixture") {e.quality.dataStatus="unknown";e.quality.blockers.push("synthetic_fixture_never_publish");}
        if(e.licensing.status!=="verified") e.quality.blockers.push("license_not_verified_for_publication");
        return e;
      }});
    return {...safeMode,sourceId:source.id,status:record.envelope.quality.dataStatus,captureId:record.id,revision:record.revision};
  }
  async reprocess(captureId) {
    const original=(await this.store.records()).find(r=>r.id===captureId);
    if(!original) throw new Error("unknown_capture");
    const capture={bytes:await this.store.readRaw(original.sha256),retrievedAt:original.retrievedAt,
      mediaType:original.envelope.raw.mediaType,etag:original.envelope.raw.etag,lastModified:original.envelope.raw.lastModified,
      operation:"reprocess",captureRef:original.id};
    return this.capture(this.registry.archivedSource(original.sourceId,original.envelope.sourceUrl),capture);
  }
  async health() {
    const records=await this.store.records(),failures=await this.store.records("failures");
    return this.registry.list().map(source=>{
      const last=records.filter(r=>r.sourceId===source.id).sort((a,b)=>Date.parse(a.retrievedAt)-Date.parse(b.retrievedAt)||a.sequence-b.sequence).at(-1);
      const failed=failures.filter(r=>r.sourceId===source.id).at(-1);
      const age=last?this.now().getTime()-Date.parse(last.retrievedAt):null;
      let status="unknown";
      if(age!==null && age>=0) status=age>source.ttlMs?"stale":last.envelope.quality.dataStatus==="valid"?"healthy":"degraded";
      if(failed && (!last || Date.parse(failed.at)>=Date.parse(last.retrievedAt))) status=last?"degraded":"unknown";
      if(age!==null && age>source.ttlMs) status="stale";
      if(last?.envelope.time.validTo && Date.parse(last.envelope.time.validTo)<=this.now().getTime()) status="stale";
      return {sourceId:source.id,status,lastRetrievedAt:last?.retrievedAt??null,lastError:failed?.code??null,
        captureCount:records.filter(r=>r.sourceId===source.id && r.operation!=="reprocess").length,ttlMs:source.ttlMs,...safeMode};
    });
  }
}
