import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ShadowRunner,readCheckpoint,writeCheckpoint} from './shadow-runner.js';
const plan=()=>({version:1,mode:'synthetic_fixture',alertsPublishEnabled:false,dispatchMode:'DRY_RUN',maxDiskBytes:16*1024*1024,maxEvents:10,hostIntervalMs:1000,
  providers:[{key:'inamhi.lab',sourceId:'inamhi.warning.pdf',intervalMs:1000,dailyBudget:3,timeoutMs:100,maxResponseBytes:1000,ttlMs:2000}]});
const ok=()=>({status:'ok',httpStatus:200,responseBytes:25,artifactSha256:'a'.repeat(64)});
async function fixture(t,options={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-runner-')),runners=[];
  t.after(async()=>{for(const r of runners)if(!r.closed&&!r.busy)await r.close();await fs.rm(root,{recursive:true,force:true});});
  let time=1800000000000,calls=0;
  const config={root,plan:plan(),now:()=>time,poll:async()=>{calls++;return ok();},...options};
  const runner=await new ShadowRunner(config).open();runners.push(runner);
  return {runner,root,config,runners,advance:n=>time+=n,calls:()=>calls};
}
test('restart preserves rolling quota, freshness and configuration; raw success is not a risk status',async t=>{
  const f=await fixture(t);await f.runner.tick();await f.runner.tick();assert.equal(f.calls(),1);
  f.advance(1000);await f.runner.tick();f.advance(1000);await f.runner.tick();await f.runner.close();
  const r=await new ShadowRunner(f.config).open();f.runners.push(r);f.advance(3000);
  assert.equal((await r.tick()).totals.attempts,3);assert.equal(f.calls(),3);assert.equal(r.health()[0].status,'stale');
  f.advance(86400000);await r.tick();assert.equal(f.calls(),4);
});
test('403/429 Retry-After pauses host across restart, failures consume quota, messages stay sanitized',async t=>{
  for(const status of [403,429]) {
    const f=await fixture(t,{poll:async()=>({status:'unknown',httpStatus:status,retryAfterMs:5000,responseBytes:20})});
    await f.runner.tick();assert.equal(f.runner.health()[0].status,'unknown');
    assert.equal(f.runner.state.totals.attempts,1);await f.runner.close();
    const r=await new ShadowRunner(f.config).open();f.runners.push(r);f.advance(2000);await r.tick();
    assert.equal(r.state.totals.attempts,1);f.advance(3000);await r.tick();assert.equal(r.state.totals.attempts,2);
    assert.equal(r.health()[0].lastError,`http_${status}`);
  }
});
test('single writer, pause without polling, clock reversal and corrupted checkpoint fail closed',async t=>{
  const f=await fixture(t);await assert.rejects(()=>new ShadowRunner(f.config).open(),e=>e.code==='EEXIST');
  await fs.writeFile(path.join(f.root,'PAUSE'),'');assert.equal((await f.runner.tick()).paused,true);assert.equal(f.calls(),0);
  await fs.unlink(path.join(f.root,'PAUSE'));await f.runner.tick();f.advance(-1);await assert.rejects(()=>f.runner.tick(),/clock_moved_backwards/);
  await f.runner.close();await fs.writeFile(path.join(f.root,'state.json'),'{}');await assert.rejects(()=>new ShadowRunner(f.config).open(),/checkpoint|argument/i);
});
test('timeout aborts provider, stop waits for settlement and never starts another provider',async t=>{
  const p=plan();p.providers.push({...p.providers[0],key:'second.lab'});
  let calls=0;
  const f=await fixture(t,{plan:p,poll:async(_, {signal})=>{calls++;await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw Error('secret URL not logged');}});
  const tick=f.runner.tick();await assert.rejects(()=>f.runner.tick(),/runner_not_available/);
  await tick;assert.equal(calls,1);assert.equal(f.runner.health()[0].lastError,'timeout');
  assert.equal(JSON.stringify(f.runner.state).includes('secret'),false);
  f.advance(3000);const stopped=f.runner.tick();await new Promise(resolve=>setTimeout(resolve,10));f.runner.requestStop();await stopped;
  assert.equal(calls,2);await f.runner.close();
});
test('reserved attempt survives crash-like restart and changed plan cannot reset budgets',async t=>{
  const f=await fixture(t);await f.runner.tick();await f.runner.close();
  const state=await readCheckpoint(path.join(f.root,'state.json'));state.providers['inamhi.lab'].lastSuccessAt=null;
  await writeCheckpoint(path.join(f.root,'state.json'),state);
  const r=await new ShadowRunner(f.config).open();await r.tick();assert.equal(f.calls(),1);await r.close();
  const changed=plan();changed.providers[0].dailyBudget=4;
  await assert.rejects(()=>new ShadowRunner({...f.config,plan:changed}).open(),/shadow_state_incompatible/);
});
test('storage ceiling suspends ingestion and events stay bounded without purging evidence',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.root,'occupancy'),Buffer.alloc(15*1024*1024));
  await f.runner.tick();assert.equal(f.calls(),0);assert.equal(f.runner.state.stoppedReason,'storage_budget');
  await fs.unlink(path.join(f.root,'occupancy'));await f.runner.tick();assert.equal(f.calls(),0);
});
test('live mode and publication configurations cannot construct the offline runner',()=>{
  for(const change of [{mode:'captured_source'},{alertsPublishEnabled:true},{dispatchMode:'LIVE'}])
    assert.throws(()=>new ShadowRunner({root:'/unused',plan:{...plan(),...change},poll:ok}),/invalid_shadow_plan/);
});
test('a provider ignoring cancellation retains the single-writer lock until settlement',async t=>{
  let finish,started;
  const entered=new Promise(resolve=>started=resolve);
  const f=await fixture(t,{poll:async()=>{started();return new Promise(resolve=>finish=resolve);}});
  const pending=f.runner.tick();await entered;f.runner.requestStop();
  await assert.rejects(()=>f.runner.close(),/runner_busy/);
  await assert.rejects(()=>new ShadowRunner(f.config).open(),e=>e.code==='EEXIST');
  finish(ok());await pending;assert.equal(f.runner.health()[0].lastError,'timeout');
  await f.runner.close();
});
test('recent event ring stays bounded while cumulative counters and quotas survive',async t=>{
  const p=plan();p.providers[0].dailyBudget=20;
  const f=await fixture(t,{plan:p});
  for(let i=0;i<15;i++){await f.runner.tick();f.advance(1000);}
  assert.equal(f.runner.state.events.length,10);assert.equal(f.runner.state.totals.attempts,15);
  const day=Object.values(f.runner.state.daily)[0].sources['inamhi.lab'];
  assert.equal(day.attempts,15);assert.equal(day.successes,15);assert.equal(day.latency.count,15);
  assert.equal(day.latency.buckets.reduce((a,b)=>a+b,0),15);
  await f.runner.close();const r=await new ShadowRunner(f.config).open();f.runners.push(r);
  assert.equal(r.state.events.length,10);assert.equal(r.state.providers['inamhi.lab'].attempts.length,15);
});
test('HTTP failures override contradictory success and Retry-After survives malformed bodies and very long delays',async t=>{
  for(const status of [403,429,500,302]) {
    const f=await fixture(t,{poll:async()=>({...ok(),httpStatus:status,retryAfterMs:8*86400000,responseBytes:status===429?1001:25})});
    await f.runner.tick();assert.equal(f.runner.state.totals.successes,0);assert.equal(f.runner.state.totals.failures,1);
    assert.equal(f.runner.health()[0].lastError,'http_'+status);
    if(status===403||status===429) {
      const host=new URL(f.runner.registry.get('inamhi.warning.pdf').url).hostname;
      assert.ok(f.runner.state.hosts[host]-f.runner.now()>=8*86400000);
      await f.runner.close();const r=await new ShadowRunner(f.config).open();f.runners.push(r);
      f.advance(86400000*7);await r.tick();assert.equal(r.state.totals.attempts,1);
    }
  }
});
test('a late 429 after timeout still preserves known Retry-After rather than retrying early',async t=>{
  let calls=0;const p=plan();p.providers[0].timeoutMs=10;
  const f=await fixture(t,{plan:p,poll:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,25));return {...ok(),httpStatus:429,retryAfterMs:60000};}});
  await f.runner.tick();assert.equal(f.runner.health()[0].lastError,'timeout');
  f.advance(1000);await f.runner.tick();assert.equal(calls,1);
});
