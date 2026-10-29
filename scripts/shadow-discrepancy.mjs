import fs from 'node:fs/promises';
import {appendDiscrepancy} from '../hazards/discrepancies.js';
const args=process.argv.slice(2);
if(!args.length)console.log('Private manual review only: --root=PRIVATE_DIR --file=NOTE.json. No fetch, publication or metric labels.');
else {
  try {
    if(args.length!==2||args.filter(a=>a.startsWith('--root=')).length!==1||args.filter(a=>a.startsWith('--file=')).length!==1)throw Error();
    const file=args.find(a=>a.startsWith('--file=')).slice(7);
    if((await fs.stat(file)).size>16000)throw Error();
    const record=await appendDiscrepancy(args.find(a=>a.startsWith('--root=')).slice(7),JSON.parse(await fs.readFile(file,'utf8')));
    console.log(JSON.stringify({id:record.id,kind:record.kind,recordOrigin:record.recordOrigin,publicationBlocked:true}));
  }catch{console.error('Private discrepancy refused: validate contract, provenance and storage. No external operation.');process.exitCode=1;}
}
