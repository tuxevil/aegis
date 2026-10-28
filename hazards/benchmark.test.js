import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {runSyntheticBenchmark,compareBenchmarks} from './benchmark.js';import {assessHazard} from './assess.js';
const inputs=JSON.parse(await fs.readFile(new URL('../replay/benchmarks/synthetic-inputs.v1.json',import.meta.url),'utf8'));
const labels=JSON.parse(await fs.readFile(new URL('../replay/benchmarks/synthetic-labels.v1.json',import.meta.url),'utf8'));
const baseline=JSON.parse(await fs.readFile(new URL('../replay/benchmarks/rain-watch-controls.baseline.v1.json',import.meta.url),'utf8'));
const run=promisify(execFile);
test('controles sintéticos reproducibles separan regiones, errores y eventos sin evidencia',async()=>{
  const a=await runSyntheticBenchmark({inputs,labels}),b=await runSyntheticBenchmark({inputs,labels});assert.deepEqual(a,b);
  assert.equal(a.rows.length,13);assert.deepEqual(inputs.cases.find(c=>c.id==='forecast-positive-control').records[0].envelope,inputs.cases.find(c=>c.id==='forecast-false-alarm-control').records[0].envelope);assert.equal(a.operationalProbability,null);assert.equal(a.historicalValidationStatus,'not_established');
  for(const group of a.groups){assert.deepEqual(group.metrics.confusion,{tp:1,fp:1,tn:1,fn:1});assert.equal(group.metrics.falseAlertRate.value,.5);assert.equal(group.metrics.missRate.value,.5);}
  assert.equal(a.groups.flatMap(g=>g.unknownSourceCases).length,5);assert.equal(a.groups.flatMap(g=>g.eventsWithoutUsableEvidence).length,3);
  assert.equal(a.groups.flatMap(g=>g.unknownLabels).length,1);assert.equal(a.rows.find(r=>r.id==='forecast-positive-control').prediction,'watch');
  assert.equal(a.groups.find(g=>g.areaId==='guayaquil').metrics.sourceDetectionLag.value,null);
});
test('etiquetas no entran al motor y cambiarlas modifica solo puntuación',async()=>{
  let calls=0;const original=structuredClone(inputs);
  const assessor=args=>{calls++;assert.deepEqual(Object.keys(args).sort(),['area','asOf','recordOrigin','records']);assert.match(args.records[0].id,/^snapshot-[0-9]+$/);assert.doesNotMatch(JSON.stringify(args),/positive-control|false-alarm-control|miss-control|eventAt|outcome/);return assessHazard(args);};
  const a=await runSyntheticBenchmark({inputs,labels,assessor,implementationSha256:'1'.repeat(64)});
  const changed=structuredClone(labels),label=changed.labels.find(c=>c.id==='forecast-positive-control');label.outcome=false;label.eventAt=null;
  const b=await runSyntheticBenchmark({inputs,labels:changed,assessor,implementationSha256:'1'.repeat(64)});
  assert.equal(calls,26);assert.deepEqual(a.rows,b.rows);assert.notDeepEqual(a.groups,b.groups);assert.deepEqual(inputs,original);
  assert.notEqual(a.labelSha256,b.labelSha256);assert.equal(a.inputSha256,b.inputSha256);
});
test('comparación antes/después informa omisiones y no confía en agregados del archivo',async()=>{
  const current=await runSyntheticBenchmark({inputs,labels,implementationSha256:'2'.repeat(64),assessor:args=>{const result=assessHazard(args);result.candidates=[];return result;}});
  const altered=structuredClone(baseline);altered.groups=[];
  const comparison=compareBenchmarks({baseline:altered,current,inputs,labels});assert.equal(comparison.changes.length,4);assert.equal(comparison.implementationChanged,true);
  assert.equal(comparison.groups[0].currentOnCommon.confusion.fn,2);assert.equal(comparison.groups[0].deltaOnCommon.missRate,.5);
  assert.equal(comparison.groups[0].deltaOnCommon.falseAlertRate,null);
});
test('perder cobertura no se presenta como mejora de error sobre una población distinta',async()=>{
  const current=await runSyntheticBenchmark({inputs,labels,implementationSha256:'3'.repeat(64),assessor:args=>{const result=assessHazard(args);
    if(args.records[0].id===inputs.cases.find(c=>c.id==='forecast-positive-control').records[0].id){result.candidates=[];result.contexts=[];}return result;}});
  const comparison=compareBenchmarks({baseline,current,inputs,labels}),group=comparison.groups.find(g=>g.areaId==='guayaquil');
  assert.equal(group.baselineEvaluated,4);assert.equal(group.currentEvaluated,3);assert.equal(group.commonCaseIds.length,3);
  assert.equal(group.deltaOnCommon.missRate,0);assert.equal(comparison.changes[0].currentClassification,null);
  assert.equal(current.groups.find(g=>g.areaId==='guayaquil').eventsWithoutUsableEvidence.length,3);
});
test('orígenes reales, labels en entradas e informes incompatibles se rechazan',async()=>{
  const wrong=structuredClone(inputs);wrong.cases[0].outcome=true;await assert.rejects(()=>runSyntheticBenchmark({inputs:wrong,labels}));
  delete wrong.cases[0].outcome;wrong.cases[0].records[0].envelope.recordOrigin='captured_source';await assert.rejects(()=>runSyntheticBenchmark({inputs:wrong,labels}));
  const report=await runSyntheticBenchmark({inputs,labels}),other=structuredClone(baseline);other.inputSha256='0'.repeat(64);
  assert.throws(()=>compareBenchmarks({baseline:other,current:report,inputs,labels}),/incompatible/);
  await assert.rejects(()=>runSyntheticBenchmark({inputs,labels,assessor:()=>({})}),/identity_required/);
});
test('CLI no necesita claves/red y compara el baseline público sin ejecutar código externo',async t=>{
  const result=await run(process.execPath,['scripts/benchmark-hazards.mjs','--baseline=replay/benchmarks/rain-watch-controls.baseline.v1.json'],{env:{}});
  const report=JSON.parse(result.stdout);assert.equal(report.comparison.changes.length,0);assert.equal(report.current.dispatchMode,'DRY_RUN');
  await assert.rejects(()=>run(process.execPath,['scripts/benchmark-hazards.mjs','--live'],{env:{}}));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aegis-benchmark-budget-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const large=path.join(root,'too-big.json');await fs.writeFile(large,' '.repeat(2000001));
  await assert.rejects(()=>run(process.execPath,['scripts/benchmark-hazards.mjs',`--baseline=${large}`],{env:{}}));
});

test('sin cohorte común las tasas comparativas son null, no una mejora a cero',async()=>{
  const current=await runSyntheticBenchmark({inputs,labels,implementationSha256:'4'.repeat(64),assessor:args=>{const result=assessHazard(args);result.candidates=[];result.contexts=[];return result;}});
  const comparison=compareBenchmarks({baseline,current,inputs,labels});
  for(const group of comparison.groups){assert.equal(group.commonCaseIds.length,0);assert.equal(group.currentOnCommon,null);assert.equal(group.deltaOnCommon.missRate,null);}
  assert.equal(comparison.behaviorChangedWithoutPolicyVersion,true);
});
test('salida del evaluador de otro territorio o con publicación habilitada no es un benchmark válido',async()=>{
  for(const patch of [{areaId:'other'},{alertsPublishEnabled:true}])await assert.rejects(()=>runSyntheticBenchmark({inputs,labels,implementationSha256:'5'.repeat(64),assessor:args=>({...assessHazard(args),...patch})}),/invalid_benchmark_assessment/);
});
