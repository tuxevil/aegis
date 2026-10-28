import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {captureRecord} from "../hazards/fixtures/captures.js";
import {assessHazard} from "../hazards/assess.js";
import {AlertJournal} from "./journal.js";
import {EditorialService} from "./editorial.js";
import {DryRunOutbox} from "./outbox.js";
import {archiveEvidenceVerifier} from "./evidence.js";
const editor={id:"editor",role:"editor"},approver={id:"reviewer",role:"approver"};
async function setup(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-evidence-cycle-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const failures=[],records=[captureRecord({id:"original",origin:"synthetic_fixture"})];let at="2026-10-27T18:05:00Z";
  const store={origin:"synthetic_fixture",namespace:"sources",verify:async()=>{},records:async(index)=>structuredClone(index==="failures"?failures:records)};
  const journal=new AlertJournal(root,{origin:"synthetic_fixture"}),verify=archiveEvidenceVerifier(store),now=()=>at;
  const service=new EditorialService({journal,verifyEvidence:verify,now}),outbox=new DryRunOutbox({journal,verifyEvidence:verify,now});
  const assess=(area="guayaquil")=>assessHazard({records:structuredClone(records),asOf:at,area,recordOrigin:"synthetic_fixture"});
  const approve=async()=>{const c=assess().candidates[0];await service.importCandidate(c,editor);await service.transition(c.id,{action:"submit",reason:"Prueba sintética",expectedVersion:1},editor);return service.transition(c.id,{action:"approve",reason:"Revisión sintética independiente",expectedVersion:2},approver);};
  const recapture=()=>{const r=captureRecord({id:"recapture",origin:"synthetic_fixture",retrievedAt:"2026-10-27T18:30:00.000Z",processedAt:"2026-10-27T18:31:00.000Z"});r.sequence=2;records.push(r);return r;};
  return {records,failures,journal,verify,service,outbox,assess,approve,recapture,setAt:value=>at=value};
}
test("reimportar misma edición con otro corte no crea colisión ni borra evaluación original",async t=>{
  const e=await setup(t),candidate=e.assess().candidates[0],first=await e.service.importCandidate(candidate,editor);
  e.setAt("2026-10-27T18:06:00Z");const next=e.assess().candidates[0];assert.equal(next.id,candidate.id);assert.notEqual(next.evaluatedAt,candidate.evaluatedAt);
  assert.deepEqual(await e.service.importCandidate(next,editor),first);assert.equal((await e.journal.entries()).length,1);
});
test("recaptura idéntica conserva revisión/aprobación y acredita comprobación reciente sin otro envío",async t=>{
  const e=await setup(t),alert=await e.approve(),item=await e.outbox.enqueue(alert.id,"simulation-rss-guayaquil",approver);
  e.recapture();e.setAt("2026-10-27T18:35:00Z");const current=e.assess().candidates[0];assert.equal(current.id,alert.id);
  const verified=await e.verify(alert.candidate,"2026-10-27T18:35:00Z");assert.equal(verified.current,true);assert.equal(verified.sourceRefs[0].captureId,"recapture");
  const imported=await e.service.importCandidate(current,editor);assert.deepEqual(imported,alert);
  const simulated=await e.outbox.process(item.key,approver);assert.equal(simulated.state,"simulated");assert.equal(simulated.sent,false);
  assert.equal(simulated.evidenceCheck.sourceRefs[0].captureId,"recapture");assert.equal(imported.candidate.sourceRefs[0].captureId,"original");
  assert.match(simulated.result.payload,/Última captura de la misma versión/);
  assert.deepEqual(await e.outbox.enqueue(alert.id,"simulation-rss-guayaquil",approver),simulated);assert.deepEqual(await e.outbox.process(item.key,approver),simulated);
});
test("vigencia documental no evita TTL vencido; captura nueva de la misma edición recupera elegibilidad",async t=>{
  const e=await setup(t),alert=await e.approve(),item=await e.outbox.enqueue(alert.id,"simulation-waha-guayaquil",approver);
  e.setAt("2026-10-27T19:00:01Z");assert.equal(e.assess().candidates.length,0);assert.equal(e.assess().excluded.at(-1).reason,"capture_stale_at_cutoff");
  assert.equal((await e.verify(alert.candidate,"2026-10-27T19:00:01Z")).current,false);
  assert.equal((await e.outbox.process(item.key,approver)).state,"cancelled");
  e.recapture();assert.equal(e.assess().candidates[0].id,alert.id);assert.equal((await e.verify(alert.candidate,"2026-10-27T19:00:01Z")).current,true);
});
test("recaptura nueva no permite falsificar procedencia o retroceder el corte revisado",async t=>{
  const e=await setup(t),c=e.assess().candidates[0];e.recapture();e.setAt("2026-10-27T18:35:00Z");
  for(const [field,value] of [["captureId","nonexistent"],["knownAt","2026-10-27T18:00:00.000Z"],["retrievedAt","2026-10-27T18:02:00.000Z"],["processedAt","2026-10-27T18:03:00.000Z"]]) {
    const forged=structuredClone(c);forged.sourceRefs[0][field]=value;assert.equal((await e.verify(forged,"2026-10-27T18:35:00Z")).current,false);
  }
  const backdated=structuredClone(c);backdated.evaluatedAt="2026-10-27T17:59:00Z";assert.equal((await e.verify(backdated,"2026-10-27T18:35:00Z")).current,false);
});
test("cambio de incertidumbre o parser cambia identidad aunque el SHA fuente sea igual",async t=>{
  const e=await setup(t),original=e.assess().candidates[0];e.records[0].envelope.quality.warnings.push("SYNTHETIC changed extraction uncertainty");
  const changed=e.assess().candidates[0];assert.notEqual(changed.id,original.id);assert.equal(changed.familyId,original.familyId);assert.equal(changed.sourceRefs[0].sha256,original.sourceRefs[0].sha256);
  assert.equal((await e.verify(original,"2026-10-27T18:05:00Z")).current,false);
});


