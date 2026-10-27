import test from "node:test";
import assert from "node:assert/strict";
import {selectKnownCaptures} from "./knowledge-cutoff.js";
import {utcMillis} from "./time.js";
import {captureRecord as record} from "./fixtures/captures.js";

test("emisión del 25 no backdatea una captura/interpretación del 27",()=>{
  const capture=record();
  const before=selectKnownCaptures([capture],"2026-10-25T23:00:00Z");
  assert.equal(before.known.length,0);assert.equal(before.excluded[0].reason,"not_known_at_cutoff");
  assert.equal(selectKnownCaptures([capture],capture.retrievedAt).known.length,0);
  const known=selectKnownCaptures([capture],capture.processedAt);
  assert.equal(known.known.length,1);assert.equal(known.known[0].knownAt,capture.processedAt);
  assert.equal(known.publicationBlocked,true);assert.equal(known.alertsPublishEnabled,false);
});

test("corrección reprocesada después del corte no aparece antes; original sigue auditable",()=>{
  const original=record({retrievedAt:"2026-10-25T22:00:00Z",processedAt:"2026-10-25T22:01:00Z"});
  const correction=structuredClone(original);Object.assign(correction,{id:"correction-1",sequence:2,operation:"reprocess",captureRef:original.id,processedAt:"2026-10-27T18:00:00Z"});
  assert.deepEqual(selectKnownCaptures([original,correction],"2026-10-26T12:00:00Z").known.map(r=>r.captureId),[original.id]);
  assert.deepEqual(selectKnownCaptures([correction,original],"2026-10-28T12:00:00Z").known.map(r=>r.captureId),[original.id,correction.id]);
  correction.captureRef="missing";
  assert.equal(selectKnownCaptures([original,correction],"2026-10-28T12:00:00Z").excluded[0].reason,"invalid_reprocessing_reference");
});

test("corrida inicializada antes del corte pero descargada después no entra al replay",()=>{
  const forecast=record({kind:"forecast_run",retrievedAt:"2026-10-26T10:00:00Z",processedAt:"2026-10-26T10:01:00Z"});
  assert.equal(selectKnownCaptures([forecast],"2026-10-25T18:00:00Z").known.length,0);
  assert.equal(selectKnownCaptures([forecast],"2026-10-27T00:00:00Z").known.length,1);
  forecast.envelope.time.availabilityVerifiedAt=null;
  assert.equal(selectKnownCaptures([forecast],"2026-10-27T00:00:00Z").excluded[0].reason,"forecast_availability_unverified");
});

test("modelo ausente o reloj de disponibilidad incoherente excluyen el pronóstico",()=>{
  const forecast=record({kind:"forecast_run"});forecast.envelope.details.providerModel=null;
  assert.equal(selectKnownCaptures([forecast],"2026-10-28T00:00:00Z").excluded[0].reason,"model_identity_unknown");
  forecast.envelope.details.providerModel="synthetic-test-model";
  forecast.envelope.time.availabilityVerifiedAt="2026-10-28T00:00:00Z";
  assert.equal(selectKnownCaptures([forecast],"2026-10-29T00:00:00Z").excluded[0].reason,"incoherent_forecast_clock");
});

test("vencimiento exacto no borra evidencia ni se presenta como aviso activo",()=>{
  const capture=record();
  const expired=selectKnownCaptures([capture],capture.envelope.time.validTo);
  assert.equal(expired.known.length,1);assert.equal(expired.known[0].activeAtCutoff,false);
  capture.envelope.time.validTo=null;
  assert.equal(selectKnownCaptures([capture],"2026-10-29T04:00:00Z").known[0].activeAtCutoff,null);
});

test("capturas legacy sin tiempo de procesamiento, reloj inválido y hash distinto no se inventan",()=>{
  for(const mutate of [r=>{delete r.processedAt;},r=>{r.processedAt="2026-10-27T17:00:00Z";},r=>{r.sha256="b".repeat(64);}]) {
    const capture=record();mutate(capture);
    assert.equal(selectKnownCaptures([capture],"2026-10-28T00:00:00Z").known.length,0);
  }
  assert.ok(Number.isNaN(utcMillis("2026-02-30T00:00:00Z")));
  assert.throws(()=>selectKnownCaptures([],"2026-10-25T14:00:00-05:00"),/invalid_as_of_utc/);
  const legacy=record();delete legacy.processedAt;
  const reprocessed={...structuredClone(legacy),id:"explicit-reprocess",sequence:2,operation:"reprocess",captureRef:legacy.id,processedAt:"2026-10-28T00:00:00Z"};
  assert.deepEqual(selectKnownCaptures([legacy,reprocessed],reprocessed.processedAt).known.map(r=>r.captureId),[reprocessed.id]);
});

test("fixtures requieren modo explícito y contexto estático nunca es evaluación dinámica",()=>{
  const synthetic=record({origin:"synthetic_fixture"});
  assert.equal(selectKnownCaptures([synthetic],"2026-10-28T00:00:00Z").excluded[0].reason,"origin_mismatch");
  const simulated=selectKnownCaptures([synthetic],"2026-10-28T00:00:00Z",{recordOrigin:"synthetic_fixture"});
  assert.equal(simulated.known[0].recordOrigin,"synthetic_fixture");assert.equal(simulated.dispatchMode,"DRY_RUN");
  const context=selectKnownCaptures([record({kind:"static_exposure"})],"2026-10-28T00:00:00Z");
  assert.equal(context.known[0].contextOnly,true);assert.equal(context.known[0].activeAtCutoff,null);
});

test("selección es determinista, sin mutar inputs, con límites y sin IDs ambiguos",()=>{
  const capture=record(),before=JSON.stringify(capture);
  assert.deepEqual(selectKnownCaptures([capture],"2026-10-28T00:00:00Z"),selectKnownCaptures([capture],"2026-10-28T00:00:00Z"));
  assert.equal(JSON.stringify(capture),before);
  assert.throws(()=>selectKnownCaptures([capture,capture],"2026-10-28T00:00:00Z"),/duplicate_capture_id/);
  assert.throws(()=>selectKnownCaptures(Array(10001).fill(null),"2026-10-28T00:00:00Z"),/invalid_replay_input/);
});
