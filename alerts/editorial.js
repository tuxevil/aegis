import {createHash} from "node:crypto";
import {utcMillis} from "../hazards/time.js";
import {pilotArea} from "../hazards/areas.js";
import {safeMode} from "../hazards/registry.js";

const hex=/^[a-f0-9]{64}$/;
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text=(value,max)=>typeof value==="string"&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const requireRole=(actor,role)=>{if(actor?.role!==role)throw new Error("editorial_forbidden");};
export function editorialState(entries) {
  const alerts=new Map();
  for(const entry of entries) {
    if(entry.action.startsWith("editorial_")) {
      const alert=entry.data.alert;
      if(!alert||typeof alert.id!=="string"||alert.publishedAt!==null||alert.publicationBlocked!==true)throw new Error("editorial_journal_invalid");
      alerts.set(alert.id,structuredClone(alert));
    }
  }
  return alerts;
}
function validateCandidate(c,origin,at) {
  if(!c||!hex.test(c.id)||!hex.test(c.familyId)||!hex.test(c.revisionHash)||c.recordOrigin!==origin||c.publicationBlocked!==true||c.alertsPublishEnabled!==false||c.dispatchMode!=="DRY_RUN"||c.status!=="draft"||!["OFFICIAL","AEGIS_ASSESSMENT"].includes(c.messageClass)||!pilotArea(c.areaId)||
    !Number.isFinite(utcMillis(c.evaluatedAt))||utcMillis(c.evaluatedAt)>utcMillis(at)||!Number.isFinite(utcMillis(c.validFrom))||!Number.isFinite(utcMillis(c.validTo))||utcMillis(c.validFrom)>=utcMillis(c.validTo)||utcMillis(c.validTo)<=utcMillis(at)||!Array.isArray(c.sourceRefs)||!c.sourceRefs.length||c.sourceRefs.length>10)throw new Error("invalid_editorial_candidate");
  for(const ref of c.sourceRefs) {
    let url;try {url=new URL(ref.sourceUrl);}catch {throw new Error("invalid_editorial_source");}
    if(url.protocol!=="https:"||url.username||url.password||!hex.test(ref.sha256)||!text(ref.captureId,100)||!text(ref.sourceId,100)||!Number.isFinite(utcMillis(ref.knownAt))||utcMillis(ref.knownAt)>utcMillis(at))throw new Error("invalid_editorial_source");
  }
  if(Buffer.byteLength(JSON.stringify(c))>65536)throw new Error("editorial_candidate_too_large");
}
// Source validation must be supplied by the archive boundary, never by a public
// request. Approval snapshots the exact evidence digest; every queue rechecks it.
export class EditorialService {
  constructor({journal,verifyEvidence,now=()=>new Date().toISOString()}) {
    if(!journal||typeof verifyEvidence!=="function")throw new Error("editorial_configuration_required");
    Object.assign(this,{journal,verifyEvidence,now});
  }
  async list() {return [...editorialState(await this.journal.entries()).values()];}
  async importCandidate(candidate,actor) {
    requireRole(actor,"editor");const at=this.now();validateCandidate(candidate,this.journal.origin,at);
    const verification=await this.verifyEvidence(structuredClone(candidate),at);
    if(verification?.current!==true)throw new Error("editorial_evidence_not_current");
    return this.journal.transact({at,actor,action:"editorial_import"},entries=>{
      const alerts=editorialState(entries),prior=alerts.get(candidate.id);
      if(prior) {
        if(prior.candidateDigest!==hash(candidate))throw new Error("editorial_candidate_collision");
        return {unchanged:true,value:prior};
      }
      const family=[...alerts.values()].filter(a=>a.familyId===candidate.familyId);
      if(family.some(a=>!["expired","retracted","superseded"].includes(a.state)))throw new Error("editorial_active_revision_exists");
      const alert={id:candidate.id,familyId:candidate.familyId,revision:family.length+1,candidate:structuredClone(candidate),candidateDigest:hash(candidate),
        state:"draft",version:1,notes:[],approval:null,createdAt:at,updatedAt:at,publishedAt:null,publicationBlocked:true,...safeMode};
      return {data:{alert},value:alert};
    });
  }
  async transition(id,{action,reason,expectedVersion},actor) {
    const role=["approve","retract"].includes(action)?"approver":"editor";requireRole(actor,role);
    if(!["submit","approve","return","expire","retract","supersede","note"].includes(action)||!text(reason,2000)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new Error("invalid_editorial_transition");
    const at=this.now();
    return this.journal.transact({at,actor,action:"editorial_"+action},async entries=>{
      const alert=editorialState(entries).get(id);if(!alert)throw new Error("editorial_not_found");
      const version=entries.filter(e=>e.action.startsWith("editorial_")&&e.data.alert.id===id).length;
      if(version!==expectedVersion)throw new Error("editorial_version_conflict");
      if(["expired","retracted","superseded"].includes(alert.state))throw new Error("editorial_terminal_state");
      const expired=utcMillis(alert.candidate.validTo)<=utcMillis(at);
      if(expired&&action!=="expire")throw new Error("editorial_candidate_expired");
      const allowed={submit:["draft"],approve:["pending_review"],return:["pending_review"],expire:["draft","pending_review","approved"],retract:["approved"],supersede:["draft","pending_review","approved"],note:["draft","pending_review","approved"]};
      if(!allowed[action].includes(alert.state))throw new Error("editorial_transition_not_allowed");
      if(action==="expire"&&!expired)throw new Error("editorial_not_expired");
      if(action==="approve") {
        const submitter=[...entries].reverse().find(e=>e.action==="editorial_submit"&&e.data.alert.id===id)?.actor.id;
        if(actor.id===submitter)throw new Error("editorial_independent_review_required");
        const evidence=await this.verifyEvidence(structuredClone(alert.candidate),at);
        if(evidence?.current!==true)throw new Error("editorial_evidence_not_current");
        alert.approval={by:actor.id,at,candidateDigest:alert.candidateDigest,sourceVersionDigest:hash(alert.candidate.sourceRefs)};
      }
      const states={submit:"pending_review",approve:"approved",return:"draft",expire:"expired",retract:"retracted",supersede:"superseded"};
      if(action!=="note")alert.state=states[action];
      if(action==="return"||action==="supersede")alert.approval=null;
      alert.notes.push({action,reason,by:actor.id,at});alert.updatedAt=at;alert.version=version+1;
      return {data:{alert},value:alert};
    });
  }
}
