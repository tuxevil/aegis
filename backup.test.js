import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createDataBackup,verifyDataBackup,restoreDataBackup} from "./backup.js";
import {HistoryStore} from "./history.js";
import {RawArtifactStore} from "./hazards/artifact-store.js";
import {GridWeatherBridge} from "./hazards/grid-weather.js";
import {LayerResearchService} from "./hazards/layer-research.js";
import {SngrLayerAcquirer} from "./hazards/arcgis-acquirer.js";
import {layerFixtures} from "./hazards/fixtures/arcgis.js";
import {assessArchive} from "./hazards/assess.js";
import {AlertJournal} from "./alerts/journal.js";
import {EditorialService} from "./alerts/editorial.js";
import {DryRunOutbox} from "./alerts/outbox.js";
import {archiveEvidenceVerifier} from "./alerts/evidence.js";
import {ZoneSubscriptions,zoneConsentVersion} from "./alerts/subscriptions.js";
const run=promisify(execFile),exists=async file=>fs.stat(file).then(()=>true,error=>{if(error.code==="ENOENT")return false;throw error;});
async function sandbox(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-recovery-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const sourceDir=path.join(root,"source"),snapshotDir=path.join(root,"snapshot"),destinationDir=path.join(root,"restored");await fs.mkdir(sourceDir,{mode:0o700});
  return {root,sourceDir,snapshotDir,destinationDir};
}
test("recuperación integral conserva Grid, fuentes, capas, revisión y preferencias sin arrancar servicios",async t=>{
  const options=await sandbox(t),{sourceDir,snapshotDir,destinationDir}=options,at=new Date();
  const history=new HistoryStore(sourceDir);history.record("synthetic-voltage",[{loctimestamp:at.toISOString(),value:120}],at);
  const store=new RawArtifactStore(sourceDir,{origin:"synthetic_fixture"});
  await new GridWeatherBridge({store}).capture({weather:{timestamp:at.toISOString(),rainRateMmHr:9,rainDailyMm:null}},{fixture:true});
  const layerStore=new RawArtifactStore(sourceDir,{origin:"synthetic_fixture",namespace:"layers"});
  const layer=new LayerResearchService({store:layerStore,acquirer:SngrLayerAcquirer.fromFixtures(layerFixtures())});
  assert.equal((await layer.collect("sngr.flood.layer","guayaquil",{fixture:true})).featureCount,3);
  const journal=new AlertJournal(sourceDir,{origin:"synthetic_fixture"}),verifyEvidence=archiveEvidenceVerifier(store),editor={id:"qa-editor",role:"editor"},approver={id:"qa-reviewer",role:"approver"};
  const service=new EditorialService({journal,verifyEvidence}),candidate=(await assessArchive({store,asOf:new Date().toISOString(),area:"pallatanga"})).candidates[0];assert.ok(candidate);
  await service.importCandidate(candidate,editor);await service.transition(candidate.id,{action:"submit",reason:"QA sintético",expectedVersion:1},editor);
  await service.transition(candidate.id,{action:"approve",reason:"Revisión QA independiente",expectedVersion:2},approver);
  const outbox=new DryRunOutbox({journal,verifyEvidence}),queued=await outbox.enqueue(candidate.id,"simulation-rss-pallatanga",approver);
  let time=new Date().getTime();const subscriptionJournal=new AlertJournal(sourceDir,{origin:"synthetic_fixture",kind:"subscriptions"}),now=()=>new Date(time).toISOString();
  const subscriptions=new ZoneSubscriptions({journal:subscriptionJournal,now}),challenge=subscriptions.challenge("192.0.2.10").challenge;time+=1500;
  const preference=await subscriptions.create({areaIds:["pallatanga"],consent:true,consentVersion:zoneConsentVersion,pushInterest:false},{challenge,clientAddress:"192.0.2.10"});
  const originalHistory=await fs.readFile(path.join(sourceDir,"observations.json"),"utf8"),originalEvents=await journal.entries();
  const backup=await createDataBackup({...options,quiesced:true});assert.equal(backup.status,"verified");assert.ok(backup.fileCount>20);
  assert.equal(backup.domainChecks.history,"compatible_v1");assert.equal(backup.domainChecks.layers[0].collections,1);assert.equal(backup.domainChecks.journals.length,2);
  assert.deepEqual(await verifyDataBackup(options),backup);
  const restored=await restoreDataBackup(options);assert.equal(restored.status,"restored_to_new_directory");assert.equal(restored.serviceStarted,false);
  assert.equal(await fs.readFile(path.join(destinationDir,"observations.json"),"utf8"),originalHistory);assert.equal(await fs.readFile(path.join(sourceDir,"observations.json"),"utf8"),originalHistory);
  assert.deepEqual(new HistoryStore(destinationDir).read("synthetic-voltage"),history.read("synthetic-voltage"));
  const restoredStore=new RawArtifactStore(destinationDir,{origin:"synthetic_fixture",readOnly:true});assert.deepEqual(await restoredStore.verify(),await store.verify());
  const recoveredLayer=new LayerResearchService({store:new RawArtifactStore(destinationDir,{origin:"synthetic_fixture",namespace:"layers",readOnly:true})});assert.equal((await recoveredLayer.verifyArchive()).collections,1);
  const restoredJournal=new AlertJournal(destinationDir,{origin:"synthetic_fixture"});assert.deepEqual(await restoredJournal.entries(),originalEvents);assert.deepEqual(await journal.entries(),originalEvents);
  const recoveredOutbox=new DryRunOutbox({journal:restoredJournal,verifyEvidence:archiveEvidenceVerifier(restoredStore)});assert.equal((await recoveredOutbox.list())[0].state,"queued");
  const simulated=await recoveredOutbox.process(queued.key,approver);assert.equal(simulated.state,"simulated");assert.equal(simulated.sent,false);
  assert.deepEqual(await recoveredOutbox.process(queued.key,approver),simulated);
  const recoveredSubscriptions=new ZoneSubscriptions({journal:new AlertJournal(destinationDir,{origin:"synthetic_fixture",kind:"subscriptions"}),now});
  assert.deepEqual((await recoveredSubscriptions.read(preference.managementSecret)).areaIds,["pallatanga"]);
  const manifestText=await fs.readFile(path.join(snapshotDir,"aegis-backup.v1.json"),"utf8");assert.doesNotMatch(manifestText,new RegExp(preference.managementSecret));assert.equal(manifestText.includes(sourceDir),false);
  assert.equal((await fs.stat(snapshotDir)).mode&0o777,0o700);assert.equal((await fs.stat(path.join(snapshotDir,"data","observations.json"))).mode&0o777,0o600);
});
test("backup exige quiescencia y destino nuevo/disjunto, sin sobrescribir ni modificar origen",async t=>{
  const options=await sandbox(t);await fs.writeFile(path.join(options.sourceDir,"evidence.txt"),"preserve");
  await assert.rejects(createDataBackup(options),/quiescence_required/);
  await assert.rejects(createDataBackup({...options,snapshotDir:path.join(options.sourceDir,"nested"),quiesced:true}),/overlapping/);
  await fs.mkdir(options.snapshotDir);await fs.writeFile(path.join(options.snapshotDir,"keep"),"existing");
  await assert.rejects(createDataBackup({...options,quiesced:true}),/destination_exists/);assert.equal(await fs.readFile(path.join(options.snapshotDir,"keep"),"utf8"),"existing");
  assert.equal(await fs.readFile(path.join(options.sourceDir,"evidence.txt"),"utf8"),"preserve");
});
test("locks, temporales, symlinks y presupuestos fallan antes de crear snapshot",async t=>{
  for(const name of ["writer.lock","acquisition-example.lock","observations.json.tmp"]) {
    const options=await sandbox(t);await fs.writeFile(path.join(options.sourceDir,name),"");await assert.rejects(createDataBackup({...options,quiesced:true}),/writer_not_quiescent/);assert.equal(await exists(options.snapshotDir),false);
  }
  const options=await sandbox(t);await fs.writeFile(path.join(options.root,"outside-secret"),"private");await fs.symlink(path.join(options.root,"outside-secret"),path.join(options.sourceDir,"linked"));
  await assert.rejects(createDataBackup({...options,quiesced:true}),/symlink_forbidden/);assert.equal(await exists(options.snapshotDir),false);
  await fs.unlink(path.join(options.sourceDir,"linked"));await fs.writeFile(path.join(options.sourceDir,"large"),"12345");
  await assert.rejects(createDataBackup({...options,quiesced:true,maxBytes:4}),/capacity_exceeded/);assert.equal(await exists(options.snapshotDir),false);
});
test("verificación detecta corrupción o archivo extra; restore no toca un destino existente",async t=>{
  const options=await sandbox(t),file=path.join(options.sourceDir,"evidence.txt");await fs.writeFile(file,"source-proof");await createDataBackup({...options,quiesced:true});
  await fs.mkdir(options.destinationDir);await fs.writeFile(path.join(options.destinationDir,"keep"),"keep");await assert.rejects(restoreDataBackup(options),/destination_exists/);
  assert.equal(await fs.readFile(path.join(options.destinationDir,"keep"),"utf8"),"keep");
  const copied=path.join(options.snapshotDir,"data","evidence.txt");await fs.writeFile(copied,"corrupted");await assert.rejects(verifyDataBackup(options),/integrity_failed/);
  await fs.writeFile(copied,"source-proof");await fs.writeFile(path.join(options.snapshotDir,"data","extra"),"extra");await assert.rejects(verifyDataBackup(options),/integrity_failed/);
  await fs.unlink(path.join(options.snapshotDir,"data","extra"));await fs.writeFile(path.join(options.snapshotDir,"unverified-extra"),"private");await assert.rejects(verifyDataBackup(options),/invalid_layout/);
  assert.equal(await fs.readFile(file,"utf8"),"source-proof");
});
test("manifiesto malicioso no permite traversal aunque su checksum se recalcule",async t=>{
  const options=await sandbox(t);await fs.writeFile(path.join(options.sourceDir,"proof"),"x");await createDataBackup({...options,quiesced:true});
  const file=path.join(options.snapshotDir,"aegis-backup.v1.json"),{checksum,...manifest}=JSON.parse(await fs.readFile(file,"utf8"));manifest.files[0].path="../../escape";
  await fs.writeFile(file,JSON.stringify({...manifest,checksum:createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}));
  await assert.rejects(restoreDataBackup(options),/invalid_manifest/);assert.equal(await exists(options.destinationDir),false);assert.equal(await exists(path.join(options.root,"escape")),false);
});
test("cambio concurrente deja copia incompleta y nunca afirma backup verificado",async t=>{
  const options=await sandbox(t),file=path.join(options.sourceDir,"proof");await fs.writeFile(file,"before");
  const mkdir=fs.mkdir.bind(fs);t.mock.method(fs,"mkdir",async(directory,...args)=>{const result=await mkdir(directory,...args);if(directory===options.snapshotDir)await fs.writeFile(file,"after!");return result;});
  await assert.rejects(createDataBackup({...options,quiesced:true}),/source_changed/);
  assert.equal(await exists(path.join(options.snapshotDir,"aegis-backup.v1.json")),false);assert.equal(await fs.readFile(file,"utf8"),"after!");
});
test("lectores readOnly no inicializan ni reparan almacenes y bloquean escrituras",async t=>{
  const {root}=await sandbox(t),missing=path.join(root,"missing");
  const store=new RawArtifactStore(missing,{readOnly:true}),journal=new AlertJournal(missing,{readOnly:true});
  await assert.rejects(store.verify(),/ENOENT/);await assert.rejects(journal.entries(),/ENOENT/);assert.equal(await exists(missing),false);
  await assert.rejects(store.capture({bytes:Buffer.from("x"),sourceId:"test.source",retrievedAt:new Date().toISOString(),normalize:()=>{throw new Error("must-not-run");}}),/read_only_store/);
  await assert.rejects(journal.transact({},()=>{throw new Error("must-not-run");}),/read_only_store/);assert.equal(await exists(missing),false);
});
test("formato de dominio incompatible se conserva sin backup certificado ni reparación",async t=>{
  const options=await sandbox(t),file=path.join(options.sourceDir,"observations.json");
  for(const bytes of ['{"version":999,"series":{}}','{"version":1,"series":null}','{"version":1,"series":[]}','{"version":1,"series":{"broken":null}}']) {
    await fs.writeFile(file,bytes);await assert.rejects(createDataBackup({...options,quiesced:true}),/domain_invalid/);
    assert.equal(await fs.readFile(file,"utf8"),bytes);assert.equal(await exists(options.snapshotDir),false);
  }
});
test("CLI sin argumentos no opera y errores nunca imprimen rutas privadas",async()=>{
  const result=await run(process.execPath,["scripts/backup-aegis.mjs"]);assert.equal(JSON.parse(result.stdout).status,"no_action");
  await assert.rejects(run(process.execPath,["scripts/backup-aegis.mjs","--verify","--snapshot=/does-not-exist/private-secret"]),error=>{assert.doesNotMatch(error.stderr,/private-secret|does-not-exist/);assert.equal(JSON.parse(error.stderr).status,"failed");return true;});
});
