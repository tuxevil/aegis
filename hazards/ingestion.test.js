import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {RawArtifactStore} from "./artifact-store.js";
import {SourceRegistry} from "./registry.js";
import {SourceHttp} from "./http.js";
import {IngestionService} from "./ingestion.js";
import {InamhiPdfAdapter,SngrArcgisAdapter,OpenMeteoSingleRunsAdapter,parseInamhiText} from "./adapters.js";
import {validateEnvelope} from "./envelope.js";
import {syntheticBulletin} from "./fixtures/pdf.js";
import {joinPdfItems} from "./pdf-layout.js";

async function sandbox(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-hazards-test-"));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;
}
const registry=new SourceRegistry();
const date="2026-10-27T18:00:00.000Z";
const metadata={recordOrigin:"captured_source",sha256:"a".repeat(64),byteLength:100,storageKey:"raw/"+"a".repeat(64),firstSeenAt:date};
const captured={retrievedAt:date,mediaType:"application/json"};
const json=value=>Buffer.from(JSON.stringify(value));

test("fragmentos de glifos PDF conservan palabras, espacios y horas",()=>{
  const line="Boletin Meteorologico Nro. 83\nFecha y hora de emision: domingo, 25 de octubre de 2026, 14:00 horas";
  const items=[...line].map(c=>({str:c==="\n"?"":c,hasEOL:c==="\n"}));
  const parsed=parseInamhiText(joinPdfItems(items));
  assert.equal(parsed.bulletinNumber,83);assert.equal(parsed.issuedAt,"2026-10-25T19:00:00.000Z");
  assert.deepEqual(parseInamhiText("Zonas: Manabí, Guayas. Guayasotros no cuenta.").areaNames,["Guayas","Manabí"]);
});

test("PDF sintético atraviesa extracción real, contrato y archivo; revisiones y reinicio",async t=>{
  const root=await sandbox(t);let time=new Date(date),bytes=syntheticBulletin();
  const store=new RawArtifactStore(root);
  const service=new IngestionService({store,now:()=>time,networkEnabled:true,allowPendingLicense:true,
    http:{get:async()=>({bytes,retrievedAt:time.toISOString(),mediaType:"application/pdf"})}});
  const first=await service.ingest("inamhi.warning.pdf");
  assert.equal(first.status,"partial");assert.equal(first.dispatchMode,"DRY_RUN");
  time=new Date(time.getTime()+3600000);
  assert.equal((await service.ingest("inamhi.warning.pdf")).revision,1);
  bytes=syntheticBulletin({number:84});time=new Date(time.getTime()+3600000);
  assert.equal((await service.ingest("inamhi.warning.pdf")).revision,2);
  const restarted=new RawArtifactStore(root);
  assert.deepEqual(await restarted.verify(),{captures:3,artifacts:2});
  const records=await restarted.records();
  assert.equal(records[1].envelope.time.firstSeenAt,date);
  assert.equal(records[0].envelope.time.issuedAt,"2026-10-25T19:00:00.000Z");
  assert.equal(records[0].envelope.details.bulletinNumber,83);
  assert.deepEqual(records[0].envelope.spatial.areaNames,["Guayas"]);
  assert.ok(records[0].envelope.quality.blockers.includes("map_not_reviewed"));
  time=new Date(time.getTime()+3600000);
  const reprocessed=await service.reprocess(first.captureId);
  const interpretation=(await store.records()).at(-1);
  assert.equal(reprocessed.revision,1);
  assert.equal(interpretation.operation,"reprocess");
  assert.equal(interpretation.captureRef,first.captureId);
  assert.equal(interpretation.retrievedAt,date);
  assert.equal((await service.health())[0].captureCount,3);
  // Offline backup to a new root, then verification of every indexed byte/hash.
  const backup=path.join(root,"backup");await fs.cp(path.join(root,"hazards"),path.join(backup,"hazards"),{recursive:true});
  assert.deepEqual(await new RawArtifactStore(backup).verify(),{captures:4,artifacts:2});
  await fs.writeFile(path.join(restarted.root,records[0].envelope.raw.storageKey),"corrupt");
  await assert.rejects(()=>restarted.verify(),/artifact_corrupt/);
});

test("fallo de fuente conserva captura previa, frescura y código sanitizado",async t=>{
  const root=await sandbox(t);let time=new Date(date),fail=false;
  const service=new IngestionService({store:new RawArtifactStore(root),now:()=>time,networkEnabled:true,allowPendingLicense:true,
    http:{get:async()=>{if(fail)throw new Error("https://private/secret");return {bytes:syntheticBulletin(),retrievedAt:time.toISOString(),mediaType:"application/pdf"};}}});
  await service.ingest("inamhi.warning.pdf");fail=true;time=new Date(time.getTime()+300001);
  assert.equal((await service.ingest("inamhi.warning.pdf")).errorCode,"ingestion_failed");
  assert.equal((await service.health())[0].status,"degraded");
  assert.equal((await service.store.records()).length,1);
  time=new Date(time.getTime()+7200000);
  assert.equal((await service.health())[0].status,"stale");
  assert.equal(JSON.stringify(await service.store.records("failures")).includes("secret"),false);
});

