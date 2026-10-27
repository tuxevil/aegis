import test from "node:test";
import assert from "node:assert/strict";
import { inspectPayload, probeOne, probes, main } from "./probe-aegis-sources.mjs";

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
