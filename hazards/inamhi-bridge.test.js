import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import https from 'node:https';
import {pinnedInamhiFetch,publicIPv4} from './inamhi-transport.js';
import {createManualInamhiRunner,createInamhiBridge} from './inamhi-bridge.js';
import {ShadowRunner} from './shadow-runner.js';
import {syntheticBulletin} from './fixtures/pdf.js';
const url='https://www.inamhi.gob.ec/pronostico/advertencia.pdf';
const authorization=()=>({status:'approved_single_manual_query',sourceId:'inamhi.warning.pdf',maxRequests:1,dispatchMode:'DRY_RUN',alertsPublishEnabled:false,
  scope:'private_research_archive',expiresAt:new Date(Date.now()+3600000).toISOString(),ownerApprovalReference:'fixture-owner-review',dataRightsReference:'fixture-private-research',
  networkVerificationReference:'fixture-namespace-test',approvedAddresses:['8.8.8.8']});
function simulatedRequest({status=200,bytes=syntheticBulletin(),headers={},seen=[]}={}) {
  return (input,options,callback)=>{
    seen.push({input,options});const req=new EventEmitter();
    req.end=()=>queueMicrotask(()=>{
      const res=new PassThrough();res.statusCode=status;res.headers={'content-type':'application/pdf',...headers};callback(res);res.end(bytes);
    });return req;
  };
}
test('pinning fixes HTTPS/GET/443/TLS/SNI and rejects DNS rebinding, private and nonregistered URLs before request',async()=>{
  const seen=[],options={method:'GET',redirect:'manual',signal:AbortSignal.timeout(1000)};
  const fetch=pinnedInamhiFetch({approvedAddresses:['8.8.8.8'],lookup:async()=>[{address:'8.8.8.8',family:4}],request:simulatedRequest({seen})});
  const response=await fetch(url,options);await response.arrayBuffer();
  assert.equal(seen[0].options.rejectUnauthorized,true);assert.equal(seen[0].options.servername,'www.inamhi.gob.ec');assert.equal(seen[0].options.agent,false);
  seen[0].options.lookup('ignored',{},(err,address,family)=>{assert.equal(err,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
  for(const target of [url+'?url=http://169.254.169.254',url.replace('https:','http:'),'https://www.inamhi.gob.ec:8443/pronostico/advertencia.pdf'])await assert.rejects(()=>fetch(target,options));
  for(const address of ['127.0.0.1','169.254.169.254','10.0.0.1','100.64.0.1','192.0.2.1','::1','::ffff:8.8.8.8','8.8.4.4']) {
    const blocked=pinnedInamhiFetch({approvedAddresses:['8.8.8.8'],lookup:async()=>[{address,family:4}],request:()=>{throw Error('request must not start');}});
    await assert.rejects(()=>blocked(url,options),/dns_change/);
  }
  assert.equal(publicIPv4('2130706433'),false);assert.equal(publicIPv4('0x7f000001'),false);
  assert.equal(seen.length,1);
});
test('bridge connects scheduler to ingestion with isolated captured origin, bounded authorization and one durable lifetime attempt',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-inamhi-bridge-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const seen=[],opts={root,authorization:authorization(),lookup:async()=>[{address:'8.8.8.8',family:4}],request:simulatedRequest({seen})};
  const {runner,store,poll}=await createManualInamhiRunner(opts);
  assert.throws(()=>new ShadowRunner({root,plan:{mode:'synthetic_fixture'},poll}),/origin_mismatch/);
  await runner.open();try {
    const result=await runner.tick();assert.equal(result.mode,'captured_source');assert.equal(result.totals.successes,1);assert.equal(result.publicationBlocked,true);
    await runner.tick();assert.equal(seen.length,1);assert.equal(runner.state.stoppedReason,'manual_attempt_limit');
  }finally{await runner.close();}
  const records=await store.records();assert.equal(records.length,1);assert.equal(records[0].envelope.recordOrigin,'captured_source');
  assert.notEqual(records[0].envelope.licensing.status,'verified');await store.verify();
  await assert.rejects(()=>createInamhiBridge(opts).poll({sourceId:'inamhi.warning.pdf'}),e=>e.code==='EEXIST');
});
test('403/429/redirect/invalid data remain failures; no redirect follow and retry date persists',async t=>{
  for(const status of [403,429,302,200]) {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-inamhi-failure-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const seen=[],bridge=createInamhiBridge({root,authorization:authorization(),lookup:async()=>[{address:'8.8.8.8',family:4}],
      request:simulatedRequest({seen,status,bytes:Buffer.from('invalid data'),headers:{location:'http://169.254.169.254/', 'retry-after':'691200'}})});
    const result=await bridge.poll({sourceId:'inamhi.warning.pdf'});assert.equal(result.status,'unknown');assert.equal(seen.length,1);
    assert.equal(result.responseBytes,status===200?12:null);
    if(status===403||status===429)assert.ok(result.retryAfterMs>7*86400000);
    assert.equal((await bridge.store.records()).length,0);
  }
});
test('bytes read before parser failure are counted; unread bodies remain unknown rather than zero',async t=>{
  for(const status of [200,429]) {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-inamhi-byte-count-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const {runner}=await createManualInamhiRunner({root,authorization:authorization(),lookup:async()=>[{address:'8.8.8.8',family:4}],
      request:simulatedRequest({status,bytes:Buffer.alloc(100,65)})});
    await runner.open();try {
      const result=await runner.tick();assert.equal(result.totals.successes,0);
      assert.equal(result.totals.bytes,status===200?100:0);assert.equal(result.totals.unknownByteAttempts,status===200?0:1);
    }finally{await runner.close();}
  }
});
test('pending approval, inherited approval, unknown flags and expired permissions fail without DNS or writes',()=>{
  for(const change of [{status:'not_authorized'},{maxRequests:2},{expiresAt:'2020-01-01T00:00:00Z'},{approvedAddresses:['127.0.0.1']},{url:'http://localhost'}])
    assert.throws(()=>createInamhiBridge({root:'/unused',authorization:{...authorization(),...change},lookup:()=>{throw Error('must not resolve');}}));
  assert.throws(()=>createInamhiBridge({root:'/unused',authorization:Object.create(authorization())}));
});
test('a real local HTTPS server with an untrusted fixture certificate is rejected before HTTP',async t=>{
  let requests=0;
  const server=https.createServer({key:await fs.readFile('test-support/inamhi-https/fixture-key.pem'),cert:await fs.readFile('test-support/inamhi-https/fixture-cert.pem')},(_,res)=>{requests++;res.end('not trusted');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const localRequest=(_url,options,callback)=>https.request({...options,hostname:'127.0.0.1',port:server.address().port,lookup:undefined},callback);
  const fetch=pinnedInamhiFetch({approvedAddresses:['8.8.8.8'],lookup:async()=>[{address:'8.8.8.8',family:4}],request:localRequest});
  await assert.rejects(()=>fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(2000)}),e=>/CERT|SELF_SIGNED|ALTNAME/.test(e.code));
  assert.equal(requests,0);
});
test('oversized body and cancellation of DNS fail closed without following a new connection',async()=>{
  const seen=[],fetch=pinnedInamhiFetch({approvedAddresses:['8.8.8.8'],lookup:async()=>[{address:'8.8.8.8',family:4}],request:simulatedRequest({seen,headers:{'content-length':'3000000'}})});
  const {SourceHttp}=await import('./http.js');
  await assert.rejects(()=>new SourceHttp({httpFetch:fetch}).get('inamhi.warning.pdf'),/body_too_large/);
  const controller=new AbortController(),blocked=pinnedInamhiFetch({approvedAddresses:['8.8.8.8'],lookup:()=>new Promise(()=>{}),request:()=>{throw Error('must not start');}});
  const pending=blocked(url,{method:'GET',redirect:'manual',signal:controller.signal});controller.abort();await assert.rejects(()=>pending);
});
test('extreme Retry-After stays representable and durable instead of enabling an early retry',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-inamhi-retry-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const bridge=createInamhiBridge({root,authorization:authorization(),lookup:async()=>[{address:'8.8.8.8',family:4}],
    request:simulatedRequest({status:429,headers:{'retry-after':'9'.repeat(100)}})});
  const result=await bridge.poll({sourceId:'inamhi.warning.pdf'});assert.equal(result.status,'unknown');
  assert.equal((await bridge.store.records('failures'))[0].retryAt,'9999-12-31T23:59:59.999Z');
});
