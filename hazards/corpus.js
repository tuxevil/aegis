import {replayCase} from "../replay/engine.js";
import {scoreReviewedCases} from "./metrics.js";
import {utcMillis} from "./time.js";
import {safeMode} from "./registry.js";

export function reportDocumentedCorpus(manifest,caseData,cutoffs) {
  if(manifest?.corpusKind!=="AEGIS_DOCUMENTED_REFERENCE_CORPUS"||!Array.isArray(manifest.coverage)||manifest.coverage.length>1000||!Array.isArray(cutoffs)||cutoffs.length>1000)
    throw new Error("invalid_documented_corpus");
  const runs=cutoffs.map(asOf=>{
    if(!Number.isFinite(utcMillis(asOf)))throw new Error("invalid_as_of_utc");
    const replay=replayCase(caseData,asOf);
    return {asOf,mode:"documented_public_reference_not_actual_AEGIS_capture",knownReferences:replay.knownEvents,
      previews:replay.drafts.map(d=>({referenceId:d.eventId,messageClass:"AEGIS_ASSESSMENT",sourceClassification:"secondary_reference",
        contextualLeadMinutesToAfternoonRain:d.leadMinutesToAfternoonRainWindow,
        warning:"Not actual delivery lead time, not anticipation of all flooding, not a street prediction"}))};
  });
  return {...safeMode,corpusId:manifest.id,recordOrigin:"documented_reference",coverage:structuredClone(manifest.coverage),runs,
    metrics:scoreReviewedCases([],{recordOrigin:"documented_reference",evaluationKey:"rain-watch-v1"}),
    limitations:["No validated non-event sample; false-alert and miss rates are unknown","No primary historical raw bulletin capture before the event",
      "Only dated secondary references establish documented public knowledge; actual AEGIS ingestion is separate",
      "Station impact totals in hindsightOnly never enter replay features"],publicationBlocked:true};
}
