import fs from "node:fs/promises";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {validateEnvelope} from "./envelope.js";
import {createImmutableFile as atomicCreate} from "./immutable-file.js";

const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const origins=new Set(["captured_source","synthetic_fixture"]);
const sourcePattern=/^[a-z0-9][a-z0-9._-]{1,99}$/;
export class RawArtifactStore {
  constructor(dataDir,{origin="captured_source",namespace="sources",readOnly=false,maxCaptures=10000,maxBytes=256*1024*1024}={}) {
    if(typeof readOnly!=="boolean" || !origins.has(origin) || !["sources","layers"].includes(namespace) || !dataDir || !Number.isSafeInteger(maxCaptures) || maxCaptures<1 || !Number.isSafeInteger(maxBytes) || maxBytes<1)
      throw new Error("invalid_store_configuration");
    Object.assign(this,{origin,namespace,readOnly,maxCaptures,maxBytes});
    this.root=namespace==="sources"?path.join(path.resolve(dataDir),"hazards","v1",origin):path.join(path.resolve(dataDir),"hazards","layers","v1",origin);
  }
  async initialize() {
    for(const directory of [this.root,path.join(this.root,"raw"),path.join(this.root,"captures"),path.join(this.root,"failures")]) {
      if(this.readOnly) {if(!(await fs.stat(directory)).isDirectory())throw new Error("invalid_store_layout");}
      else await fs.mkdir(directory,{recursive:true,mode:0o700});
    }
    const format=path.join(this.root,"format.json");
    try { await fs.access(format); }
    catch(error) {
      if(error.code!=="ENOENT"||this.readOnly) throw error;
      try {await atomicCreate(format,JSON.stringify({version:1,origin:this.origin,namespace:this.namespace}));}
      catch(writeError) {if(writeError.code!=="EEXIST") throw writeError;}
    }
    const existing=JSON.parse(await fs.readFile(format,"utf8"));
    if(existing.version!==1 || existing.origin!==this.origin || (existing.namespace===undefined?"sources":existing.namespace)!==this.namespace) throw new Error("unsupported_store_format");
  }
  async locked(action) {
    if(this.readOnly)throw new Error("read_only_store");
    await this.initialize();
    let handle;
    try { handle=await fs.open(path.join(this.root,"writer.lock"),"wx",0o600); }
    catch(error) { if(error.code==="EEXIST") throw new Error("store_busy"); throw error; }
    try { return await action(); }
    finally { await handle.close(); await fs.unlink(path.join(this.root,"writer.lock")); }
  }
  async records(directory="captures") {
    await this.initialize();
    if(!["captures","failures"].includes(directory)) throw new Error("invalid_index");
    const names=(await fs.readdir(path.join(this.root,directory))).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n));
    if(names.length>this.maxCaptures) throw new Error("store_capacity_exceeded");
    const records=[];
    for(const name of names) {
      const record=JSON.parse(await fs.readFile(path.join(this.root,directory,name),"utf8"));
      if(directory==="captures") {
        validateEnvelope(record.envelope);
        if(record.version!==1 || record.envelope.sourceId!==record.sourceId || record.envelope.recordOrigin!==this.origin ||
          !Number.isSafeInteger(record.sequence) || record.sequence<1 || !/^[a-f0-9]{64}$/.test(record.sha256) ||
          (this.origin==="captured_source" && (record.sha256!==record.envelope.raw.sha256 || record.envelope.raw.storageKey!==`raw/${record.sha256}`)))
          throw new Error("invalid_capture_index");
      }
      records.push(record);
    }
    return records.sort((a,b)=>a.sequence-b.sequence);
  }
  async capture({bytes,sourceId,retrievedAt,normalize,operation="capture",captureRef=null,transport=null}) {
    if(!Buffer.isBuffer(bytes) || bytes.length<1 || !sourcePattern.test(sourceId) || !Number.isFinite(Date.parse(retrievedAt)))
      throw new Error("invalid_capture");
    return this.locked(async()=>{
      const previous=await this.records();
      if(previous.length>=this.maxCaptures) throw new Error("store_capacity_exceeded");
      const digest=hash(bytes);
      const rawFiles=(await fs.readdir(path.join(this.root,"raw"))).filter(n=>/^[a-f0-9]{64}$/.test(n));
      let total=0;
      for(const name of rawFiles) total+=(await fs.stat(path.join(this.root,"raw",name))).size;
      if(total+(rawFiles.includes(digest)?0:bytes.length)>this.maxBytes) throw new Error("store_capacity_exceeded");
      const sameSource=previous.filter(r=>r.sourceId===sourceId);
      const sameHash=sameSource.find(r=>r.sha256===digest);
      const versions=[...new Set(sameSource.map(r=>r.sha256))];
      const metadata={sha256:digest,byteLength:bytes.length,storageKey:`raw/${digest}`,
        firstSeenAt:sameHash?.retrievedAt||retrievedAt,recordOrigin:this.origin};
      const envelope=validateEnvelope(await normalize(metadata));
      if(envelope.sourceId!==sourceId || envelope.recordOrigin!==this.origin ||
        (this.origin==="captured_source" && (envelope.raw.sha256!==digest || envelope.raw.storageKey!==metadata.storageKey || envelope.raw.byteLength!==bytes.length || envelope.retrievedAt!==retrievedAt)))
        throw new Error("capture_envelope_mismatch");
      const rawFile=path.join(this.root,"raw",digest);
      try { await atomicCreate(rawFile,bytes); }
      catch(error) { if(error.code!=="EEXIST") throw error; }
      if(hash(await fs.readFile(rawFile))!==digest) throw new Error("artifact_corrupt");
      if(!["capture","reprocess"].includes(operation) || (operation==="reprocess" && !previous.some(r=>r.id===captureRef && r.sha256===digest && r.retrievedAt===retrievedAt)))
        throw new Error("invalid_capture_reference");
      const record={version:1,id:randomUUID(),sequence:previous.length+1,sourceId,retrievedAt,operation,captureRef,processedAt:new Date().toISOString(),
        transport,sha256:digest,revision:versions.includes(digest)?versions.indexOf(digest)+1:versions.length+1,envelope};
      await atomicCreate(path.join(this.root,"captures",record.id+".json"),JSON.stringify(record));
      return structuredClone(record);
    });
  }
  async failure({sourceId,at,code,retryAt=null}) {
    if(!sourcePattern.test(sourceId) || !Number.isFinite(Date.parse(at)) || !/^[a-z0-9_]{1,80}$/.test(code) || (retryAt!==null && !Number.isFinite(Date.parse(retryAt)))) throw new Error("invalid_failure");
    return this.locked(async()=>{
      const previous=await this.records("failures");
      if(previous.length>=this.maxCaptures) throw new Error("store_capacity_exceeded");
      await atomicCreate(path.join(this.root,"failures",randomUUID()+".json"),JSON.stringify({sequence:previous.length+1,sourceId,at,code,retryAt}));
    });
  }
  async readRaw(digest) {
    if(!/^[a-f0-9]{64}$/.test(digest)) throw new Error("invalid_digest");
    const bytes=await fs.readFile(path.join(this.root,"raw",digest));
    if(hash(bytes)!==digest) throw new Error("artifact_corrupt");
    return bytes;
  }
  async verify() {
    const records=await this.records();
    for(const record of records) {
      if(record.version!==1) throw new Error("unsupported_store_format");
      validateEnvelope(record.envelope);
      await this.readRaw(record.sha256);
    }
    return {captures:records.length,artifacts:new Set(records.map(r=>r.sha256)).size};
  }
}
