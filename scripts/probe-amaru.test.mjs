import test from "node:test";
import assert from "node:assert/strict";
import {AMARU_ENDPOINT,buildRequestUrl,GUAYAQUIL_SAMPLE,probeAmaru,summarizeResponse} from "./probe-amaru.mjs";
const TEST_KEY="amaru_testsecret000000";
test("Endpoint exacto, HTTPS y parámetros; clave no se muestra en resumen",()=>{
 const u=buildRequestUrl(TEST_KEY);
 assert.equal(u.origin,"https://amaruapp.com");
 assert.equal(u.pathname,new URL(AMARU_ENDPOINT).pathname);
 assert.equal(u.searchParams.get("key"),TEST_KEY);
 assert.equal(u.searchParams.get("lat"),String(GUAYAQUIL_SAMPLE.lat));
 assert.throws(()=>buildRequestUrl("no"),/invalid_api_key/);
});
test("Respuesta básica del plan Dev y esquema parcial",()=>{
 const input={ubicacion:{lat:-2.17,lon:-79.92,elevacion_m:8},clima:{temp_c:29,lluvia_mm:0,intensidad:"sin_lluvia"},riesgo:{indice:15,nivel:"Bajo"},solo_en_planes_de_pago:["factores","rio","reports"]};
 const out=summarizeResponse(input);
 assert.equal(out.risk.index,15);
 assert.equal(out.risk.level,"Bajo");
 assert.equal(out.climate.rainMmPerHour,0);
 assert.equal(out.schemaObserved.hasPaywalledFieldsIndicator,true);
 assert.ok(!JSON.stringify(out).includes(TEST_KEY));
});
test("No revela claves ni valores reflejados por el proveedor",async()=>{
 const payload={riesgo:{indice:60,nivel:TEST_KEY},clima:{temp_c:30,key:TEST_KEY},key:TEST_KEY,
  ubicacion:{lat:-2.17,lon:-79.92}};
 const x=await probeAmaru({key:TEST_KEY,fetchImpl:async()=>new Response(JSON.stringify(payload),{status:200})});
 assert.equal(x.result,"sample_obtained");
 assert.ok(!JSON.stringify(x).includes(TEST_KEY));
 assert.equal(x.risk.level,null);
});
test("Una única petición GET, sin reintentos",async()=>{
 let count=0;let method;
 const x=await probeAmaru({key:TEST_KEY,fetchImpl:async(_url,options)=>{count++;method=options.method;return new Response(JSON.stringify({clima:{temp_c:25},riesgo:{indice:42,nivel:"Atención"}}),{status:200});}});
 assert.equal(x.result,"sample_obtained");
 assert.equal(count,1);assert.equal(method,"GET");
});
test("401 y 429 resultan en error no sensible",async()=>{
 for(const [status,expected] of [[401,"unauthorized_401"],[429,"quota_or_rate_limit_429"]]){
 const x=await probeAmaru({key:TEST_KEY,fetchImpl:async()=>new Response(JSON.stringify({error:"echo:"+TEST_KEY}),{status})});
 assert.equal(x.result,"unverified");
 assert.equal(x.errorCode,expected);
 assert.ok(!JSON.stringify(x).includes(TEST_KEY));
 }
});
test("HTML inesperado o respuesta con error del proveedor",async()=>{
 for(const [body,code] of [["<html>error</html>","invalid_json"],[JSON.stringify({error:TEST_KEY}),"provider_reported_error"]]){
 const x=await probeAmaru({key:TEST_KEY,fetchImpl:async()=>new Response(body,{status:200})});
 assert.equal(x.errorCode,code);
 assert.ok(!JSON.stringify(x).includes(TEST_KEY));
 }
});
