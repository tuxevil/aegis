import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {AlertJournal} from "./journal.js";
import {ZoneSubscriptions,zoneConsentVersion} from "./subscriptions.js";
const prefs={areaIds:["guayaquil"],consent:true,consentVersion:zoneConsentVersion,pushInterest:false};
async function setup(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-subscriptions-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  let clock=Date.parse("2026-10-27T21:00:00Z");const now=()=>new Date(clock).toISOString(),journal=new AlertJournal(root,{kind:"subscriptions",origin:"synthetic_fixture"});
  const service=new ZoneSubscriptions({journal,now});
  const register=async(input=prefs)=>{const {challenge}=service.challenge("192.0.2.10");clock+=1500;return service.create(input,{challenge,clientAddress:"192.0.2.10"});};
  return {root,journal,service,register,now,advance:ms=>clock+=ms};
}
test("consentimiento separado, secreto aleatorio devuelto una vez y solo hash durable",async t=>{
  const {service,journal,register,root,now}=await setup(t),one=await register(),two=await register({...prefs,areaIds:["pallatanga"],pushInterest:true});
  assert.match(one.managementSecret,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(one.managementSecret,two.managementSecret);
  assert.equal(two.pushInterest,true);assert.equal(two.pushDeliveryEnabled,false);assert.equal(two.whatsappFollowConfirmed,false);
  const entries=JSON.stringify(await journal.entries());assert.doesNotMatch(entries,new RegExp(one.managementSecret));assert.doesNotMatch(entries,/192\.0\.2\.10|clientAddress|managementSecret/);
  const reopened=new ZoneSubscriptions({journal:new AlertJournal(root,{kind:"subscriptions",origin:"synthetic_fixture"}),now});
  const view=await reopened.read(one.managementSecret);assert.deepEqual(view.areaIds,["guayaquil"]);assert.equal(view.managementSecret,undefined);assert.equal(view.secretDigest,undefined);
  await assert.rejects(reopened.read(randomBytes(32).toString("base64url")),/authentication_required/);
});
test("desafío firmado tiene espera, caducidad, vínculo de petición y uso único",async t=>{
  const {service,advance}=await setup(t),{challenge}=service.challenge("192.0.2.10");
  await assert.rejects(service.create(prefs,{challenge,clientAddress:"192.0.2.10"}),/invalid_subscription_challenge/);
  advance(1500);await assert.rejects(service.create(prefs,{challenge,clientAddress:"192.0.2.11"}),/invalid_subscription_challenge/);
  await assert.rejects(service.create(prefs,{challenge,clientAddress:"192.0.2.10",website:"spam.invalid"}),/invalid_subscription_challenge/);
  await assert.rejects(service.create(prefs,{challenge:challenge+"x",clientAddress:"192.0.2.10"}),/invalid_subscription_challenge/);
  await service.create(prefs,{challenge,clientAddress:"192.0.2.10"});await assert.rejects(service.create(prefs,{challenge,clientAddress:"192.0.2.10"}),/challenge_used/);
  const next=service.challenge("192.0.2.10");advance(600001);await assert.rejects(service.create(prefs,{challenge:next.challenge,clientAddress:"192.0.2.10"}),/invalid_subscription_challenge/);
});
test("preferencias rechazan domicilio, teléfono, faltas de consentimiento y catálogo inventado",async t=>{
  const {register,journal}=await setup(t);
  for(const input of [{...prefs,phone:"private"},{...prefs,latitude:-2},{...prefs,consent:false},{...prefs,consentVersion:"wrong"},{...prefs,pushInterest:undefined},{...prefs,areaIds:["invented"]},{...prefs,areaIds:["guayaquil","guayaquil"]}])await assert.rejects(register(input),/invalid_subscription_preferences/);
  assert.equal((await journal.entries()).length,0);
});
test("gestión autenticada cambia zona, revoca idempotentemente y caduca sin habilitar envíos",async t=>{
  const {service,register,advance,journal}=await setup(t),registered=await register(),secret=registered.managementSecret;
  const updated=await service.update(secret,{...prefs,areaIds:["pallatanga"],pushInterest:true});assert.deepEqual(updated.areaIds,["pallatanga"]);
  const count=(await journal.entries()).length;await service.update(secret,{...prefs,areaIds:["pallatanga"],pushInterest:true});assert.equal((await journal.entries()).length,count);
  const revoked=await service.revoke(secret);assert.equal(revoked.state,"revoked");assert.deepEqual(revoked.areaIds,[]);assert.equal(revoked.pushInterest,false);
  await assert.rejects(service.read(secret),/authentication_required/);await assert.rejects(service.update(secret,prefs),/authentication_required/);
  assert.deepEqual(await service.revoke(secret),revoked);
  const second=await register();advance(30*86400000);await assert.rejects(service.read(second.managementSecret),/authentication_required/);
});
test("demanda agregada suprime grupos pequeños y no inventa métricas de visitas/seguidores",async t=>{
  const {service,register}=await setup(t);await register();let report=await service.demand();assert.equal(report.areas[0].interest,null);
  for(let i=0;i<4;i++)await register();report=await service.demand();assert.equal(report.areas[0].interest,5);assert.equal(report.areas[1].interest,null);
  assert.equal(report.visits,null);assert.equal(report.realWhatsappFollowers,null);assert.equal(report.pushEnabled,null);
  assert.doesNotMatch(JSON.stringify(report),/secretDigest|managementSecret|192\.0\.2/);
});
test("journal separa suscripciones/editorial y rechaza copias cruzadas sin tocar historia",async t=>{
  const {root,journal,register}=await setup(t);await register();const editorial=new AlertJournal(root,{origin:"synthetic_fixture"});
  await editorial.initialize();await fs.copyFile(path.join(journal.root,"00000001.json"),path.join(editorial.root,"00000001.json"));
  await assert.rejects(editorial.entries(),/corrupt/);assert.equal((await journal.entries()).length,1);
  assert.equal((await fs.stat(path.join(journal.root,"00000001.json"))).mode&0o777,0o600);
});

test("journal editorial legado se lee sin migrar o reescribir entradas",async t=>{
  const {createHash}=await import("node:crypto"),{root}=await setup(t),journal=new AlertJournal(root,{origin:"synthetic_fixture"});
  await journal.transact({at:"2026-10-27T21:00:00Z",actor:{id:"editor",role:"editor"},action:"legacy_test"},()=>({data:{legacy:true},value:true}));
  const file=path.join(journal.root,"00000001.json"),entry=JSON.parse(await fs.readFile(file,"utf8"));delete entry.sha256;delete entry.journalKind;
  const bytes=JSON.stringify({...entry,sha256:createHash("sha256").update(JSON.stringify(entry)).digest("hex")});await fs.writeFile(file,bytes);
  assert.equal((await journal.entries()).length,1);assert.equal(await fs.readFile(file,"utf8"),bytes);
});
