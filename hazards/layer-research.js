import fs from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {SourceRegistry,safeMode} from "./registry.js";
import {SngrLayerAcquirer} from "./arcgis-acquirer.js";
import {baseEnvelope} from "./adapters.js";
import {createImmutableFile} from "./immutable-file.js";
import {pilotArea} from "./areas.js";

const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const codes=new Set(["source_cooldown","source_busy","timeout","network_or_read_error","body_too_large","empty_body",
  "invalid_json","provider_json_error","unsupported_layer_metadata","invalid_id_manifest","invalid_feature_page",
  "invalid_feature_territory_or_category","incomplete_layer","layer_changed_during_acquisition","invalid_layer_count","incomplete_id_manifest",
  "acquisition_request_budget","acquisition_byte_budget","acquisition_point_budget","acquisition_feature_budget","unsupported_source_crs",
  "polygon_required","degenerate_ring","geometry_too_large","invalid_coordinate","invalid_projected_coordinate",
  "store_capacity_exceeded","invalid_source_envelope","artifact_corrupt"]);

export class LayerResearchService {
  constructor({store,registry=new SourceRegistry(),acquirer,now=()=>new Date(),networkEnabled=false,allowPendingLicense=false}={}) {
    if(!store||store.namespace!=="layers") throw new Error("isolated_layer_store_required");
    Object.assign(this,{store,registry,now,networkEnabled,allowPendingLicense});
    this.acquirer=acquirer||new SngrLayerAcquirer({registry,now});
  }
  async collect(sourceId,area,{fixture=false}={}) {
    const source=this.registry.get(sourceId),territory=pilotArea(area);
    if(!source.internal||!territory) throw new Error("invalid_layer_request");
    if(fixture!==(this.store.origin==="synthetic_fixture")) throw new Error("live_fixture_mixing_forbidden");
    if(!fixture&&!this.networkEnabled) throw new Error("network_opt_in_required");
    if(!fixture&&source.licensing.status==="pending"&&!this.allowPendingLicense) throw new Error("research_archive_opt_in_required");
    if(!fixture&&this.acquirer.http?.networkMode==="offline_fixture") throw new Error("live_fixture_mixing_forbidden");
    if(fixture&&this.acquirer.http?.networkMode!=="offline_fixture") throw new Error("offline_fixture_transport_required");
    await this.store.initialize();
    const leaseFile=path.join(this.store.root,`acquisition-${digest(new URL(source.url).hostname)}.lock`);
    let lease;
    try {lease=await fs.open(leaseFile,"wx",0o600);}
    catch(error) {if(error.code==="EEXIST")return {...safeMode,status:"unknown",errorCode:"source_busy"};throw error;}
    try {
    if(!fixture) {
      const records=await this.store.records(),failures=await this.store.records("failures");
      const host=new URL(source.url).hostname;
      const paused=records.some(r=>r.sourceId===sourceId && this.now().getTime()<Date.parse(r.retrievedAt)+source.acquisitionCooldownMs)||failures.some(f=>{
        try {return new URL(this.registry.get(f.sourceId).url).hostname===host && Date.parse(f.retryAt)>this.now().getTime();}catch{return false;}
      });
      if(paused) return {...safeMode,status:"unknown",errorCode:"source_cooldown"};
    }
    try {
      const result=await this.acquirer.acquire({sourceId,area:territory.id,onCapture:async(capture,details)=>{
        const record=await this.store.capture({bytes:capture.bytes,sourceId,retrievedAt:capture.retrievedAt,
          transport:{httpStatus:capture.httpStatus,elapsedMs:capture.elapsedMs},normalize:raw=>{
            const e=baseEnvelope({...source,url:capture.sourceUrl},capture,raw);
            e.kind="static_exposure";e.details=details;
            e.spatial={precision:details.geometryIncluded?"polygon":"unknown",areaNames:details.captureRole==="metadata"?[]:[territory.name],
              crs:details.geometryIncluded?4326:details.sourceCrs,geometryRef:null,
              matchingMethod:details.captureRole==="metadata"?"Layer metadata does not establish canton coverage":"Source DPA attribute filter; administrative boundary remains unverified"};
            e.quality.dataStatus=fixture?"unknown":"partial";
            e.quality.blockers=["collection_requires_complete_manifest","dataset_and_boundary_review_pending","license_not_verified_for_publication",
              ...(fixture?["synthetic_fixture_never_publish"]:[])];
            e.quality.warnings=["Static susceptibility is not a forecast or observed event"];
            return e;
          }});
        return record.id;
      }});
      const snapshot=await this.commit(result);
      return {...safeMode,status:"partial",sourceId,areaId:territory.id,featureCount:result.featureCount,
        snapshotId:snapshot.id,revision:snapshot.revision,requests:result.requests,publicationBlocked:true};
    } catch(error) {
      const code=codes.has(error.message)||/^http_\d{3}$/.test(error.message)?error.message:"acquisition_failed";
      if(!fixture) {
        const earliest=this.now().getTime()+source.acquisitionCooldownMs;
        const next=Date.parse(this.acquirer.http?.nextAllowedAt?.(sourceId));
        await this.store.failure({sourceId,at:this.now().toISOString(),code,retryAt:new Date(Math.max(earliest,Number.isFinite(next)?next:0)).toISOString()});
      }
      return {...safeMode,status:"unknown",sourceId,areaId:territory.id,errorCode:code,publicationBlocked:true};
    }
    } finally {await lease.close();await fs.unlink(leaseFile);}
  }
  async snapshots() {
    await this.store.initialize();
    const directory=path.join(this.store.root,"collections");
    let names;
    try {names=await fs.readdir(directory);}catch(error){if(error.code==="ENOENT")return [];throw error;}
    names=names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n));
    if(names.length>this.store.maxCaptures) throw new Error("store_capacity_exceeded");
    const snapshots=[];
    for(const name of names) {
      const snapshot=JSON.parse(await fs.readFile(path.join(directory,name),"utf8"));
      const {checksum,...body}=snapshot;
      if(checksum!==digest(body)||body.version!==1||body.recordOrigin!==this.store.origin||!Number.isSafeInteger(body.sequence)||body.sequence<1||
        body.id+".json"!==name||!Array.isArray(body.artifactIds)||!body.artifactIds.length||body.artifactIds.length>1000||new Set(body.artifactIds).size!==body.artifactIds.length||
        !Array.isArray(body.idManifest)||body.idManifest.length>100000||body.idManifest.some(id=>!Number.isSafeInteger(id)||id<0)||new Set(body.idManifest).size!==body.idManifest.length||
        body.featureCount!==body.idManifest.length||body.publicationBlocked!==true||body.alertsPublishEnabled!==false||body.dispatchMode!=="DRY_RUN"||
        body.completeness!=="verified_id_manifest"||!Number.isFinite(Date.parse(body.completedAt)))
        throw new Error("invalid_collection_index");
      snapshots.push(snapshot);
    }
    return snapshots.sort((a,b)=>a.sequence-b.sequence);
  }
  async commit(result) {
    return this.store.locked(async()=>{
      const previous=await this.snapshots();
      if(previous.length>=this.store.maxCaptures) throw new Error("store_capacity_exceeded");
      const records=await this.store.records();
      if(!Array.isArray(result.artifactIds)||new Set(result.artifactIds).size!==result.artifactIds.length||result.artifactIds.length!==result.requests||
        result.completeness!=="verified_id_manifest") throw new Error("invalid_collection_index");
      const selected=result.artifactIds.map(id=>records.find(r=>r.id===id));
      if(selected.some(r=>!r||r.sourceId!==result.sourceId)||!selected.length) throw new Error("invalid_collection_index");
      const actual=selected.filter(r=>r.envelope.details.captureRole==="features").flatMap(r=>r.envelope.details.features.map(f=>f.objectId)).sort((a,b)=>a-b);
      if(actual.length!==result.featureCount||actual.length!==result.idManifest.length||actual.some((id,i)=>id!==result.idManifest[i])) throw new Error("incomplete_layer");
      const contentHash=digest(selected.map(r=>({sha256:r.sha256,url:r.envelope.sourceUrl})));
      const group=previous.filter(r=>r.sourceId===result.sourceId&&r.areaId===result.areaId);
      const versions=[...new Set(group.map(r=>r.contentHash))];
      const body={...result,version:1,recordOrigin:this.store.origin,id:randomUUID(),sequence:previous.length+1,contentHash,
        revision:versions.includes(contentHash)?versions.indexOf(contentHash)+1:versions.length+1};
      const snapshot={...body,checksum:digest(body)};
      const directory=path.join(this.store.root,"collections");await fs.mkdir(directory,{recursive:true,mode:0o700});
      await createImmutableFile(path.join(directory,snapshot.id+".json"),JSON.stringify(snapshot));
      return snapshot;
    });
  }
  async verify(sourceId,area,{snapshotId}={}) {
    const territory=pilotArea(area);if(!territory)throw new Error("invalid_source_area");
    const snapshot=(await this.snapshots()).filter(s=>s.sourceId===sourceId&&s.areaId===territory.id&&(snapshotId===undefined||s.id===snapshotId)).at(-1);
    if(!snapshot)throw new Error("unknown_collection");
    const records=await this.store.records(),actual=[];
    for(const id of snapshot.artifactIds) {
      const record=records.find(r=>r.id===id);
      if(!record||record.sourceId!==sourceId)throw new Error("invalid_collection_index");
      await this.store.readRaw(record.sha256);
      if(record.envelope.details.captureRole==="features") actual.push(...record.envelope.details.features.map(f=>f.objectId));
    }
    actual.sort((a,b)=>a-b);
    if(actual.length!==snapshot.featureCount||actual.length!==snapshot.idManifest.length||actual.some((id,i)=>id!==snapshot.idManifest[i]))throw new Error("incomplete_layer");
    return {...safeMode,snapshotId:snapshot.id,featureCount:actual.length,revision:snapshot.revision,publicationBlocked:true};
  }
  async verifyArchive() {
    const artifacts=await this.store.verify(),snapshots=await this.snapshots();
    const groups=new Map(snapshots.map(s=>[`${s.sourceId}:${s.areaId}`,s]));
    for(const snapshot of groups.values())await this.verify(snapshot.sourceId,snapshot.areaId);
    return {...safeMode,...artifacts,collections:snapshots.length,latestCollections:groups.size,publicationBlocked:true};
  }
}
