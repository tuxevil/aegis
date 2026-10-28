import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {AlertJournal} from "./journal.js";
import {ZoneSubscriptions,zoneConsentVersion} from "./subscriptions.js";
import {reviewSubscriptionRetention} from "./retention-review.js";
const prefs={areaIds:["guayaquil"],consent:true,consentVersion:zoneConsentVersion,pushInterest:true};
async function setup(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-retention-review-"));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  let clock=Date.parse("2026-10-27T21:00:00Z");const now=()=>new Date(clock).toISOString();
  const journal=new AlertJournal(root,{kind:"subscriptions",origin:"synthetic_fixture"});
  const service=new ZoneSubscriptions({journal,now});
  return {root,journal,service,now,advance:ms=>clock+=ms,register:async()=>{
    const {challenge}=service.challenge("192.0.2.10");clock+=1500;
    return service.create(prefs,{challenge,clientAddress:"192.0.2.10"});
  }};
}
test("inventario privado distingue expiración/baja de borrado y no revela identificadores",async t=>{
  const {root,journal,service,register,now,advance}=await setup(t);
  const revoked=await register();await service.revoke(revoked.managementSecret);
  const expired=await register();advance(30*86400000);const active=await register();
  const names=await fs.readdir(journal.root),before=await Promise.all(names.map(n=>fs.readFile(path.join(journal.root,n),"utf8")));
  const report=await reviewSubscriptionRetention({dataDir:root,origin:"synthetic_fixture",asOf:now()});
  assert.deepEqual(report.subscriptions,{total:3,active:1,expired:1,revoked:1});
  assert.equal(report.snapshot.entries,4);assert.equal(report.retainedJournal.zoneBearingEntries,3);
  assert.equal(report.retainedJournal.managementDigestsInLatestStates,3);
  assert.equal(report.physicalErasure,"not_performed");assert.equal(report.privacyCompliance,"not_established");
  assert.equal(report.dispatchMode,"DRY_RUN");assert.equal(report.alertsPublishEnabled,false);
  const text=JSON.stringify(report);
  for(const entry of await journal.entries())for(const value of [entry.data.subscription.id,entry.data.subscription.secretDigest])assert.ok(!text.includes(value));
  for(const secret of [revoked,expired,active])assert.ok(!text.includes(secret.managementSecret));
  assert.ok(!text.includes("192.0.2.10"));assert.ok(!text.includes("guayaquil"));
  assert.deepEqual(await fs.readdir(journal.root),names);
  assert.deepEqual(await Promise.all(names.map(n=>fs.readFile(path.join(journal.root,n),"utf8"))),before);
  await assert.rejects(service.read(expired.managementSecret),/authentication_required/);
  assert.equal((await service.read(active.managementSecret)).state,"active");
});
test("revisión rechaza corrupción/tiempo futuro y no crea un almacén ausente",async t=>{
  const {root,journal,register,now}=await setup(t);await register();
  await assert.rejects(reviewSubscriptionRetention({dataDir:root,origin:"synthetic_fixture",asOf:"2026-10-27T20:00:00Z"}),/precedes_snapshot/);
  await assert.rejects(reviewSubscriptionRetention({dataDir:root,asOf:now()}),/ENOENT/);
  assert.deepEqual(await fs.readdir(path.join(root,"subscriptions","v1")),["synthetic_fixture"]);
  await assert.rejects(reviewSubscriptionRetention({dataDir:root,asOf:"invalid"}),/invalid_retention_cutoff/);
  const file=path.join(journal.root,"00000001.json");await fs.writeFile(file,"{}");
  await assert.rejects(reviewSubscriptionRetention({dataDir:root,origin:"synthetic_fixture",asOf:now()}),/corrupt/);
});
test("CLI ignora DATA_DIR, exige selección explícita y sanea errores",async t=>{
  const {root,register,now}=await setup(t);await register();
  const run=args=>spawnSync(process.execPath,["scripts/review-subscription-retention.mjs",...args],{encoding:"utf8",env:{...process.env,DATA_DIR:"/must-not-read"}});
  const help=run([]);assert.equal(help.status,0);assert.match(help.stdout,/read-only/);
  const okay=run([`--data-dir=${root}`,`--as-of=${now()}`,"--fixture"]);
  assert.equal(okay.status,0);assert.equal(JSON.parse(okay.stdout).subscriptions.active,1);
  for(const args of [[`--data-dir=${root}`],[`--data-dir=${root}`,`--as-of=${now()}`,"--publish"],
    [`--data-dir=${root}`,`--as-of=${now()}`,"--fixture","--fixture"],
    ["--data-dir=/private-missing-path",`--as-of=${now()}`]]) {
    const rejected=run(args);assert.equal(rejected.status,1);assert.equal(rejected.stdout,"");
    assert.doesNotMatch(rejected.stderr,/private-missing-path|ENOENT|secretDigest/);
  }
});
test("journal vacío verificado difiere de ausente; estado semántico inválido no da conteos seguros",async t=>{
  const {root,journal,register,now}=await setup(t);await journal.initialize();
  const report=await reviewSubscriptionRetention({dataDir:root,origin:"synthetic_fixture",asOf:now()});
  assert.deepEqual(report.subscriptions,{total:0,active:0,expired:0,revoked:0});
  assert.equal(report.snapshot.firstEventAt,null);await register();
  await journal.transact({at:now(),actor:{id:"fixture-test",role:"editor"},action:"subscription_update"},entries=>({
    data:{subscription:{...entries[0].data.subscription,expiresAt:"not-a-date"}},value:null
  }));
  // Valid journal hash chain is insufficient to certify valid preference state.
  assert.equal((await journal.entries()).length,2);
  await assert.rejects(reviewSubscriptionRetention({dataDir:root,origin:"synthetic_fixture",asOf:now()}),/invalid_retention_snapshot/);
});
