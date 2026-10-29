import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {main} from '../scripts/shadow-lab.mjs';
import {readCheckpoint,writeCheckpoint} from '../hazards/shadow-runner.js';
import {RawArtifactStore} from '../hazards/artifact-store.js';
import {verifyShadowLab} from '../hazards/shadow-recovery.js';
import {createStagingBackup,restoreStagingBackup} from '../staging-backup.js';

test('offline lifecycle uses real archive/evaluator, dedupes bytes, preserves failures and resumes without backdating',async t=>{
  const root=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'aegis-shadow-lifecycle-')),'lab');
  t.after(()=>fs.rm(path.dirname(root),{recursive:true,force:true}));
  const fetchMock=t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected external request');});
  const result=await main(['--lab','--root='+root,'--cycles=12']);
  assert.equal(fetchMock.mock.callCount(),0);assert.equal(result.externalRequests,0);assert.equal(result.precisionMetrics.falsePositiveRate,null);
  assert.equal(result.clockMode,'accelerated_schedule_only');assert.ok(result.simulatedElapsedSeconds>result.actualElapsedSeconds);
  const store=new RawArtifactStore(path.join(root,'archive'),{origin:'synthetic_fixture',readOnly:true});
  const verified=await store.verify();assert.ok(verified.captures>=2);assert.ok(verified.artifacts<verified.captures);
  const state=await readCheckpoint(path.join(root,'state.json'));assert.ok(state.totals.failures>=2);
  assert.ok(state.totals.successes>=2);
  assert.equal((await fs.readdir(path.join(root,'evaluations'))).length,verified.captures);
  for(const name of await fs.readdir(path.join(root,'evaluations'))) {
    const e=JSON.parse(await fs.readFile(path.join(root,'evaluations',name),'utf8'));
    assert.equal(e.recordOrigin,'synthetic_fixture');assert.equal(e.publicationBlocked,true);
    assert.ok(Date.parse(e.actualEvaluatedAt)>=Date.parse(e.processedAt));
    assert.equal(e.results.length,2);assert.ok(e.results.every(r=>r.publicationBlocked));
    assert.equal(e.results.find(r=>r.areaId==='pallatanga').status,'unknown');
    assert.ok(e.results.find(r=>r.areaId==='guayaquil').candidates.length>0);
    for(const r of e.results)for(const candidate of r.candidates){assert.equal(candidate.recordOrigin,'synthetic_fixture');assert.equal(candidate.publicationBlocked,true);}
  }
  const resumed=await main(['--lab','--root='+root,'--cycles=1']);
  assert.ok(resumed.totals.attempts>=state.totals.attempts);
  assert.equal(fetchMock.mock.callCount(),0);
  assert.equal((await verifyShadowLab(root)).capturesWithoutEvaluation.length,0);
  const snapshot=path.join(path.dirname(root),'backup'),restored=path.join(path.dirname(root),'restored');
  await createStagingBackup({sourceDir:root,snapshotDir:snapshot,quiesced:true});
  await restoreStagingBackup({snapshotDir:snapshot,destinationDir:restored});
  assert.equal((await verifyShadowLab(restored)).evaluations,verified.captures);
  assert.deepEqual((await readCheckpoint(path.join(restored,'state.json'))).totals,resumed.totals);
  const raw=(await store.records())[0].sha256;
  await fs.writeFile(path.join(root,'archive','hazards','v1','synthetic_fixture','raw',raw),'damaged fixture');
  await assert.rejects(()=>verifyShadowLab(root),/artifact_corrupt/);
});
test('CLI rejects live mode, credentials, approval strings and malformed arguments before creating files',()=>{
  for(const args of [['--live'],['--lab','--root=/unused','--approval=yes'],['--lab','--root=/unused','--days=7'],['--lab','--cycles=NaN'],['--lab','--url=https://example.com']]) {
    const r=spawnSync(process.execPath,['scripts/shadow-lab.mjs',...args],{encoding:'utf8'});
    assert.equal(r.status,1);assert.equal(r.stdout,'');
  }
});
test('heartbeat is process-only, rejects stale/stopped/live state and does not confuse it with source freshness',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-heartbeat-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const check=()=>spawnSync(process.execPath,['scripts/shadow-lab-health.mjs','--root='+root],{encoding:'utf8'});
  await fs.writeFile(path.join(root,'runner.lock'),'');
  const state={mode:'synthetic_fixture',heartbeatAt:Date.now(),stoppedReason:null};
  await writeCheckpoint(path.join(root,'state.json'),state);assert.equal(check().status,0);
  for(const changes of [{heartbeatAt:Date.now()-200000},{heartbeatAt:Date.now()+200000},{mode:'captured_source'},{stoppedReason:'storage_budget'}]) {
    await writeCheckpoint(path.join(root,'state.json'),{...state,...changes});assert.equal(check().status,1);
  }
});
