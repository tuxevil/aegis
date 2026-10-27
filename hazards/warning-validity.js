// M1 foundation: normalized, explicitly extracted dates only. No PDF parsing,
// network, publication or claim about historic web availability.
import {utcMillis as utcTime} from "./time.js";

export function inspectWarningValidity({issuedAt,validFrom,validTo,retrievedAt},now=new Date()) {
  const times=[issuedAt,validFrom,validTo,retrievedAt].map(utcTime);
  const [issued,start,end,retrieved]=times;
  const current=now.getTime();
  if(!Number.isFinite(current) || times.some(t=>!Number.isFinite(t)))
    return {dataStatus:"unknown",blockers:["missing_or_invalid_utc_time"]};
  if(end<=start || issued>end)
    return {dataStatus:"invalid",blockers:["inconsistent_validity_window"]};
  // Five minutes tolerates small clock skew, never proves NTP synchronization.
  if(retrieved>current+300000 || issued>retrieved+300000)
    return {dataStatus:"unknown",blockers:["incoherent_clock_or_future_issue"]};
  if(end<=current) return {dataStatus:"stale",blockers:["warning_expired"]};
  return {dataStatus:"valid",blockers:[],effectiveNow:start<=current};
}
