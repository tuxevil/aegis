import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {AlertJournal} from "./journal.js";
import {EditorialService} from "./editorial.js";
import {assessHazard} from "../hazards/assess.js";
import {captureRecord} from "../hazards/fixtures/captures.js";
const editor={id:"editor-1",role:"editor"},approver={id:"reviewer-1",role:"approver"};
async function setup(t,options={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-editorial-"));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  let at="2026-10-27T18:05:00Z",current=true;
  const journal=new AlertJournal(dir,{origin:"synthetic_fixture",...options});
  const service=new EditorialService({journal,now:()=>at,verifyEvidence:async()=>({current})});
  const record=captureRecord({id:"test-capture",kind:"official_warning",origin:"synthetic_fixture"});
  const candidate=assessHazard({records:[record],asOf:at,area:"guayaquil",recordOrigin:"synthetic_fixture"}).candidates[0];
  assert.ok(candidate);
  return {dir,journal,service,candidate,setAt:value=>at=value,setCurrent:value=>current=value};
}
test("editorial draft → revisión independiente → approved es durable y nunca published",async t=>{
  const {dir,service,journal,candidate}=await setup(t);
  const imported=await service.importCandidate(candidate,editor);assert.equal(imported.state,"draft");
  assert.deepEqual(await service.importCandidate(candidate,editor),imported);assert.equal((await journal.entries()).length,1);
  await service.transition(candidate.id,{action:"submit",reason:"Fuente revisada",expectedVersion:1},editor);
  const approved=await service.transition(candidate.id,{action:"approve",reason:"Revisión humana en simulación",expectedVersion:2},approver);
  assert.equal(approved.state,"approved");assert.equal(approved.publishedAt,null);assert.equal(approved.dispatchMode,"DRY_RUN");
  assert.equal(approved.alertsPublishEnabled,false);assert.ok(approved.approval.sourceVersionDigest);
  const reopened=new EditorialService({journal:new AlertJournal(dir,{origin:"synthetic_fixture"}),verifyEvidence:async()=>({current:true})});
  assert.deepEqual(await reopened.list(),[approved]);
  assert.equal((await fs.stat(path.join(journal.root,"00000001.json"))).mode&0o777,0o600);
});
test("roles, versiones y doble revisión impiden saltos o aprobación propia",async t=>{
  const {service,candidate}=await setup(t);
  await assert.rejects(service.importCandidate(candidate,approver),/forbidden/);
  await service.importCandidate(candidate,editor);
  await assert.rejects(service.transition(candidate.id,{action:"approve",reason:"sin revisión",expectedVersion:1},approver),/not_allowed/);
  await service.transition(candidate.id,{action:"submit",reason:"Para revisar",expectedVersion:1},editor);
  await assert.rejects(service.transition(candidate.id,{action:"approve",reason:"Propia",expectedVersion:2},{id:editor.id,role:"approver"}),/independent/);
  await assert.rejects(service.transition(candidate.id,{action:"approve",reason:"vieja versión",expectedVersion:1},approver),/version_conflict/);
  await assert.rejects(service.transition(candidate.id,{action:"published",reason:"no permitido",expectedVersion:2},editor),/invalid_editorial_transition/);
});
test("caducidad y cambio de fuente bloquean aprobación; expiración es auditada",async t=>{
  const env=await setup(t),{service,candidate}=env;
  env.setCurrent(false);await assert.rejects(service.importCandidate(candidate,editor),/not_current/);env.setCurrent(true);
  await service.importCandidate(candidate,editor);await service.transition(candidate.id,{action:"submit",reason:"Revisar",expectedVersion:1},editor);
  env.setCurrent(false);await assert.rejects(service.transition(candidate.id,{action:"approve",reason:"Fuente cambió",expectedVersion:2},approver),/not_current/);
  env.setAt(candidate.validTo);await assert.rejects(service.transition(candidate.id,{action:"approve",reason:"Vencida",expectedVersion:2},approver),/expired/);
  const expired=await service.transition(candidate.id,{action:"expire",reason:"Vigencia terminada",expectedVersion:2},editor);
  assert.equal(expired.state,"expired");await assert.rejects(service.transition(candidate.id,{action:"note",reason:"terminal",expectedVersion:3},editor),/terminal/);
});
test("corrección requiere retirar revisión anterior; mantiene historia y motivos",async t=>{
  const {service,candidate}=await setup(t);await service.importCandidate(candidate,editor);
  const correction=structuredClone(candidate);correction.id="a".repeat(64);correction.revisionHash="b".repeat(64);
  await assert.rejects(service.importCandidate(correction,editor),/active_revision/);
  await service.transition(candidate.id,{action:"supersede",reason:"Nueva interpretación de la fuente",expectedVersion:1},editor);
  const next=await service.importCandidate(correction,editor);assert.equal(next.revision,2);assert.equal(next.state,"draft");
  assert.equal((await service.list()).length,2);
});
test("journal detecta alteración, huecos y reloj regresivo sin sobrescribir historia",async t=>{
  const {service,journal,candidate,setAt}=await setup(t);await service.importCandidate(candidate,editor);
  setAt("2026-10-27T18:04:00Z");await assert.rejects(service.transition(candidate.id,{action:"note",reason:"Reloj anterior",expectedVersion:1},editor),/clock_regression/);
  const file=path.join(journal.root,"00000001.json"),original=await fs.readFile(file,"utf8"),entry=JSON.parse(original);entry.actor.id="tampered";
  await fs.writeFile(file,JSON.stringify(entry));await assert.rejects(journal.entries(),/corrupt/);
  await fs.writeFile(file,original);await fs.rename(file,path.join(journal.root,"00000002.json"));await assert.rejects(journal.entries(),/gap/);
});
test("writer ocupado y capacidad fallan cerrados; origen sintético no se mezcla",async t=>{
  const {service,journal,candidate}=await setup(t,{maxEvents:1});
  const real={...candidate,recordOrigin:"captured_source"};await assert.rejects(service.importCandidate(real,editor),/invalid_editorial_candidate/);
  await journal.initialize();await fs.writeFile(path.join(journal.root,"writer.lock"),"");
  await assert.rejects(service.importCandidate(candidate,editor),/busy/);await fs.unlink(path.join(journal.root,"writer.lock"));
  await service.importCandidate(candidate,editor);await assert.rejects(service.transition(candidate.id,{action:"note",reason:"Sin espacio",expectedVersion:1},editor),/capacity/);
  assert.equal((await journal.entries()).length,1);
});

test("verificador de archivo vuelve a evaluar evidencia y rechaza hechos alterados",async t=>{
  const {archiveEvidenceVerifier}=await import("./evidence.js");
  const {candidate}=await setup(t);
  const record=captureRecord({id:"test-capture",kind:"official_warning",origin:"synthetic_fixture"});
  let verified=0;
  const store={origin:"synthetic_fixture",namespace:"sources",verify:async()=>verified++,records:async()=>[record]};
  const verify=archiveEvidenceVerifier(store);
  assert.equal((await verify(candidate,"2026-10-27T18:06:00Z")).current,true);
  const tampered=structuredClone(candidate);tampered.facts.authority="Autoridad inventada";
  assert.equal((await verify(tampered,"2026-10-27T18:06:00Z")).current,false);
  assert.equal((await verify(candidate,candidate.validTo)).current,false);assert.equal(verified,3);
});