test("reprocesar bytes antiguos no renueva TTL ni su fecha de captura",async t=>{
  const e=await setup(t),c=e.assess().candidates[0],reprocessed=structuredClone(e.records[0]);
  Object.assign(reprocessed,{id:"reprocessed",sequence:2,operation:"reprocess",captureRef:"original",processedAt:"2026-10-27T19:01:00.000Z"});e.records.push(reprocessed);e.setAt("2026-10-27T19:02:00Z");
  assert.equal(e.assess().candidates.length,0);assert.equal((await e.verify(c,"2026-10-27T19:02:00Z")).current,false);assert.equal(e.records[0].retrievedAt,reprocessed.retrievedAt);
});
test("fallo conocido posterior bloquea confirmación, sin fuga de fallos futuros ni afectar otra fuente",async t=>{
  const e=await setup(t),c=e.assess().candidates[0];
  e.failures.push({sourceId:"sngr.flood.single",at:"2026-10-27T18:02:00Z",code:"timeout",retryAt:null});
  assert.equal((await e.verify(c,"2026-10-27T18:05:00Z")).current,true);
  e.failures.push({sourceId:"inamhi.warning.pdf",at:"2026-10-27T18:10:00Z",code:"timeout",retryAt:null});
  assert.equal((await e.verify(c,"2026-10-27T18:05:00Z")).current,true);assert.equal((await e.verify(c,"2026-10-27T18:15:00Z")).current,false);
  e.recapture();assert.equal((await e.verify(c,"2026-10-27T18:35:00Z")).current,true);
});
test("URL oficial con nuevo boletín impide usar cita antigua sin inferir retractación",async t=>{
  const e=await setup(t),alert=await e.approve(),newer=e.recapture();newer.envelope.details.bulletinNumber=1000;newer.sha256="b".repeat(64);e.setAt("2026-10-27T18:35:00Z");
  assert.equal(e.assess().candidates.length,2);assert.equal((await e.verify(alert.candidate,"2026-10-27T18:35:00Z")).current,false);
  const latest=e.assess().candidates.find(c=>c.facts.bulletinNumber===1000);
  assert.equal((await e.service.list())[0].state,"approved");assert.equal((await e.verify(latest,"2026-10-27T18:35:00Z")).current,true);
  const oldReprocess=structuredClone(e.records[0]);Object.assign(oldReprocess,{id:"old-reprocessed",sequence:3,operation:"reprocess",captureRef:"original",processedAt:"2026-10-27T18:40:00.000Z"});e.records.push(oldReprocess);
  assert.equal((await e.verify(alert.candidate,"2026-10-27T18:45:00Z")).current,false);assert.equal((await e.verify(latest,"2026-10-27T18:45:00Z")).current,true);
});

