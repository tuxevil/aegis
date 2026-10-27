import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {layerFixtures} from "./fixtures/arcgis.js";
import {SngrLayerAcquirer} from "./arcgis-acquirer.js";
import {SourceRegistry} from "./registry.js";
import {SourceHttp} from "./http.js";
import {RawArtifactStore} from "./artifact-store.js";
import {LayerResearchService} from "./layer-research.js";
const now=()=>new Date("2026-10-27T20:00:00Z");
const sourceId="sngr.flood.layer",area="guayaquil";
async function sandbox(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-layer-test-"));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;
}
const fixtureService=(root,fixtures)=>new LayerResearchService({store:new RawArtifactStore(root,{origin:"synthetic_fixture",namespace:"layers"}),now,
  acquirer:SngrLayerAcquirer.fromFixtures(fixtures,{now})});

test("2501 entidades paginadas se cotejan contra manifiesto, sin límite falso de 2000",async()=>{
  const id="sngr.multihazard.layer";
  const fixtures=layerFixtures({sourceId:id,count:2501,pageSize:100,pagination:true});
  const result=await SngrLayerAcquirer.fromFixtures(fixtures,{now}).acquire({sourceId:id,area});
  assert.equal(result.featureCount,2501);assert.equal(result.requests,32);
  assert.equal(result.completeness,"verified_id_manifest");assert.equal(result.publicationBlocked,true);
  assert.equal(result.dispatchMode,"DRY_RUN");
});

test("MapServer sin paginación usa objectIds acotados y conserva procedencia original",async()=>{
  const registry=new SourceRegistry();const specs=[];
  const fixtures=layerFixtures({count:3});let index=0;
  const acquirer=new SngrLayerAcquirer({registry,now,wait:async()=>{},http:{get:async(id,spec)=>{
    specs.push(spec);return {bytes:Buffer.from(JSON.stringify(fixtures[index++].payload)),retrievedAt:now().toISOString(),mediaType:"application/json"};
  }}});
  const retained=[];
  const result=await acquirer.acquire({sourceId,area,onCapture:async(capture,details)=>{retained.push({capture,details});return `test-${retained.length}`;}});
  assert.equal(specs[3].mode,"batch");assert.deepEqual(specs[3].ids,[1,2]);
  assert.equal(new URL(retained[3].capture.sourceUrl).searchParams.get("outSR"),"32717");
  assert.equal(retained[3].details.sourceCrs,32717);assert.equal(retained[3].details.targetCrs,4326);
  assert.equal(retained[3].details.features[0].geometry.type,"Polygon");assert.equal(result.featureCount,3);
});

test("diagnóstico de manifiesto termina tras tres GETs sin descargar geometría",async()=>{
  const result=await SngrLayerAcquirer.fromFixtures(layerFixtures(),{now}).acquire({sourceId,area,inspectOnly:true});
  assert.equal(result.idCount,3);assert.equal(result.requestEvidence.length,3);
  assert.equal(result.geometryDownloaded,false);assert.equal(result.publicationBlocked,true);
  assert.ok(result.requestEvidence.every(r=>!new URL(r.sourceUrl).searchParams.has("objectIds")));
});

