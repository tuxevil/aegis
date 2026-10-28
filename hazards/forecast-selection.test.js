import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SourceRegistry} from './registry.js';
import {SourceHttp} from './http.js';
import {RawArtifactStore} from './artifact-store.js';
import {IngestionService} from './ingestion.js';
import {assessHazard} from './assess.js';
import {main as ingestMain} from '../scripts/ingest-hazards.mjs';
import {archiveEvidenceVerifier} from '../alerts/evidence.js';
const id='openmeteo.singlerun.ecmwf',registry=new SourceRegistry();
const selection={run:'2026-10-27T12:00',area:'pallatanga'};
const payload={hourly_units:{precipitation:'mm'},utc_offset_seconds:0,
  hourly:{time:Array.from({length:72},(_,i)=>new Date(Date.UTC(2026,9,27,12+i)).toISOString().slice(0,16)),precipitation:Array(72).fill(1)}};

test('corrida manual limita calendario, ciclo, modelo, coordenadas y parámetros',()=>{
  const selected=registry.forecastSource(id,selection),url=new URL(selected.url);
  assert.equal(url.origin,'https://single-runs-api.open-meteo.com');assert.equal(url.searchParams.get('models'),'ecmwf_ifs');
  assert.equal(url.searchParams.get('latitude'),'-1.99856');assert.deepEqual(selected.areaIds,['pallatanga']);
  assert.equal(registry.requestUrl(id,selection),selected.url);
  assert.deepEqual(registry.archivedSource(id,selected.url),selected);
  for(const bad of [{...selection,run:'2026-02-30T12:00'},{...selection,run:'2026-10-27T13:00'},
    {...selection,run:selection.run+'Z'},{...selection,area:'unknown'},{...selection,latitude:0},
    {...selection,models:'other'},{run:selection.run},null,[],{...selection,run:'2024-02-29T00:00'}])
    assert.throws(()=>registry.forecastSource(id,bad),/invalid_forecast_request/);
  assert.throws(()=>registry.forecastSource('inamhi.warning.pdf',selection),/invalid_forecast_request/);
  for(const suffix of ['&apikey=secret','&latitude=0','#fragment'])assert.throws(()=>registry.archivedSource(id,selected.url+suffix));
  assert.throws(()=>registry.archivedSource(id,selected.url.replace('single-runs-api.open-meteo.com','example.invalid')));
});

test('HTTP usa solo la URL de corrida validada y rechaza parámetros antes de red',async()=>{
  let calls=0;const http=new SourceHttp({registry,httpFetch:async url=>{
    calls++;assert.equal(url,registry.forecastSource(id,selection).url);
    return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
  }});
  await http.get(id,selection);assert.equal(calls,1);
  await assert.rejects(()=>http.get(id,{...selection,url:'https://example.invalid'}));assert.equal(calls,1);
});

test('dos pilotos, archivo, replay, confirmación y reproceso conservan corrida y ámbito',async t=>{
  const initialized=Math.floor((Date.now()-12*3600000)/(6*3600000))*6*3600000;
  const chosen={...selection,run:new Date(initialized).toISOString().slice(0,16)};
  const data={...payload,hourly:{time:Array.from({length:72},(_,i)=>new Date(initialized+i*3600000).toISOString().slice(0,16)),precipitation:Array(72).fill(1)}};
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-forecast-selection-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new RawArtifactStore(root);let time=new Date(Date.now()-600001),calls=0;
  const service=new IngestionService({store,registry,networkEnabled:true,allowPendingLicense:true,now:()=>time,
    http:{get:async(sourceId,request)=>{calls++;assert.equal(sourceId,id);return {bytes:Buffer.from(JSON.stringify({...data,latitude:Number(new URL(registry.requestUrl(id,request)).searchParams.get("latitude")),longitude:Number(new URL(registry.requestUrl(id,request)).searchParams.get("longitude"))})),mediaType:'application/json',retrievedAt:time.toISOString(),sourceUrl:registry.requestUrl(id,request)};}}});
  for(const area of ['guayaquil','pallatanga']) {
    assert.equal((await service.ingest(id,{...chosen,area})).status,'partial');time=new Date(time.getTime()+300001);
  }
  let records=await store.records();assert.equal(records.length,2);assert.equal(calls,2);
  time=new Date(Date.parse(records.at(-1).retrievedAt)+1);
  assert.equal((await service.ingest(id,{...chosen,area:'guayaquil'})).errorCode,'source_cooldown');
  assert.equal(calls,2);
  records=await store.records();const cutoff=new Date(Date.parse(records.at(-1).processedAt)+1000).toISOString();
  for(const area of ['guayaquil','pallatanga']) {
    const result=assessHazard({records,asOf:cutoff,area});assert.equal(result.candidates.length,1);
    const c=result.candidates[0];assert.equal(c.areaId,area);assert.match(c.scope.name,new RegExp(area==='guayaquil'?'Guayaquil':'Pallatanga'));
    assert.equal(new URL(c.sourceRefs[0].sourceUrl).searchParams.get('run'),chosen.run);
    assert.equal((await archiveEvidenceVerifier(store)(c,cutoff)).current,true);
  }
  const original=records.find(r=>r.envelope.spatial.areaNames[0].startsWith('Pallatanga'));
  await service.reprocess(original.id);const reprocessed=(await store.records()).at(-1);
  assert.equal(reprocessed.envelope.sourceUrl,original.envelope.sourceUrl);
  assert.equal(reprocessed.envelope.time.runInitializedAt,chosen.run+':00.000Z');
  assert.equal(reprocessed.envelope.time.availabilityVerifiedAt,original.retrievedAt);
  assert.equal(reprocessed.retrievedAt,original.retrievedAt);assert.equal(calls,2);
});

test('corridas futuras u opciones inválidas no crean archivo ni usan HTTP',async t=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-forecast-refused-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
  const root=path.join(parent,'absent'),service=new IngestionService({store:new RawArtifactStore(root),networkEnabled:true,allowPendingLicense:true,
    now:()=>new Date('2026-10-27T10:00:00Z'),http:{get:async()=>assert.fail('unexpected network')}});
  await assert.rejects(()=>service.ingest(id,selection),/future_model_run/);
  await assert.rejects(()=>service.ingest(id,{...selection,area:'anywhere'}),/invalid_forecast_request/);
  await assert.rejects(()=>fs.stat(root),{code:'ENOENT'});
});


test('CLI rechaza selección parcial, duplicada o mezclada con operaciones offline',async t=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-forecast-cli-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
  const root=path.join(parent,'absent'),base=[`--data-dir=${root}`,`--source=${id}`];
  for(const args of [['--run=2026-10-27T12:00'],['--area=pallatanga'],
    ['--run=2026-10-27T12:00','--area=pallatanga','--run=2026-10-27T18:00'],
    ['--run=2026-10-27T12:00','--area=pallatanga','--verify'],
    ['--run=2026-10-27T12:00','--area=pallatanga','--reprocess=anything']])
    await assert.rejects(()=>ingestMain([...base,...args]),/invalid_arguments/);
  await assert.rejects(()=>fs.stat(root),{code:'ENOENT'});
});
