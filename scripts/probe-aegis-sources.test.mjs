import test from "node:test";
import assert from "node:assert/strict";
import { inspectPayload, probeOne, probeAll, probes, main } from "./probe-aegis-sources.mjs";

const b = value => Buffer.from(JSON.stringify(value));
test("lista de sondas solo hosts públicos predefinidos y HTTPS", () => {
  assert.equal(probes.length,6);
  for(const item of probes) {
    const u=new URL(item.url);
    assert.equal(u.protocol,"https:");
    assert.ok(["www.inamhi.gob.ec","sgrportal.gestionderiesgos.gob.ec","single-runs-api.open-meteo.com"].includes(u.hostname));
  }
});
test("PDF requiere cabecera real y no finge procesar boletín", () => {
  assert.equal(inspectPayload("pdf",Buffer.from("%PDF-1.7 mock")).parsedBulletin,false);
  assert.throws(()=>inspectPayload("pdf",Buffer.from("<html>falso</html>")),/not_pdf_magic/);
});
test("metadatos ArcGIS soportados sin inventar valores", () => {
  const sample={geometryType:"esriGeometryPolygon",maxRecordCount:2000,fields:[{name:"FID"},{name:"sui"}],advancedQueryCapabilities:{supportsPagination:false}};
  const inspected=inspectPayload("layer",b(sample));
  assert.equal(inspected.supportsPagination,false);
  assert.deepEqual(inspected.fieldNames,["FID","sui"]);
});
test("ArcGIS devuelve HTTP 200 con error JSON: debe rechazarse",()=>{
  assert.throws(()=>inspectPayload("layer",b({error:{code:499,message:"Token"}})),/provider_json_error/);
  assert.throws(()=>inspectPayload("arcgis-query",b({features:[{attributes:{}},{attributes:{}}]})),/query_exceeded_1_record/);
});
test("respuesta de consulta muestra exactamente claves sin datos personales",()=>{
  const x=inspectPayload("arcgis-query",b({features:[{attributes:{objectid:11,tipo_amen:"test"}}],exceededTransferLimit:true}));
  assert.deepEqual(x.attributeKeys,["objectid","tipo_amen"]);
  assert.equal(x.exceededTransferLimit,true);
});
test("pronóstico no admite series desalineadas ni JSON erróneo",()=>{
  const a={hourly:{time:["2026-10-25T00:00"],precipitation:[2.5]},hourly_units:{precipitation:"mm"}};
  assert.equal(inspectPayload("forecast",b(a)).points,1);
  a.hourly.precipitation=[];
  assert.throws(()=>inspectPayload("forecast",b(a)),/forecast_length_mismatch/);
  assert.throws(()=>inspectPayload("forecast",Buffer.from("<html>not-json")),/invalid_json/);
});
test("sonda HTTP simulada funciona sin acceder a red",async()=>{
  const result=await probeOne(probes[2],{httpFetch:async()=>new Response(JSON.stringify({features:[]}),{status:200,headers:{"content-type":"application/json"}})});
  assert.equal(result.status,"reachable");
  assert.equal(result.inspection.returnedCount,0);
  assert.match(result.sha256,/^[a-f0-9]{64}$/);
});
test("429, HTML por PDF y payload sobredimensionado dan 'unverified'",async()=>{
  const rate=await probeOne(probes[0],{httpFetch:async()=>new Response("limit",{status:429})});
  assert.equal(rate.errorCode,"rate_limited_429");
  const html=await probeOne(probes[0],{httpFetch:async()=>new Response("<html/>",{status:200})});
  assert.equal(html.errorCode,"not_pdf_magic");
  const large=await probeOne({...probes[0],maxBytes:3},{httpFetch:async()=>new Response("abcd",{status:200})});
  assert.match(large.errorCode,/body_too_large/);
});
test("sin --live el script no accede a red",async()=> {
  await main([]);
});

test("errores de proveedor conservan HTTP/hash, nunca mensajes remotos",async()=>{
  const result=await probeOne(probes[4],{httpFetch:async()=>new Response(
    JSON.stringify({error:{code:400,message:"private-secret",details:["sensitive"]}}),
    {headers:{"content-type":"application/json","date":"Tue, 27 Oct 2026 18:00:00 GMT"}})});
  assert.equal(result.httpStatus,200);
  assert.equal(result.providerErrorCode,400);
  assert.match(result.sha256,/^[a-f0-9]{64}$/);
  assert.equal(result.serverDate,"Tue, 27 Oct 2026 18:00:00 GMT");
  assert.equal(JSON.stringify(result).includes("private-secret"),false);
});

test("timeout, 404 y redirecciones se documentan sin seguir ni filtrar URLs",async()=>{
  const timeout=await probeOne(probes[0],{httpFetch:async()=>{
    throw new DOMException("secret-url","TimeoutError");
  }});
  assert.equal(timeout.errorCode,"timeout");
  for(const status of [302,404]) {
    let calls=0;
    const result=await probeOne(probes[0],{httpFetch:async(url,options)=>{
      calls++;
      assert.equal(options.method,"GET");
      assert.equal(options.redirect,"manual");
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(null,{status,headers:{location:"https://private.example/secret"}});
    }});
    assert.equal(calls,1);
    assert.equal(result.httpStatus,status);
    assert.equal(JSON.stringify(result).includes("private.example"),false);
  }
  const network=await probeOne(probes[0],{httpFetch:async()=>{throw new Error("secret");}});
  assert.equal(network.errorCode,"network_or_read_error");
});

test("403/429 suspenden ese proveedor; otras fuentes continúan sin reintentos",async()=>{
  for(const status of [403,429]) {
    const calls=[];
    const results=await probeAll({httpFetch:async(url)=>{
      calls.push(url);
      return new Response(null,{status,headers:{"retry-after":"120"}});
    }});
    assert.equal(calls.length,3);
    assert.equal(results.filter(r=>r.errorCode==="provider_paused").length,3);
    assert.equal(results[1].retryAfter,"120");
  }
});

test("límites y modelo ausente son evidencia incompleta, nunca validación operativa",()=>{
  const layer=inspectPayload("layer",b({geometryType:"esriGeometryPolygon",fields:[],maxRecordCount:2000}));
  assert.equal(layer.maxRecordCount,2000);
  assert.equal(layer.supportsPagination,null);
  const forecast=inspectPayload("forecast",b({hourly:{time:["2026-10-25T00:00"],precipitation:[null]}}));
  assert.equal(forecast.modelIdentityKnown,false);
});

test("precipitación negativa y tiempos desordenados se rechazan",()=>{
  assert.throws(()=>inspectPayload("forecast",b({hourly:{time:["2026-10-25T00:00"],precipitation:[-1]}})),/invalid_precipitation/);
  assert.throws(()=>inspectPayload("forecast",b({hourly:{time:["2026-10-25T01:00","2026-10-25T00:00"],precipitation:[1,2]}})),/invalid_forecast_times/);
});