test("archivo completo, revisión, reinicio, corrupción y fallo parcial preservan versión anterior",async t=>{
  const root=await sandbox(t);
  const history='{"version":1,"series":{"preserved":[]}}';await fs.writeFile(path.join(root,"observations.json"),history);
  let service=fixtureService(root,layerFixtures());
  const first=await service.collect(sourceId,area,{fixture:true});
  assert.equal(first.status,"partial");assert.equal(first.featureCount,3);
  const records=await service.store.records();
  assert.ok(records.every(r=>r.envelope.recordOrigin==="synthetic_fixture"&&r.envelope.retrievedAt===null));
  assert.equal(records.filter(r=>r.envelope.details.geometryIncluded).length,2);
  assert.ok(records.filter(r=>r.envelope.details.geometryIncluded).every(r=>r.envelope.spatial.crs===4326&&r.envelope.details.sourceCrs===32717));
  service=fixtureService(root,layerFixtures({category:"MEDIA"}));
  assert.equal((await service.collect(sourceId,area,{fixture:true})).revision,2);
  assert.equal((await service.verify(sourceId,area)).featureCount,3);
  assert.equal((await service.verifyArchive()).collections,2);
  const backup=path.join(root,"restore-validation");
  await fs.cp(path.join(root,"hazards"),path.join(backup,"hazards"),{recursive:true});
  assert.equal((await fixtureService(backup,[]).verifyArchive()).collections,2);
  assert.equal(await fs.readFile(path.join(root,"observations.json"),"utf8"),history);
  assert.deepEqual(await new RawArtifactStore(root,{origin:"synthetic_fixture"}).records(),[]);
  const previous=(await service.snapshots()).at(-1);
  const broken=layerFixtures();broken[4].payload.features=[];
  service=fixtureService(root,broken);
  const failure=await service.collect(sourceId,area,{fixture:true});
  assert.equal(failure.errorCode,"incomplete_layer");
  assert.equal((await service.snapshots()).length,2);
  assert.equal((await service.verify(sourceId,area)).snapshotId,previous.id);
  const file=path.join(service.store.root,"collections",previous.id+".json");
  const tampered=JSON.parse(await fs.readFile(file,"utf8"));tampered.featureCount=0;
  await fs.writeFile(file,JSON.stringify(tampered));
  await assert.rejects(()=>service.verify(sourceId,area),/invalid_collection_index/);
});

test("manifiesto cambiante, edición silenciosa, duplicados y truncamiento bloquean snapshot",async()=>{
  for(const mutate of [
    f=>{f.at(-3).payload.objectIds.push(99);},
    f=>{f.at(-1).payload.editingInfo.lastEditDate=2;},
    f=>{f[3].payload.features[1].attributes.FID=1;},
    f=>{f[3].payload.exceededTransferLimit=true;},
    f=>{f[2].payload.objectIds.pop();},
    f=>{f.at(-2).payload.count=4;},
  ]) {
    const fixtures=layerFixtures();mutate(fixtures);
    await assert.rejects(()=>SngrLayerAcquirer.fromFixtures(fixtures,{now}).acquire({sourceId,area}),/layer_changed_during_acquisition|incomplete_layer|incomplete_id_manifest/);
  }
});

test("no inventa CRS, categoría, DPA ni geometrías; rechaza respuestas HTTP 200 con error",async()=>{
  for(const mutate of [
    f=>{f[0].payload.geometryType="esriGeometryPolyline";},
    f=>{f[3].payload.spatialReference.wkid=3857;},
    f=>{delete f[3].payload.features[0].attributes.sui;},
    f=>{f[3].payload.features[0].attributes.dpa_canton="0608";},
    f=>{f[3].payload={error:{code:400,message:"private remote detail"}};},
  ]) {
    const fixtures=layerFixtures();mutate(fixtures);
    await assert.rejects(()=>SngrLayerAcquirer.fromFixtures(fixtures,{now}).acquire({sourceId,area}),/unsupported_layer_metadata|invalid_feature_page|invalid_feature_territory_or_category|provider_json_error/);
  }
});

test("resultado vacío y metadato sin fecha de edición son desconocimiento, no tranquilidad",async()=>{
  const result=await SngrLayerAcquirer.fromFixtures(layerFixtures({count:0,lastEditDate:null}),{now}).acquire({sourceId,area});
  assert.equal(result.featureCount,0);assert.equal(result.snapshotAtomicity,"unknown");
  assert.ok(result.limitations.some(l=>l.includes("absence")));assert.equal(result.publicationBlocked,true);
});

test("presupuestos de requests, bytes, puntos y entidades no permiten colecciones parciales",async()=>{
  for(const [options,expected] of [
    [{maxRequests:3},"acquisition_request_budget"],[{maxBytes:10},"acquisition_byte_budget"],
    [{maxPoints:4},"acquisition_point_budget"],[{maxFeatures:2},"acquisition_feature_budget"],
  ]) await assert.rejects(()=>SngrLayerAcquirer.fromFixtures(layerFixtures(),{now,...options}).acquire({sourceId,area}),new RegExp(expected));
});

