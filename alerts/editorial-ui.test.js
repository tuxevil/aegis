import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {JSDOM} from "jsdom";
import {assessHazard} from "../hazards/assess.js";
import {captureRecord} from "../hazards/fixtures/captures.js";
const html=await fs.readFile(new URL("../public/editorial.html",import.meta.url),"utf8"),script=await fs.readFile(new URL("../public/editorial.js",import.meta.url),"utf8");
const flush=()=>new Promise(resolve=>setTimeout(resolve,15));
async function browser(t,{role="editor"}={}) {
  const dom=new JSDOM(html,{url:"https://aegis.example/editorial/",runScripts:"outside-only"});t.after(()=>dom.window.close());
  const {window:w}=dom,requests=[];
  const c=assessHazard({records:[captureRecord({origin:"synthetic_fixture"})],asOf:"2026-10-27T18:05:00Z",area:"guayaquil",recordOrigin:"synthetic_fixture"}).candidates[0];
  c.scope.name="<img src=x onerror=alert(1)>";
  const alert={id:c.id,candidate:c,revision:1,state:role==="editor"?"draft":"pending_review",version:7,notes:[]};let fail=false,pending=null;
  w.fetch=async(url,options)=>{
    requests.push({url,options});if(pending&&url.endsWith("candidates?area=guayaquil"))await pending;
    if(fail)return {status:401,ok:false,json:async()=>({})};
    const data=url.endsWith("/session")?{actor:{id:role,role}}:url.includes("/candidates?")?{candidates:[c]}:url.includes("/outbox?")?{items:[],total:0}:url.includes("?limit=")?{items:[alert],total:1}:alert;
    return {status:200,ok:true,json:async()=>data};
  };
  w.eval(script);
  const login=async()=>{w.document.getElementById("credential").value="T".repeat(43);w.document.getElementById("login").dispatchEvent(new w.Event("submit",{cancelable:true}));await flush();};
  return {w,requests,login,fail:()=>fail=true,block:promise=>pending=promise};
}
test("interfaz usa Bearer en memoria, escapa datos y limpia sesión sin storage/URL",async t=>{
  const {w,requests,login}=await browser(t);await login();const d=w.document;
  assert.equal(d.getElementById("private").hidden,false);assert.equal(d.getElementById("credential").value,"");
  assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);assert.equal(w.location.search,"");
  assert.ok(requests.every(r=>r.options.headers.Authorization==="Bearer "+"T".repeat(43)));
  assert.match(d.getElementById("alerts").textContent,/DATOS SINTÉTICOS DE PRUEBA/);
  assert.equal(d.querySelector("#alerts img"),null);assert.match(d.getElementById("alerts").textContent,/<img src=x/);
  d.getElementById("logout").click();assert.equal(d.getElementById("private").hidden,true);assert.equal(d.getElementById("alerts").children.length,0);
});
test("acción editorial exige motivo y envía versión mostrada; separa roles",async t=>{
  const {w,requests,login}=await browser(t);await login();const d=w.document;
  assert.equal([...d.querySelectorAll("button")].some(b=>b.textContent==="Aprobar para simulación"),false);
  const submit=[...d.querySelectorAll("button")].find(b=>b.textContent==="Solicitar revisión");submit.click();await flush();assert.match(d.getElementById("status").textContent,/motivo/);
  d.querySelector("textarea").value="Fuente cotejada";submit.click();await flush();
  const request=requests.find(r=>r.url.endsWith("/transitions"));assert.ok(request);assert.deepEqual(JSON.parse(request.options.body),{action:"submit",reason:"Fuente cotejada",expectedVersion:7});
});
test("respuesta tardía después de cerrar sesión no repuebla evidencia privada",async t=>{
  const {w,login,block}=await browser(t);await login();let release;
  block(new Promise(resolve=>release=resolve));w.document.getElementById("candidate-form").dispatchEvent(new w.Event("submit",{cancelable:true}));
  await flush();w.document.getElementById("logout").click();release();await flush();
  assert.equal(w.document.getElementById("candidates").children.length,0);assert.equal(w.document.getElementById("private").hidden,true);
});
test("credencial revocada limpia datos, y aprobador no tiene controles de editor",async t=>{
  const {w,login,fail}=await browser(t,{role:"approver"});await login();
  assert.ok([...w.document.querySelectorAll("button")].some(b=>b.textContent==="Aprobar para simulación"));
  assert.equal([...w.document.querySelectorAll("button")].some(b=>b.textContent==="Solicitar revisión"),false);
  fail();w.document.getElementById("refresh").click();await flush();
  assert.equal(w.document.getElementById("private").hidden,true);assert.equal(w.document.getElementById("alerts").children.length,0);
});
