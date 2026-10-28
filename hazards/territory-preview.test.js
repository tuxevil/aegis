import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {RawArtifactStore} from './artifact-store.js';import {LayerResearchService} from './layer-research.js';import {SngrLayerAcquirer} from './arcgis-acquirer.js';import {layerFixtures} from './fixtures/arcgis.js';import {TerritoryPreviewReader} from './territory-preview.js';
const run=promisify(execFile),sourceId='sngr.flood.layer';
async function setup(t,{count=3}={}) {
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-territory-preview-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
  const root=path.join(parent,'archive'),store=new RawArtifactStore(root,{origin:'synthetic_fixture',namespace:'layers'});
  const service=new LayerResearchService({store,acquirer:SngrLayerAcquirer.fromFixtures(layerFixtures({count}))});
  assert.equal((await service.collect(sourceId,'guayaquil',{fixture:true})).status,'partial');
  const readStore=new RawArtifactStore(root,{origin:'synthetic_fixture',namespace:'layers',readOnly:true});
  return {root,parent,store,service,readStore,reader:new TerritoryPreviewReader({store:readStore})};
}
test('proyección privada verificada conserva multipunto y procedencia, pagina sin editar archivo',async t=>{
  const {reader,store}=await setup(t),before=await store.verify();
  const first=await reader.read({sourceId,area:'0901',limit:2});
  assert.equal(first.features.length,2);assert.equal(first.pagination.total,3);assert.equal(first.pagination.hasMore,true);
  assert.equal(first.snapshot.snapshotAtomicity,'provider_edit_marker_unchanged');assert.equal(first.snapshot.targetCrs,4326);assert.equal(first.evidenceClass,'STATIC_EXPOSURE');assert.equal(first.notForPrediction,true);
  assert.equal(first.recordOrigin,'synthetic_fixture');assert.equal(first.publicationBlocked,true);assert.equal(first.boundaryVersion,null);
  assert.equal(first.features[0].properties.categoryRaw,'ALTA');assert.equal(first.features[0].geometry.type,'Polygon');
  assert.equal('raw' in first.features[0],false);assert.equal('artifactIds' in first.snapshot,false);
  const last=await reader.read({sourceId,area:'guayaquil',limit:2,offset:2});assert.deepEqual(last.features.map(f=>f.id),[3]);
  assert.equal(last.pagination.hasMore,false);assert.deepEqual(await store.verify(),before);
});
test('falta de colección no significa exposición cero y no mezcla pilotos ni orígenes',async t=>{
  const {reader,parent}=await setup(t);const result=await reader.read({sourceId,area:'pallatanga'});
  assert.equal(result.status,'unknown');assert.equal(result.snapshot,null);assert.equal(result.features.length,0);assert.equal(result.pagination.total,null);
  const root=path.join(parent,'absent'),r=new TerritoryPreviewReader({store:new RawArtifactStore(root,{namespace:'layers',readOnly:true})});
  await assert.rejects(()=>r.read({sourceId,area:'guayaquil'}));await assert.rejects(()=>fs.stat(root),{code:'ENOENT'});
});
test('presupuestos y parámetros fallan sin simplificar o truncar geometrías',async t=>{
  const {reader,readStore,store}=await setup(t);
  for(const options of [{sourceId:'inamhi.warning.pdf',area:'guayaquil'},{sourceId,area:'unknown'},{sourceId,area:'guayaquil',limit:51},{sourceId,area:'guayaquil',offset:-1}])await assert.rejects(()=>reader.read(options));
  assert.throws(()=>new TerritoryPreviewReader({store}),/configuration/);
  for(const options of [{maxPoints:4},{maxBytes:100}])await assert.rejects(()=>new TerritoryPreviewReader({store:readStore,...options}).read({sourceId,area:'guayaquil'}),/territory_preview_budget/);
});
test('artefacto corrupto no se convierte en geometría revisable',async t=>{
  const {reader,store}=await setup(t),record=(await store.records()).find(r=>r.envelope.details.captureRole==='features');
  await fs.writeFile(path.join(store.root,'raw',record.sha256),'corrupt');await assert.rejects(()=>reader.read({sourceId,area:'guayaquil'}),/artifact_corrupt/);
});
test('CLI offline exige archivo nuevo separado, permisos privados y no expone geometría en stdout',async t=>{
  const {root,parent,store}=await setup(t),output=path.join(parent,'preview.json'),args=['scripts/inspect-territory.mjs',`--data-dir=${root}`,`--source=${sourceId}`,'--area=guayaquil','--fixture'];
  const before=await store.verify(),result=await run(process.execPath,[...args,`--out=${output}`]);
  assert.equal(JSON.parse(result.stdout).featureCount,3);assert.doesNotMatch(result.stdout,/coordinates|geometry|storageKey/);
  assert.equal((await fs.stat(output)).mode&0o777,0o600);assert.equal(JSON.parse(await fs.readFile(output,'utf8')).features.length,3);
  await assert.rejects(()=>run(process.execPath,[...args,`--out=${output}`]));
  await assert.rejects(()=>run(process.execPath,[...args,`--out=${path.join(root,'forbidden.json')}`]));
  await assert.rejects(()=>fs.stat(path.join(root,'forbidden.json')),{code:'ENOENT'});
  const alias=path.join(parent,'archive-alias');await fs.symlink(root,alias);
  await assert.rejects(()=>run(process.execPath,[...args,`--out=${path.join(alias,'forbidden.json')}`]));
  await assert.rejects(()=>fs.stat(path.join(root,'forbidden.json')),{code:'ENOENT'});assert.deepEqual(await store.verify(),before);
});

