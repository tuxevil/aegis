import test from "node:test";
import assert from "node:assert/strict";
import {inspectWarningValidity} from "./warning-validity.js";

// Synthetic normalized dates; not a captured bulletin or historic availability.
const sample={issuedAt:"2026-10-25T19:00:00Z",validFrom:"2026-10-25T21:00:00Z",
  validTo:"2026-10-29T04:00:00Z",retrievedAt:"2026-10-27T18:00:00Z"};
const now=new Date("2026-10-27T18:01:00Z");
test("fechas vigentes no certifican fuente, licencia o distribución",()=>{
  assert.deepEqual(inspectWarningValidity(sample,now),{dataStatus:"valid",blockers:[],effectiveNow:true});
});
test("PDF antiguo y vencimiento exacto bloquean nuevos avisos",()=>{
  assert.equal(inspectWarningValidity(sample,new Date(sample.validTo)).dataStatus,"stale");
  const old={issuedAt:"2025-05-01T12:00:00Z",validFrom:"2025-05-01T12:00:00Z",validTo:"2025-05-02T12:00:00Z",retrievedAt:sample.retrievedAt};
  assert.equal(inspectWarningValidity(old,now).dataStatus,"stale");
});
test("fechas ausentes, inválidas o locales no se convierten en cobertura segura",()=>{
  for(const issuedAt of [null,"2026-10-25T14:00:00-05:00","2026-02-30T19:00:00Z"])
    assert.equal(inspectWarningValidity({...sample,issuedAt},now).dataStatus,"unknown");
});
test("reloj incoherente y emisión futura quedan desconocidos",()=>{
  assert.equal(inspectWarningValidity(sample,new Date("2026-10-24T00:00:00Z")).dataStatus,"unknown");
  assert.equal(inspectWarningValidity({...sample,issuedAt:"2026-10-28T19:00:00Z"},now).dataStatus,"unknown");
});
test("fin anterior al inicio es inválido; vigencia futura no se presenta efectiva",()=>{
  assert.equal(inspectWarningValidity({...sample,validTo:sample.validFrom},now).dataStatus,"invalid");
  const pending={...sample,retrievedAt:sample.issuedAt};
  assert.equal(inspectWarningValidity(pending,new Date(sample.issuedAt)).effectiveNow,false);
});
