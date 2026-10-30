import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {RawArtifactStore} from './artifact-store.js';
import {IngestionService} from './ingestion.js';
import {syntheticBulletin} from './fixtures/pdf.js';
import {assessArchive,assessHazard} from './assess.js';
import {months} from './inamhi-dates.js';
import {validateTerritorialInput} from './territorial-evidence.js';
import {createDataBackup,verifyDataBackup,restoreDataBackup} from '../backup.js';
async function setup(t,areaText='LEYENDA: Guayas') {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-territorial-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const dir=path.join(root,'data'),store=new RawArtifactStore(dir),service=new IngestionService({store,http:{get:()=>{throw Error('NETWORK_FORBIDDEN');}}});
 const now=new Date(),issued=new Date(now.getTime()-86400000),end=new Date(now.getTime()+86400000);
 const dateText=d=>`${d.getUTCDate()} de ${months[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
 await service.capture(service.registry.get('inamhi.warning.pdf'),{bytes:syntheticBulletin({day:String(issued.getUTCDate()),month:months[issued.getUTCMonth()],year:String(issued.getUTCFullYear()),issueHour:'15',number:900,areaText,validityText:`desde 00H00 del ${dateText(issued)} hasta las 23H00 del ${dateText(end)}`}),mediaType:'application/pdf',retrievedAt:now.toISOString()});
 const capture=(await store.records())[0];
 const input={captureId:capture.id,sha256:capture.sha256,bulletinNumber:900,parserVersion:capture.envelope.quality.parserVersion,evidenceType:'unknown_coverage',location:{page:1,region:'lower affected section'},fragmentRef:'synthetic:section-1',territory:{name:'Guayas',resolution:'province',extent:'unknown'},officialClassification:null,method:'human_annotation',reviewerId:'reviewer-a',interpretedAt:capture.processedAt,limitations:['SYNTHETIC TEST; not an official interpretation'],verification:'ambiguous',supersedes:null,cartography:null};
 return {root,dir,store,capture,input};
}
const evaluate=(store,asOf=new Date().toISOString(),area='guayaquil')=>assessArchive({store,asOf,area});
for(const [name,text,count] of [
 ['legend only','LEYENDA: Guayas',0],['descriptive context','DESCRIPCION: lluvia cerca de Guayas',0],
 ['explicit affected list','ZONAS AFECTADAS: Guayas, Loja.',1],
 ['qualified partial list','ZONAS AFECTADAS: oeste de Guayas, interior de Los Ríos',0],
 ['similar province names','ZONAS AFECTADAS: Guayasotros, Los RíosX',0],
 ['territory absent','ZONAS AFECTADAS: Esmeraldas',0],
])test(name,async t=>{
 const {store}=await setup(t,text);const result=await evaluate(store);assert.equal(result.candidates.length,count);
 assert.equal(result.dispatchMode,'DRY_RUN');assert.equal(result.publicationBlocked,true);
 if(count){assert.equal(result.candidates[0].scope.precision,'province');assert.equal(result.candidates[0].scope.name,'Guayas');assert.equal(result.candidates[0].scope.evidence.method,'automatic');}
 assert.equal((await evaluate(store,undefined,'pallatanga')).status,'unknown');
});

test('manual annotation is not validation; valid review keeps provincial precision and effective knowledge time',async t=>{
 const {store,input,capture,dir,root}=await setup(t);const original=await fs.readFile(path.join(store.root,'captures',capture.id+'.json'));
 const before=await evaluate(store,capture.processedAt);
 const note=await store.appendTerritorialReview(input);assert.equal((await evaluate(store,note.recordedAt)).candidates.length,0);
 const accepted=await store.appendTerritorialReview({...input,method:'validated_review',reviewerId:'reviewer-b',supersedes:note.id,verification:'verified',evidenceType:'explicit_text_coverage',territory:{...input.territory,extent:'whole'},interpretedAt:new Date().toISOString()});
 assert.deepEqual(await evaluate(store,capture.processedAt),before);
 const after=await evaluate(store,accepted.recordedAt);assert.equal(after.candidates.length,1);
 const candidate=after.candidates[0];assert.equal(candidate.scope.precision,'province');assert.equal(candidate.scope.evidence.reviewId,accepted.id);assert.equal(candidate.scope.evidence.method,'validated_review');assert.equal(candidate.publicationBlocked,true);
 assert.equal(candidate.scope.evidence.officialClassification,null);assert.equal(candidate.sourceRiskLevel,'MEDIO - MUY ALTO');
 assert.deepEqual(await fs.readFile(path.join(store.root,'captures',capture.id+'.json')),original);
 assert.deepEqual(await store.verify(),{captures:1,artifacts:1});
 await createDataBackup({sourceDir:dir,snapshotDir:path.join(root,'backup'),quiesced:true});await verifyDataBackup({snapshotDir:path.join(root,'backup')});await restoreDataBackup({snapshotDir:path.join(root,'backup'),destinationDir:path.join(root,'restored')});
 const restored=new RawArtifactStore(path.join(root,'restored'),{readOnly:true});assert.deepEqual(await restored.territorialReviews(),await store.territorialReviews());assert.deepEqual(await evaluate(restored,accepted.recordedAt),after);
 const rejection=await store.appendTerritorialReview({...input,method:'validated_review',reviewerId:'reviewer-c',supersedes:accepted.id,verification:'rejected',interpretedAt:new Date().toISOString()});
 assert.equal((await evaluate(store,rejection.recordedAt)).candidates.length,0);assert.equal((await store.territorialReviews()).length,3);
 assert.deepEqual(await evaluate(store,accepted.recordedAt),after);
});

test('contradictory branches fail closed and retain both interpretations',async t=>{
 const {store,input}=await setup(t);const note=await store.appendTerritorialReview(input);
 await store.appendTerritorialReview({...input,method:'validated_review',reviewerId:'reviewer-b',supersedes:note.id,verification:'verified',evidenceType:'explicit_text_coverage',territory:{...input.territory,extent:'whole'},interpretedAt:new Date().toISOString()});
 const reject=await store.appendTerritorialReview({...input,reviewerId:'reviewer-c',supersedes:note.id,verification:'rejected',interpretedAt:new Date().toISOString()});
 const result=await evaluate(store,reject.recordedAt);assert.equal(result.candidates.length,0);assert.equal(result.excluded.at(-1).reason,'territorial_reviews_conflict');
});

test('a map without verified legend or georeferencing cannot grant coverage',async t=>{
 const {store,input}=await setup(t);const note=await store.appendTerritorialReview(input);
 const map={...input,method:'validated_review',reviewerId:'reviewer-b',supersedes:note.id,verification:'verified',evidenceType:'verified_map_coverage',territory:{...input.territory,extent:'whole'},cartography:{legendVerified:false,georeferenced:true,crs:'SYNTHETIC:TEST',boundaryVersion:'synthetic-1',geometryRef:'synthetic:geometry'}};
 await assert.rejects(store.appendTerritorialReview(map),/cartography_unverified/);
 await assert.rejects(store.appendTerritorialReview({...map,cartography:{...map.cartography,legendVerified:true,georeferenced:false}}),/cartography_unverified/);
 const accepted=await store.appendTerritorialReview({...map,cartography:{...map.cartography,legendVerified:true}});
 assert.equal((await evaluate(store,accepted.recordedAt)).candidates[0].scope.evidence.evidenceType,'verified_map_coverage');
});

test('partial coverage never extends to entire province/canton; no self-validation',async t=>{
 const {store,input}=await setup(t);const note=await store.appendTerritorialReview({...input,evidenceType:'partial_coverage',territory:{...input.territory,extent:'partial'}});
 await assert.rejects(store.appendTerritorialReview({...input,method:'validated_review',reviewerId:'reviewer-a',supersedes:note.id,verification:'verified',evidenceType:'explicit_text_coverage',territory:{...input.territory,extent:'whole'}}),/independent_territorial_review_required/);
 const partial=await store.appendTerritorialReview({...input,supersedes:note.id,evidenceType:'partial_coverage',territory:{...input.territory,extent:'partial'}});
 assert.equal((await evaluate(store,partial.recordedAt)).candidates.length,0);
 await assert.rejects(store.appendTerritorialReview({...input,method:'validated_review',reviewerId:'reviewer-b',supersedes:partial.id,verification:'verified',evidenceType:'partial_coverage',territory:{...input.territory,extent:'partial'}}),/coverage_not_verified/);
});

test('incomplete evidence, wrong hash/version, future time and mutation are rejected',async t=>{
 const {store,input}=await setup(t),records=await store.records();
 for(const patch of [{location:{}},{sha256:'0'.repeat(64)},{parserVersion:'invented'},{verification:'verified'},{publicationBlocked:false}])assert.throws(()=>validateTerritorialInput({...input,...patch},records));
 await assert.rejects(store.appendTerritorialReview({...input,interpretedAt:'2099-01-01T00:00:00Z'}),/invalid_territorial_history/);
 const note=await store.appendTerritorialReview(input);const file=path.join(store.root,'territorial-reviews',note.id+'.json');const changed={...note,sha256:'0'.repeat(64)};await fs.writeFile(file,JSON.stringify(changed));
 await assert.rejects(store.verify(),/provenance_mismatch/);
});

test('read-only legacy archive needs no annotation directory; plain spatial mentions cannot grant scope',async t=>{
 const {dir,store}=await setup(t);assert.deepEqual(await new RawArtifactStore(dir,{readOnly:true}).territorialReviews(),[]);
 const records=await store.records();records[0].envelope.spatial={precision:'province',areaNames:['Guayas'],geometryRef:null,crs:null};
 const result=assessHazard({records,asOf:records[0].processedAt,area:'guayaquil'});assert.equal(result.candidates.length,0);
});

test('a new territorial review never refreshes capture age and still explains scope',async t=>{
 const {store,input,capture}=await setup(t);const note=await store.appendTerritorialReview(input);
 const asOf=new Date(Date.parse(capture.retrievedAt)+3600001).toISOString();
 const result=await evaluate(store,asOf);assert.equal(result.candidates.length,0);
 assert.equal(result.excluded.at(-1).reason,'capture_stale_at_cutoff');
 assert.equal(result.excluded.at(-1).territorialEvidence.reason,'territorial_review_unverified');
 assert.deepEqual(result.excluded.at(-1).territorialEvidence.reviewIds,[note.id]);
});

test('offline CLI appends a bounded note; caller cannot change safety fields',async t=>{
 const {spawnSync}=await import('node:child_process');const {dir,store,input,root}=await setup(t);
 const file=path.join(root,'annotation.json');await fs.writeFile(file,JSON.stringify(input),{mode:0o600});
 const result=spawnSync(process.execPath,['scripts/territorial-review.mjs','--data-dir='+dir,'--annotation='+file],{encoding:'utf8',env:{...process.env,ALERTS_PUBLISH_ENABLED:'true'}});
 assert.equal(result.status,0,result.stderr);const value=JSON.parse(result.stdout);assert.equal(value.dispatchMode,'DRY_RUN');assert.equal(value.publicationBlocked,true);
 const [note]=await store.territorialReviews();assert.equal(note.alertsPublishEnabled,false);
 await fs.writeFile(file,JSON.stringify({...input,dispatchMode:'LIVE'}));
 const refused=spawnSync(process.execPath,['scripts/territorial-review.mjs','--data-dir='+dir,'--annotation='+file],{encoding:'utf8'});
 assert.equal(refused.status,1);assert.equal((await store.territorialReviews()).length,1);
});

test('consistent unverified graphic/text notes remain unknown and exact names prevent false matching',async t=>{
 const {store,input}=await setup(t);
 await store.appendTerritorialReview(input);
 const related=await store.appendTerritorialReview({...input,method:'automatic',reviewerId:null,evidenceType:'mention',territory:{name:'Guayaquil',resolution:'canton',extent:'unknown'},verification:'unverified',fragmentRef:'synthetic:map-label'});
 const result=await evaluate(store,related.recordedAt);assert.equal(result.candidates.length,0);assert.equal(result.excluded.at(-1).reason,'territorial_review_unverified');assert.equal(result.excluded.at(-1).territorialEvidence.reviewIds.length,2);
});

test('annotation remains bound to capture lineage and cannot spill into similar names',async t=>{
 const {store,input,capture}=await setup(t);
 const note=await store.appendTerritorialReview(input);const accepted=await store.appendTerritorialReview({...input,method:'validated_review',reviewerId:'reviewer-b',supersedes:note.id,verification:'verified',evidenceType:'explicit_text_coverage',territory:{...input.territory,extent:'whole'}});
 const records=await store.records(),reviews=await store.territorialReviews();
 const duplicate={...structuredClone(capture),id:'unrelated-capture',sequence:2};
 const result=assessHazard({records:[...records,duplicate],territorialReviews:reviews,area:'guayaquil',asOf:accepted.recordedAt});assert.equal(result.candidates.length,0);
 assert.equal(result.excluded.at(-1).reason,'territory_not_supported');
 const incorrect={...input,territory:{name:'Guayasotros',resolution:'province',extent:'unknown'}};await store.appendTerritorialReview(incorrect);
 assert.equal((await evaluate(store)).candidates.length,1); // unrelated note cannot override Guayas
});
