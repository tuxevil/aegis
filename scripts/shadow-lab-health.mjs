import path from 'node:path';
import fs from 'node:fs/promises';
import {readCheckpoint} from '../hazards/shadow-runner.js';
const args=process.argv.slice(2);
try {
  if(args.length!==1||!args[0].startsWith('--root=')||!args[0].slice(7))throw Error();
  const root=path.resolve(args[0].slice(7)),state=await readCheckpoint(path.join(root,'state.json'));
  const age=Date.now()-state.heartbeatAt;
  if(state.mode!=='synthetic_fixture'||state.stoppedReason||typeof state.heartbeatAt!=='number'||age<0||age>150000)throw Error();
  await fs.access(path.join(root,'runner.lock'));
  console.log(JSON.stringify({status:'process_heartbeat_only',mode:'synthetic_fixture',publicationBlocked:true}));
}catch{console.error('Shadow heartbeat missing, stale, stopped or incompatible; not a risk status.');process.exitCode=1;}
