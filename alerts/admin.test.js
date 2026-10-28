import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,createHash} from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createApp} from "../backend.js";
import {HistoryStore} from "../history.js";
import {AlertJournal} from "./journal.js";
import {RawArtifactStore} from "../hazards/artifact-store.js";
import {EditorialService} from "./editorial.js";
import {DryRunOutbox} from "./outbox.js";
import {archiveEvidenceVerifier} from "./evidence.js";
import {captureRecord} from "../hazards/fixtures/captures.js";
import {createAdminAuthenticator} from "./auth.js";
const base={store:new HistoryStore(),mac:null,fetchUrl:async()=>({status:503,data:""}),hazardsEnabled:false};
async function setup(t,{territoryReader=null}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-admin-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const tokens={editor:randomBytes(32).toString("base64url"),approver:randomBytes(32).toString("base64url")};
  const credentials=Object.entries(tokens).map(([role,token])=>({id:role,role,tokenSha256:createHash("sha256").update(token).digest("hex")}));
  const record=captureRecord({kind:"official_warning",origin:"synthetic_fixture"});let fail=false;
  const sourceStore={origin:"synthetic_fixture",namespace:"sources",verify:async()=>{if(fail)throw new Error("private station secret do-not-leak");},records:async(index)=>index==="failures"?[]:[record]};
  let at="2026-10-27T18:05:00Z";
  const journal=new AlertJournal(root,{origin:"synthetic_fixture"}),verifyEvidence=archiveEvidenceVerifier(sourceStore),now=()=>at;
  const services={sourceStore,territoryReader,editorial:new EditorialService({journal,verifyEvidence,now}),outbox:new DryRunOutbox({journal,verifyEvidence,now})};
  const app=await createApp({...base,now:()=>new Date(now()),alertsAdminEnabled:true,alertsAdminCredentials:credentials,alertsAdminServices:services});t.after(()=>app.close());
  const inject=(url,{role="editor",method="GET",body,headers={},...rest}={})=>app.inject({url,method,remoteAddress:"192.0.2.15",headers:{authorization:`Bearer ${tokens[role]}`,...headers},...(body===undefined?{}:{payload:body}),...rest});
  return {app,inject,tokens,credentials,services,setAt:value=>at=value,setFail:()=>fail=true};
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
  assert.equal((await transition("retract","approver",3)).statusCode,200);
  const enqueueBody={targetId:"simulation-waha-guayaquil",kind:"retraction"};
  assert.equal((await inject(`/api/admin/alerts/${candidate.id}/outbox`,{method:"POST",role:"editor",body:enqueueBody})).statusCode,403);
  assert.equal((await inject(`/api/admin/alerts/${candidate.id}/outbox`,{method:"POST",role:"approver",body:{...enqueueBody,kind:"send"}})).statusCode,400);
  response=await inject(`/api/admin/alerts/${candidate.id}/outbox`,{method:"POST",role:"approver",body:enqueueBody});assert.equal(response.statusCode,200);
  response=await inject("/api/admin/alerts/outbox/process",{method:"POST",role:"approver",body:{key:response.json().key}});
  assert.equal(response.statusCode,200);assert.equal(response.json().state,"simulated");assert.match(response.json().result.payload,/RETRACTACIÓN/);

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


test("importación HTTP repetida tras avanzar el reloj conserva edición y auditoría originales",async t=>{
  const {inject,setAt,services}=await setup(t),candidate=(await inject("/api/admin/alerts/candidates?area=guayaquil")).json().candidates[0];
  const request={method:"POST",body:{area:"guayaquil",candidateId:candidate.id}};
  const first=await inject("/api/admin/alerts/candidates",request);assert.equal(first.statusCode,200);setAt("2026-10-27T18:06:00Z");
  const repeated=await inject("/api/admin/alerts/candidates",request);assert.equal(repeated.statusCode,200);assert.deepEqual(repeated.json(),first.json());assert.equal((await services.editorial.journal.entries()).length,1);
});


test("lector administrativo por defecto no crea archivos de fuente ausentes",async t=>{
  const {credentials,tokens}=await setup(t),root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-admin-source-ro-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const previous=process.env.DATA_DIR;process.env.DATA_DIR=path.join(root,"missing");t.after(()=>{if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;});
  const app=await createApp({...base,alertsAdminEnabled:true,alertsAdminCredentials:credentials,zoneSubscriptionsEnabled:false});t.after(()=>app.close());
  const response=await app.inject({url:"/api/admin/alerts/candidates?area=guayaquil",headers:{authorization:"Bearer "+tokens.editor}});assert.equal(response.statusCode,503);
  const territory=await app.inject({url:"/api/admin/alerts/territory?area=guayaquil&sourceId=sngr.flood.layer",headers:{authorization:"Bearer "+tokens.editor}});assert.equal(territory.statusCode,503);assert.deepEqual(await fs.readdir(root),[]);
});

test("geometría territorial solo tras Bearer, consulta cerrada y archivo verificado",async t=>{
  const {LayerResearchService}=await import('../hazards/layer-research.js'),{SngrLayerAcquirer}=await import('../hazards/arcgis-acquirer.js');
  const {layerFixtures}=await import('../hazards/fixtures/arcgis.js'),{TerritoryPreviewReader}=await import('../hazards/territory-preview.js');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-admin-territory-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new RawArtifactStore(root,{origin:'synthetic_fixture',namespace:'layers'});
  await new LayerResearchService({store,acquirer:SngrLayerAcquirer.fromFixtures(layerFixtures())}).collect('sngr.flood.layer','guayaquil',{fixture:true});
  const reader=new TerritoryPreviewReader({store:new RawArtifactStore(root,{origin:'synthetic_fixture',namespace:'layers',readOnly:true})});
  const {app,inject}=await setup(t,{territoryReader:reader}),url='/api/admin/alerts/territory?area=guayaquil&sourceId=sngr.flood.layer';
  assert.equal((await app.inject(url)).statusCode,401);
  const response=await inject(url);assert.equal(response.statusCode,200);assert.equal(response.headers['cache-control'],'no-store');
  assert.equal(response.json().features.length,3);
  const pinned=url+'&snapshotId='+response.json().snapshot.id;assert.equal((await inject(pinned)).statusCode,200);
  assert.equal((await inject(url+'&snapshotId=00000000-0000-0000-0000-000000000000')).statusCode,404);
  assert.equal((await inject(url+'&snapshotId=bad')).statusCode,400);assert.equal(response.json().recordOrigin,'synthetic_fixture');assert.equal(response.json().publicationBlocked,true);
  assert.doesNotMatch(response.body,/storageKey|artifactIds/);
  for(const suffix of ['&url=https://example.invalid','&limit=51','&offset=-1','&sourceId=other'])assert.equal((await inject(url+suffix)).statusCode,400);
  assert.equal((await inject(url,{role:'approver'})).statusCode,200);
  assert.match((await app.inject('/editorial/territory/')).headers['content-security-policy'],/connect-src 'self'/);
  const record=(await store.records()).find(r=>r.envelope.details.captureRole==='features');await fs.writeFile(path.join(store.root,'raw',record.sha256),'broken');
  const failure=await inject(url);assert.equal(failure.statusCode,503);assert.doesNotMatch(failure.body,/coordinates|private|sha256|broken/);
});
