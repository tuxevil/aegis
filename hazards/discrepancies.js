import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {SourceRegistry,safeMode} from './registry.js';
import {createImmutableFile} from './immutable-file.js';
import {utcMillis} from './time.js';
export const discrepancyKinds=Object.freeze(['official_warning_missed','unsupported_candidate','severity_difference','wrong_location',
  'delayed_source','revised_document','interpretation_error','evaluation_changed']);
const fields=['kind','recordOrigin','areaId','sourceId','evaluationRef','artifactHashes','officialReferences','decisionAt','reviewedAt','reviewer','note'];
export function validateDiscrepancy(value) {
  if(!value||Object.keys(value).some(k=>!fields.includes(k))||!discrepancyKinds.includes(value.kind)||
    !['synthetic_fixture','captured_source','documented_reference'].includes(value.recordOrigin)||!['guayaquil','pallatanga'].includes(value.areaId)||
    !/^[a-z0-9-]{1,128}$/.test(value.evaluationRef)||!Array.isArray(value.artifactHashes)||value.artifactHashes.length>16||
    value.artifactHashes.some(h=>!/^[a-f0-9]{64}$/.test(h))||!Array.isArray(value.officialReferences)||value.officialReferences.length>5||
    !Number.isFinite(utcMillis(value.decisionAt))||!Number.isFinite(utcMillis(value.reviewedAt))||utcMillis(value.reviewedAt)<utcMillis(value.decisionAt)||
    typeof value.reviewer!=='string'||!/^[a-zA-Z0-9._-]{2,80}$/.test(value.reviewer)||typeof value.note!=='string'||value.note.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.note))throw Error('invalid_discrepancy');
  new SourceRegistry().get(value.sourceId);
  for(const ref of value.officialReferences) {
    let u;try{u=new URL(ref);}catch{throw Error('invalid_discrepancy_reference');}
    if(typeof ref!=='string'||ref.length>1000||u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('invalid_discrepancy_reference');
  }
  if(value.recordOrigin!=='synthetic_fixture'&&!value.officialReferences.length)throw Error('discrepancy_provenance_required');
  return structuredClone(value);
}
// Private review notes, not classifier labels or publication approvals. Never
// fetch references. An append-only correction references the prior entry ID.
export async function appendDiscrepancy(root,input) {
  const value=validateDiscrepancy(input),directory=path.join(path.resolve(root),'discrepancies',value.recordOrigin);
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const stat=await fs.lstat(directory);if(stat.isSymbolicLink()||!stat.isDirectory()||(stat.mode&0o077))throw Error('private_discrepancy_directory_required');
  const lockFile=path.join(directory,'writer.lock'),lock=await fs.open(lockFile,'wx',0o600);
  try {
    const names=(await fs.readdir(directory)).filter(n=>n.endsWith('.json'));
    if(names.length>=1000)throw Error('discrepancy_capacity');
    const id=randomUUID(),record={version:1,id,...value,recordedAt:new Date().toISOString(),
      verification:'manual_note_not_ground_truth',publicationBlocked:true,...safeMode};
    await createImmutableFile(path.join(directory,id+'.json'),JSON.stringify(record));return record;
  }finally{await lock.close();await fs.unlink(lockFile);}
}
