import {randomBytes,randomUUID,createHash,createHmac,timingSafeEqual} from "node:crypto";
import {utcMillis} from "../hazards/time.js";
import {pilotAreas} from "../hazards/areas.js";
import {safeMode} from "../hazards/registry.js";
const sha=value=>createHash("sha256").update(value).digest("hex");
const actor={id:"zone-subscription-service",role:"editor"};
export const zoneConsentVersion="zone-follow-1";
const secretPattern=/^[a-zA-Z0-9_-]{43}$/;
function state(entries) {
  const subscriptions=new Map(),used=new Set();
  for(const e of entries) {
    if(!["subscription_create","subscription_update","subscription_revoke"].includes(e.action))throw new Error("invalid_subscription_journal");
    const s=e.data.subscription;
    if(!s||!s.id||!s.secretDigest||!Array.isArray(s.areaIds)||s.pushDeliveryEnabled!==false||s.whatsappFollowConfirmed!==false)throw new Error("invalid_subscription_journal");
    subscriptions.set(s.id,s);if(e.data.challengeDigest)used.add(e.data.challengeDigest);
  }
  return {subscriptions,used};
}
const publicView=(s,recordOrigin)=>({recordOrigin,areaIds:[...s.areaIds],state:s.state,consentVersion:s.consentVersion,consentedAt:s.consentedAt,pushInterest:s.pushInterest,
  pushDeliveryEnabled:false,whatsappFollowConfirmed:false,expiresAt:s.expiresAt,...safeMode});
