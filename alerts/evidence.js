import {isDeepStrictEqual} from "node:util";
import {assessHazard} from "../hazards/assess.js";
import {candidateVersion} from "../hazards/candidate-version.js";
import {selectKnownCaptures} from "../hazards/knowledge-cutoff.js";
import {SourceRegistry} from "../hazards/registry.js";
import {utcMillis} from "../hazards/time.js";
// Both the original evaluation and the current confirmation come from the
// verified private archive. No provider calls or caller-supplied success flags.
export function archiveEvidenceVerifier(store) {
  const registry=new SourceRegistry();
  return async(candidate,at)=>{
    if(!store||store.namespace!=="sources")throw new Error("source_store_required");
    const evaluated=utcMillis(candidate.evaluatedAt),cutoff=utcMillis(at);
    if(candidate.recordOrigin!==store.origin||!Number.isFinite(evaluated)||!Number.isFinite(cutoff)||evaluated>cutoff||!Array.isArray(candidate.sourceRefs)||!candidate.sourceRefs.length)return {current:false};
    await store.verify();const records=await store.records();
    const input={records,area:candidate.areaId,recordOrigin:store.origin};
    const original=assessHazard({...input,asOf:candidate.evaluatedAt});
    if(!original.candidates.some(c=>isDeepStrictEqual(c,candidate)))return {current:false};
    const assessment=assessHazard({...input,asOf:at});
    const current=assessment.candidates.find(c=>isDeepStrictEqual(candidateVersion(c),candidateVersion(candidate)));
    if(!current)return {current:false};
    const known=selectKnownCaptures(records,at,{recordOrigin:store.origin}).known,byId=new Map(records.map(r=>[r.id,r])),latestByUrl=new Map();
    for(const ref of known) {
      const key=ref.sourceId+"\n"+byId.get(ref.captureId).envelope.sourceUrl,prior=latestByUrl.get(key);
      const time=utcMillis(ref.retrievedAt),priorTime=prior?utcMillis(prior.retrievedAt):NaN;
      if(!prior||time>priorTime||(time===priorTime&&ref.sequence>prior.sequence))latestByUrl.set(key,ref);
    }
    const failures=await store.records("failures");
    for(const ref of current.sourceRefs) {
      // A mutable official PDF URL may now serve a different bulletin. That
      // blocks retransmission under the old citation, never retracts the old event.
      const latest=latestByUrl.get(ref.sourceId+"\n"+ref.sourceUrl),latestRecord=latest?byId.get(latest.captureId):null;
      if(current.messageClass==="OFFICIAL"&&(!latest||latest.captureId!==ref.captureId))return {current:false};
      if(latestRecord?.envelope.details.upstreamFailed===true||
        (store.origin!=="synthetic_fixture"&&["unknown","invalid","stale"].includes(latestRecord?.envelope.quality.dataStatus)))return {current:false};
      for(const failure of failures) {
        const failedAt=utcMillis(failure.at);
        if(failure.sourceId===ref.sourceId&&(!Number.isFinite(failedAt)||(failedAt<=cutoff&&failedAt>=utcMillis(ref.retrievedAt))))return {current:false};
        if(!Number.isFinite(failedAt)||failedAt>cutoff||!["http_403","http_429"].includes(failure.code))continue;
        let host;try {host=new URL(registry.get(failure.sourceId).url).hostname;}catch {continue;}
        const retry=utcMillis(failure.retryAt);
        if(host===new URL(ref.sourceUrl).hostname&&(failedAt>=utcMillis(ref.retrievedAt)||(Number.isFinite(retry)&&retry>cutoff)))return {current:false};
      }
    }
    return {current:true,checkedAt:at,sourceRefs:structuredClone(current.sourceRefs)};
  };
}
