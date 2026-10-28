import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {scoreReviewedCases} from "./metrics.js";
import {reportDocumentedCorpus} from "./corpus.js";

const base={recordOrigin:"synthetic_fixture",verification:"synthetic",evaluationKey:"test-point-rain",coverageVerified:true,compatibilityVerified:true,
  decisionAt:"2026-10-25T18:00:00Z",windowFrom:"2026-10-25T19:00:00Z",windowTo:"2026-10-26T19:00:00Z",reviewedAt:"2026-10-27T00:00:00Z",
  eventAt:"2026-10-26T12:00:00Z",signalValidFrom:"2026-10-25T19:00:00Z",firstSignalKnownAt:"2026-10-25T17:00:00Z",signalValidTo:"2026-10-26T19:00:00Z"};
const options={evaluationKey:base.evaluationKey,recordOrigin:"synthetic_fixture"};
test("métricas de corpus sintético distinguen TP/FP/FN/TN con denominadores explícitos",()=>{
  const cases=[[true,true],[true,false],[false,true],[false,false]].map(([forecastPositive,outcome],i)=>({...base,id:`case-${i}`,forecastPositive,outcome}));
  const result=scoreReviewedCases(cases,options);
  assert.deepEqual(result.confusion,{tp:1,fp:1,tn:1,fn:1});
  assert.equal(result.falseAlertRate.value,.5);assert.equal(result.falseAlertRate.denominator,2);
  assert.equal(result.missRate.value,.5);assert.equal(result.leadTime[0].minutes,19*60);
  assert.equal(result.calibrationStatus,"not_validated_for_operational_probability");assert.equal(result.publicationBlocked,true);
});
test("datos faltantes y cobertura no verificada no se convierten en no-eventos",()=>{
  const cases=[{...base,id:"unknown",forecastPositive:null,outcome:null},{...base,id:"coverage",forecastPositive:false,outcome:false,coverageVerified:false}];
  const result=scoreReviewedCases(cases,options);
  assert.equal(result.evaluated.length,0);assert.equal(result.excluded.length,2);
  assert.equal(result.falseAlertRate.value,null);assert.equal(result.missRate.value,null);assert.equal(result.sourceDetectionLag.value,null);
});
test("etiquetas futuras, señal posterior al corte y ausencia de prueba de publicación no fabrican latencia",()=>{
  for(const patch of [{reviewedAt:"2026-10-25T20:00:00Z"},{firstSignalKnownAt:"2026-10-25T18:01:00Z"},{eventAt:"2026-10-25T18:00:00Z"}])
    assert.equal(scoreReviewedCases([{...base,id:"bad-time",forecastPositive:true,outcome:true,...patch}],options).evaluated.length,0);
  const noPublication=scoreReviewedCases([{...base,id:"no-pub",forecastPositive:true,outcome:true}],options);
  assert.equal(noPublication.sourceDetectionLag.value,null);
  const proven={...base,id:"pub",forecastPositive:true,outcome:true,documentedPublicationAt:"2026-10-25T16:55:00Z",publicationVerification:"independent_timestamp",provenance:["https://example.org/synthetic-fixture"]};
  assert.equal(scoreReviewedCases([proven],options).sourceDetectionLag.value,5);
});
test("corpus real exige revisión y procedencia; no mezcla targets ni orígenes",()=>{
  const real={...base,id:"real-shaped",recordOrigin:"captured_source",verification:"reviewed",forecastPositive:true,outcome:true};
  assert.equal(scoreReviewedCases([real],{evaluationKey:base.evaluationKey}).evaluated.length,0);
  assert.equal(scoreReviewedCases([{...real,reviewedBy:"test-reviewer",provenance:["https://example.org/synthetic-test-format"]}],{evaluationKey:base.evaluationKey}).evaluated.length,1);
  assert.equal(scoreReviewedCases([{...base,id:"other",evaluationKey:"different-target",forecastPositive:true,outcome:true}],options).evaluated.length,0);
  assert.throws(()=>scoreReviewedCases([{...base,id:"duplicate"},{...base,id:"duplicate"}],options),/invalid_metric_case_identity/);
});
test("replay documental conserva brechas 21–27, no filtra impacto retrospectivo ni produce tasas falsas",()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL("../replay/multihazard-corpus.v1.json",import.meta.url)));
  const reference=JSON.parse(fs.readFileSync(new URL("../replay/guayaquil-2026-10-26.json",import.meta.url)));
  const report=reportDocumentedCorpus(manifest,reference,["2026-10-25T22:00:00Z","2026-10-25T23:30:00Z"]);
  assert.equal(report.coverage.length,14);assert.ok(report.coverage.every(row=>row.outcome===null));
  assert.equal(report.runs[0].knownReferences.length,0);assert.equal(report.runs[1].knownReferences.length,1);
  assert.equal(report.runs[1].previews[0].contextualLeadMinutesToAfternoonRain,1139);
  assert.equal(report.runs[1].previews[0].messageClass,"AEGIS_ASSESSMENT");
  assert.equal(JSON.stringify(report.runs).includes("95.3"),false);
  assert.equal(report.metrics.falseAlertRate.value,null);assert.equal(report.metrics.missRate.value,null);
  assert.equal(report.recordOrigin,"documented_reference");
});

