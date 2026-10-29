import path from 'node:path';
import {readCheckpoint,writeCheckpoint} from './shadow-runner.js';

// Wall-clock experiment identity is independent of a process lifetime.
export async function beginRun(root,{at,durationMs,heartbeatAt=null}) {
  const file=path.join(root,'run.json');let run;
  try{run=await readCheckpoint(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!run)run={version:1,mode:'synthetic_fixture',initialStartedAt:at,durationMs,deadline:durationMs===null?null:at+durationMs,segments:[],extensions:[]};
  if(run.version!==1||run.mode!=='synthetic_fixture'||!Number.isSafeInteger(run.initialStartedAt)||
    !(run.durationMs===null||Number.isSafeInteger(run.durationMs)&&run.durationMs>0)||
    run.deadline!==(run.durationMs===null?null:run.initialStartedAt+run.durationMs)||
    !Array.isArray(run.segments)||run.segments.length>=1000||at<run.initialStartedAt)throw Error('incompatible_run');
  if(run.durationMs!==durationMs) {
    if(run.durationMs!==7*86400000||durationMs!==14*86400000)throw Error('duration_change_refused');
    run.extensions.push({at,from:run.durationMs,to:durationMs});run.durationMs=durationMs;run.deadline=run.initialStartedAt+durationMs;
  }
  const prior=run.segments.at(-1);
  if(prior&&prior.endedAt===null){prior.interruptionDetectedAt=at;prior.lastVerifiedHeartbeatAt=heartbeatAt;}
  run.segments.push({startedAt:at,endedAt:null,reason:null});
  await writeCheckpoint(file,run);return run;
}
export function restartBudgetExceeded(run,at) {
  return run.segments.filter(s=>(s.interruptionDetectedAt||s.reason==='interrupted')&&
    (s.interruptionDetectedAt||s.endedAt)>at-86400000).length>=2;
}
export async function finishRun(root,run,{at,reason}) {
  run.segments.at(-1).endedAt=at;run.segments.at(-1).reason=reason;
  await writeCheckpoint(path.join(root,'run.json'),run);
}
export function resourceStop(metrics,state={},at=Date.now()) {
  const cg=metrics.cgroupNamespace||{};
  const memoryLimited=Number.isFinite(cg.memoryLimitBytes)&&cg.memoryLimitBytes<=512*1048576;
  const highMemory=memoryLimited&&cg.memoryBytes>=Math.min(360*1048576,cg.memoryLimitBytes*0.94);
  state.memorySamples=highMemory?(state.memorySamples||0)+1:0;
  state.highRssSince=metrics.rssBytes>320*1048576?(state.highRssSince??at):null;
  const reason=memoryLimited&&cg.oomKills>0?'cgroup_oom':state.memorySamples>=2?'cgroup_memory':
    state.highRssSince!==null&&at-state.highRssSince>=300000?'process_rss':null;
  return {state,reason};
}
