import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {DatabaseSync} from "node:sqlite";
import {spawnSync} from "node:child_process";
import {openStore} from "./storage/sqlite-store.js";
import {HistoryStore} from "./history.js";
import {RawArtifactStore} from "./hazards/artifact-store.js";
import {GridWeatherBridge} from "./hazards/grid-weather.js";
import {assessArchive} from "./hazards/assess.js";
import {AlertJournal} from "./alerts/journal.js";
import {EditorialService} from "./alerts/editorial.js";
import {DryRunOutbox} from "./alerts/outbox.js";
import {archiveEvidenceVerifier} from "./alerts/evidence.js";
import {createStagingBackup,verifyStagingBackup,restoreStagingBackup} from "./staging-backup.js";
async function setup(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-combined-backup-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const sourceDir=path.join(root,"data"),snapshotDir=path.join(root,"snapshot"),destinationDir=path.join(root,"recovery");
  await fs.mkdir(sourceDir);return {root,sourceDir,snapshotDir,destinationDir,quiesced:true};
}
test("combined staging recovery preserves Grid, immutable source and SQLite with no migration or startup",async t=>{
  const options=await setup(t),at=new Date(),history=new HistoryStore(options.sourceDir);
  history.record("synthetic-voltage",[{loctimestamp:at.toISOString(),value:120}],at);
  const source=new RawArtifactStore(options.sourceDir,{origin:"synthetic_fixture"});
  await new GridWeatherBridge({store:source,now:()=>at}).capture({weather:{timestamp:at.toISOString(),rainRateMmHr:9,rainDailyMm:10}},{fixture:true});
  const journal=new AlertJournal(options.sourceDir,{origin:"synthetic_fixture"}),verifyEvidence=archiveEvidenceVerifier(source);
  const editorial=new EditorialService({journal,verifyEvidence}),editor={id:"fixture-editor",role:"editor"},approver={id:"fixture-approver",role:"approver"};
  const candidate=(await assessArchive({store:source,area:"pallatanga",asOf:new Date().toISOString()})).candidates[0];assert.ok(candidate);
  await editorial.importCandidate(candidate,editor);
  await editorial.transition(candidate.id,{action:"submit",reason:"Synthetic integration evidence",expectedVersion:1},editor);
  await editorial.transition(candidate.id,{action:"approve",reason:"Independent synthetic reviewer",expectedVersion:2},approver);
  const outbox=new DryRunOutbox({journal,verifyEvidence});
  const queued=await outbox.enqueue(candidate.id,"simulation-rss-pallatanga",approver);
  const sqlite=await openStore({directory:path.join(options.sourceDir,"v5"),synthetic:true,now:()=>at});
  sqlite.writeBatch(JSON.parse(await fs.readFile(new URL("./demo/blackout.json",import.meta.url),"utf8")));sqlite.close();
  const original=await fs.readFile(path.join(options.sourceDir,"observations.json"));
  const result=await createStagingBackup(options);assert.equal(result.sqlite.status,"integrity_and_migrations_verified");
  assert.equal(result.sqlite.migrationCount,6);assert.equal(result.serviceStarted,false);assert.equal(result.dispatchMode,"DRY_RUN");
  assert.deepEqual(await verifyStagingBackup(options),result);
  const restored=await restoreStagingBackup(options);assert.equal(restored.status,"restored_to_new_directory");
  assert.equal(restored.serviceStarted,false);assert.equal(restored.sqlite.migrationCount,6);
  assert.deepEqual(await fs.readFile(path.join(options.destinationDir,"observations.json")),original);
  assert.deepEqual(await fs.readFile(path.join(options.sourceDir,"observations.json")),original);
  const recovered=new RawArtifactStore(options.destinationDir,{origin:"synthetic_fixture",readOnly:true});
  assert.deepEqual(await recovered.verify(),await source.verify());
  const restoredOutbox=new DryRunOutbox({journal:new AlertJournal(options.destinationDir,{origin:"synthetic_fixture"}),verifyEvidence:archiveEvidenceVerifier(recovered)});
  const simulated=await restoredOutbox.process(queued.key,approver);
  assert.equal(simulated.state,"simulated");assert.equal(simulated.sent,false);
  assert.deepEqual(await restoredOutbox.process(queued.key,approver),simulated);
  const restoredEditorial=new EditorialService({journal:restoredOutbox.journal,verifyEvidence:archiveEvidenceVerifier(recovered)});
  assert.equal((await restoredEditorial.list())[0].publishedAt,null);
  const db=new DatabaseSync(path.join(options.destinationDir,"v5","aegis-v5.sqlite"),{readOnly:true});
  try {assert.ok(db.prepare("SELECT COUNT(*) AS n FROM areas").get().n>0);assert.equal(db.prepare("SELECT value FROM settings WHERE key='synthetic'").get().value,"true");}
  finally {db.close();}
  await assert.rejects(restoreStagingBackup(options),/destination_exists/);
});
test("active WAL is refused without checkpointing, erasing files or claiming a complete backup",async t=>{
  const options=await setup(t),sqlite=await openStore({directory:path.join(options.sourceDir,"v5"),synthetic:true});
  t.after(()=>sqlite.close());
  sqlite.writeBatch(JSON.parse(await fs.readFile(new URL("./demo/blackout.json",import.meta.url),"utf8")));
  const wal=path.join(options.sourceDir,"v5","aegis-v5.sqlite-wal"),before=await fs.readFile(wal);
  await assert.rejects(createStagingBackup(options),/not_quiescent/);
  assert.deepEqual(await fs.readFile(wal),before);await assert.rejects(fs.stat(options.snapshotDir),{code:"ENOENT"});
});
test("SQLite semantic corruption and changed snapshot bytes never pass combined verification",async t=>{
  const options=await setup(t);await fs.mkdir(path.join(options.sourceDir,"v5"));
  await fs.writeFile(path.join(options.sourceDir,"v5","aegis-v5.sqlite"),"not a SQLite database");
  await assert.rejects(createStagingBackup(options),/sqlite_integrity_failed/);
  await assert.rejects(verifyStagingBackup(options),/sqlite_integrity_failed/);
  await assert.rejects(restoreStagingBackup(options),/sqlite_integrity_failed/);
  await assert.rejects(fs.stat(options.destinationDir),{code:"ENOENT"});
  await fs.appendFile(path.join(options.snapshotDir,"data","v5","aegis-v5.sqlite"),"changed");
  await assert.rejects(verifyStagingBackup(options),/integrity_failed/);
});
test("CLI requires explicit roots, rejects contradictory arguments and leaves DATA_DIR untouched",async t=>{
  const options=await setup(t),sentinel=path.join(options.sourceDir,"sentinel");await fs.writeFile(sentinel,"unchanged");
  const run=args=>spawnSync(process.execPath,["scripts/staging-snapshot.mjs",...args],{encoding:"utf8",env:{...process.env,DATA_DIR:options.sourceDir}});
  const help=run([]);assert.equal(help.status,0);assert.equal(JSON.parse(help.stdout).status,"no_action");
  for(const args of [["--backup"],["--verify","--snapshot=/sensitive-private-path","--quiesced"],["--restore","--snapshot=/sensitive-private-path"]]){
    const result=run(args);assert.equal(result.status,1);assert.equal(result.stdout,"");assert.ok(!result.stderr.includes("/sensitive-private-path"));
  }
  assert.equal(await fs.readFile(sentinel,"utf8"),"unchanged");
});
