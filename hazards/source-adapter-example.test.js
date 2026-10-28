import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {runSourceAdapterExample,ExampleInamhiAdapter,ExampleWarningSource} from '../scripts/example-source-adapter.mjs';
import {RawArtifactStore} from './artifact-store.js';import {IngestionService} from './ingestion.js';import {syntheticBulletin} from './fixtures/pdf.js';
const run=promisify(execFile);
test('receta autocontenida reproduce hash, fechas, revisión y verificación sin red',async()=>{
  const first=await runSourceAdapterExample(),again=await runSourceAdapterExample();assert.deepEqual(first,again);
  const expected=JSON.parse(await fs.readFile(new URL("../docs/contracts/examples/source-adapter.receipt.v1.json",import.meta.url),"utf8"));assert.deepEqual(first,expected);
  assert.deepEqual(first.verification,{captures:3,artifacts:1});assert.equal(first.recordOrigin,'synthetic_fixture');assert.equal(first.networkRequests,0);
  assert.equal(first.providerBytes,false);assert.equal(first.alertsPublishEnabled,false);assert.equal(first.dispatchMode,'DRY_RUN');assert.deepEqual(first.sourceRevisions,[1]);
  assert.equal(first.normalized.dataStatus,'unknown');assert.equal(first.normalized.sourcePrecision,'province');assert.equal(first.normalized.sourceLicenseStatus,'pending');
});
test('CLI ignora DATA_DIR, no altera datos existentes y rechaza opciones de red',async t=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-example-cli-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
  const marker=path.join(parent,'observations.json');await fs.writeFile(marker,'existing synthetic test history');
  const options={env:{DATA_DIR:parent}},script='scripts/example-source-adapter.mjs';
  const result=await run(process.execPath,[script,'--run'],options);assert.equal(JSON.parse(result.stdout).verification.captures,3);
  assert.equal(await fs.readFile(marker,'utf8'),'existing synthetic test history');assert.deepEqual(await fs.readdir(parent),['observations.json']);
  await assert.rejects(()=>run(process.execPath,[script,'--live'],options));
  const help=JSON.parse((await run(process.execPath,[script],options)).stdout);assert.match(help.note,/No network or writes/);
});
test('adaptador contribuyente sigue sujeto al contrato antes de guardar bytes',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-example-invalid-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  class InvalidAdapter extends ExampleInamhiAdapter {async normalize(...args){const envelope=await super.normalize(...args);envelope.details.undeclared='synthetic-invalid-field';return envelope;}}
  const store=new RawArtifactStore(root,{origin:'synthetic_fixture'}),service=new IngestionService({store,adapterOverrides:{'inamhi.warning.pdf':new InvalidAdapter()}});
  await assert.rejects(()=>service.importFixture('inamhi.warning.pdf',syntheticBulletin(),{mediaType:'application/pdf',retrievedAt:'2026-10-27T18:00:00Z'}),/invalid_source_envelope/);
  assert.equal((await store.records()).length,0);assert.equal((await fs.readdir(path.join(store.root,'raw'))).length,0);
});

test('fuente de ejemplo declara licencia propia, alcance y estado desconocido sin simular salud real',async()=>{
  const source=new ExampleWarningSource();assert.equal(source.license.spdx,'MIT');assert.equal(source.supports({area:'guayaquil'}),true);
  assert.equal(source.supports({area:'pallatanga'}),false);await assert.rejects(()=>source.fetch({area:'pallatanga'}),/fixture_area_not_supported/);
  await assert.rejects(()=>source.fetch({signal:AbortSignal.abort()}),/fixture_fetch_aborted/);
  await assert.rejects(()=>source.fetch({since:'2026-10-27T18:00:00Z'}),/unsupported_fixture_request/);
  assert.equal((await source.health()).status,'unknown');assert.equal((await source.fetch()).recordOrigin,'synthetic_fixture');
});
