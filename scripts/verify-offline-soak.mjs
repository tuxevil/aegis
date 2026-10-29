// Development Docker experiment, never Proxmox. Fixed offline limits; no ports.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as sleep} from 'node:timers/promises';
import {readCheckpoint} from '../hazards/shadow-runner.js';
import {verifyShadowLab} from '../hazards/shadow-recovery.js';
import {createStagingBackup,restoreStagingBackup} from '../staging-backup.js';
const exec=promisify(execFile),args=process.argv.slice(2);
if(args.length!==1||!/^--image=[a-z0-9._:/-]+$/.test(args[0]||''))throw Error('Use --image=LOCALLY_BUILT_IMAGE; isolated development only');
const image=args[0].slice(8),root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-real-time-soak-'));
await fs.chmod(root,0o700);if(process.getuid()===0)await fs.chown(root,1000,1000);
const name='aegis-soak-'+randomUUID(),started=Date.now(),samples=[];
const docker=async(...command)=>(await exec('docker',command,{timeout:30000,maxBuffer:1000000})).stdout.trim();
let created=false,restarted=false,paused=false,resumed=false,healthy=false;
try {
  await docker('run','-d','--pull=never','--name',name,'--init','--network','none','--cpus','0.5','--memory','384m','--pids-limit','96',
    '--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/tmp:rw,noexec,nosuid,size=96m',
    '--mount',`type=bind,src=${root},dst=/data`,'-e','NODE_OPTIONS=--max-old-space-size=192','-e','ALERTS_PUBLISH_ENABLED=false',
    image,'node','scripts/shadow-lab.mjs','--lab','--root=/data/lab','--wall-clock','--short-fixture','--seconds=120');
  created=true;
  while(Date.now()-started<160000) {
    const elapsed=Date.now()-started;
    if(elapsed>=30000&&!restarted){await docker('restart','--timeout','20',name);restarted=true;}
    if(elapsed>=60000&&!paused){await fs.writeFile(path.join(root,'lab','PAUSE'),'');paused=true;}
    if(elapsed>=75000&&!resumed){await fs.unlink(path.join(root,'lab','PAUSE'));resumed=true;}
    const info=JSON.parse(await docker('inspect','--format','{{json .State}}',name));
    let report=null;try{report=await readCheckpoint(path.join(root,'lab','report.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!healthy&&report){await docker('exec',name,'node','scripts/shadow-lab-health.mjs','--root=/data/lab');healthy=true;}
    const stats=info.Running?JSON.parse(await docker('stats','--no-stream','--format','{{json .}}',name)):null;
    samples.push({at:new Date().toISOString(),elapsedSeconds:elapsed/1000,running:info.Running,stats,
      totals:report?.totals??null,resources:report?.resources??null,heartbeatAt:report?.heartbeatAt??null});
    if(!info.Running)break;
    await sleep(3000);
  }
  const info=JSON.parse(await docker('inspect','--format','{{json .State}}',name));
  if(info.Running)throw Error('deadline_not_enforced');
  const verified=await verifyShadowLab(path.join(root,'lab')),run=await readCheckpoint(path.join(root,'lab','run.json'));
  if(info.ExitCode!==0||info.OOMKilled||run.segments.length!==2||run.segments.at(-1).reason!=='deadline'||!healthy||!paused||!resumed)throw Error('soak_acceptance_failed');
  const snapshot=root+'-backup',restore=root+'-restored';
  await createStagingBackup({sourceDir:path.join(root,'lab'),snapshotDir:snapshot,quiesced:true});
  await restoreStagingBackup({snapshotDir:snapshot,destinationDir:restore});
  const recovered=await verifyShadowLab(restore);
  const result={version:1,image,actualStartedAt:new Date(started).toISOString(),actualEndedAt:new Date().toISOString(),
    actualElapsedSeconds:(Date.now()-started)/1000,mode:'synthetic_fixture',network:'none',cpus:0.5,memoryLimitBytes:384*1048576,
    exitCode:info.ExitCode,oomKilled:info.OOMKilled,healthy,restarted,paused,resumed,run,verified,recovered,samples,
    powerWatts:null,energyWh:null,externalRequests:0,sevenDaysCompleted:false};
  await fs.writeFile(path.join(root,'experiment.json'),JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify({root,actualElapsedSeconds:result.actualElapsedSeconds,verified,recovered,exitCode:info.ExitCode,oomKilled:info.OOMKilled}));
}finally {
  if(created){await docker('stop','--timeout','20',name).catch(()=>{});await docker('rm',name).catch(()=>{});}
}