test("fixtures aislados y archivo/red requieren opt-in independiente",async t=>{
  const root=await sandbox(t);const store=new RawArtifactStore(root);
  let calls=0;const http={get:async()=>{calls++;throw new Error("not expected");}};
  await assert.rejects(()=>new IngestionService({store,http}).ingest("inamhi.warning.pdf"),/network_opt_in_required/);
  await assert.rejects(()=>new IngestionService({store,http,networkEnabled:true}).ingest("inamhi.warning.pdf"),/research_archive_opt_in_required/);
  const fixtures=new RawArtifactStore(root,{origin:"synthetic_fixture"});
  const service=new IngestionService({store:fixtures,http,networkEnabled:true});
  await assert.rejects(()=>service.ingest("inamhi.warning.pdf"),/live_fixture_mixing_forbidden/);
  assert.equal(calls,0);
  await service.importFixture("inamhi.warning.pdf",syntheticBulletin(),{mediaType:"application/pdf",retrievedAt:date});
  const e=(await fixtures.records())[0].envelope;
  assert.equal(e.recordOrigin,"synthetic_fixture");assert.equal(e.raw.sha256,null);
  assert.equal(e.time.firstSeenAt,null);assert.equal(e.retrievedAt,null);assert.equal(e.quality.dataStatus,"unknown");
  assert.deepEqual(await store.records(),[]);
});

test("cuotas, formato desconocido y lock nunca sobreescriben historia",async t=>{
  const root=await sandbox(t);const store=new RawArtifactStore(root,{maxCaptures:1});let time=new Date(date);
  const service=new IngestionService({store,now:()=>time,networkEnabled:true,allowPendingLicense:true,
    http:{get:async()=>({bytes:syntheticBulletin(),retrievedAt:date,mediaType:"application/pdf"})}});
  await service.ingest("inamhi.warning.pdf");
  time=new Date(time.getTime()+300001);
  assert.equal((await service.ingest("inamhi.warning.pdf")).errorCode,"store_capacity_exceeded");
  assert.equal((await store.verify()).captures,1);
  await fs.writeFile(path.join(store.root,"writer.lock"),"");
  await assert.rejects(()=>store.failure({sourceId:"inamhi.warning.pdf",at:date,code:"timeout"}),/store_busy/);
  await fs.unlink(path.join(store.root,"writer.lock"));
  await fs.writeFile(path.join(store.root,"format.json"),JSON.stringify({version:99,origin:"captured_source"}));
  await assert.rejects(()=>store.records(),/unsupported_store_format/);
});

test("SNGR error 200/truncamiento/nulos no pasan por cobertura verificada",async()=>{
  const adapter=new SngrArcgisAdapter(),source=registry.get("sngr.multihazard.single");
  await assert.rejects(()=>adapter.normalize(json({error:{code:400}}),source,captured,metadata),/provider_json_error/);
  const e=await adapter.normalize(json({features:[{attributes:{objectid:1}}],exceededTransferLimit:true}),source,captured,metadata);
  validateEnvelope(e);assert.equal(e.kind,"static_exposure");assert.equal(e.details.features[0].categoryRaw,null);
  assert.ok(e.quality.blockers.includes("transfer_limit"));assert.equal(e.spatial.geometryRef,null);
});

test("forecast requiere mm/UTC, conserva null, modelo y disponibilidad separados",async()=>{
  const adapter=new OpenMeteoSingleRunsAdapter(),source=registry.get("openmeteo.singlerun.test");
  const data={hourly:{time:["2026-10-25T00:00"],precipitation:[null]},hourly_units:{precipitation:"mm"},utc_offset_seconds:0};
  const e=await adapter.normalize(json(data),source,captured,metadata);validateEnvelope(e);
  assert.equal(e.time.availabilityVerifiedAt,date);assert.notEqual(e.time.availabilityVerifiedAt,e.time.runInitializedAt);
  assert.equal(e.details.precipitationMm[0],null);assert.ok(e.quality.blockers.includes("model_identity_unknown"));
  data.hourly_units.precipitation="inch";
  await assert.rejects(()=>adapter.normalize(json(data),source,captured,metadata),/invalid_forecast_units_or_timezone/);
});

