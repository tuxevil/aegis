import fs from "node:fs";
import {SourceRegistry} from "../hazards/registry.js";
// Deliberately no activation path. An approval string/env is not authorization.
const args=process.argv.slice(2);
if(!args.length) {
  console.log(JSON.stringify({status:"blocked",activationStatus:"not_authorized",externalRequestsStarted:false,containerNetworkState:"not_inspected",
    reason:"Host egress, source permissions, continuous runner and owner approval are not established",dispatchMode:"DRY_RUN"}));
  process.exitCode=2;
} else {
  try {
    if(args.length!==1||args[0]!=="--check-plan")throw Error();
    const plan=JSON.parse(fs.readFileSync(new URL("../docs/verification/integration/shadow-egress-policy.proposed.json",import.meta.url),"utf8"));
    if(plan.activationStatus!=="not_authorized"||plan.approvalReference!==null||plan.continuousRunnerReady!==false||
      plan.hostFirewallVerified!==false||plan.observationStartedAt!==null||plan.dnsPolicy.resolvedAddressAllowlist.length||
      plan.maxConcurrentRequests!==1||JSON.stringify(plan.methods)!=='["GET"]'||JSON.stringify(plan.schemes)!=='["https:"]'||JSON.stringify(plan.ports)!=='[443]'||plan.redirects!=="deny")throw Error();
    const registry=new SourceRegistry();
    for(const proposal of plan.sources) {
      const source=registry.get(proposal.sourceId),url=new URL(source.url);
      if(url.hostname!==proposal.host||url.pathname!==proposal.path||source.maxBytes!==proposal.maxResponseBytes||source.timeoutMs!==proposal.timeoutMs||proposal.approvalReference!==null)throw Error();
    }
    console.log(JSON.stringify({status:"inactive_plan_consistent_with_registry",externalRequestsStarted:false,containerNetworkState:"not_inspected",
      sourceProfiles:plan.sources.length,hostFirewallVerified:false,continuousRunnerReady:false,
      observationStartedAt:null,notice:"Proposal only; no source request, Docker operation, database write or approval",dispatchMode:"DRY_RUN"}));
  }catch {console.error("Shadow preparation refused: only --check-plan of the inactive proposal is supported");process.exitCode=1;}
}
