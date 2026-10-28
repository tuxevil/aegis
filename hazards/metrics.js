import {utcMillis} from "./time.js";
import {safeMode} from "./registry.js";

const ratio=(numerator,denominator)=>({value:denominator?numerator/denominator:null,numerator,denominator});
const citations=caseData=>Array.isArray(caseData.provenance)&&caseData.provenance.length>0&&caseData.provenance.every(url=>{
  try {const u=new URL(url);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}
});

// Evaluation-only reviewed labels. Never pass outcomes/impacts into assessHazard.
// Ratios describe the selected corpus, never a probability of a disaster.
export function scoreReviewedCases(cases,{evaluationKey,recordOrigin="captured_source"}={}) {
  if(!Array.isArray(cases)||cases.length>10000||typeof evaluationKey!=="string"||!evaluationKey||!["captured_source","synthetic_fixture","documented_reference"].includes(recordOrigin))throw new Error("invalid_metric_input");
  const ids=new Set(),excluded=[],evaluated=[],leadTime=[],detectionLag=[];
  let tp=0,fp=0,tn=0,fn=0;
  for(const c of cases) {
    if(typeof c?.id!=="string"||!c.id||ids.has(c.id))throw new Error("invalid_metric_case_identity");ids.add(c.id);
    const reject=reason=>excluded.push({id:c.id,reason});
    if(c.evaluationKey!==evaluationKey){reject("incompatible_evaluation_target");continue;}
    if(recordOrigin==="documented_reference"||c.recordOrigin!==recordOrigin||c.verification!==(recordOrigin==="synthetic_fixture"?"synthetic":"reviewed")||
      (recordOrigin==="captured_source"&&(!citations(c)||typeof c.reviewedBy!=="string"||!c.reviewedBy))){reject("labels_or_provenance_not_verified");continue;}
    if(c.coverageVerified!==true||c.compatibilityVerified!==true||typeof c.forecastPositive!=="boolean"||typeof c.outcome!=="boolean") {
      reject("coverage_or_labels_unknown");continue;
    }
    const decision=utcMillis(c.decisionAt),start=utcMillis(c.windowFrom),end=utcMillis(c.windowTo),review=utcMillis(c.reviewedAt);
    if(![decision,start,end,review].every(Number.isFinite)||decision>start||start>=end||review<end){reject("evaluation_window_not_verified");continue;}
    const event=c.outcome?utcMillis(c.eventAt):null;
    if(c.outcome&&(!Number.isFinite(event)||event<start||event>=end||event<=decision)){reject("event_outside_evaluation_window");continue;}
    const signal=c.forecastPositive?utcMillis(c.firstSignalKnownAt):null;
    if(c.forecastPositive&&(!Number.isFinite(signal)||signal>decision)) {
      reject("signal_not_known_or_relevant_at_cutoff");continue;
    }
    const signalFrom=utcMillis(c.signalValidFrom),signalTo=utcMillis(c.signalValidTo);
    if(c.forecastPositive&&(!Number.isFinite(signalFrom)||!Number.isFinite(signalTo)||signalFrom>start||signalTo<end||signalFrom>=signalTo)) {
      reject("signal_window_not_covered");continue;
    }
    const classification=c.forecastPositive?(c.outcome?"TP":"FP"):(c.outcome?"FN":"TN");
    if(classification==="TP") {tp++;leadTime.push({id:c.id,minutes:(event-signal)/60000});}
    if(classification==="FP")fp++;if(classification==="FN")fn++;if(classification==="TN")tn++;
    if(c.forecastPositive&&c.publicationVerification==="independent_timestamp"&&Number.isFinite(utcMillis(c.documentedPublicationAt))&&utcMillis(c.documentedPublicationAt)<=signal&&citations(c))
      detectionLag.push({id:c.id,minutes:(signal-utcMillis(c.documentedPublicationAt))/60000});
    evaluated.push({id:c.id,classification});
  }
  return {...safeMode,recordOrigin,evaluationKey,signalWindowPolicy:"full_evaluation_window_v1",caseCount:cases.length,evaluated,excluded,confusion:{tp,fp,tn,fn},
    falseAlertRate:{...ratio(fp,tp+fp),definition:"FP / (TP + FP); false-alarm ratio of reviewed cases"},
    nonEventFalsePositiveRate:{...ratio(fp,fp+tn),definition:"FP / (FP + TN)"},
    missRate:{...ratio(fn,tp+fn),definition:"FN / (TP + FN)"},leadTime,
    sourceDetectionLag:{values:detectionLag,value:detectionLag.length?detectionLag.reduce((s,v)=>s+v.minutes,0)/detectionLag.length:null,
      definition:"Difference from independently timestamped publication to first known signal; not proof of first web upload time"},
    calibrationStatus:"not_validated_for_operational_probability",publicationBlocked:true};
}
