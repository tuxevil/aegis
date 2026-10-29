import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {beginRun,finishRun,resourceStop,restartBudgetExceeded} from './shadow-run-lifecycle.js';
test('experiment deadline survives restarts, records unknown interruption and explicit extension',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-run-deadline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const start=1800000000000,durationMs=7*86400000;
  await beginRun(root,{at:start,durationMs});
  const resumed=await beginRun(root,{at:start+60000,durationMs,heartbeatAt:start+10000});
  assert.equal(resumed.deadline,start+durationMs);assert.equal(resumed.segments[0].endedAt,null);
  assert.equal(resumed.segments[0].lastVerifiedHeartbeatAt,start+10000);
  await finishRun(root,resumed,{at:start+90000,reason:'signal'});
  const extended=await beginRun(root,{at:start+100000,durationMs:14*86400000});
  assert.equal(extended.deadline,start+14*86400000);assert.equal(extended.extensions.length,1);
  assert.equal(restartBudgetExceeded(extended,start+100001),false);
  assert.equal(restartBudgetExceeded({segments:[{interruptionDetectedAt:start+1},{interruptionDetectedAt:start+2}]},start+100),true);
});
test('resource stop distinguishes limited runtime cgroup from host/test cgroup and leaves energy unknown',()=>{
  const metrics={rssBytes:70*1048576,cgroupNamespace:{memoryLimitBytes:384*1048576,memoryBytes:370*1048576,oomKills:0}};
  const one=resourceStop(metrics,{},1);assert.equal(one.reason,null);
  assert.equal(resourceStop(metrics,one.state,2).reason,'cgroup_memory');
  assert.equal(resourceStop({...metrics,cgroupNamespace:{memoryLimitBytes:100*1024**3,memoryBytes:1024**3,oomKills:5}}, {},1).reason,null);
  assert.equal(resourceStop({...metrics,cgroupNamespace:{...metrics.cgroupNamespace,oomKills:1}}, {},1).reason,'cgroup_oom');
});
