import {readFileSync} from "node:fs";
import {pilotAreas,pilotArea} from "../hazards/areas.js";

// Owner-reported public links, never session discovery or provider identifiers.
const loadDirectory=()=>JSON.parse(readFileSync(new URL("../docs/design/openalert-channels.json",import.meta.url),"utf8"));
export function cityChannels() {
  const directory=loadDirectory();
  return pilotAreas().map(area=>{
    const reported=area.id==="guayaquil"?directory.channels.find(c=>c.key==="ec-guayaquil"):null;
    return {cityId:area.id,dpaCode:area.dpaCode,dpaStatus:area.codeStatus,name:area.name,province:area.province,
      boundaryVersion:area.boundaryVersion,coverageStatus:area.coverageStatus,
      channelKey:reported?.key??null,displayName:reported?.displayName??null,inviteUrl:reported?.publicInvitationUrl??null,
      inviteVerification:reported?.linkVerification??"not_provided",channelId:null,ownerVerifiedAt:null,state:"proposed",
      automatedPublishingEnabled:false,publicationBlockers:["provider_jid_not_verified","owner_role_not_verified","geography_not_certified","publication_not_authorized"]};
  });
}
export function nationalDiscoveryChannel() {
  const c=loadDirectory().channels.find(c=>c.key==="ec-national");
  return {displayName:c.displayName,inviteUrl:c.publicInvitationUrl,inviteVerification:c.linkVerification,
    subscriptionConfirmed:false,notificationGuaranteed:false,automatedPublishingEnabled:false};
}
export function simulationTargets(cityId) {
  if(!pilotArea(cityId))throw new Error("unknown_channel_city");
  return ["portal","rss","pwa","waha"].map(transport=>({id:`simulation-${transport}-${cityId}`,cityId,transport,
    mode:"DRY_RUN",providerChannelId:null,realDeliveryEnabled:false}));
}
