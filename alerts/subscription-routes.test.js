import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createApp} from "../backend.js";
import {HistoryStore} from "../history.js";
import {AlertJournal} from "./journal.js";
import {ZoneSubscriptions,zoneConsentVersion} from "./subscriptions.js";
const base={store:new HistoryStore(),fetchUrl:async()=>({status:503,data:""}),mac:null,hazardsEnabled:false,alertsAdminEnabled:false};
const prefs={areaIds:["guayaquil"],consent:true,consentVersion:zoneConsentVersion,pushInterest:false};
async function setup(t,journalOptions={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-sub-api-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));let time=Date.parse("2026-10-27T21:00:00Z");
  const journal=new AlertJournal(root,{kind:"subscriptions",origin:"synthetic_fixture",...journalOptions}),service=new ZoneSubscriptions({journal,now:()=>new Date(time).toISOString()});
  const app=await createApp({...base,zoneSubscriptionsEnabled:true,zoneSubscriptionService:service});t.after(()=>app.close());
  const inject=(url,opts={})=>app.inject({url,remoteAddress:"192.0.2.37",...opts});
  const register=async()=>{const challenge=(await inject("/api/subscriptions/challenge")).json().challenge;time+=1500;return inject("/api/subscriptions/zones",{method:"POST",payload:{...prefs,challenge}});};
  return {app,inject,register,journal,service,advance:ms=>time+=ms};
}
test("suscripciones apagadas conservan rutas antiguas y no crean persistencia",async t=>{
  const app=await createApp({...base,zoneSubscriptionsEnabled:false});t.after(()=>app.close());
  assert.equal((await app.inject("/api/subscriptions/catalog")).statusCode,404);assert.equal((await app.inject("/ciudades/")).statusCode,404);
  assert.equal((await app.inject("/api/status")).statusCode,200);
});
test("catálogo público preciso: pilotos, canal reportado y ninguna notificación habilitada",async t=>{
  const {inject}=await setup(t),response=await inject("/api/subscriptions/catalog");assert.equal(response.statusCode,200);const data=response.json();
  assert.equal(data.areas.length,2);assert.equal(data.pushAvailable,false);assert.equal(data.catalogScope,"pilot_cantons_only_not_national_catalog");
  assert.equal(data.channels[0].channelId,null);assert.equal(data.channels[1].inviteUrl,null);assert.equal(data.dispatchMode,"DRY_RUN");
  assert.equal((await inject("/api/subscriptions/catalog?token=leak")).statusCode,400);
  assert.equal((await inject("/api/hazards/private")).statusCode,403);
});
test("alta/gestión/revocación requieren consentimiento, desafío y Bearer privado",async t=>{
  const {inject,register,journal}=await setup(t),registered=await register();assert.equal(registered.statusCode,200);
  const data=registered.json(),secret=data.managementSecret;assert.ok(secret);assert.equal(registered.headers["cache-control"],"no-store");
  assert.equal((await inject("/api/subscriptions/zones/me")).statusCode,401);
  assert.equal((await inject("/api/subscriptions/zones/me?token="+secret)).statusCode,401);
  assert.equal((await inject("/api/subscriptions/zones/me",{headers:{cookie:"token="+secret}})).statusCode,401);
  const headers={authorization:"Bearer "+secret};let response=await inject("/api/subscriptions/zones/me",{headers});assert.equal(response.statusCode,200);assert.equal(response.json().managementSecret,undefined);
  response=await inject("/api/subscriptions/zones/me",{method:"PATCH",headers,payload:{...prefs,areaIds:["pallatanga"],pushInterest:true}});assert.equal(response.statusCode,200);assert.equal(response.json().pushDeliveryEnabled,false);
  response=await inject("/api/subscriptions/zones/me",{method:"DELETE",headers});assert.equal(response.json().state,"revoked");
  assert.equal((await inject("/api/subscriptions/zones/me",{headers})).statusCode,401);
  assert.doesNotMatch(JSON.stringify(await journal.entries()),new RegExp(secret));
});
test("rechaza campos personales, replay y spam sin datos privados en errores",async t=>{
  const {inject,advance}=await setup(t),challenge=(await inject("/api/subscriptions/challenge")).json().challenge;advance(1500);
  for(const extra of [{phone:"private-value"},{address:"private-value"},{latitude:2},{pushEndpoint:"https://private.invalid"}]) {
    const response=await inject("/api/subscriptions/zones",{method:"POST",payload:{...prefs,challenge,...extra}});assert.equal(response.statusCode,400);assert.doesNotMatch(response.body,/private-value|private.invalid/);
  }
  assert.equal((await inject("/api/subscriptions/zones",{method:"POST",payload:{...prefs,challenge,website:"spam"}})).statusCode,400);
  // Different source address gives an independent request budget, not a bypass
  // of signature binding: the same challenge still fails there.
  assert.equal((await inject("/api/subscriptions/zones",{method:"POST",remoteAddress:"192.0.2.38",payload:{...prefs,challenge}})).statusCode,400);
});
test("límite de desafíos precede toda operación e incluye localhost; body limitado",async t=>{
  const {app,inject}=await setup(t);
  for(let i=0;i<5;i++)assert.equal((await app.inject({url:"/api/subscriptions/challenge",remoteAddress:"127.0.0.1"})).statusCode,200);
  assert.equal((await app.inject({url:"/api/subscriptions/challenge",remoteAddress:"127.0.0.1"})).statusCode,429);
  assert.equal((await inject("/api/subscriptions/zones",{method:"POST",payload:{...prefs,challenge:"x".repeat(5000)}})).statusCode,413);
});

test("API consume desafío una vez y no devuelve otro secreto al repetirlo",async t=>{
  const {inject,advance}=await setup(t),challenge=(await inject("/api/subscriptions/challenge")).json().challenge;advance(1500);
  const payload={...prefs,challenge};const first=await inject("/api/subscriptions/zones",{method:"POST",payload});assert.equal(first.statusCode,200);
  const repeated=await inject("/api/subscriptions/zones",{method:"POST",payload});assert.equal(repeated.statusCode,409);assert.equal(repeated.json().managementSecret,undefined);
});


test("API rechaza nuevas altas por reserva de cuota pero conserva DELETE e idempotencia",async t=>{
  const {inject,register}=await setup(t,{maxEvents:2}),first=await register();assert.equal(first.statusCode,200);
  const secret=first.json().managementSecret,blocked=await register();assert.equal(blocked.statusCode,503);assert.equal(blocked.json().error,"subscription_store_unavailable");
  const headers={authorization:"Bearer "+secret};
  for(let i=0;i<2;i++) {
    const response=await inject("/api/subscriptions/zones/me",{method:"DELETE",headers});assert.equal(response.statusCode,200);assert.equal(response.json().state,"revoked");
  }
  assert.equal((await inject("/api/subscriptions/zones/me",{headers})).statusCode,401);
});
