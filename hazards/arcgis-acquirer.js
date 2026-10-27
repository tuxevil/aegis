import {setTimeout as delay} from "node:timers/promises";
import {createHash} from "node:crypto";
import {SourceRegistry,safeMode} from "./registry.js";
import {SourceHttp} from "./http.js";
import {pilotArea} from "./areas.js";
import {normalizeArcgisGeometry,verifyLayerCompleteness} from "./geography.js";

const readJson=bytes=>{
  let parsed;
  try {parsed=JSON.parse(bytes.toString("utf8"));} catch {throw new Error("invalid_json");}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||Object.hasOwn(parsed,"error")) {
    const error=new Error("provider_json_error");
    if(Number.isSafeInteger(parsed?.error?.code))error.providerCode=parsed.error.code;
    throw error;
  }
  return parsed;
};
const crs=p=>p?.spatialReference?.latestWkid??p?.spatialReference?.wkid??null;
const idsEqual=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);

export class SngrLayerAcquirer {
  static fromFixtures(responses,{registry=new SourceRegistry(),now=()=>new Date(),...budgets}={}) {
    const queue=structuredClone(responses);let index=0;
    const http={networkMode:"offline_fixture",get:async(sourceId,spec)=>{
      const fixture=queue[index++];
      if(!fixture || (fixture.request && JSON.stringify(fixture.request)!==JSON.stringify(spec))) throw new Error("fixture_request_mismatch");
      return {bytes:Buffer.from(JSON.stringify(fixture.payload)),retrievedAt:now().toISOString(),
        sourceUrl:registry.requestUrl(sourceId,spec),httpStatus:200,elapsedMs:0,mediaType:"application/json"};
    }};
    return new SngrLayerAcquirer({registry,now,http,wait:async()=>{},...budgets});
  }
  constructor({registry=new SourceRegistry(),http,now=()=>new Date(),wait=delay,maxFeatures=5000,maxRequests=64,maxBytes=32_000_000,maxPoints=500000}={}) {
    for(const value of [maxFeatures,maxRequests,maxBytes,maxPoints]) if(!Number.isSafeInteger(value)||value<1) throw new Error("invalid_acquisition_budget");
    if(maxFeatures>100000||maxRequests>1000||maxBytes>256_000_000||maxPoints>1000000) throw new Error("invalid_acquisition_budget");
    Object.assign(this,{registry,now,wait,maxFeatures,maxRequests,maxBytes,maxPoints});
    this.http=http||new SourceHttp({registry,now});
  }
  async acquire({sourceId,area,onCapture=async()=>null,inspectOnly=false}) {
    const source=this.registry.get(sourceId),territory=pilotArea(area);
    if(!source.internal||source.type!=="arcgis-layer"||!territory) throw new Error("invalid_layer_request");
    let requests=0,bytes=0,points=0;
    const artifactIds=[],requestEvidence=[];
    const request=async parameters=>{
      if(requests>=this.maxRequests) throw new Error("acquisition_request_budget");
      if(requests) await this.wait(source.cooldownMs);
      const spec={...parameters,area:territory.id};
      let capture;
      try {capture=await this.http.get(sourceId,spec);}
      catch(error) {
        requestEvidence.push({mode:spec.mode,sourceUrl:this.registry.requestUrl(sourceId,spec),attemptedAt:this.now().toISOString(),
          errorCode:/^(http_\d{3}|[a-z_]{1,80})$/.test(error.message)?error.message:"request_failed"});
        throw error;
      }
      requests++;bytes+=capture.bytes.length;
      if(bytes>this.maxBytes) throw new Error("acquisition_byte_budget");
      // Actual URL is derived locally from the registry, never from provider data.
      capture.sourceUrl=this.registry.requestUrl(sourceId,spec);
      requestEvidence.push({mode:spec.mode,sourceUrl:capture.sourceUrl,retrievedAt:capture.retrievedAt,
        httpStatus:capture.httpStatus??null,elapsedMs:capture.elapsedMs??null,byteLength:capture.bytes.length,
        sha256:createHash("sha256").update(capture.bytes).digest("hex")});
      return {capture,payload:readJson(capture.bytes)};
    };
    const retain=async(result,details)=>{
      const id=await onCapture(result.capture,details);if(id) artifactIds.push(id);
    };
    const metadata=async()=>{
      const result=await request({mode:"metadata"}),p=result.payload;
      const fieldNames=Array.isArray(p.fields)?p.fields.map(f=>f?.name):[];
      const sourceCrs=crs(p.extent)??crs(p);
      if(p.geometryType!=="esriGeometryPolygon"||sourceCrs!==32717 || ![source.idField,source.categoryField,"dpa_canton","dpa_descan"].every(f=>fieldNames.includes(f)) ||
        !Number.isSafeInteger(p.maxRecordCount)||p.maxRecordCount<1) throw new Error("unsupported_layer_metadata");
      await retain(result,{captureRole:"metadata",features:[],sourceCrs:32717,geometryIncluded:false,exceededTransferLimit:null});
      return {supportsPagination:p.advancedQueryCapabilities?.supportsPagination===true,
        maxRecordCount:p.maxRecordCount,pageSize:Math.min(p.maxRecordCount,100),lastEditDate:Number.isFinite(p.editingInfo?.lastEditDate)?p.editingInfo.lastEditDate:null,
        fingerprint:JSON.stringify({geometryType:p.geometryType,sourceCrs,fields:fieldNames,maxRecordCount:p.maxRecordCount,pagination:p.advancedQueryCapabilities?.supportsPagination??null})};
    };
    const manifest=async()=>{
      const result=await request({mode:"ids"}),p=result.payload;
      if(p.exceededTransferLimit===true||p.objectIdFieldName!==source.idField||!Array.isArray(p.objectIds)||p.objectIds.length>this.maxFeatures||
        p.objectIds.some(id=>!Number.isSafeInteger(id)||id<0)||new Set(p.objectIds).size!==p.objectIds.length) throw new Error("invalid_id_manifest");
      await retain(result,{captureRole:"ids",features:[],sourceCrs:null,geometryIncluded:false,exceededTransferLimit:p.exceededTransferLimit??null});
      return p.objectIds.slice().sort((a,b)=>a-b);
    };
    const count=async()=>{
      const result=await request({mode:"count"}),p=result.payload;
      if(!Number.isSafeInteger(p.count)||p.count<0||p.exceededTransferLimit===true) throw new Error("invalid_layer_count");
      if(p.count>this.maxFeatures) throw new Error("acquisition_feature_budget");
      await retain(result,{captureRole:"count",features:[],sourceCrs:null,geometryIncluded:false,exceededTransferLimit:null});
      return p.count;
    };
    try {
    const before=await metadata(),expectedCount=await count(),expectedIds=await manifest(),features=[];
    if(expectedCount!==expectedIds.length)throw new Error("incomplete_id_manifest");
    if(inspectOnly) return {...safeMode,inspectionOnly:true,sourceId,areaId:territory.id,dpaCode:territory.dpaCode,
      idCount:expectedIds.length,sourceCrs:32717,maxRecordCount:before.maxRecordCount,supportsPagination:before.supportsPagination,
      requestEvidence,geometryDownloaded:false,licensing:source.licensing,publicationBlocked:true};
    for(let offset=0;offset<expectedIds.length;offset+=before.pageSize) {
      const wanted=expectedIds.slice(offset,offset+before.pageSize);
      const result=await request(before.supportsPagination?{mode:"page",offset,count:wanted.length}:{mode:"batch",ids:wanted}),p=result.payload;
      if(!Array.isArray(p.features)||crs(p)!==32717) throw new Error("invalid_feature_page");
      if(p.exceededTransferLimit===true && (!before.supportsPagination || offset+wanted.length>=expectedIds.length)) throw new Error("incomplete_layer");
      verifyLayerCompleteness({expectedIds:wanted,features:p.features,idField:source.idField});
      const normalized=p.features.map(f=>{
        const a=f.attributes;
        if(a.dpa_canton!==territory.dpaCode || typeof a.dpa_descan!=="string" || !a.dpa_descan ||
          typeof a[source.categoryField]!=="string"||!a[source.categoryField]) throw new Error("invalid_feature_territory_or_category");
        const geometry=normalizeArcgisGeometry(f.geometry,{sourceCrs:32717});
        points+=f.geometry.rings.reduce((n,r)=>n+r.length,0);
        if(points>this.maxPoints) throw new Error("acquisition_point_budget");
        return {objectId:a[source.idField],categoryRaw:a[source.categoryField].slice(0,2000),cantonCode:a.dpa_canton,
          cantonName:a.dpa_descan.slice(0,2000),hazardRaw:typeof a.tipo_amen==="string"?a.tipo_amen.slice(0,2000):null,geometry:geometry.geometry};
      });
      features.push(...p.features.map(f=>({attributes:{[source.idField]:f.attributes[source.idField]}})));
      await retain(result,{captureRole:"features",features:normalized,sourceCrs:32717,targetCrs:4326,
        transformEngine:"proj4@2.22.0",geometryIncluded:true,exceededTransferLimit:p.exceededTransferLimit??null});
    }
    if(!idsEqual(expectedIds,await manifest())||expectedCount!==await count()) throw new Error("layer_changed_during_acquisition");
    const after=await metadata();
    if(before.fingerprint!==after.fingerprint||before.lastEditDate!==after.lastEditDate) throw new Error("layer_changed_during_acquisition");
    verifyLayerCompleteness({expectedIds,features,idField:source.idField});
    return {...safeMode,sourceId,areaId:territory.id,dpaCode:territory.dpaCode,featureCount:features.length,
      idManifest:expectedIds,artifactIds,requests,byteLength:bytes,completedAt:this.now().toISOString(),
      completeness:"verified_id_manifest",snapshotAtomicity:before.lastEditDate===null?"unknown":"provider_edit_marker_unchanged",
      boundaryValidation:"pending",licensing:source.licensing,publicationBlocked:true,
      limitations:["Static susceptibility is not a forecast","Administrative boundaries and dataset rights require review",
        ...(features.length?[]:["Empty result does not establish absence of hazards"])]};
    } catch(error) {error.requestEvidence=structuredClone(requestEvidence);throw error;}
  }
}
