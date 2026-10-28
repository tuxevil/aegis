// Contributor recipe: generated MIT fixture only; no provider, credentials or DATA_DIR.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {InamhiPdfAdapter} from '../hazards/adapters.js';
import {IngestionService} from '../hazards/ingestion.js';
import {RawArtifactStore} from '../hazards/artifact-store.js';
import {validateEnvelope} from '../hazards/envelope.js';
import {syntheticBulletin} from '../hazards/fixtures/pdf.js';
import {safeMode} from '../hazards/registry.js';
export const exampleVersion='source-adapter-example-1';
// Minimal acquisition interface. A real proposal must use reviewed registry/HTTP
// boundaries; this source can only generate a Guayaquil-shaped synthetic fixture.
export class ExampleWarningSource {
  id='inamhi.warning.pdf';
  license=Object.freeze({status:'synthetic_fixture_only',spdx:'MIT'});
  sourceTermsUrl='https://github.com/tuxevil/aegis/blob/6349097/LICENSE';
  supports({area}={}) {return area==='guayaquil';}
  async fetch({area='guayaquil',signal,...extra}={}) {
    if(Object.keys(extra).length)throw new Error('unsupported_fixture_request');
    if(signal?.aborted)throw new Error('fixture_fetch_aborted');
    if(!this.supports({area}))throw new Error('fixture_area_not_supported');
    const bytes=syntheticBulletin();
    return {sourceId:this.id,recordOrigin:'synthetic_fixture',bytes,mediaType:'application/pdf',
      retrievedAt:'2026-10-27T18:00:00.000Z',sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  async health() {return {status:'unknown',recordOrigin:'synthetic_fixture',reason:'fixture_never_provider_health'};}
}
// Override normalize(), not transport or publication policy. Keep the envelope
// and original source metadata; add only declared parser/quality information.
export class ExampleInamhiAdapter extends InamhiPdfAdapter {
  async normalize(bytes,source,capture,raw) {
    const envelope=await super.normalize(bytes,source,capture,raw);
    envelope.quality.parserVersion='example-inamhi-1.0.0';
    envelope.quality.warnings.push('Generated synthetic example; not an official document');
    return envelope;
  }
}
export async function runSourceAdapterExample() {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-source-example-'));
  try {
    const store=new RawArtifactStore(directory,{origin:'synthetic_fixture'});let networkRequests=0;
    const sourceAdapter=new ExampleWarningSource(),sourceId=sourceAdapter.id;
    const fetched=await sourceAdapter.fetch({area:'guayaquil'}),fixture=fetched.bytes;
    const service=new IngestionService({store,networkEnabled:false,adapterOverrides:{[sourceId]:new ExampleInamhiAdapter()},
      http:{get:async()=>{networkRequests++;throw new Error('example_network_forbidden');}}});
    const input={mediaType:fetched.mediaType,retrievedAt:fetched.retrievedAt};
    const first=await service.importFixture(sourceId,fixture,input);
    await service.importFixture(sourceId,fixture,input);
    await service.reprocess(first.captureId);
    const reader=new RawArtifactStore(directory,{origin:'synthetic_fixture',readOnly:true});
    const verification=await reader.verify(),records=await reader.records(),envelope=validateEnvelope(records[0].envelope);
    assert.equal(fetched.sha256,records[0].sha256);assert.equal((await sourceAdapter.health()).status,'unknown');
    assert.equal(networkRequests,0);assert.deepEqual(verification,{captures:3,artifacts:1});
    assert.ok(records.every(r=>r.envelope.recordOrigin==='synthetic_fixture'&&r.revision===1&&r.envelope.quality.dataStatus==='unknown'));
    assert.ok(envelope.quality.blockers.includes('synthetic_fixture_never_publish'));
    assert.equal(envelope.raw.sha256,null);assert.equal(envelope.retrievedAt,null);
    assert.equal(envelope.details.bulletinNumber,83);assert.equal(envelope.time.issuedAt,'2026-10-25T19:00:00.000Z');
    return {exampleVersion,...safeMode,recordOrigin:'synthetic_fixture',fixtureLicense:sourceAdapter.license.spdx,fixtureTermsUrl:sourceAdapter.sourceTermsUrl,providerBytes:false,networkRequests,
      verification,sourceId,rawFixtureSha256:records[0].sha256,sourceRevisions:[...new Set(records.map(r=>r.revision))],
      normalized:{kind:envelope.kind,parserVersion:envelope.quality.parserVersion,dataStatus:envelope.quality.dataStatus,
        bulletinNumber:envelope.details.bulletinNumber,issuedAt:envelope.time.issuedAt,validFrom:envelope.time.validFrom,validTo:envelope.time.validTo,
        sourcePrecision:envelope.spatial.precision,sourceLicenseStatus:envelope.licensing.status,blockers:envelope.quality.blockers},
      notice:'Synthetic scenario dates, not historical availability. No official bulletin, publication or delivery. Temporary archive removed.'};
  } finally {await fs.rm(directory,{recursive:true,force:true});}
}
export async function main(args=process.argv.slice(2)) {
  if(!args.length){console.log(JSON.stringify({...safeMode,exampleVersion,note:'No network or writes. Use --run for a generated synthetic example in an automatically removed temporary archive.'}));return;}
  if(args.length!==1||args[0]!=='--run')throw new Error('invalid_example_arguments');
  console.log(JSON.stringify(await runSourceAdapterExample(),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error('Offline contributor example failed. No provider contacted or publication attempted.');process.exitCode=1;});
