import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {JSDOM} from "jsdom";
import {pilotAreas} from "../hazards/areas.js";
import {cityChannels,nationalDiscoveryChannel} from "./channels.js";
const html=await fs.readFile(new URL("../public/cities.html",import.meta.url),"utf8"),script=await fs.readFile(new URL("../public/cities.js",import.meta.url),"utf8");
const flush=()=>new Promise(resolve=>setTimeout(resolve,15));
async function browser(t) {
  const dom=new JSDOM(html,{url:"https://aegis.example/ciudades/",runScripts:"outside-only"});t.after(()=>dom.window.close());const w=dom.window,requests=[],secret="S".repeat(43);let revoked=false;
  const catalog={areas:pilotAreas(),channels:cityChannels(),nationalChannel:nationalDiscoveryChannel(),consentVersion:"zone-follow-1",pushAvailable:false};
  const preference={areaIds:["guayaquil"],pushInterest:true,state:"active",expiresAt:"2026-11-26T21:00:00Z",pushDeliveryEnabled:false,whatsappFollowConfirmed:false};
  w.fetch=async(url,options)=>{
    requests.push({url,options});let data;
    if(url.endsWith("/catalog"))data=catalog;else if(url.endsWith("/challenge"))data={challenge:"mock-nonce",minWaitMs:0};
    else if(options.method==="DELETE"){revoked=true;data={state:"revoked",areaIds:[]};}
    else if(url.endsWith("/zones"))data={...preference,managementSecret:secret};else data=preference;
    return {status:200,ok:true,json:async()=>data};
  };
  let notificationCalls=0,geolocationCalls=0;w.Notification={requestPermission:()=>notificationCalls++};Object.defineProperty(w.navigator,"geolocation",{value:{getCurrentPosition:()=>geolocationCalls++}});
  w.eval(script);await flush();return {w,requests,secret,isRevoked:()=>revoked,calls:()=>({notificationCalls,geolocationCalls})};
}
test("selector móvil filtra pilotos y separa enlace, interés y activación PWA",async t=>{
  const {w,requests,calls}=await browser(t),d=w.document;
  assert.equal(d.querySelectorAll("#cities article").length,2);assert.equal(d.querySelectorAll("#cities a").length,1);
  d.getElementById("search").value="Pallatanga";d.getElementById("search").dispatchEvent(new w.Event("input"));assert.equal(d.querySelectorAll("#cities article").length,1);assert.match(d.getElementById("cities").textContent,/Sin canal/);
  d.getElementById("search").value="ciudad inventada";d.getElementById("search").dispatchEvent(new w.Event("input"));assert.match(d.getElementById("cities").textContent,/Sin coincidencias/);
  assert.deepEqual(calls(),{notificationCalls:0,geolocationCalls:0});assert.equal(requests.length,1);assert.equal(d.querySelectorAll("input[type=tel]" ).length,0);
});
test("alta solo después de consentimiento, secreto en memoria y baja autenticada",async t=>{
  const {w,requests,secret,isRevoked,calls}=await browser(t),d=w.document;
  d.querySelector("#cities input").click();d.getElementById("interest").dispatchEvent(new w.Event("submit",{cancelable:true}));await flush();assert.equal(requests.length,1);assert.match(d.getElementById("status").textContent,/consentimiento/);
  d.getElementById("consent").checked=true;d.getElementById("push-interest").checked=true;d.getElementById("interest").dispatchEvent(new w.Event("submit",{cancelable:true}));await flush();await flush();
  const registered=requests.find(r=>r.url.endsWith("/zones"));assert.ok(registered);assert.equal(JSON.parse(registered.options.body).pushInterest,true);
  assert.equal(d.getElementById("new-secret").value,secret);assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);assert.equal(w.location.search,"");
  d.getElementById("revoke").click();await flush();assert.equal(isRevoked(),true);assert.equal(d.getElementById("new-secret").value,"");assert.equal(d.getElementById("created").hidden,true);
  assert.ok(requests.every(r=>!r.url.includes(secret)));assert.deepEqual(calls(),{notificationCalls:0,geolocationCalls:0});
});
test("gestión usa Authorization y limpiar pantalla no envía una baja silenciosa",async t=>{
  const {w,requests,secret,isRevoked}=await browser(t),d=w.document;d.getElementById("management-secret").value=secret;d.getElementById("unlock").dispatchEvent(new w.Event("submit",{cancelable:true}));await flush();
  assert.equal(d.getElementById("management-secret").value,"");assert.equal(requests.at(-1).options.headers.Authorization,"Bearer "+secret);assert.equal(d.getElementById("revoke").hidden,false);
  d.getElementById("forget").click();assert.equal(d.getElementById("revoke").hidden,true);assert.equal(isRevoked(),false);assert.match(d.getElementById("status").textContent,/no da de baja/);
});
