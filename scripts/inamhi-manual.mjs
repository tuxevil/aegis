import fs from 'node:fs/promises';
import path from 'node:path';
import {createManualInamhiRunner} from '../hazards/inamhi-bridge.js';
import {writeCheckpoint} from '../hazards/shadow-runner.js';
import {assessArchive} from '../hazards/assess.js';
const args=process.argv.slice(2);
if(!args.length)console.log(JSON.stringify({status:'not_authorized',networkStarted:false,dispatchMode:'DRY_RUN',note:'Requires separate owner/data/network approval. No default live configuration.'}));
else {
  let runner;
  try {
    if(args.length!==3||!args.includes('--execute-manual')||args.filter(a=>a.startsWith('--authorization-file=')).length!==1||args.filter(a=>a.startsWith('--root=')).length!==1)throw Error('invalid_arguments');
    const file=args.find(a=>a.startsWith('--authorization-file=')).slice(21),root=args.find(a=>a.startsWith('--root=')).slice(7);
    const stat=await fs.lstat(file);if(!root||!stat.isFile()||stat.isSymbolicLink()||stat.size>16000||(stat.mode&0o077))throw Error('private_approval_required');
    const authorization=JSON.parse(await fs.readFile(file,'utf8')),bridge=await createManualInamhiRunner({root,authorization});runner=bridge.runner;
    await runner.open();
    if(runner.state.totals.attempts>=1)throw Error('manual_authorization_already_consumed');
    const result=await runner.tick(),asOf=new Date().toISOString(),evaluations=[];
    if(result.totals.successes)for(const area of ['guayaquil','pallatanga'])evaluations.push(await assessArchive({store:bridge.store,area,asOf}));
    await writeCheckpoint(path.join(path.resolve(root),'manual-result.json'),{...result,asOf,evaluations,publicationBlocked:true});
    console.log(JSON.stringify({mode:result.mode,attempts:result.totals.attempts,successes:result.totals.successes,publicationBlocked:true,dispatchMode:'DRY_RUN'}));
    if(!result.totals.successes)process.exitCode=1;
  }catch{console.error('Manual INAMHI query refused or failed; inspect private authorization/storage. No automatic retry or publication.');process.exitCode=1;}
  finally{if(runner?.lock&&!runner.busy)await runner.close();}
}
