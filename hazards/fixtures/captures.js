import {SourceRegistry} from "../registry.js";
import {baseEnvelope} from "../adapters.js";

// Synthetic representations for contract/algorithm tests, not provider captures.
export function captureRecord({id="capture-1",retrievedAt="2026-10-27T18:00:00.000Z",processedAt="2026-10-27T18:01:00.000Z",kind="official_warning",origin="captured_source"}={}) {
  const sourceId=kind==="forecast_run"?"openmeteo.singlerun.test":kind==="observation"?"grid.pallatanga.weather":kind==="static_exposure"?"sngr.flood.single":"inamhi.warning.pdf";
  const source=new SourceRegistry().get(sourceId),sha256="a".repeat(64);
  const e=baseEnvelope(source,{retrievedAt,mediaType:kind==="official_warning"?"application/pdf":"application/json"},
    {recordOrigin:origin,sha256,byteLength:30,storageKey:"raw/"+sha256,firstSeenAt:retrievedAt});
  e.kind=kind;e.quality.dataStatus=origin==="synthetic_fixture"?"unknown":"partial";
  if(kind==="official_warning") {
    Object.assign(e.time,{issuedAt:"2026-10-25T19:00:00Z",validFrom:"2026-10-25T21:00:00Z",validTo:"2026-10-29T04:00:00Z"});
    e.spatial.precision="province";e.spatial.areaNames=["Guayas"];
    e.details={bulletinNumber:999,authority:"INAMHI",sourceRiskLevel:"SYNTHETIC TEST",phenomena:["synthetic rain"],areasMentioned:["Guayas"],coveredAreaNames:["Guayas"],mapReviewed:false};
  } else if(kind==="forecast_run") {
    Object.assign(e.time,{runInitializedAt:"2026-10-25T00:00:00Z",availabilityVerifiedAt:origin==="captured_source"?retrievedAt:null});
    e.spatial.precision="point";e.spatial.areaNames=["Guayaquil · punto aproximado sintético"];
    e.details={requestedLatitude:-2.19,requestedLongitude:-79.88,gridLatitude:-2.19,gridLongitude:-79.88,gridLocationStatus:"approximate",providerModel:"synthetic-test-model",runInitializedAt:e.time.runInitializedAt,time:["2026-10-25T12:00:00Z"],precipitationMm:[null],unit:"mm"};
  } else if(kind==="observation") {
    e.spatial.precision="station";e.spatial.areaNames=["Pallatanga"];
    e.details={measuredAt:retrievedAt,rainRateMmHr:9,rainDailyMm:null,scope:"single_station",upstreamFailed:false};
  } else e.details={features:[],exceededTransferLimit:null,sourceCrs:null,geometryIncluded:false};
  return {id,sequence:1,operation:"capture",sourceId:source.id,sha256,retrievedAt,processedAt,envelope:e};
}
