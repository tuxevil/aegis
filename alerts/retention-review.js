import {AlertJournal} from "./journal.js";
import {utcMillis} from "../hazards/time.js";
import {safeMode} from "../hazards/registry.js";

// Private aggregate inventory only. Expiration/revocation is not physical erasure.
export async function reviewSubscriptionRetention({dataDir,origin="captured_source",asOf}) {
  const cutoff=utcMillis(asOf);
  if(!Number.isFinite(cutoff))throw new Error("invalid_retention_cutoff");
  const journal=new AlertJournal(dataDir,{kind:"subscriptions",origin,readOnly:true});
  const entries=await journal.entries(),latest=new Map();
  if(entries.some(e=>utcMillis(e.at)>cutoff))throw new Error("retention_cutoff_precedes_snapshot");
  let historicalZoneEntries=0,historicalPushInterestEntries=0;
  for(const entry of entries) {
    const s=entry.data?.subscription;
    if(!["subscription_create","subscription_update","subscription_revoke"].includes(entry.action)||
      !s||typeof s.id!=="string"||typeof s.secretDigest!=="string"||!/^[a-f0-9]{64}$/.test(s.secretDigest)||
      !["active","revoked"].includes(s.state)||!Array.isArray(s.areaIds)||s.areaIds.some(a=>typeof a!=="string")||
      typeof s.pushInterest!=="boolean"||s.pushDeliveryEnabled!==false||s.whatsappFollowConfirmed!==false||
      !Number.isFinite(utcMillis(s.expiresAt))||!Number.isFinite(utcMillis(s.consentedAt))||
      utcMillis(s.consentedAt)>utcMillis(entry.at)||utcMillis(s.expiresAt)<=utcMillis(s.consentedAt)||
      (s.state==="revoked"&&(s.areaIds.length!==0||s.pushInterest!==false)))throw new Error("invalid_retention_snapshot");
    if(s.areaIds.length)historicalZoneEntries++;
    if(s.pushInterest)historicalPushInterestEntries++;
    latest.set(s.id,s);
  }
  const counts={active:0,expired:0,revoked:0};
  for(const s of latest.values())counts[s.state==="revoked"?"revoked":utcMillis(s.expiresAt)<=cutoff?"expired":"active"]++;
  return {reportKind:"AEGIS_PRIVATE_SUBSCRIPTION_RETENTION_REVIEW",recordOrigin:origin,asOf,
    snapshot:{entries:entries.length,lastSequence:entries.at(-1)?.sequence??0,
      firstEventAt:entries[0]?.at??null,lastEventAt:entries.at(-1)?.at??null},
    subscriptions:{total:latest.size,...counts},retainedJournal:{zoneBearingEntries:historicalZoneEntries,
      pushInterestEntries:historicalPushInterestEntries,managementDigestsInLatestStates:latest.size},
    physicalErasure:"not_performed",backups:"not_inspected",privacyCompliance:"not_established",
    limitations:["Private exact counts; do not publish as public demand analytics",
      "Expired and revoked preferences can remain in earlier immutable events and backups",
      "This inventory does not inspect backups, arbitrary extra fields, files outside the journal, or legal retention duties",
      "No deletion, anonymization, reactivation, notification or policy change"],...safeMode};
}
