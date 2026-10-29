import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import https from 'node:https';
test('TLS repair proposal requires both a reviewed trust chain and matching hostname, with no insecure fallback',async t=>{
  const cert=await fs.readFile('test-support/inamhi-https/fixture-cert.pem'),key=await fs.readFile('test-support/inamhi-https/fixture-key.pem');
  let received=0;
  const server=https.createServer({cert,key},(_,res)=>{received++;res.end('synthetic Grid transport fixture');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const get=options=>new Promise((resolve,reject)=>{
    const req=https.get({host:'127.0.0.1',port:server.address().port,servername:'localhost',rejectUnauthorized:true,agent:false,...options},res=>{
      let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve(text));res.on('error',reject);
    });req.on('error',reject);req.setTimeout(2000,()=>req.destroy(Error('timeout')));
  });
  await assert.rejects(()=>get({}),e=>/CERT|SELF_SIGNED/.test(e.code));
  assert.equal(await get({ca:cert}),'synthetic Grid transport fixture');
  await assert.rejects(()=>get({ca:cert,servername:'wrong.fixture.invalid'}),e=>e.code==='ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(received,1);
});
