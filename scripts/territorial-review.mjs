// Offline, private append-only annotations; no HTTP or publication import.
import fs from 'node:fs/promises';
import {RawArtifactStore} from '../hazards/artifact-store.js';
const args=process.argv.slice(2);
try {
 if(args.length!==2||!args[0].startsWith('--data-dir=')||!args[1].startsWith('--annotation='))throw Error('arguments_required');
 const file=args[1].slice(13),stat=await fs.lstat(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)throw Error('invalid_annotation');
 const store=new RawArtifactStore(args[0].slice(11));
 const result=await store.appendTerritorialReview(JSON.parse(await fs.readFile(file,'utf8')));
 console.log(JSON.stringify({id:result.id,sequence:result.sequence,verification:result.verification,publicationBlocked:true,dispatchMode:'DRY_RUN'}));
} catch {console.error('Territorial annotation refused; original history preserved.');process.exitCode=1;}
