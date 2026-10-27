import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {assessHazard} from "./assess.js";
import {GridWeatherBridge} from "./grid-weather.js";
import {RawArtifactStore} from "./artifact-store.js";
import {SourceHttp} from "./http.js";
import {captureRecord as record} from "./fixtures/captures.js";
const asOf="2026-10-27T18:05:00Z";
const assess=(records,area="guayaquil",options={})=>assessHazard({records,asOf,area,...options});

test("aviso primario conserva clase, nivel fuente y alcance provincial; no invade Pallatanga",()=>{
  const r=record(),result=assess([r]),candidate=result.candidates[0];
  assert.equal(candidate.messageClass,"OFFICIAL");assert.equal(candidate.sourceRiskLevel,"SYNTHETIC TEST");
  assert.equal(candidate.scope.precision,"province");assert.equal(candidate.scope.name,"Guayas");
  assert.equal(candidate.severity,"watch");assert.equal(candidate.status,"draft");assert.equal(candidate.publicationBlocked,true);
  assert.equal(assess([r],"pallatanga").candidates.length,0);
  r.envelope.sourceUrl="https://unregistered.example/warning";
  assert.equal(assess([r]).excluded.at(-1).reason,"source_url_not_registered");
});

test("sin datos, fuente vencida o fallida permanecen desconocidos, nunca all-clear",()=>{
  assert.equal(assess([]).status,"unknown");
  const r=record();r.envelope.time.validTo=asOf;
  assert.equal(assess([r]).candidates.length,0);
  r.envelope.quality.dataStatus="unknown";
  assert.equal(assess([r]).status,"unknown");
  assert.equal(Object.hasOwn(assess([r]),"probabilityOfFlooding"),false);
});

test("revisión conocida sustituye interpretación del mismo boletín, sin filtrar corrección futura",()=>{
  const original=record(),revision=structuredClone(original);
  Object.assign(revision,{id:"revision",sequence:2,operation:"reprocess",captureRef:original.id,processedAt:"2026-10-27T18:06:00Z"});
  revision.envelope.details.sourceRiskLevel="SYNTHETIC CORRECTION";
  assert.equal(assess([original,revision]).candidates[0].sourceRiskLevel,"SYNTHETIC TEST");
  const later=assess([original,revision],"guayaquil",{asOf:"2026-10-27T18:07:00Z"});
  assert.equal(later.candidates.length,1);assert.equal(later.candidates[0].sourceRiskLevel,"SYNTHETIC CORRECTION");
  assert.equal(later.candidates[0].familyId,assess([original]).candidates[0].familyId);
  assert.notEqual(later.candidates[0].revisionHash,assess([original]).candidates[0].revisionHash);
});

test("forecast necesita 24 horas completas y no infiere inundación a partir de lluvia",()=>{
  const r=record({kind:"forecast_run"});
  r.envelope.details.time=Array.from({length:24},(_,i)=>new Date(Date.parse("2026-10-27T20:00:00Z")+i*3600000).toISOString());
  r.envelope.details.precipitationMm=Array(24).fill(1);
  const candidate=assess([r]).candidates[0];
  assert.equal(candidate.messageClass,"AEGIS_ASSESSMENT");assert.equal(candidate.evidenceClass,"FORECAST");
  assert.equal(assess([r]).contexts[0].messageClass,"FORECAST");
  assert.equal(candidate.facts.forecast24hMm,24);assert.equal(candidate.scope.precision,"point");
  assert.equal(candidate.phenomenon,"rainfall_watch");
  assert.equal(assess([r],"pallatanga").candidates.length,0);
  r.envelope.details.precipitationMm[4]=null;
  assert.equal(assess([r]).excluded.at(-1).reason,"forecast_24h_coverage_unknown");
});

test("observación local, nulos, fecha futura y límite de frescura no crean falsas señales",()=>{
  const r=record({kind:"observation"}),candidate=assess([r],"pallatanga").candidates[0];
  assert.equal(candidate.messageClass,"AEGIS_ASSESSMENT");assert.equal(candidate.evidenceClass,"OBSERVATION");
  assert.equal(candidate.scope.precision,"station");assert.equal(candidate.facts.rainDailyMm,null);
  assert.equal(assess([r],"pallatanga").contexts[0].messageClass,"OBSERVATION");
  assert.equal(assess([r]).candidates.length,0);
  assert.equal(assess([r],"pallatanga",{asOf:"2026-10-27T19:00:00Z"}).candidates.length,0);
  r.envelope.details.rainRateMmHr=null;
  assert.equal(assess([r],"pallatanga").status,"unknown");
  r.envelope.details.rainRateMmHr=99;r.envelope.details.upstreamFailed=true;
  assert.equal(assess([r],"pallatanga").candidates.length,0);
});

