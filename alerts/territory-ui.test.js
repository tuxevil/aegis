import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {JSDOM} from 'jsdom';
const html=await fs.readFile(new URL('../public/territory.html',import.meta.url),'utf8'),script=await fs.readFile(new URL('../public/territory.js',import.meta.url),'utf8');
const flush=()=>new Promise(r=>setTimeout(r,20));
async function browser(t) {
  const dom=new JSDOM(html,{url:'https://aegis.example/editorial/territory/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,requests=[];
  let failure=false,block=null;
  const data={alertsPublishEnabled:false,notForPrediction:true,privateReviewOnly:true,publicationBlocked:true,dispatchMode:'DRY_RUN',evidenceClass:'STATIC_EXPOSURE',recordOrigin:'synthetic_fixture',notice:'Static test, not prediction',areaId:'guayaquil',dpaCode:'0901',owner:'SNGR',licensingStatus:'pending',snapshot:{completedAt:'2026-10-28T12:00:00Z',revision:1,sourceCrs:32717,targetCrs:4326,topologyStatus:'unverified',snapshotAtomicity:'unknown'},
    features:[{id:1,type:'Feature',properties:{categoryRaw:'<img src=x onerror=alert(1)>',cantonCode:'0901'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]],[[.2,.2],[.2,.4],[.4,.4],[.4,.2],[.2,.2]]]}}],pagination:{total:21,hasMore:true}};
  w.fetch=async(url,options)=>{requests.push({url,options});if(block&&url.includes('/territory?'))await block;
    return {ok:!failure,status:failure?401:200,json:async()=>url.endsWith('/session')?{actor:{role:'editor'}}:structuredClone(data)};};
  w.eval(script);const login=async()=>{w.document.getElementById('credential').value='T'.repeat(43);w.document.getElementById('login').dispatchEvent(new w.Event('submit',{cancelable:true}));await flush();};
  return {w,requests,data,login,setFailure:()=>failure=true,setBlock:p=>block=p};
}
test('mapa privado conserva huecos, atributos seguros y selección por lista; credencial solo en memoria',async t=>{
  const {w,requests,login,data}=await browser(t);await login();const d=w.document;
  assert.equal(d.getElementById('credential').value,'');assert.equal(w.localStorage.length+w.sessionStorage.length,0);
  assert.ok(requests.every(r=>r.options.headers.Authorization==='Bearer '+'T'.repeat(43)));
  const path=d.querySelector('#map path');assert.equal(path.getAttribute('fill-rule'),'evenodd');assert.equal((path.getAttribute('d').match(/M/g)||[]).length,2);
  assert.equal(d.querySelector('#features img'),null);assert.match(d.getElementById('features').textContent,/<img src=x/);
  const button=d.querySelector('#features button');button.click();assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(path.classList.contains('selected'),true);
  assert.match(d.getElementById('selection').textContent,/<img src=x/);d.getElementById('next').click();await flush();assert.ok(requests.some(r=>r.url.includes('offset=20')));
  const rings=data.features[0].geometry.coordinates;data.features[0].geometry={type:'MultiPolygon',coordinates:[rings,[[[2,0],[3,0],[3,1],[2,1],[2,0]]]]};
  d.getElementById('filters').dispatchEvent(new w.Event('submit',{cancelable:true}));await flush();assert.equal((d.querySelector('#map path').getAttribute('d').match(/M/g)||[]).length,3);
  d.getElementById('logout').click();assert.equal(d.querySelector('#map svg'),null);assert.equal(d.getElementById('private').hidden,true);
});
test('sin colección o con geometría inválida no persiste un mapa anterior',async t=>{
  const {w,data,login}=await browser(t);await login();const prior=structuredClone(data);data.snapshot=null;data.features=[];
  w.document.getElementById('filters').dispatchEvent(new w.Event('submit',{cancelable:true}));await flush();assert.equal(w.document.querySelector('#map svg'),null);
  assert.match(w.document.getElementById('status').textContent,/No significa ausencia/);
  Object.assign(data,prior);data.features[0].geometry.coordinates[0][0][0]='bad';w.document.getElementById('filters').dispatchEvent(new w.Event('submit',{cancelable:true}));await flush();assert.equal(w.document.querySelector('#map svg'),null);assert.match(w.document.getElementById('status').textContent,/Geometría/);
});
test('respuesta tardía tras logout y credencial revocada limpian geometría privada',async t=>{
  const {w,login,setBlock}=await browser(t);await login();let release;setBlock(new Promise(r=>release=r));
  w.document.getElementById('filters').dispatchEvent(new w.Event('submit',{cancelable:true}));await flush();w.document.getElementById('logout').click();release();await flush();
  assert.equal(w.document.querySelector('#map svg'),null);assert.equal(w.document.getElementById('private').hidden,true);
  const second=await browser(t);await second.login();second.setFailure();second.w.document.getElementById('filters').dispatchEvent(new second.w.Event('submit',{cancelable:true}));await flush();assert.equal(second.w.document.getElementById('private').hidden,true);
});
