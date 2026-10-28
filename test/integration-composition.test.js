import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {randomBytes,createHash} from "node:crypto";
import webPush from "web-push";
import {createApp} from "../backend.js";
import {HistoryStore} from "../history.js";
import {openStore} from "../storage/sqlite-store.js";
import {RawArtifactStore} from "../hazards/artifact-store.js";
import {HazardPublicReader} from "../hazards/public-reader.js";
import {AlertJournal} from "../alerts/journal.js";
import {EditorialService} from "../alerts/editorial.js";
import {DryRunOutbox} from "../alerts/outbox.js";
import {ZoneSubscriptions} from "../alerts/subscriptions.js";
import {readPushConfig} from "../push/policy.js";
import {createPushTransport,dispatchPush,startPushWorker} from "../push/transport.js";

test("both lines compose behind independent contracts without exposing legacy/admin routes",async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-composed-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const now=()=>new Date("2026-10-28T12:00:00Z"),vapid=webPush.generateVAPIDKeys(),key=randomBytes(32),adminToken="e".repeat(43);
  const sqlite=await openStore({directory:":memory:",synthetic:true,now,pushStorageKey:key});
  sqlite.writeBatch(JSON.parse(await fs.readFile(new URL("../demo/blackout.json",import.meta.url),"utf8")));
  const sourceStore=new RawArtifactStore(root,{origin:"synthetic_fixture"});await sourceStore.initialize();
  const journal=new AlertJournal(root,{origin:"synthetic_fixture"}),verifyEvidence=async()=>({current:false});
  const zones=new ZoneSubscriptions({journal:new AlertJournal(root,{origin:"synthetic_fixture",kind:"subscriptions"}),now:()=>now().toISOString()});
  const app=await createApp({store:new HistoryStore(root),mac:null,now,fetchUrl:async()=>{throw Error("offline");},
    flags:{PUBLIC_API_V1:true,SQLITE_STORAGE:true,BLACKOUT_MAP:true,CITIZEN_REPORTS:true,
      OFFICIAL_SCHEDULES:true,PUSH_ALERTS:true,TIME_MACHINE:true,EXPLORER_3D:true},
    openV5Store:async()=>sqlite,reportsOrigin:"https://example.invalid",
    pushConfig:{origin:"https://example.invalid",storageKey:key,publicKey:vapid.publicKey,privateKey:vapid.privateKey,delivery:false},
    hazardsEnabled:true,hazardReader:new HazardPublicReader({dataDir:root,now}),
    zoneSubscriptionsEnabled:true,zoneSubscriptionService:zones,alertsAdminEnabled:true,
    alertsAdminCredentials:[{id:"integration-editor",role:"editor",tokenSha256:createHash("sha256").update(adminToken).digest("hex")}],
    alertsAdminServices:{sourceStore,editorial:new EditorialService({journal,verifyEvidence,now:()=>now().toISOString()}),
      outbox:new DryRunOutbox({journal,verifyEvidence,now:()=>now().toISOString()})}});
  t.after(()=>app.close());
  for(const url of ["/ui","/map","/report","/watch/","/history/","/explorer/","/hazards/","/editorial/","/ciudades/",
    "/api/v1/health/public","/api/v1/areas?limit=1","/api/hazards/sources","/api/subscriptions/catalog"]){
    const response=await app.inject({url,remoteAddress:"198.51.100.20"});assert.equal(response.statusCode,200,`${url}: ${response.body}`);
  }
  for(const url of ["/api/weather","/api/dams","/api/cenace","/api/enso"]){
    const response=await app.inject({url,remoteAddress:"198.51.100.20",headers:{host:"example.invalid",origin:"https://example.invalid"}});
    assert.equal(response.statusCode,403,url);
  }
  for(const remoteAddress of ["127.0.0.1","198.51.100.20"])
    assert.equal((await app.inject({url:"/api/admin/alerts",remoteAddress})).statusCode,401);
  assert.equal((await app.inject({url:"/api/admin/alerts",remoteAddress:"198.51.100.20",headers:{authorization:`Bearer ${adminToken}`}})).statusCode,200);
  const home=(await app.inject("/ui")).body;
  for(const url of ["/map","/history/","/explorer/","/watch/","/hazards/","/ciudades/"])assert.ok(home.includes(`href="${url}"`),url);
  assert.equal((await app.inject({url:"/api/hazards/sources",method:"POST",remoteAddress:"198.51.100.20"})).statusCode,403);
  const config=(await app.inject("/api/v1/push/public-key")).json();assert.equal(config.delivery_enabled,false);
  const dto=(await app.inject("/api/subscriptions/catalog")).json();assert.equal(dto.dispatchMode,"DRY_RUN");
  assert.ok(!JSON.stringify(dto).includes(vapid.privateKey));
  const docs=(await app.inject("/api/v1/openapi.json")).json();
  assert.ok(docs.paths["/api/v1/areas"]);assert.equal(docs.paths["/api/admin/alerts"],undefined);
});

test("legacy environment and direct transport calls cannot enable real notifications",async()=>{
  assert.throws(()=>readPushConfig({PUSH_DELIVERY:"true"}),/DRY_RUN/);
  assert.throws(()=>createPushTransport({delivery:true}),/DRY_RUN/);
  let requests=0,claims=0,opened=0;
  const store={info:()=>({synthetic:false}),subscriptions:{claim(){claims++;return null;}}};
  await assert.rejects(dispatchPush(store,{delivery:true},{transport:async()=>{requests++;}}),/DRY_RUN/);
  assert.throws(()=>startPushWorker(store,{delivery:true}),/DRY_RUN/);
  await assert.rejects(createApp({flags:{PUBLIC_API_V1:true,SQLITE_STORAGE:true,OFFICIAL_SCHEDULES:true,BLACKOUT_MAP:true,PUSH_ALERTS:true},
    pushConfig:{delivery:true},openV5Store:async()=>{opened++;throw Error("must not open");}}),/DRY_RUN/);
  assert.equal(requests,0);assert.equal(claims,0);assert.equal(opened,0);
});