test("susceptibilidad ALTA es contexto estático, sin candidatos dinámicos",()=>{
  const r=record({kind:"static_exposure"});r.envelope.details.features=[{objectId:1,categoryRaw:"ALTA",cantonCode:"0901",cantonName:"Guayaquil",hazardRaw:null}];
  const result=assess([r]);assert.equal(result.candidates.length,0);
  assert.equal(result.contexts[0].notForPrediction,true);assert.equal(result.status,"unknown");
  assert.equal(result.contexts[0].evidenceClass,"STATIC_EXPOSURE");assert.equal(result.contexts[0].messageClass,undefined);
});

test("simulación requiere origen explícito y no marca disponibilidad sintética como verificada",()=>{
  const r=record({kind:"forecast_run",origin:"synthetic_fixture"});
  r.fixtureForecastAvailabilityAt=r.retrievedAt;
  r.envelope.details.time=Array.from({length:24},(_,i)=>new Date(Date.parse("2026-10-27T20:00:00Z")+i*3600000).toISOString());
  r.envelope.details.precipitationMm=Array(24).fill(2);
  assert.equal(assess([r]).candidates.length,0);
  const candidate=assess([r],"guayaquil",{recordOrigin:"synthetic_fixture"}).candidates[0];
  assert.equal(candidate.recordOrigin,"synthetic_fixture");assert.equal(candidate.facts.availabilityVerifiedAt,null);
  assert.equal(candidate.facts.simulatedAvailabilityAt,r.retrievedAt);assert.equal(candidate.dispatchMode,"DRY_RUN");
});

test("puente v4 persiste solo métricas permitidas, conserva timestamp y no consulta red",async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-grid-bridge-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const measured=new Date(Date.now()-60000).toISOString(),store=new RawArtifactStore(root);
  const input={timestamp:"2020-01-01T00:00:00Z",weather:{timestamp:measured,rainRateMmHr:9,rainDailyMm:null,
    mac:"private-mac",lat:1,lon:2,history:["private"],arbitrary:"private-key"}};
  const result=await new GridWeatherBridge({store}).capture(input);
  assert.equal(result.status,"partial");
  const records=await store.records(),saved=records[0],raw=(await store.readRaw(saved.sha256)).toString();
  assert.equal(raw.includes("private"),false);assert.equal(saved.envelope.details.measuredAt,measured);
  const assessed=assessHazard({records,area:"pallatanga",asOf:saved.processedAt});
  assert.equal(assessed.candidates[0].evidenceClass,"OBSERVATION");
  await assert.rejects(()=>new SourceHttp().get("grid.pallatanga.weather"),/non_network_source/);
});

test("evaluación determinista no muta originales ni descarta incertidumbre",()=>{
  const r=record(),before=JSON.stringify(r);
  assert.deepEqual(assess([r]),assess([r]));assert.equal(JSON.stringify(r),before);
  assert.equal(assess([null]).status,"unknown");
  assert.throws(()=>assess([r],"unknown"),/unknown_pilot_area/);
  const tied=structuredClone(r);tied.id="ambiguous";tied.envelope.details.sourceRiskLevel="DIFFERENT SYNTHETIC CONTENT";
  assert.equal(assess([r,tied]).excluded.at(-1).reason,"ambiguous_revision_order");
  assert.equal(assess([r,tied]).candidates.length,0);
  const forged=record({kind:"observation"});forged.sourceId="inamhi.warning.pdf";forged.envelope.sourceId=forged.sourceId;
  forged.envelope.sourceUrl=r.envelope.sourceUrl;
  assert.equal(assess([forged]).excluded.at(-1).reason,"source_kind_mismatch");
});

test("lluvia de la hora anterior no se atribuye a la ventana futura del modelo",()=>{
  const r=record({kind:"forecast_run"});
  r.envelope.details.time=Array.from({length:25},(_,i)=>new Date(Date.parse("2026-10-27T19:00:00Z")+i*3600000).toISOString());
  r.envelope.details.precipitationMm=[99,...Array(24).fill(0)];
  const result=assess([r]);
  assert.equal(result.candidates.length,0);assert.equal(result.contexts[0].facts.forecast24hMm,0);
  r.envelope.details.precipitationMm[24]=20;
  const candidate=assess([r]).candidates[0];
  assert.equal(candidate.validFrom,"2026-10-27T19:00:00.000Z");
  assert.equal(candidate.validTo,"2026-10-28T19:00:00.000Z");
  assert.equal(candidate.facts.forecast24hMm,20);
});
