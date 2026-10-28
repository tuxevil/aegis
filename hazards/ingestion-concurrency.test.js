import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createDataBackup} from '../backup.js';
import {IngestionService} from './ingestion.js';import {RawArtifactStore} from './artifact-store.js';import {syntheticBulletin} from './fixtures/pdf.js';
async function root(t){const value=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-ingestion-lease-'));t.after(()=>fs.rm(value,{recursive:true,force:true}));return value;}
const now=()=>new Date('2026-10-27T18:00:00Z');
const service=(directory,http)=>new IngestionService({store:new RawArtifactStore(directory),http,now,networkEnabled:true,allowPendingLicense:true});
const capture=()=>({bytes:syntheticBulletin(),mediaType:'application/pdf',retrievedAt:now().toISOString()});
test('dos instancias no descargan el mismo host simultáneamente y tras captura rige cooldown',async t=>{
  const directory=await root(t);let release,entered;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);let calls=0;
  const first=service(directory,{get:async()=>{calls++;entered();await wait;return capture();}});
  const second=service(directory,{get:async()=>{calls++;return capture();}});
  const running=first.ingest('inamhi.warning.pdf');t.after(async()=>{release();await running;});await ready;
  const blocked=await second.ingest('inamhi.warning.pdf');assert.equal(blocked.errorCode,'source_busy');assert.equal(calls,1);
  assert.equal((await first.store.records('failures')).length,0);
  const backupDir=directory+'-backup';t.after(()=>fs.rm(backupDir,{recursive:true,force:true}));
  await assert.rejects(()=>createDataBackup({sourceDir:directory,snapshotDir:backupDir,quiesced:true}),/backup_writer_not_quiescent/);
  release();assert.equal((await running).status,'partial');
  assert.equal((await second.ingest('inamhi.warning.pdf')).errorCode,'source_cooldown');assert.equal(calls,1);
  assert.equal((await fs.readdir(first.store.root)).some(n=>n.endsWith('.lock')),false);
});
test('perfiles distintos de Open-Meteo comparten exclusión por host',async t=>{
  const directory=await root(t);let release,entered;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);let calls=0;
  const first=service(directory,{get:async()=>{calls++;entered();await wait;throw new Error('http_503');}}),second=service(directory,{get:async()=>assert.fail('duplicate host request')});
  const running=first.ingest('openmeteo.singlerun.test');t.after(async()=>{release();await running;});await ready;
  assert.equal((await second.ingest('openmeteo.singlerun.ecmwf')).errorCode,'source_busy');assert.equal(calls,1);
  release();assert.equal((await running).errorCode,'http_503');assert.equal((await first.store.records('failures')).length,1);
  assert.equal((await fs.readdir(first.store.root)).some(n=>n.endsWith('.lock')),false);
});
test('otro proveedor puede completar su consulta mientras uno está ocupado',async t=>{
  const directory=await root(t);let release,entered;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
  const first=service(directory,{get:async()=>{entered();await wait;return capture();}});
  const running=first.ingest('inamhi.warning.pdf');t.after(async()=>{release();await running;});await ready;
  const other=service(directory,{get:async()=>({bytes:Buffer.from(JSON.stringify({features:[{attributes:{FID:1,sui:'ALTA',dpa_canton:'0901'}}]})),mediaType:'application/json',retrievedAt:now().toISOString()})});
  assert.equal((await other.ingest('sngr.flood.single')).status,'partial');release();assert.equal((await running).status,'partial');
  assert.equal((await first.store.records()).length,2);
});
test('exclusión no se borra por antigüedad y readOnly no inicia archivo ni red',async t=>{
  const directory=await root(t),s=service(directory,{get:async()=>assert.fail('unexpected network')});
  await s.store.initialize();const {createHash}=await import('node:crypto'),hostHash=createHash('sha256').update('www.inamhi.gob.ec').digest('hex');
  const file=path.join(s.store.root,'ingestion-'+hostHash+'.lock');await fs.writeFile(file,'operator investigation required',{mode:0o600});
  assert.equal((await s.ingest('inamhi.warning.pdf')).errorCode,'source_busy');assert.equal(await fs.readFile(file,'utf8'),'operator investigation required');
  const missing=path.join(directory,'absent'),ro=new IngestionService({store:new RawArtifactStore(missing,{readOnly:true}),networkEnabled:true,allowPendingLicense:true,http:{get:async()=>assert.fail('unexpected network')}});
  await assert.rejects(()=>ro.ingest('inamhi.warning.pdf'),/read_only_store/);await assert.rejects(()=>fs.stat(missing),{code:'ENOENT'});
});

test('proceso separado mantiene la exclusión hasta terminar petición y registro de fallo',{timeout:10000},async t=>{
  const {spawn}=await import('node:child_process'),{once}=await import('node:events');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-ingestion-process-'));
  const script=`import {IngestionService} from './hazards/ingestion.js';import {RawArtifactStore} from './hazards/artifact-store.js';
    try {const service=new IngestionService({store:new RawArtifactStore(process.argv[1]),networkEnabled:true,allowPendingLicense:true,
      http:{get:async()=>{process.send({type:'fetch-started'});await new Promise(resolve=>process.once('message',resolve));throw new Error('http_503');}}});
      const result=await service.ingest('inamhi.warning.pdf');process.send({type:'done',errorCode:result.errorCode});process.disconnect();}
    catch {process.send({type:'failed'});process.disconnect();process.exitCode=1;}`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,directory],{stdio:['ignore','ignore','ignore','ipc']});
  const exit=once(child,'exit');t.after(async()=>{if(child.exitCode===null)child.kill('SIGTERM');await exit;await fs.rm(directory,{recursive:true,force:true});});
  const [ready]=await once(child,'message');assert.equal(ready.type,'fetch-started');
  const second=service(directory,{get:async()=>assert.fail('duplicate subprocess request')});
  assert.equal((await second.ingest('inamhi.warning.pdf')).errorCode,'source_busy');
  const done=once(child,'message');child.send('release');assert.deepEqual((await done)[0],{type:'done',errorCode:'http_503'});
  await exit;assert.equal(child.exitCode,0);assert.equal((await second.store.records('failures')).length,1);
  assert.equal((await fs.readdir(second.store.root)).some(n=>n.endsWith('.lock')),false);
});

test('archivo sin capacidad para registrar capturas o fallos no inicia una descarga',async t=>{
  for(const full of ['captures','failures']) {
    const directory=await root(t),store=new RawArtifactStore(directory,{maxCaptures:1});
    const first=new IngestionService({store,now,networkEnabled:true,allowPendingLicense:true,http:{get:async()=>capture()}});
    if(full==='captures')await first.ingest('inamhi.warning.pdf');
    else await store.failure({sourceId:'sngr.flood.single',at:now().toISOString(),code:'http_503'});
    const blocked=new IngestionService({store,now:()=>new Date('2026-10-27T19:00:00Z'),networkEnabled:true,allowPendingLicense:true,http:{get:async()=>assert.fail('archive cannot record result')}});
    assert.equal((await blocked.ingest('inamhi.warning.pdf')).errorCode,'store_capacity_exceeded');
    assert.equal((await fs.readdir(store.root)).some(n=>n.endsWith('.lock')),false);
  }
});