test("modelo explícito verificado se atribuye a la solicitud, no a un eco inexistente",async()=>{
  const adapter=new OpenMeteoSingleRunsAdapter(),source=registry.get("openmeteo.singlerun.ecmwf");
  const data={hourly:{time:["2026-10-25T00:00"],precipitation:[1]},hourly_units:{precipitation:"mm"},utc_offset_seconds:0};
  const e=await adapter.normalize(json(data),source,captured,metadata);validateEnvelope(e);
  assert.equal(e.details.providerModel,"ecmwf_ifs");assert.equal(e.details.modelIdentityBasis,"explicit_request");
  assert.ok(!e.quality.blockers.includes("model_identity_unknown"));
  data.model="different-model";
  await assert.rejects(()=>adapter.normalize(json(data),source,captured,metadata),/forecast_model_mismatch/);
});

test("PDF imagen, vencido, HTML y texto parcial no originan aviso válido",async()=>{
  const source=registry.get("inamhi.warning.pdf");
  const adapter=new InamhiPdfAdapter({extractText:async()=>"SYNTHETIC IMAGE NO TEXT"});
  const e=await adapter.normalize(Buffer.from("%PDF-mock"),source,{...captured,mediaType:"application/pdf"},metadata);
  validateEnvelope(e);assert.equal(e.quality.dataStatus,"unknown");
  await assert.rejects(()=>adapter.normalize(Buffer.from("<html>"),source,captured,metadata),/not_pdf_magic/);
  assert.equal(parseInamhiText("Fecha y hora de emision: lunes, 30 de febrero de 2026, 14:00 horas").issuedAt,null);
});

test("HTTP fijo rechaza redirección, pausa host y corta tamaños sin reintentos",async()=>{
  let calls=0;let time=new Date(date);
  const client=new SourceHttp({now:()=>time,random:()=>0,httpFetch:async(url,options)=>{
    calls++;assert.equal(options.method,"GET");assert.equal(options.redirect,"manual");
    return new Response(null,{status:429,headers:{"retry-after":"3600"}});
  }});
  await assert.rejects(()=>client.get("sngr.multihazard.single"),/http_429/);
  await assert.rejects(()=>client.get("sngr.flood.single"),/source_cooldown/);assert.equal(calls,1);
  await assert.rejects(()=>client.get("https://private.example"),/unknown_source/);
  time=new Date(time.getTime()+3600001);
  await assert.rejects(()=>client.get("sngr.multihazard.single"),/http_429/);assert.equal(calls,2);
  for(const [response,code] of [[new Response(null,{status:302}),"http_302"],[new Response("x",{headers:{"content-length":"9999999"}}),"body_too_large"]]) {
    const http=new SourceHttp({httpFetch:async()=>response});
    await assert.rejects(()=>http.get("inamhi.warning.pdf"),new RegExp(code));
  }
});

test("reiniciar el CLI no elude Retry-After; latencia/HTTP quedan en el índice",async t=>{
  const root=await sandbox(t);let time=new Date(date),calls=0;
  const httpFetch=async()=>{
    calls++;
    if(calls===1) return new Response(null,{status:429,headers:{"retry-after":"3600"}});
    return new Response(JSON.stringify({features:[]}),{headers:{"content-type":"application/json"}});
  };
  const service=()=>new IngestionService({store:new RawArtifactStore(root),now:()=>time,networkEnabled:true,allowPendingLicense:true,
    http:new SourceHttp({now:()=>time,httpFetch,random:()=>0})});
  assert.equal((await service().ingest("sngr.multihazard.single")).errorCode,"http_429");
  time=new Date(time.getTime()+300001);
  assert.equal((await service().ingest("sngr.flood.single")).errorCode,"source_cooldown");
  assert.equal(calls,1);
  time=new Date(time.getTime()+3600000);
  await service().ingest("sngr.multihazard.single");
  assert.equal(calls,2);
  const record=(await new RawArtifactStore(root).records())[0];
  assert.equal(record.transport.httpStatus,200);assert.equal(record.transport.elapsedMs,0);
});

test("journal de fallos exige UTC canónico y no escribe tiempos imposibles o sin zona",async t=>{
  const root=await sandbox(t),store=new RawArtifactStore(root);
  for(const at of ["2026-02-30T12:00:00Z","2026-10-27T12:00:00","2026-10-27T12:00:00-05:00"])
    await assert.rejects(store.failure({sourceId:"inamhi.warning.pdf",at,code:"timeout"}),/invalid_failure/);
  await assert.rejects(store.failure({sourceId:"inamhi.warning.pdf",at:date,code:"timeout",retryAt:"2026-02-30T12:00:00Z"}),/invalid_failure/);
  assert.deepEqual(await fs.readdir(root),[]);
});