export class ZoneSubscriptions {
  #key;
  constructor({journal,now=()=>new Date().toISOString(),challengeKey=randomBytes(32),catalog=pilotAreas()}) {
    if(!journal||journal.kind!=="subscriptions"||!Buffer.isBuffer(challengeKey)||challengeKey.length<32||!Array.isArray(catalog)||!catalog.length||catalog.length>250)throw new Error("invalid_subscription_configuration");
    if(catalog.some(a=>!a||typeof a.id!=="string"||!/^[a-z0-9-]{1,60}$/.test(a.id)||!/^\d{4}$/.test(a.dpaCode)||typeof a.name!=="string"||typeof a.province!=="string")||new Set(catalog.map(a=>a.id)).size!==catalog.length)throw new Error("invalid_subscription_catalog");
    Object.assign(this,{journal,now,catalog:structuredClone(catalog)});this.#key=Buffer.from(challengeKey);
  }
  sign(value) {return createHmac("sha256",this.#key).update(value).digest("base64url");}
  challenge(clientAddress) {
    if(typeof clientAddress!=="string"||clientAddress.length>100)throw new Error("invalid_subscription_client");
    const nonce=randomBytes(24).toString("base64url"),issued=utcMillis(this.now());
    if(!Number.isFinite(issued))throw new Error("invalid_subscription_clock");
    const content=nonce+"."+issued,signature=this.sign(content+":"+clientAddress);
    return {challenge:content+"."+signature,minWaitMs:1500,expiresInMs:600000,...safeMode};
  }
  validateChallenge(value,clientAddress,at) {
    if(typeof value!=="string"||!/^[a-zA-Z0-9_-]{32}\.\d{13}\.[a-zA-Z0-9_-]{43}$/.test(value)||typeof clientAddress!=="string"||clientAddress.length>100)throw new Error("invalid_subscription_challenge");
    const [nonce,issued,signature]=value.split("."),age=utcMillis(at)-Number(issued),expected=this.sign(nonce+"."+issued+":"+clientAddress);
    if(age<1500||age>600000||!Number.isFinite(age)||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw new Error("invalid_subscription_challenge");
    return sha(value);
  }
  validatePreferences(input) {
    if(!input||Object.keys(input).some(k=>!["areaIds","consent","consentVersion","pushInterest"].includes(k))||input.consent!==true||input.consentVersion!==zoneConsentVersion||typeof input.pushInterest!=="boolean"||!Array.isArray(input.areaIds)||!input.areaIds.length||input.areaIds.length>5||new Set(input.areaIds).size!==input.areaIds.length||input.areaIds.some(id=>!this.catalog.some(a=>a.id===id)))throw new Error("invalid_subscription_preferences");
    return [...input.areaIds].sort();
  }
  #transact(action,at,update) {
    return this.journal.transact({at,actor,action},async entries=>{
      const result=await update(entries);
      // A revocation must remain best-effort even for older under-reserved stores.
      if(result.unchanged||action==="subscription_revoke")return result;
      const {subscriptions}=state(entries),next=result.data.subscription;subscriptions.set(next.id,next);
      result.reserveEntries=[...subscriptions.values()].filter(s=>s.state==="active"&&utcMillis(s.expiresAt)>utcMillis(at)).map(s=>({
        actor,action:"subscription_revoke",data:{subscription:{...s,state:"revoked",areaIds:[],pushInterest:false}}
      }));
      return result;
    });
  }
  async create(input,{challenge,clientAddress,website=""}) {
    if(website!=="")throw new Error("invalid_subscription_challenge");
    const at=this.now(),challengeDigest=this.validateChallenge(challenge,clientAddress,at),areaIds=this.validatePreferences(input);
    const secret=randomBytes(32).toString("base64url"),secretDigest=sha(secret);
    const value=await this.#transact("subscription_create",at,entries=>{
      const {used}=state(entries);if(used.has(challengeDigest))throw new Error("subscription_challenge_used");
      const subscription={id:randomUUID(),secretDigest,areaIds,state:"active",consentVersion:zoneConsentVersion,consentedAt:at,pushInterest:input.pushInterest,
        pushDeliveryEnabled:false,whatsappFollowConfirmed:false,expiresAt:new Date(utcMillis(at)+30*86400000).toISOString()};
      return {data:{subscription,challengeDigest},value:publicView(subscription,this.journal.origin)};
    });
    // Secret returned only once; journal contains its digest, no IP/phone/address.
    return {...value,managementSecret:secret};
  }
  find(entries,secret,at,{allowRevoked=false}={}) {
    if(typeof secret!=="string"||!secretPattern.test(secret))throw new Error("subscription_authentication_required");
    const digest=Buffer.from(sha(secret),"hex");let found=null;
    for(const s of state(entries).subscriptions.values())if(timingSafeEqual(Buffer.from(s.secretDigest,"hex"),digest))found=s;
    if(!found||(!allowRevoked&&found.state!=="active")||utcMillis(found.expiresAt)<=utcMillis(at))throw new Error("subscription_authentication_required");
    return found;
  }
  async read(secret) {return publicView(this.find(await this.journal.entries(),secret,this.now()),this.journal.origin);}
  async update(secret,input) {
    const areaIds=this.validatePreferences(input),at=this.now();
    return this.#transact("subscription_update",at,entries=>{
      const prior=this.find(entries,secret,at);
      if(prior.areaIds.join()===areaIds.join()&&prior.pushInterest===input.pushInterest)return {unchanged:true,value:publicView(prior,this.journal.origin)};
      const subscription={...prior,areaIds,pushInterest:input.pushInterest,consentedAt:at};
      return {data:{subscription},value:publicView(subscription,this.journal.origin)};
    });
  }
  async revoke(secret) {
    const at=this.now();return this.#transact("subscription_revoke",at,entries=>{
      const prior=this.find(entries,secret,at,{allowRevoked:true});
      if(prior.state==="revoked")return {unchanged:true,value:publicView(prior,this.journal.origin)};
      const subscription={...prior,state:"revoked",areaIds:[],pushInterest:false};
      return {data:{subscription},value:publicView(subscription,this.journal.origin)};
    });
  }
  async demand() {
    const at=utcMillis(this.now()),active=[...state(await this.journal.entries()).subscriptions.values()].filter(s=>s.state==="active"&&utcMillis(s.expiresAt)>at);
    const suppress=n=>n>=5?n:null;
    return {measurement:"active_zone_preferences_not_unique_people_or_followers",suppressionThreshold:5,visits:null,territorySelections:null,realWhatsappFollowers:null,pushEnabled:null,
      areas:this.catalog.map(a=>({areaId:a.id,dpaCode:a.dpaCode,interest:suppress(active.filter(s=>s.areaIds.includes(a.id)).length),pushInterest:suppress(active.filter(s=>s.areaIds.includes(a.id)&&s.pushInterest).length)})),...safeMode};
  }
}
