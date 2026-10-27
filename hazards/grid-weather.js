import {SourceRegistry,safeMode} from "./registry.js";
import {baseEnvelope} from "./adapters.js";
import {utcMillis} from "./time.js";

function measurementTime(value) {
  if(typeof value!=="string")return null;
  if(Number.isFinite(utcMillis(value)))return new Date(value).toISOString();
  const match=value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?)([+-])(\d{2}):(\d{2})$/);
  if(!match||!Number.isFinite(utcMillis(match[1]+"Z"))||Number(match[3])>14||Number(match[4])>59||(Number(match[3])===14&&Number(match[4])!==0))return null;
  const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;
}
const rain=value=>typeof value==="number"&&Number.isFinite(value)&&value>=0?value:null;

// Local import of an existing v4 panorama. No station API call and no MAC,
// coordinates, history, arbitrary error text or other source fields are stored.
export class GridWeatherBridge {
  constructor({store,now=()=>new Date(),registry=new SourceRegistry()}={}) {
    if(!store||store.namespace!=="sources")throw new Error("source_store_required");
    Object.assign(this,{store,now,registry});
  }
  async capture(status,{fixture=false}={}) {
    if(fixture!==(this.store.origin==="synthetic_fixture"))throw new Error("live_fixture_mixing_forbidden");
    const weather=status?.weather;
    if(!weather||typeof weather!=="object"||Array.isArray(weather))throw new Error("missing_grid_weather");
    const source=this.registry.get("grid.pallatanga.weather"),retrievedAt=this.now().toISOString();
    const measuredAt=measurementTime(weather.timestamp);
    const reading={measuredAt,rainRateMmHr:rain(weather.rainRateMmHr),rainDailyMm:rain(weather.rainDailyMm),scope:"single_station",
      upstreamFailed:weather.retrievalFailed===true||typeof weather.error==="string"};
    const bytes=Buffer.from(JSON.stringify(reading));
    const record=await this.store.capture({bytes,sourceId:source.id,retrievedAt,normalize:raw=>{
      const e=baseEnvelope(source,{retrievedAt,mediaType:"application/json"},raw);e.kind="observation";
      e.details=reading;e.spatial={precision:"station",areaNames:["Pallatanga"],crs:null,geometryRef:null};
      e.time.sourceTimeZone="America/Guayaquil";
      e.time.originalTimeText=measuredAt?weather.timestamp:null;
      const age=measuredAt?utcMillis(retrievedAt)-utcMillis(measuredAt):null;
      e.quality.dataStatus=fixture||age===null||age<0||reading.upstreamFailed?"unknown":age>source.ttlMs?"stale":"partial";
      e.quality.blockers=["single_station_not_canton_coverage","license_not_verified_for_publication",...(fixture?["synthetic_fixture_never_publish"]:[])];
      if(reading.upstreamFailed)e.quality.blockers.push("upstream_retrieval_failed");
      if(age===null||age<0)e.quality.blockers.push("measurement_time_unknown_or_future");
      return e;
    }});
    return {...safeMode,captureId:record.id,sourceId:source.id,status:record.envelope.quality.dataStatus,publicationBlocked:true};
  }
}
