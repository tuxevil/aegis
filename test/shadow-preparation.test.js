import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
test("shadow proposal cannot activate traffic through arguments or approval-like environment",()=>{
  const env={...process.env,AEGIS_APPROVED_SHADOW_NETWORK:"bridge",SHADOW_APPROVED:"true",PUSH_DELIVERY:"true",ALERTS_PUBLISH_ENABLED:"true"};
  const run=args=>spawnSync(process.execPath,["scripts/shadow-egress-preflight.mjs",...args],{encoding:"utf8",env});
  const blocked=run([]);assert.equal(blocked.status,2);assert.equal(JSON.parse(blocked.stdout).externalRequestsStarted,false);
  const checked=run(["--check-plan"]);assert.equal(checked.status,0);assert.equal(JSON.parse(checked.stdout).observationStartedAt,null);
  for(const args of [["--live"],["--activate"],["--check-plan","--live"],["--approval=pretend-approved"]]){
    const rejected=run(args);assert.equal(rejected.status,1);assert.equal(rejected.stdout,"");
  }
});
