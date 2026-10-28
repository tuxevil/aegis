import {createHash} from "node:crypto";
import {editorialState} from "./editorial.js";
import {simulationTargets} from "./channels.js";
import {renderPreview,simulateTransport} from "./templates.js";
import {utcMillis} from "../hazards/time.js";
import {safeMode} from "../hazards/registry.js";
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const confirmation=(verification,at)=>({checkedAt:at,sourceRefs:(verification.sourceRefs??[]).map(ref=>Object.fromEntries(
  ["captureId","sourceId","sha256","sourceUrl","knownAt","issuedAt","retrievedAt","processedAt"].map(key=>[key,ref[key]])))});
export function outboxState(entries) {
  const outbox=new Map();
  for(const entry of entries)if(entry.action.startsWith("outbox_")) {
    const item=entry.data.item;
    if(!item||item.sent!==false||item.mode!=="DRY_RUN")throw new Error("outbox_journal_invalid");
    outbox.set(item.key,structuredClone(item));
  }
  return outbox;
}
export class DryRunOutbox {
  constructor({journal,verifyEvidence,now=()=>new Date().toISOString(),simulate=simulateTransport,maxAttempts=3,retryMs=60000}) {
    if(!journal||journal.kind!=="editorial"||typeof verifyEvidence!=="function"||typeof simulate!=="function"||!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>5||!Number.isSafeInteger(retryMs)||retryMs<1000)throw new Error("invalid_outbox_configuration");
    Object.assign(this,{journal,verifyEvidence,now,simulate,maxAttempts,retryMs});
  }
  async list() {return [...outboxState(await this.journal.entries()).values()];}
  async enqueue(alertId,targetId,actor,{kind="notice"}={}) {
    if(!["notice","retraction"].includes(kind))throw new Error("invalid_outbox_kind");
    if(actor?.role!=="approver")throw new Error("outbox_forbidden");
    const at=this.now();
    return this.journal.transact({at,actor,action:"outbox_enqueue"},async entries=>{
      const alert=editorialState(entries).get(alertId);
      if(kind==="retraction")return this.enqueueRetraction(entries,alert,targetId,at);
      if(!alert||alert.state!=="approved"||!alert.approval||alert.approval.candidateDigest!==alert.candidateDigest||alert.approval.sourceVersionDigest!==hash(alert.candidate.sourceRefs))throw new Error("outbox_not_approved");
      if(utcMillis(alert.candidate.validTo)<=utcMillis(at))throw new Error("outbox_expired");
      const target=simulationTargets(alert.candidate.areaId).find(t=>t.id===targetId);
      if(!target)throw new Error("outbox_target_not_allowed");
      const verification=await this.verifyEvidence(structuredClone(alert.candidate),at);
      if(verification?.current!==true)throw new Error("outbox_evidence_changed");
      const key=[alert.id,alert.revision,alert.candidate.areaId,target.id].join(":"),prior=outboxState(entries).get(key);
      if(prior)return {unchanged:true,value:prior};
      const item={key,alertId:alert.id,revision:alert.revision,candidateDigest:alert.candidateDigest,target,createdAt:at,expiresAt:alert.candidate.validTo,
        state:"queued",attempts:0,nextAttemptAt:at,lastError:null,result:null,evidenceCheck:confirmation(verification,at),mode:"DRY_RUN",sent:false,publicationBlocked:true,...safeMode};
      return {data:{item},value:item};
    });
  }
  enqueueRetraction(entries,alert,targetId,at) {
    if(!alert||alert.state!=="retracted"||!alert.notes.some(n=>n.action==="retract"))throw new Error("outbox_not_retracted");
    const target=simulationTargets(alert.candidate.areaId).find(t=>t.id===targetId);
    if(!target)throw new Error("outbox_target_not_allowed");
    const originalKey=[alert.id,alert.revision,alert.candidate.areaId,target.id].join(":"),items=outboxState(entries),original=items.get(originalKey);
    if(!original||original.state!=="simulated"||original.candidateDigest!==alert.candidateDigest)throw new Error("outbox_no_prior_simulation");
    const key=originalKey+":retraction",prior=items.get(key);if(prior)return {unchanged:true,value:prior};
    const item={key,kind:"retraction",originalKey,editorialVersion:alert.version,alertId:alert.id,revision:alert.revision,
      candidateDigest:alert.candidateDigest,target,createdAt:at,expiresAt:new Date(utcMillis(at)+86400000).toISOString(),
      state:"queued",attempts:0,nextAttemptAt:at,lastError:null,result:null,evidenceCheck:null,
      mode:"DRY_RUN",sent:false,publicationBlocked:true,...safeMode};
    return {data:{item},value:item};
  }
  async process(key,actor) {
    if(actor?.role!=="approver")throw new Error("outbox_forbidden");
    const at=this.now();
    return this.journal.transact({at,actor,action:"outbox_process"},async entries=>{
      const item=outboxState(entries).get(key);if(!item)throw new Error("outbox_not_found");
      if(!["queued","retry"].includes(item.state))return {unchanged:true,value:item};
      const alert=editorialState(entries).get(item.alertId);
      const cancel=reason=>{item.state="cancelled";item.lastError=reason;item.nextAttemptAt=null;return {data:{item},value:item};};
      if(utcMillis(item.expiresAt)<=utcMillis(at))return cancel("expired");
      const retraction=item.kind==="retraction";
      if(!alert||alert.state!==(retraction?"retracted":"approved")||alert.candidateDigest!==item.candidateDigest||alert.revision!==item.revision||
        (retraction&&alert.version!==item.editorialVersion))return cancel("editorial_state_changed");
      const verification=retraction?null:await this.verifyEvidence(structuredClone(alert.candidate),at);
      if(!retraction&&verification?.current!==true)return cancel("evidence_no_longer_eligible");
      if(utcMillis(item.nextAttemptAt)>utcMillis(at))return {unchanged:true,value:item};
      if(!retraction)item.evidenceCheck=confirmation(verification,at);item.attempts++;
      try {
        const result=await this.simulate(structuredClone(item.target),renderPreview(alert,{kind:retraction?"retraction":alert.revision>1?"correction":"notice",asOf:at,evidenceCheck:item.evidenceCheck}),structuredClone(alert));
        if(result?.simulation!==true||result.sent!==false||result.providerMessageId!==null)throw new Error("invalid_simulation_result");
        if(Buffer.byteLength(JSON.stringify(result))>100000)throw new Error("simulation_result_too_large");
        item.result=result;item.state="simulated";item.nextAttemptAt=null;item.lastError=null;
      } catch {
        // Do not persist provider/body/error text or secrets from an adapter.
        item.lastError="simulation_failed";item.state=item.attempts>=this.maxAttempts?"dead_letter":"retry";
        item.nextAttemptAt=item.state==="retry"?new Date(utcMillis(at)+this.retryMs*2**(item.attempts-1)).toISOString():null;
      }
      return {data:{item},value:item};
    });
  }
}
