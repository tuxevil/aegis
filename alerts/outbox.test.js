import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {AlertJournal} from "./journal.js";
import {EditorialService} from "./editorial.js";
import {DryRunOutbox} from "./outbox.js";
import {cityChannels,nationalDiscoveryChannel,simulationTargets} from "./channels.js";
import {renderPreview,simulateTransport} from "./templates.js";
import {assessHazard,assessArchive} from "../hazards/assess.js";
import {captureRecord} from "../hazards/fixtures/captures.js";
import {archiveEvidenceVerifier} from "./evidence.js";
const editor={id:"editor",role:"editor"},approver={id:"approver",role:"approver"};
async function setup(t,{simulate}={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-outbox-"));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  let at="2026-10-27T18:05:00Z",current=true;
  const journal=new AlertJournal(dir,{origin:"synthetic_fixture"});
  const verifyEvidence=async()=>({current}),now=()=>at;
  const service=new EditorialService({journal,verifyEvidence,now});
  const candidate=assessHazard({records:[captureRecord({kind:"official_warning",origin:"synthetic_fixture"})],asOf:at,area:"guayaquil",recordOrigin:"synthetic_fixture"}).candidates[0];
  await service.importCandidate(candidate,editor);
  await service.transition(candidate.id,{action:"submit",reason:"Revisar",expectedVersion:1},editor);
  const alert=await service.transition(candidate.id,{action:"approve",reason:"Prueba editorial humana",expectedVersion:2},approver);
  return {dir,journal,service,alert,outbox:new DryRunOutbox({journal,verifyEvidence,now,simulate}),setAt:v=>at=v,setCurrent:v=>current=v};
}
test("directorio conserva enlaces reportados sin inventar JIDs, roles ni canal Pallatanga",()=>{
  const [guayaquil,pallatanga]=cityChannels();assert.equal(guayaquil.inviteVerification,"provided_by_owner");
  assert.match(guayaquil.inviteUrl,/whatsapp.com\/channel\//);assert.equal(guayaquil.channelId,null);assert.equal(guayaquil.ownerVerifiedAt,null);
  assert.equal(guayaquil.boundaryVersion,null);assert.equal(pallatanga.inviteUrl,null);assert.equal(pallatanga.state,"proposed");
  assert.equal(nationalDiscoveryChannel().subscriptionConfirmed,false);
  assert.ok(simulationTargets("guayaquil").every(t=>t.providerChannelId===null&&t.realDeliveryEnabled===false));
});
test("outbox durable deduplica cada transporte; simulación no es envío",async t=>{
  const {outbox,alert,dir}=await setup(t);
  for(const target of simulationTargets("guayaquil")) {
    const queued=await outbox.enqueue(alert.id,target.id,approver);
    assert.deepEqual(await outbox.enqueue(alert.id,target.id,approver),queued);
    const result=await outbox.process(queued.key,approver);assert.equal(result.state,"simulated");assert.equal(result.sent,false);
    assert.equal(result.attempts,1);assert.equal(result.result.providerMessageId,null);
    assert.deepEqual(await outbox.process(queued.key,approver),result);
  }
  const reopened=new DryRunOutbox({journal:new AlertJournal(dir,{origin:"synthetic_fixture"}),verifyEvidence:async()=>({current:true})});
  assert.equal((await reopened.list()).length,4);
});
test("retractación, expiración y versión fuente cambiada cancelan sin simular",async t=>{
  for(const scenario of ["retract","expired","source"]) {
    const env=await setup(t),{outbox,alert,service}=env;
    const q=await outbox.enqueue(alert.id,"simulation-waha-guayaquil",approver);
    if(scenario==="retract")await service.transition(alert.id,{action:"retract",reason:"Revisión retirada",expectedVersion:3},approver);
    if(scenario==="expired")env.setAt(alert.candidate.validTo);
    if(scenario==="source")env.setCurrent(false);
    const cancelled=await outbox.process(q.key,approver);assert.equal(cancelled.state,"cancelled");assert.equal(cancelled.attempts,0);assert.equal(cancelled.result,null);
  }
});
test("fallos de simulación aplican backoff y dead-letter sin guardar error sensible",async t=>{
  const env=await setup(t,{simulate:()=>{throw new Error("https://private.invalid/?secret=do-not-store");}}),{outbox,alert,journal}=env;
  const q=await outbox.enqueue(alert.id,"simulation-rss-guayaquil",approver);
  let result=await outbox.process(q.key,approver);assert.equal(result.state,"retry");assert.equal(result.attempts,1);
  assert.deepEqual(await outbox.process(q.key,approver),result);
  env.setAt(result.nextAttemptAt);result=await outbox.process(q.key,approver);assert.equal(result.attempts,2);
  env.setAt(result.nextAttemptAt);result=await outbox.process(q.key,approver);assert.equal(result.state,"dead_letter");assert.equal(result.attempts,3);
  assert.doesNotMatch(JSON.stringify(await journal.entries()),/do-not-store|private.invalid/);
});
test("no se admiten destinos reales ni resultados que afirmen envío",async t=>{
  const {outbox,alert}=await setup(t,{simulate:()=>({simulation:false,sent:true,providerMessageId:"invented"})});
  await assert.rejects(outbox.enqueue(alert.id,"123@newsletter",approver),/target_not_allowed/);
  await assert.rejects(outbox.enqueue(alert.id,"simulation-rss-guayaquil",editor),/forbidden/);
  const q=await outbox.enqueue(alert.id,"simulation-pwa-guayaquil",approver);
  assert.equal((await outbox.process(q.key,approver)).state,"retry");
  assert.throws(()=>simulateTransport({mode:"LIVE"},renderPreview(alert),alert),/prohibited/);
});
test("plantillas separan autoridad, evidencia, fechas, validez y rectificación",async t=>{
  const {alert}=await setup(t),official=renderPreview(alert,{kind:"correction"});
  assert.match(official.text,/RECTIFICACIÓN/);assert.match(official.text,/Emisión declarada:/);assert.match(official.text,/Captura AEGIS:/);assert.match(official.text,/no representan un aviso real/);
  const independent=structuredClone(alert);independent.candidate.messageClass="AEGIS_ASSESSMENT";independent.candidate.evidenceClass="OBSERVATION";
  assert.match(renderPreview(independent).text,/Evaluación independiente AEGIS/);
  independent.candidate.scope.name="<script>&";
  const xml=simulateTransport(simulationTargets("guayaquil")[1],renderPreview(independent),independent).payload;
  assert.doesNotMatch(xml,/<script>/);assert.match(xml,/&lt;script&gt;&amp;/);
});
test("extremo a extremo PDF sintético → archivo verificado → revisión → outbox DRY_RUN",async t=>{
  const {RawArtifactStore}=await import("../hazards/artifact-store.js");
  const {IngestionService}=await import("../hazards/ingestion.js");
  const {InamhiPdfAdapter}=await import("../hazards/adapters.js");
  const {syntheticBulletin}=await import("../hazards/fixtures/pdf.js");
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-editorial-e2e-"));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const clock=Date.now(),store=new RawArtifactStore(dir,{origin:"synthetic_fixture"}),adapter=new InamhiPdfAdapter();
  // Dynamic fixture window only; no source capture or historical date is forged.
  const service=new IngestionService({store,adapterOverrides:{"inamhi.warning.pdf":{normalize:async(...args)=>{
    const e=await adapter.normalize(...args);Object.assign(e.time,{issuedAt:new Date(clock-3600000).toISOString(),validFrom:new Date(clock-1800000).toISOString(),validTo:new Date(clock+7200000).toISOString()});return e;
  }}}});
  await service.importFixture("inamhi.warning.pdf",syntheticBulletin(),{mediaType:"application/pdf",retrievedAt:new Date(clock).toISOString()});
  const at=new Date().toISOString(),assessment=await assessArchive({store,asOf:at,area:"guayaquil"});assert.equal(assessment.candidates.length,1);
  const journal=new AlertJournal(dir,{origin:"synthetic_fixture"}),verifyEvidence=archiveEvidenceVerifier(store),now=()=>at;
  const editorial=new EditorialService({journal,verifyEvidence,now}),candidate=assessment.candidates[0];
  await editorial.importCandidate(candidate,editor);await editorial.transition(candidate.id,{action:"submit",reason:"PDF sintético revisado",expectedVersion:1},editor);
  await editorial.transition(candidate.id,{action:"approve",reason:"Revisor distinto, sin publicación",expectedVersion:2},approver);
  const outbox=new DryRunOutbox({journal,verifyEvidence,now}),item=await outbox.enqueue(candidate.id,"simulation-waha-guayaquil",approver);
  const simulation=await outbox.process(item.key,approver);assert.equal(simulation.state,"simulated");assert.equal(simulation.sent,false);
  assert.equal((await editorial.list())[0].publishedAt,null);assert.deepEqual(await store.verify(),{captures:1,artifacts:1});
});
