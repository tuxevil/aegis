import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {RawArtifactStore} from './artifact-store.js';
import {IngestionService} from './ingestion.js';
import {InamhiPdfAdapter} from './adapters.js';
import {SourceHttp} from './http.js';
import {syntheticBulletin} from './fixtures/pdf.js';
import {assessArchive} from './assess.js';
import {selectKnownCaptures} from './knowledge-cutoff.js';
import {createDataBackup,verifyDataBackup,restoreDataBackup} from '../backup.js';
const capturedAt='2026-10-30T00:02:31.269Z';

test('real PDF.js extraction of synthetic cross-month bulletin; offline revision, backup and restore preserve history',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-inamhi-reprocess-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'data'),store=new RawArtifactStore(dir);
 const adapter=new InamhiPdfAdapter();
 const legacy={normalize:async(...args)=>{
   const e=await adapter.normalize(...args);e.time.validFrom=null;e.time.validTo=null;
   e.quality.parserVersion='synthetic-legacy-failure';e.quality.dataStatus='unknown';
   delete e.details.temporalExtraction;return e;
 }};
 const originalPdf=syntheticBulletin({day:'28',issueHour:'15',number:900,areaText:'LEYENDA DEL MAPA: Guayas',validityText:'desde 13H00 del 29 de octubre hasta las 23H00 del 01 de noviembre de 2026'});
 const bytes=originalPdf;
 const ingest=new IngestionService({store,adapterOverrides:{'inamhi.warning.pdf':legacy}});
 const first=await ingest.capture(ingest.registry.get('inamhi.warning.pdf'),{bytes,mediaType:'application/pdf',retrievedAt:capturedAt});
 const old=(await store.records())[0],file=path.join(store.root,'captures',old.id+'.json'),originalBytes=await fs.readFile(file);
 const service=new IngestionService({store,http:{get:()=>{throw Error('NETWORK_FORBIDDEN');}}});
 const result=await service.reprocess(first.captureId),records=await store.records(),revision=records.at(-1);
 assert.equal(result.dispatchMode,'DRY_RUN');assert.equal(result.alertsPublishEnabled,false);
 assert.deepEqual(await fs.readFile(file),originalBytes);
 assert.equal(revision.captureRef,old.id);assert.equal(revision.retrievedAt,old.retrievedAt);assert.equal(revision.sha256,old.sha256);
 assert.equal(revision.revision,old.revision);assert.equal(revision.sequence,old.sequence+1);assert.equal(revision.transport,null);
 assert.ok(Date.parse(revision.processedAt)>=Date.parse(old.processedAt));
 assert.notEqual(revision.envelope.quality.parserVersion,old.envelope.quality.parserVersion);
 assert.equal(revision.envelope.time.issuedAt,'2026-10-28T20:00:00.000Z');
 assert.equal(revision.envelope.time.validFrom,'2026-10-29T18:00:00.000Z');assert.equal(revision.envelope.time.validTo,'2026-11-02T04:00:00.000Z');
 assert.equal(revision.envelope.quality.dataStatus,'partial');assert.equal(revision.envelope.spatial.precision,'unknown');
 assert.deepEqual(selectKnownCaptures(records,capturedAt).known,[]);
 for(const area of ['guayaquil','pallatanga']) {
   const result=await assessArchive({store,area,asOf:revision.processedAt});
   assert.equal(result.status,'unknown');assert.equal(result.candidates.length,0);
   const expectedReason=Date.parse(revision.processedAt)-Date.parse(revision.retrievedAt)>service.registry.get(revision.sourceId).ttlMs?'capture_stale_at_cutoff':'territory_not_supported';
   assert.ok(result.excluded.some(r=>r.reason===expectedReason));assert.equal(result.alertsPublishEnabled,false);
 }
 const snapshot=path.join(root,'snapshot'),restored=path.join(root,'restored');
 await createDataBackup({sourceDir:dir,snapshotDir:snapshot,quiesced:true});await verifyDataBackup({snapshotDir:snapshot});
 await restoreDataBackup({snapshotDir:snapshot,destinationDir:restored});
 const copy=new RawArtifactStore(restored,{readOnly:true});assert.deepEqual(await copy.verify(),{captures:2,artifacts:1});
 assert.deepEqual(await copy.records(),records);
 assert.deepEqual(await assessArchive({store:copy,area:'guayaquil',asOf:revision.processedAt}),await assessArchive({store,area:'guayaquil',asOf:revision.processedAt}));
});

test('reprocessing refuses corrupt archive before appending any interpretation',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-inamhi-corrupt-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new RawArtifactStore(root),service=new IngestionService({store});
 const capture=await service.capture(service.registry.get('inamhi.warning.pdf'),{bytes:syntheticBulletin(),mediaType:'application/pdf',retrievedAt:capturedAt});
 const record=(await store.records())[0];await fs.writeFile(path.join(store.root,'raw',record.sha256),'corrupt');
 await assert.rejects(service.reprocess(capture.captureId),/artifact_corrupt/);assert.equal((await store.records()).length,1);
});

test('HTTP elapsedMs is an integer millisecond difference, separate from parsing time',async()=>{
 const base=Date.parse(capturedAt);let clock=base,calls=0;
 const http=new SourceHttp({now:()=>new Date(clock),httpFetch:async()=>{calls++;clock+=3164;return new Response('synthetic',{headers:{'content-type':'application/pdf'}});}});
 const capture=await http.get('inamhi.warning.pdf');assert.equal(capture.elapsedMs,3164);assert.equal(capture.elapsedMs/1000,3.164);assert.equal(calls,1);
});
