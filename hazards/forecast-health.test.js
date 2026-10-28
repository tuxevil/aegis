import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {HazardPublicReader} from './public-reader.js';
import {SourceRegistry} from './registry.js';
const registry=new SourceRegistry(),sourceId='openmeteo.singlerun.ecmwf';
const record=(area,retrievedAt,sequence=1)=>({sourceId,retrievedAt,sequence,sha256:String(sequence),envelope:{time:{validTo:null},
  sourceUrl:registry.forecastSource(sourceId,{area,run:'2026-10-27T12:00'}).url}});
const health=(result)=>result.items.find(s=>s.sourceId===sourceId);

test('frescura filtrada corresponde al punto del piloto y no al último punto global',async()=>{
  const old='2026-10-27T10:00:00.000Z',recent='2026-10-27T12:59:00.000Z';
  const reader=new HazardPublicReader({now:()=>new Date('2026-10-27T13:00:00Z')});
  reader.records=async()=>[record('guayaquil',old),record('pallatanga',recent,2)];
  assert.deepEqual(health(await reader.read('health',{area:'guayaquil'})),{sourceId,status:'stale',lastRetrievedAt:old,coverageStatus:'limited'});
  assert.equal(health(await reader.read('health',{area:'0608'})).lastRetrievedAt,recent);
  assert.equal(health(await reader.read('health')).lastRetrievedAt,recent);
});

test('sin captura del punto solicitado o con URL no registrada el estado es unknown',async()=>{
  const reader=new HazardPublicReader({now:()=>new Date('2026-10-27T13:00:00Z')});
  reader.records=async()=>[record('pallatanga','2026-10-27T12:59:00.000Z')];
  assert.equal(health(await reader.read('health',{area:'guayaquil'})).status,'unknown');
  const invalid=record('guayaquil','2026-10-27T12:59:00.000Z');invalid.envelope.sourceUrl+='&latitude=0';
  reader.records=async()=>[invalid];
  assert.equal(health(await reader.read('health',{area:'guayaquil'})).lastRetrievedAt,null);
  assert.equal(health(await reader.read('health')).status,'unknown');
});

test('lector verifica último artefacto por punto, sin recorrer todas las corridas históricas',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-forecast-health-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'format.json'),'{}');
  const records=[record('guayaquil','2026-10-27T10:00:00.000Z',1),record('pallatanga','2026-10-27T11:00:00.000Z',2),record('guayaquil','2026-10-27T12:00:00.000Z',3)];
  const reader=new HazardPublicReader(),checked=[];
  reader.store={root,records:async()=>records,readRaw:async sha=>{checked.push(sha);}};
  await reader.loadRecords();assert.deepEqual(checked.sort(),['2','3']);
  reader.store.readRaw=async sha=>{if(sha==='2')throw new Error('artifact_corrupt');};
  await assert.rejects(()=>reader.loadRecords(),/artifact_corrupt/);
});

test('catálogo de cada piloto enlaza documentación del modelo, no la muestra de otro punto',async()=>{
  const reader=new HazardPublicReader();
  for(const area of ['guayaquil','pallatanga']) {
    const source=(await reader.read('sources',{area})).items.find(s=>s.sourceId===sourceId);
    assert.equal(source.sourceUrl,'https://open-meteo.com/en/docs/single-runs-api');
    assert.equal(new URL(source.sourceUrl).search,'');
  }
});
