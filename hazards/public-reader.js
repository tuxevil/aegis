import fs from "node:fs/promises";
import path from "node:path";
import {RawArtifactStore} from "./artifact-store.js";
import {SourceRegistry,safeMode} from "./registry.js";
import {pilotAreas,pilotArea} from "./areas.js";

export class HazardPublicReader {
  constructor({dataDir,now=()=>new Date(),registry=new SourceRegistry()}={}) {
    this.store=dataDir?new RawArtifactStore(dataDir,{readOnly:true}):null;
    Object.assign(this,{now,registry});
  }
  async records() {
    if(!this.store) return [];
    const time=this.now().getTime();
    if(this.cached && time>=this.cached.at && time-this.cached.at<30000) return this.cached.records;
    if(this.loading) return this.loading;
    this.loading=this.loadRecords().then(records=>{this.cached={at:this.now().getTime(),records};return records;})
      .finally(()=>{this.loading=null;});
    return this.loading;
  }
  sourceFor(record) {
    try {
      const source=this.registry.get(record.sourceId);
      return source.type==="forecast"?this.registry.archivedSource(record.sourceId,record.envelope.sourceUrl):source;
    } catch {return null;}
  }
  async loadRecords() {
    try { await fs.access(path.join(this.store.root,"format.json")); }
    catch(error) {if(error.code==="ENOENT") return [];throw error;}
    const records=await this.store.records();
    // Verify before projecting; a corrupt artifact never becomes public evidence.
    // Only latest per source/model point is projected. Historical full verification is a
    // local operator task, not unbounded IO triggered by a public request.
    const latest=new Map();
    for(const r of records) {
      const source=this.sourceFor(r);if(!source)continue;
      const key=r.sourceId+"\n"+(source.type==="forecast"?source.areaIds.join(","):"");
      const previous=latest.get(key);
      if(!previous || Date.parse(r.retrievedAt)>Date.parse(previous.retrievedAt)||
        (r.retrievedAt===previous.retrievedAt&&r.sequence>previous.sequence)) latest.set(key,r);
    }
    for(const r of latest.values()) await this.store.readRaw(r.sha256);
    return records;
  }
  async read(collection,{area,limit=20,offset=0}={}) {
    const sources=this.registry.list().filter(s=>!area || s.areaIds.includes(pilotArea(area)?.id));
    const records=collection==="health"?await this.records():[];
    let items=[];
    if(collection==="areas") items=pilotAreas().filter(a=>!area||a.id===pilotArea(area)?.id);
    if(collection==="sources") items=sources.map(s=>({sourceId:s.id,title:s.title,owner:s.owner,sourceUrl:s.url,
      licensingStatus:s.licensing.status,coverageStatus:"limited",pollingEnabled:false}));
    if(collection==="health") items=sources.map(s=>{
      const latest=records.filter(r=>{
        if(r.sourceId!==s.id)return false;
        const source=this.sourceFor(r);return source&&(!area||source.areaIds.includes(pilotArea(area)?.id));
      }).sort((a,b)=>Date.parse(a.retrievedAt)-Date.parse(b.retrievedAt)||a.sequence-b.sequence).at(-1);
      const age=latest?this.now().getTime()-Date.parse(latest.retrievedAt):null;
      const expired=latest?.envelope.time.validTo && Date.parse(latest.envelope.time.validTo)<=this.now().getTime();
      return {sourceId:s.id,status:age===null||age<0?"unknown":age>s.ttlMs||expired?"stale":"degraded",
        lastRetrievedAt:latest?.retrievedAt??null,coverageStatus:"limited"};
    });
    // M2 is a source explorer, never a publication shortcut around M4. Until an
    // audited editorial publication exists, research observations/bulletins stay
    // private even if their provider happens to use an open license.
    return {schemaVersion:"1.0",collection,generatedAt:this.now().toISOString(),...safeMode,
      coverageStatus:"limited",notice:"Sin información publicada y revisada no se puede evaluar el riesgo local. Consulte las fuentes oficiales.",
      items:items.slice(offset,offset+limit),pagination:{limit,offset,total:items.length,hasMore:offset+limit<items.length}};
  }
}
