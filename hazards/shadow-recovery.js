import fs from 'node:fs/promises';
import path from 'node:path';
import {readCheckpoint} from './shadow-runner.js';
import {RawArtifactStore} from './artifact-store.js';
import {utcMillis} from './time.js';
export async function verifyShadowLab(root) {
  root=path.resolve(root);
  const stat=await fs.lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('invalid_shadow_root');
  try{await fs.lstat(path.join(root,'runner.lock'));throw Error('shadow_not_quiescent');}catch(e){if(e.code!=='ENOENT')throw e;}
  const state=await readCheckpoint(path.join(root,'state.json'));
  if(state.version!==1||state.mode!=='synthetic_fixture')throw Error('invalid_shadow_state');
  const report=await readCheckpoint(path.join(root,'report.json'));
  if(report.mode!=='synthetic_fixture'||report.publicationBlocked!==true||report.dispatchMode!=='DRY_RUN'||report.alertsPublishEnabled!==false)throw Error('invalid_shadow_report');
  let records=[];
  const store=new RawArtifactStore(path.join(root,'archive'),{origin:'synthetic_fixture',readOnly:true,maxCaptures:1000,maxBytes:32*1024*1024});
  try{await fs.access(store.root);await store.verify();records=await store.records();}
  catch(e){if(e.code!=='ENOENT'||state.totals.successes)throw e;}
  let names=[];try{names=await fs.readdir(path.join(root,'evaluations'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(names.length>1000||names.some(n=>!/^[a-f0-9-]{36}\.json$/.test(n)))throw Error('invalid_shadow_evaluations');
  const seen=new Set();
  for(const name of names) {
    const file=path.join(root,'evaluations',name),st=await fs.lstat(file);
    if(!st.isFile()||st.isSymbolicLink()||st.size>1_000_000)throw Error('invalid_shadow_evaluation');
    const e=JSON.parse(await fs.readFile(file,'utf8')),record=records.find(r=>r.id===e.captureId);
    if(!record||seen.has(e.captureId)||e.artifactSha256!==record.sha256||e.sourceVersion!==record.revision||
      e.recordOrigin!=='synthetic_fixture'||e.publicationBlocked!==true||e.alertsPublishEnabled!==false||e.dispatchMode!=='DRY_RUN'||
      !Number.isFinite(utcMillis(e.actualEvaluatedAt))||utcMillis(e.actualEvaluatedAt)<utcMillis(record.processedAt)||
      !Array.isArray(e.results)||e.results.length!==2||e.results.some(r=>r.publicationBlocked!==true||r.recordOrigin!=='synthetic_fixture'))throw Error('invalid_shadow_evaluation');
    seen.add(e.captureId);
  }
  const daily=await fs.readdir(path.join(root,'daily'));
  if(daily.length>16||daily.some(n=>!/^\d{4}-\d{2}-\d{2}\.json$/.test(n)))throw Error('invalid_shadow_daily');
  for(const file of daily)await readCheckpoint(path.join(root,'daily',file));
  return {status:'verified_offline_shadow',captures:records.length,artifacts:new Set(records.map(r=>r.sha256)).size,
    evaluations:seen.size,capturesWithoutEvaluation:records.filter(r=>!seen.has(r.id)).map(r=>r.id),
    powerWatts:null,energyWh:null,publicationBlocked:true};
}
