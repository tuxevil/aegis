import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assessHazard} from './assess.js';
import {scoreReviewedCases} from './metrics.js';
import {pilotArea} from './areas.js';
import {validateEnvelope} from './envelope.js';
import {utcMillis} from './time.js';
import {safeMode} from './registry.js';
const HOUR=3600000,hex=/^[a-f0-9]{64}$/;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const targets={
  'synthetic-model-rain-24h':{kind:'forecast_run',precision:'point',context:'model_forecast',evidence:'FORECAST'},
  'synthetic-station-monitoring':{kind:'observation',precision:'station',context:'station_observation',evidence:'OBSERVATION'},
};
export const benchmarkVersion='hazard-benchmark-1';
export async function assessmentFingerprint() {
  const files=['assess.js','candidate-version.js','knowledge-cutoff.js','forecast-location.js','time.js','registry.js','areas.js','envelope.js',
    '../docs/contracts/source-envelope.v1.schema.json','../scripts/probe-aegis-sources.mjs'];
  const values=await Promise.all(files.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')})));
  return hash(values);
}
async function scoringFingerprint() {
  const files=['metrics.js','benchmark.js'];
  return hash(await Promise.all(files.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(new URL(file,import.meta.url))).digest('hex')}))));
}
function checkCorpus(inputs,labels) {
  if(inputs?.datasetKind!=='AEGIS_SYNTHETIC_BENCHMARK_INPUTS'||labels?.datasetKind!=='AEGIS_SYNTHETIC_BENCHMARK_LABELS'||
    inputs.schemaVersion!==1||labels.schemaVersion!==1||inputs.recordOrigin!=='synthetic_fixture'||labels.recordOrigin!=='synthetic_fixture'||
    inputs.license!=='MIT'||labels.license!=='MIT'||typeof inputs.corpusId!=='string'||inputs.corpusId!==labels.corpusId||
    !Array.isArray(inputs.cases)||!inputs.cases.length||inputs.cases.length>100||!Array.isArray(labels.labels)||inputs.cases.length!==labels.labels.length)throw new Error('invalid_benchmark_corpus');
  const ids=new Set(),byId=new Map();
  for(const c of inputs.cases) {
    const area=pilotArea(c.areaId),target=targets[c.target];
    if(Object.keys(c).some(k=>!['id','target','phenomenon','areaId','dpaCode','precision','decisionAt','records'].includes(k))||
      typeof c.id!=='string'||!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(c.id)||ids.has(c.id)||!area||area.dpaCode!==c.dpaCode||
      !target||c.phenomenon!=='rainfall_watch'||target.precision!==c.precision||!Number.isFinite(utcMillis(c.decisionAt))||
      !Array.isArray(c.records)||!c.records.length||c.records.length>10||c.records.some(r=>r.envelope?.recordOrigin!=='synthetic_fixture'||r.envelope.kind!==target.kind))throw new Error('invalid_benchmark_case');
    for(const record of c.records) {
      if(Object.keys(record).some(k=>!['id','sequence','operation','sourceId','sha256','retrievedAt','processedAt','envelope','fixtureForecastAvailabilityAt','captureRef'].includes(k)))throw new Error('invalid_benchmark_snapshot');
      validateEnvelope(record.envelope);
    }
    ids.add(c.id);
  }
  for(const label of labels.labels) {
    if(!ids.has(label.id)||byId.has(label.id)||![true,false,null].includes(label.outcome)||label.verification!=='synthetic'||
      !Number.isFinite(utcMillis(label.windowFrom))||!Number.isFinite(utcMillis(label.windowTo))||utcMillis(label.windowFrom)>=utcMillis(label.windowTo)||
      !Number.isFinite(utcMillis(label.reviewedAt))||utcMillis(label.reviewedAt)<utcMillis(label.windowTo)||
      (label.outcome===true&&(!Number.isFinite(utcMillis(label.eventAt))||utcMillis(label.eventAt)<utcMillis(label.windowFrom)||utcMillis(label.eventAt)>=utcMillis(label.windowTo))))throw new Error('invalid_benchmark_label');
    byId.set(label.id,label);
  }
  return byId;
}
function classifyAssessment(c,result) {
  const target=targets[c.target];
  if(result?.areaId!==c.areaId||result.asOf!==c.decisionAt||result.recordOrigin!=='synthetic_fixture'||result.publicationBlocked!==true||result.alertsPublishEnabled!==false||result.dispatchMode!=='DRY_RUN'||
    !Array.isArray(result.candidates)||!Array.isArray(result.contexts)||!Array.isArray(result.excluded)||typeof result.policy?.version!=='string')throw new Error('invalid_benchmark_assessment');
  if(result.candidates.some(p=>p.areaId!==c.areaId||p.recordOrigin!=='synthetic_fixture'||p.publicationBlocked!==true||p.alertsPublishEnabled!==false||p.dispatchMode!=='DRY_RUN'))throw new Error('invalid_benchmark_candidate');
  const candidates=result.candidates.filter(p=>p.phenomenon===c.phenomenon&&p.evidenceClass===target.evidence&&p.scope?.precision===c.precision);
  const context=result.contexts.filter(x=>x.contextType===target.context&&x.scope?.precision===c.precision);
  let prediction='unknown',from=null,to=null,known=null;
  if(candidates.length===1) {
    const p=candidates[0];prediction='watch';from=p.validFrom;to=p.validTo;
    const times=p.sourceRefs.map(r=>utcMillis(r.knownAt));if(!times.length||!times.every(Number.isFinite))throw new Error('invalid_benchmark_signal');
    known=new Date(Math.max(...times)).toISOString();
  } else if(!candidates.length&&context.length===1) {
    const f=context[0].facts;
    const complete=target.evidence==='FORECAST'?typeof f.forecast24hMm==='number'&&Number.isFinite(f.forecast24hMm):
      ['rainRateMmHr','rainDailyMm'].every(k=>typeof f[k]==='number'&&Number.isFinite(f[k]));
    if(complete) {
      prediction='not_triggered';const start=target.evidence==='FORECAST'?Math.ceil(utcMillis(c.decisionAt)/HOUR)*HOUR:utcMillis(f.measuredAt);
      from=new Date(start).toISOString();to=new Date(start+(target.evidence==='FORECAST'?24:1)*HOUR).toISOString();
    }
  }
  return {id:c.id,target:c.target,areaId:c.areaId,precision:c.precision,decisionAt:c.decisionAt,prediction,
    evidenceFrom:from,evidenceTo:to,firstSignalKnownAt:known,candidateCount:candidates.length,
    missingEvidence:prediction==='unknown'?[context.length?'complete_inputs_for_control':'eligible_source_context']:[],
    ruleIds:[...new Set(candidates.map(p=>p.ruleId))].sort(),inputSnapshotIds:c.records.map(r=>r.id),
    exclusionReasons:[...new Set(result.excluded.map(e=>e.reason))].sort()};
}
function scoreRows(rows,inputs,labels) {
  const groups=[];
  for(const key of [...new Set(rows.map(r=>r.target+':'+r.areaId))].sort()) {
    const selected=rows.filter(r=>r.target+':'+r.areaId===key),cases=selected.map(r=>{
      const label=labels.get(r.id),input=inputs.cases.find(c=>c.id===r.id);
      const covered=r.prediction!=='unknown'&&Number.isFinite(utcMillis(r.evidenceFrom))&&Number.isFinite(utcMillis(r.evidenceTo))&&
        utcMillis(r.evidenceFrom)<=utcMillis(label.windowFrom)&&utcMillis(r.evidenceTo)>=utcMillis(label.windowTo);
      return {id:r.id,recordOrigin:'synthetic_fixture',verification:'synthetic',evaluationKey:key,coverageVerified:covered,compatibilityVerified:true,
        decisionAt:input.decisionAt,windowFrom:label.windowFrom,windowTo:label.windowTo,reviewedAt:label.reviewedAt,eventAt:label.eventAt,outcome:label.outcome,
        forecastPositive:r.prediction==='unknown'?null:r.prediction==='watch',firstSignalKnownAt:r.firstSignalKnownAt,signalValidFrom:r.evidenceFrom,signalValidTo:r.evidenceTo};
    });
    const metrics=scoreReviewedCases(cases,{evaluationKey:key,recordOrigin:'synthetic_fixture'});
    groups.push({target:selected[0].target,areaId:selected[0].areaId,caseCount:selected.length,
      unknownSourceCases:selected.filter(r=>r.prediction==='unknown').map(r=>r.id),
      unknownLabels:selected.filter(r=>labels.get(r.id).outcome===null).map(r=>r.id),
      eventsWithoutUsableEvidence:selected.filter(r=>r.prediction==='unknown'&&labels.get(r.id).outcome===true).map(r=>r.id),metrics});
  }
  return groups;
}
export async function runSyntheticBenchmark({inputs,labels,assessor=assessHazard,implementationSha256}={}) {
  const byId=checkCorpus(inputs,labels);
  if(assessor!==assessHazard&&!hex.test(implementationSha256??''))throw new Error('benchmark_implementation_identity_required');
  const rows=[],versions=new Set();
  for(const c of inputs.cases) {
    // Labels, outcomes, event windows and review fields never enter the assessor.
    const result=assessor({records:structuredClone(c.records),area:c.areaId,asOf:c.decisionAt,recordOrigin:'synthetic_fixture'});
    versions.add(result.policy?.version);rows.push(classifyAssessment(c,result));
  }
  if(versions.size!==1)throw new Error('mixed_benchmark_policy_versions');
  return {benchmarkKind:'AEGIS_SYNTHETIC_BENCHMARK',benchmarkVersion,corpusId:inputs.corpusId,recordOrigin:'synthetic_fixture',license:'MIT',
    ...safeMode,publicationBlocked:true,historicalValidationStatus:'not_established',operationalProbability:null,
    caseCount:rows.length,inputSha256:hash(inputs),labelSha256:hash(labels),
    scoringImplementationSha256:await scoringFingerprint(),dependencyLockSha256:createHash('sha256').update(await fs.readFile(new URL('../package-lock.json',import.meta.url))).digest('hex'),assessmentImplementationSha256:implementationSha256??await assessmentFingerprint(),
    policyVersion:[...versions][0],rows,groups:scoreRows(rows,inputs,byId),
    limitations:['Artificial controls only, not measured incidents or verified historical non-events','Unknown source evidence is excluded from conditional rates and reported separately',
      'Lead times are synthetic control intervals, not delivery performance or disaster prediction','No external provider is ground truth; no key, network, publication or rule activation']};
}
export function compareBenchmarks({baseline,current,inputs,labels}={}) {
  const byId=checkCorpus(inputs,labels),ids=inputs.cases.map(c=>c.id);
  for(const report of [baseline,current]) {
    if(report?.benchmarkKind!=='AEGIS_SYNTHETIC_BENCHMARK'||report.benchmarkVersion!==benchmarkVersion||report.recordOrigin!=='synthetic_fixture'||report.publicationBlocked!==true||
      report.alertsPublishEnabled!==false||report.dispatchMode!=='DRY_RUN'||report.inputSha256!==hash(inputs)||report.labelSha256!==hash(labels)||
      !hex.test(report.scoringImplementationSha256??'')||!hex.test(report.dependencyLockSha256??'')||!hex.test(report.assessmentImplementationSha256??'')||!Array.isArray(report.rows)||report.rows.length!==ids.length||new Set(report.rows.map(r=>r.id)).size!==ids.length)throw new Error('incompatible_benchmark_reports');
    for(const row of report.rows) {
      const c=inputs.cases.find(c=>c.id===row.id);
      if(!c||row.target!==c.target||row.areaId!==c.areaId||row.precision!==c.precision||row.decisionAt!==c.decisionAt||!['watch','not_triggered','unknown'].includes(row.prediction)||
        (row.prediction==='watch'&&!Number.isFinite(utcMillis(row.firstSignalKnownAt))))throw new Error('invalid_benchmark_prediction');
    }
  }
  // Recompute both sides with the same labels/scorer. Never trust stored totals.
  const before=scoreRows(baseline.rows,inputs,byId),after=scoreRows(current.rows,inputs,byId),groups=[];
  for(const group of after) {
    const prior=before.find(g=>g.target===group.target&&g.areaId===group.areaId);
    const common=group.metrics.evaluated.map(c=>c.id).filter(id=>prior.metrics.evaluated.some(c=>c.id===id));
    const old=scoreRows(baseline.rows.filter(r=>common.includes(r.id)),inputs,byId).find(g=>g.target===group.target&&g.areaId===group.areaId);
    const next=scoreRows(current.rows.filter(r=>common.includes(r.id)),inputs,byId).find(g=>g.target===group.target&&g.areaId===group.areaId);
    const delta=(a,b)=>typeof a==='number'&&typeof b==='number'?b-a:null;
    groups.push({target:group.target,areaId:group.areaId,baselineEvaluated:prior.metrics.evaluated.length,currentEvaluated:group.metrics.evaluated.length,
      commonCaseIds:common,baselineOnCommon:old?.metrics??null,currentOnCommon:next?.metrics??null,
      deltaOnCommon:{falseAlertRate:delta(old?.metrics.falseAlertRate.value,next?.metrics.falseAlertRate.value),missRate:delta(old?.metrics.missRate.value,next?.metrics.missRate.value)}});
  }
  const classification=(groups,id)=>groups.flatMap(g=>g.metrics.evaluated).find(c=>c.id===id)?.classification??null;
  const changes=ids.flatMap(id=>{const a=baseline.rows.find(r=>r.id===id),b=current.rows.find(r=>r.id===id),old=classification(before,id),next=classification(after,id);
    return a.prediction===b.prediction&&old===next?[]:[{id,baselinePrediction:a.prediction,currentPrediction:b.prediction,baselineClassification:old,currentClassification:next}];});
  return {benchmarkVersion,...safeMode,publicationBlocked:true,recordOrigin:'synthetic_fixture',historicalValidationStatus:'not_established',
    comparisonScoringSha256:current.scoringImplementationSha256,baselineScoresRecomputed:true,
    scoringCodeChanged:baseline.scoringImplementationSha256!==current.scoringImplementationSha256,
    baselineImplementationSha256:baseline.assessmentImplementationSha256,currentImplementationSha256:current.assessmentImplementationSha256,
    implementationChanged:baseline.assessmentImplementationSha256!==current.assessmentImplementationSha256,dependencyLockChanged:baseline.dependencyLockSha256!==current.dependencyLockSha256,
    policyVersionChanged:baseline.policyVersion!==current.policyVersion,behaviorChangedWithoutPolicyVersion:changes.length>0&&baseline.policyVersion===current.policyVersion,changes,groups,
    notice:'Conditional rates compare only common evaluated cases; inspect coverage changes and unknowns separately. No operational accuracy claim.'};
}