test('checksum de colección no sustituye la comprobación de su vínculo con los artefactos',async t=>{
  const {reader,service,store}=await setup(t),snapshot=(await service.snapshots()).at(-1);
  const {checksum,...body}=snapshot;body.contentHash='0'.repeat(64);
  const altered={...body,checksum:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
  await fs.writeFile(path.join(store.root,'collections',snapshot.id+'.json'),JSON.stringify(altered));
  await assert.rejects(()=>reader.read({sourceId,area:'guayaquil'}),/invalid_territory_snapshot/);
});

test('colección completa vacía se distingue de archivo ausente sin inferir riesgo bajo',async t=>{
  const {reader}=await setup(t,{count:0});const result=await reader.read({sourceId,area:'guayaquil'});
  assert.equal(result.status,'partial');assert.equal(result.pagination.total,0);assert.ok(result.snapshot);
  assert.equal(result.notForPrediction,true);assert.equal(result.publicationBlocked,true);
});

test('paginación fija la colección y no mezcla una captura posterior',async t=>{
  const {reader,store,root,parent}=await setup(t);const first=await reader.read({sourceId,area:'guayaquil',limit:2});
  await new LayerResearchService({store,acquirer:SngrLayerAcquirer.fromFixtures(layerFixtures({count:4}))}).collect(sourceId,'guayaquil',{fixture:true});
  const old=await reader.read({sourceId,area:'guayaquil',limit:2,offset:2,snapshotId:first.snapshot.id});
  assert.equal(old.snapshot.id,first.snapshot.id);assert.equal(old.pagination.total,3);assert.deepEqual(old.features.map(f=>f.id),[3]);
  const fresh=await reader.read({sourceId,area:'guayaquil',limit:2,offset:2});assert.notEqual(fresh.snapshot.id,first.snapshot.id);assert.equal(fresh.pagination.total,4);
  const output=path.join(parent,'pinned.json');await run(process.execPath,['scripts/inspect-territory.mjs',`--data-dir=${root}`,`--source=${sourceId}`,'--area=guayaquil','--fixture',`--snapshot=${first.snapshot.id}`,`--out=${output}`]);assert.equal(JSON.parse(await fs.readFile(output,'utf8')).snapshot.id,first.snapshot.id);
  await assert.rejects(()=>reader.read({sourceId,area:'pallatanga',snapshotId:first.snapshot.id}),/territory_snapshot_not_found/);
  await assert.rejects(()=>reader.read({sourceId,area:'guayaquil',snapshotId:'../../private'}),/invalid_territory_request/);
});
