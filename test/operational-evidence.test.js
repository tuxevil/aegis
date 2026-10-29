import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {reportDocumentedCorpus} from '../hazards/corpus.js';
test('new institutional impact reference stays hindsight-only and never manufactures labels or anticipation',async()=>{
  const manifest=JSON.parse(await fs.readFile('replay/historical-supplement-2026-10-29.json','utf8'));
  const historicalCase=JSON.parse(await fs.readFile('replay/guayaquil-2026-10-26.json','utf8'));
  const report=reportDocumentedCorpus(manifest,historicalCase,['2026-10-18T00:00:00Z']);
  assert.equal(report.coverage.length,4);assert.ok(report.coverage.every(c=>c.outcome===null));
  assert.equal(report.hindsightOnly.usedAsReplayInput,false);assert.equal(report.hindsightOnly.usedAsReviewedLabels,false);
  assert.equal(report.metrics.falseAlertRate.value,null);assert.equal(report.metrics.missRate.value,null);
  assert.equal(report.runs[0].knownReferences.length,0);
});