test("señales sin vigencia para toda la ventana no fabrican aciertos ni falsas alarmas",()=>{
  const positive={...base,signalValidFrom:base.windowFrom,id:"temporal-scope",forecastPositive:true,outcome:true};
  for(const patch of [
    {signalValidTo:"2026-10-26T11:59:00Z"}, // expires before the actual event
    {signalValidFrom:"2026-10-25T20:00:00Z"}, // starts after evaluation window
    {signalValidFrom:null},
    {signalValidTo:"2026-10-26T18:59:00Z",outcome:false}, // incomplete negative exposure
  ]) {
    const result=scoreReviewedCases([{...positive,...patch}],options);
    assert.equal(result.evaluated.length,0);assert.equal(result.excluded[0].reason,"signal_window_not_covered");
    assert.equal(result.falseAlertRate.value,null);assert.equal(result.missRate.value,null);assert.equal(result.leadTime.length,0);
  }
  const complete=scoreReviewedCases([positive],options);assert.equal(complete.confusion.tp,1);
});

test("evidencia primaria retrospectiva no cambia entradas, borradores o tasas del replay",()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL("../replay/multihazard-corpus.v1.json",import.meta.url)));
  const reference=JSON.parse(fs.readFileSync(new URL("../replay/guayaquil-2026-10-26.json",import.meta.url)));
  const cutoffs=["2026-10-24T23:00:00Z","2026-10-25T23:30:00Z","2026-10-26T19:30:00Z"];
  const legacy=structuredClone(manifest);delete legacy.historicalDocuments;
  for(const row of legacy.coverage)delete row.hindsightReferences;
  const before=reportDocumentedCorpus(legacy,reference,cutoffs),after=reportDocumentedCorpus(manifest,reference,cutoffs);
  assert.deepEqual(after.runs,before.runs);assert.deepEqual(after.metrics,before.metrics);
  assert.equal(after.hindsightOnly.historicalDocuments.length,1);
  assert.equal(after.hindsightOnly.usedAsReplayInput,false);assert.equal(after.hindsightOnly.usedAsReviewedLabels,false);
  assert.ok(after.coverage.every(row=>row.outcome===null));
  assert.equal(after.hindsightOnly.historicalDocuments[0].firstEvidenceAvailableAt,null);
  assert.equal(after.metrics.falseAlertRate.value,null);assert.equal(after.metrics.missRate.value,null);
  const changed=structuredClone(manifest);changed.historicalDocuments[0].summary="HINDSIGHT_SENTINEL 95.3";
  const amended=reportDocumentedCorpus(changed,reference,cutoffs);
  assert.deepEqual(amended.runs,after.runs);assert.ok(!JSON.stringify(amended.runs).includes("HINDSIGHT_SENTINEL"));
});

test("referencias retrospectivas rechazan mezcla con eventos o referencias de entrada",()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL("../replay/multihazard-corpus.v1.json",import.meta.url)));
  const reference=JSON.parse(fs.readFileSync(new URL("../replay/guayaquil-2026-10-26.json",import.meta.url)));
  const cutoff=["2026-10-26T19:30:00Z"];
  for(const mutate of [
    m=>{m.historicalDocuments[0].knowledgeRole="replay_input";},
    m=>{m.historicalDocuments.push(structuredClone(m.historicalDocuments[0]));},
    m=>{m.historicalDocuments[0].sourceUrl="https://private:secret@example.org/document";},
    m=>{m.coverage[0].hindsightReferences=["not-a-reviewed-document"];},
    m=>{m.coverage[0].references=[m.historicalDocuments[0].id];},
  ]) {
    const invalid=structuredClone(manifest);mutate(invalid);
    assert.throws(()=>reportDocumentedCorpus(invalid,reference,cutoff),/invalid_retrospective/);
  }
  const mixed=structuredClone(reference);mixed.events[0].sourceUrl=manifest.historicalDocuments[0].sourceUrl;
  assert.throws(()=>reportDocumentedCorpus(manifest,mixed,cutoff),/invalid_retrospective/);
});
