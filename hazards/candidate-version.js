// Compare reviewable content, retaining every field except evaluation clock and
// the four volatile capture-reference fields. Provenance is verified separately.
export function candidateVersion(candidate) {
  const version=structuredClone(candidate);delete version.evaluatedAt;
  version.sourceRefs=version.sourceRefs.map(ref=>{
    const stable={...ref};for(const field of ["captureId","knownAt","retrievedAt","processedAt"])delete stable[field];return stable;
  });
  return version;
}
