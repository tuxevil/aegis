import {isDeepStrictEqual} from "node:util";
import {assessArchive} from "../hazards/assess.js";
// Re-evaluation reads the verified private archive. No provider calls, request
// supplied validators or acceptance of a caller's `current: true` field.
export function archiveEvidenceVerifier(store) {
  return async(candidate,at)=>{
    if(candidate.recordOrigin!==store.origin)return {current:false};
    const assessment=await assessArchive({store,area:candidate.areaId,asOf:at});
    return {current:assessment.candidates.some(current=>isDeepStrictEqual({...current,evaluatedAt:candidate.evaluatedAt},candidate))};
  };
}
