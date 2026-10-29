import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {appendDiscrepancy,validateDiscrepancy} from './discrepancies.js';
import {measureProcess,recordDailyMeasurement} from './operational-metrics.js';
import {readCheckpoint} from './shadow-runner.js';
const note=()=>({kind:'evaluation_changed',recordOrigin:'synthetic_fixture',areaId:'pallatanga',sourceId:'inamhi.warning.pdf',
  evaluationRef:'test-evaluation-1',artifactHashes:['a'.repeat(64)],officialReferences:[],decisionAt:'2026-10-29T12:00:00Z',reviewedAt:'2026-10-29T13:00:00Z',reviewer:'fixture-reviewer',note:'Synthetic correction; not a measured error rate.'});
test('private discrepancy preserves revisions and provenance without creating metric labels or fetching URLs',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-discrepancy-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const fetch=t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected fetch');});
  const a=await appendDiscrepancy(root,note()),b=await appendDiscrepancy(root,{...note(),evaluationRef:a.id});
  assert.notEqual(a.id,b.id);assert.equal(b.publicationBlocked,true);assert.equal(b.verification,'manual_note_not_ground_truth');
  assert.equal(fetch.mock.callCount(),0);
  for(const change of [{recordOrigin:'captured_source'},{kind:'all_clear'},{areaId:'../private'},{officialReferences:['https://user:password@example.com/']},{outcome:false}])
    assert.throws(()=>validateDiscrepancy({...note(),...change}));
});
test('daily observations keep actual days and unknown electricity across process restarts',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-daily-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const resources=await measureProcess();assert.equal(resources.powerWatts,null);assert.equal(resources.energyWh,null);assert.ok(resources.rssBytes>0);
  const r={actualReportedAt:'2026-10-29T12:00:00Z',actualStartedAt:'2026-10-29T11:00:00Z',mode:'synthetic_fixture',clockMode:'accelerated_schedule_only',totals:{attempts:2},resources};
  await recordDailyMeasurement(root,r);await recordDailyMeasurement(root,{...r,actualStartedAt:'2026-10-29T12:00:00Z'});
  await recordDailyMeasurement(root,{...r,actualStartedAt:'2026-10-29T12:00:00Z'});
  const daily=await readCheckpoint(path.join(root,'daily','2026-10-29.json'));
  assert.equal(daily.samples,3);assert.equal(daily.processRestartSinceFirst,true);assert.equal(daily.powerWatts,null);
});