test("pausa de host no se interpreta como recuperación al vencer Retry-After",async t=>{
  const e=await setup(t),forecast=captureRecord({id:"forecast",kind:"forecast_run",origin:"synthetic_fixture"});forecast.fixtureForecastAvailabilityAt=forecast.retrievedAt;
  forecast.envelope.details.time=Array.from({length:24},(_,i)=>new Date(Date.parse("2026-10-27T20:00:00Z")+i*3600000).toISOString());forecast.envelope.details.precipitationMm=Array(24).fill(1);
  e.records.splice(0,1,forecast);const c=e.assess().candidates[0];assert.ok(c);
  e.failures.push({sourceId:"openmeteo.singlerun.ecmwf",at:"2026-10-27T18:02:00Z",code:"http_429",retryAt:"2026-10-27T18:12:00Z"});
  assert.equal((await e.verify(c,"2026-10-27T18:05:00Z")).current,false);assert.equal((await e.verify(c,"2026-10-27T18:15:00Z")).current,false);
  const fresh=structuredClone(forecast);Object.assign(fresh,{id:"fresh-model",sequence:2,retrievedAt:"2026-10-27T18:30:00.000Z",processedAt:"2026-10-27T18:31:00.000Z"});e.records.push(fresh);
  assert.equal((await e.verify(c,"2026-10-27T18:35:00Z")).current,true);
});


test("lectura local posterior fallida bloquea confirmación sin borrar la observación conocida",async t=>{
  const e=await setup(t),station=captureRecord({id:"station",kind:"observation",origin:"synthetic_fixture"});e.records.splice(0,1,station);
  const c=e.assess("pallatanga").candidates[0];assert.ok(c);
  const failed=captureRecord({id:"failed-station",kind:"observation",origin:"synthetic_fixture",retrievedAt:"2026-10-27T18:10:00.000Z",processedAt:"2026-10-27T18:11:00.000Z"});failed.sequence=2;failed.envelope.details.upstreamFailed=true;e.records.push(failed);
  assert.equal((await e.verify(c,"2026-10-27T18:05:00Z")).current,true);assert.equal((await e.verify(c,"2026-10-27T18:15:00Z")).current,false);assert.equal(e.records[0].envelope.details.rainRateMmHr,9);
});

test("archivo físico recapturado mantiene una edición y una simulación con hash verificado",async t=>{
  const {RawArtifactStore}=await import("../hazards/artifact-store.js"),{GridWeatherBridge}=await import("../hazards/grid-weather.js"),{assessArchive}=await import("../hazards/assess.js");
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-recapture-durable-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new RawArtifactStore(root,{origin:"synthetic_fixture"}),bridge=new GridWeatherBridge({store}),status={weather:{timestamp:new Date().toISOString(),rainRateMmHr:9,rainDailyMm:null}};
  await bridge.capture(status,{fixture:true});const candidate=(await assessArchive({store,area:"pallatanga",asOf:new Date().toISOString()})).candidates[0];assert.ok(candidate);
  const journal=new AlertJournal(root,{origin:"synthetic_fixture"}),verify=archiveEvidenceVerifier(store),service=new EditorialService({journal,verifyEvidence:verify}),outbox=new DryRunOutbox({journal,verifyEvidence:verify});
  await service.importCandidate(candidate,editor);await service.transition(candidate.id,{action:"submit",reason:"Lectura sintética, mismo contenido",expectedVersion:1},editor);
  const approved=await service.transition(candidate.id,{action:"approve",reason:"Revisión independiente sintética",expectedVersion:2},approver),queued=await outbox.enqueue(candidate.id,"simulation-waha-pallatanga",approver);
  const original=await store.records(),originalIndex=await fs.readFile(path.join(store.root,"captures",original[0].id+".json"),"utf8");
  await bridge.capture(status,{fixture:true});const records=await store.records();assert.equal(records.length,2);assert.equal(records[0].sha256,records[1].sha256);assert.deepEqual(await store.verify(),{captures:2,artifacts:1});
  const repeated=(await assessArchive({store,area:"pallatanga",asOf:new Date().toISOString()})).candidates[0];assert.equal(repeated.id,candidate.id);assert.deepEqual(await service.importCandidate(repeated,editor),approved);
  const result=await outbox.process(queued.key,approver);assert.equal(result.state,"simulated");assert.equal(result.sent,false);assert.equal(result.evidenceCheck.sourceRefs[0].captureId,records[1].id);
  assert.deepEqual(await outbox.enqueue(candidate.id,"simulation-waha-pallatanga",approver),result);assert.equal((await outbox.list()).length,1);
  assert.equal(await fs.readFile(path.join(store.root,"captures",original[0].id+".json"),"utf8"),originalIndex);
});
