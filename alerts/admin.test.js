import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,createHash} from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createApp} from "../backend.js";
import {HistoryStore} from "../history.js";
import {AlertJournal} from "./journal.js";
import {EditorialService} from "./editorial.js";
import {DryRunOutbox} from "./outbox.js";
import {archiveEvidenceVerifier} from "./evidence.js";
import {captureRecord} from "../hazards/fixtures/captures.js";
import {createAdminAuthenticator} from "./auth.js";
const base={store:new HistoryStore(),mac:null,fetchUrl:async()=>({status:503,data:""}),hazardsEnabled:false};
async function setup(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-admin-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const tokens={editor:randomBytes(32).toString("base64url"),approver:randomBytes(32).toString("base64url")};
  const credentials=Object.entries(tokens).map(([role,token])=>({id:role,role,tokenSha256:createHash("sha256").update(token).digest("hex")}));
  const record=captureRecord({kind:"official_warning",origin:"synthetic_fixture"});let fail=false;
  const sourceStore={origin:"synthetic_fixture",namespace:"sources",verify:async()=>{if(fail)throw new Error("private station secret do-not-leak");},records:async()=>[record]};
  const journal=new AlertJournal(root,{origin:"synthetic_fixture"}),verifyEvidence=archiveEvidenceVerifier(sourceStore),now=()=>"2026-10-27T18:05:00Z";
  const services={sourceStore,editorial:new EditorialService({journal,verifyEvidence,now}),outbox:new DryRunOutbox({journal,verifyEvidence,now})};
  const app=await createApp({...base,now:()=>new Date(now()),alertsAdminEnabled:true,alertsAdminCredentials:credentials,alertsAdminServices:services});t.after(()=>app.close());
  const inject=(url,{role="editor",method="GET",body,headers={},...rest}={})=>app.inject({url,method,remoteAddress:"192.0.2.15",headers:{authorization:`Bearer ${tokens[role]}`,...headers},...(body===undefined?{}:{payload:body}),...rest});
  return {app,inject,tokens,credentials,services,setFail:()=>fail=true};
}
test("admin apagado por defecto; activación sin credenciales falla cerrada",async t=>{
  const app=await createApp({...base,alertsAdminEnabled:false});t.after(()=>app.close());
  assert.equal((await app.inject("/api/admin/alerts")).statusCode,404);
  await assert.rejects(createApp({...base,alertsAdminEnabled:true,alertsAdminCredentials:[]}),/credentials_required/);
});
test("Bearer obligatorio incluso desde localhost y Origin coincidente; no acepta query o cookie",async t=>{
  const {app,tokens}=await setup(t);
  for(const remoteAddress of ["127.0.0.1","192.0.2.20"])for(const headers of [{},{origin:"http://localhost"},{referer:"http://localhost/admin"},{authorization:"Bearer wrong"},{cookie:`token=${tokens.editor}`}]) {
    const response=await app.inject({url:"/api/admin/alerts",remoteAddress,headers});assert.equal(response.statusCode,401);assert.equal(response.headers["cache-control"],"no-store");
  }
  assert.equal((await app.inject({url:`/api/admin/alerts?token=${tokens.editor}`})).statusCode,401);
  assert.equal((await app.inject({url:"/api/status",remoteAddress:"192.0.2.15"})).statusCode,403);
});
test("API completa evalúa/importa/revisa y simula; nadie puede enviar candidato propio",async t=>{
  const {inject}=await setup(t);
  const assessment=await inject("/api/admin/alerts/candidates?area=guayaquil");assert.equal(assessment.statusCode,200);
  const candidate=assessment.json().candidates[0];assert.ok(candidate);
  let response=await inject("/api/admin/alerts/candidates",{method:"POST",body:{area:"guayaquil",candidateId:candidate.id,candidate:{facts:"forged"}}});assert.equal(response.statusCode,400);
  response=await inject("/api/admin/alerts/candidates",{method:"POST",body:{area:"guayaquil",candidateId:candidate.id}});assert.equal(response.statusCode,200);assert.equal(response.json().version,1);
  const transition=(action,role,expectedVersion)=>inject(`/api/admin/alerts/${candidate.id}/transitions`,{method:"POST",role,body:{action,reason:"Prueba de revisión",expectedVersion}});
  assert.equal((await transition("approve","editor",1)).statusCode,403);
  assert.equal((await transition("submit","editor",1)).statusCode,200);
  assert.equal((await transition("approve","approver",1)).statusCode,409);
  assert.equal((await transition("approve","approver",2)).statusCode,200);
  response=await inject(`/api/admin/alerts/${candidate.id}/outbox`,{method:"POST",role:"approver",body:{targetId:"simulation-waha-guayaquil"}});assert.equal(response.statusCode,200);
  const key=response.json().key;
  response=await inject("/api/admin/alerts/outbox/process",{method:"POST",role:"approver",body:{key}});assert.equal(response.statusCode,200);assert.equal(response.json().state,"simulated");assert.equal(response.json().sent,false);
  assert.equal((await inject("/api/admin/alerts")).json().items[0].publishedAt,null);
});
test("rutas validadas, paginación acotada y errores sanitizados",async t=>{
  const {inject,setFail}=await setup(t);
  for(const query of ["limit=999","offset=-1","secret=extra","url=https://private.invalid","limit=1&token=extra"])assert.equal((await inject("/api/admin/alerts?"+query)).statusCode,400);
  assert.equal((await inject("/api/admin/alerts/candidates?area=unknown")).statusCode,400);
  assert.equal((await inject("/api/admin/alerts/candidates",{method:"POST",body:{area:"guayaquil",candidateId:"a".repeat(64)},role:"approver"})).statusCode,403);
  setFail();const response=await inject("/api/admin/alerts/candidates?area=guayaquil");assert.equal(response.statusCode,503);assert.doesNotMatch(response.body,/private|secret|station|do-not-leak/);
});
test("admin limita intentos también en localhost y rechaza cuerpos grandes",async t=>{
  const {inject,app}=await setup(t);
  assert.equal((await inject("/api/admin/alerts/candidates",{method:"POST",body:{area:"guayaquil",candidateId:"a".repeat(20000)}})).statusCode,413);
  for(let i=0;i<30;i++)assert.equal((await app.inject({url:"/api/admin/alerts",remoteAddress:"127.0.0.1"})).statusCode,401);
  assert.equal((await app.inject({url:"/api/admin/alerts",remoteAddress:"127.0.0.1"})).statusCode,429);
});
test("configuración rechaza roles, IDs y digests duplicados; comparación usa digest",async t=>{
  const {credentials,tokens}=await setup(t),auth=createAdminAuthenticator(credentials);
  assert.deepEqual(auth("Bearer "+tokens.editor),{id:"editor",role:"editor"});assert.equal(auth("Bearer "+randomBytes(32).toString("base64url")),null);
  assert.throws(()=>createAdminAuthenticator([credentials[0],credentials[0]]),/invalid_admin_credentials/);
  assert.throws(()=>createAdminAuthenticator([{...credentials[0],role:"owner"}]),/invalid_admin_credentials/);
  assert.throws(()=>createAdminAuthenticator([{...credentials[0],token:"plaintext"}]),/invalid_admin_credentials/);
});

test("demanda agregada solo existe con flag de zonas y requiere autenticación administrativa",async t=>{
  const {credentials,tokens,inject}=await setup(t);
  assert.equal((await inject("/api/admin/alerts/demand")).statusCode,403);
  const app=await createApp({...base,zoneSubscriptionsEnabled:true,alertsAdminEnabled:true,alertsAdminCredentials:credentials,
    zoneSubscriptionService:{catalog:[],demand:async()=>({areas:[{areaId:"guayaquil",interest:null}],realWhatsappFollowers:null}),challenge:()=>({})}});t.after(()=>app.close());
  const response=await app.inject({url:"/api/admin/alerts/demand",remoteAddress:"192.0.2.15"});assert.equal(response.statusCode,401);
  const authenticated=await app.inject({url:"/api/admin/alerts/demand",remoteAddress:"192.0.2.15",headers:{authorization:"Bearer "+tokens.editor}});assert.equal(authenticated.statusCode,200);assert.equal(authenticated.json().realWhatsappFollowers,null);
  assert.equal((await app.inject({url:"/api/subscriptions/demand",remoteAddress:"192.0.2.15"})).statusCode,403);
});