test("request builder excluye SSRF, SQL y parámetros arbitrarios antes de red",()=>{
  const registry=new SourceRegistry();
  assert.equal(registry.list().length,4);
  for(const request of [{mode:"ids",area:"0901' OR 1=1"},{mode:"ids",area,url:"https://private.example"},
    {mode:"batch",area,ids:[1,1]},{mode:"batch",area,ids:[-1]},{mode:"page",area,offset:0,count:2001}])
    assert.throws(()=>registry.requestUrl(sourceId,request),/invalid_source_request|invalid_source_area/);
  assert.throws(()=>registry.requestUrl("https://private.example",{mode:"metadata",area}),/unknown_source/);
});

test("fixture no puede conectar transporte real; opt-ins y lease previenen escrituras/red accidental",async t=>{
  const root=await sandbox(t),store=new RawArtifactStore(root,{namespace:"layers"});
  await assert.rejects(()=>new LayerResearchService({store}).collect(sourceId,area),/network_opt_in_required/);
  await assert.rejects(()=>new LayerResearchService({store,networkEnabled:true}).collect(sourceId,area),/research_archive_opt_in_required/);
  const synthetic=new RawArtifactStore(root,{origin:"synthetic_fixture",namespace:"layers"});
  await assert.rejects(()=>new LayerResearchService({store:synthetic}).collect(sourceId,area,{fixture:true}),/offline_fixture_transport_required/);
  await assert.rejects(()=>new LayerResearchService({store,networkEnabled:true,allowPendingLicense:true,acquirer:SngrLayerAcquirer.fromFixtures(layerFixtures(),{now})}).collect(sourceId,area),/live_fixture_mixing_forbidden/);
  const service=fixtureService(root,layerFixtures());
  const first=await service.collect(sourceId,area,{fixture:true});assert.equal(first.featureCount,3);
  const lease=(await fs.readdir(service.store.root)).filter(n=>n.startsWith("acquisition-"));assert.deepEqual(lease,[]);
});

test("dos adquisiciones concurrentes del mismo host no duplican solicitudes",async t=>{
  const root=await sandbox(t);let release,entered;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const service=fixtureService(root,layerFixtures()),original=service.acquirer.http.get;
  let calls=0;
  service.acquirer.http.get=async(...args)=>{if(!calls++){entered();await gate;}return original(...args);};
  const pending=service.collect(sourceId,area,{fixture:true});
  await started;
  try {assert.equal((await fixtureService(root,layerFixtures()).collect(sourceId,area,{fixture:true})).errorCode,"source_busy");}
  finally {release();}
  assert.equal((await pending).featureCount,3);assert.equal(calls,8);
});

test("429 detiene la colección y la pausa del host sobrevive al reinicio",async t=>{
  const root=await sandbox(t);let time=now().getTime(),calls=0;
  const clock=()=>new Date(time),metadata=layerFixtures()[0].payload;
  const http=new SourceHttp({now:clock,random:()=>0,httpFetch:async()=>{
    calls++;return calls===1?new Response(JSON.stringify(metadata)):new Response(null,{status:429,headers:{"retry-after":"7200"}});
  }});
  const service=new LayerResearchService({store:new RawArtifactStore(root,{namespace:"layers"}),now:clock,networkEnabled:true,allowPendingLicense:true,
    acquirer:new SngrLayerAcquirer({http,now:clock,wait:async ms=>{time+=ms;}})});
  assert.equal((await service.collect(sourceId,area)).errorCode,"http_429");assert.equal(calls,2);
  assert.equal((await service.snapshots()).length,0);
  time+=3600001;
  const restarted=new LayerResearchService({store:new RawArtifactStore(root,{namespace:"layers"}),now:clock,networkEnabled:true,allowPendingLicense:true});
  assert.equal((await restarted.collect("sngr.multihazard.layer",area)).errorCode,"source_cooldown");
  assert.equal(calls,2);
  const failures=await service.store.records("failures");assert.equal(failures[0].code,"http_429");
});
