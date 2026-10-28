// Sanity guard for the single configured ECMWF profile, not canton membership or
// model accuracy. A 0.25-degree axis discrepancy requires operator investigation.
export function forecastLocation(sourceUrl,{latitude,longitude}={}) {
  const url=new URL(sourceUrl),requestedLatitude=Number(url.searchParams.get('latitude')),requestedLongitude=Number(url.searchParams.get('longitude'));
  const valid=(value,bound)=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=bound;
  if(!url.searchParams.has('latitude')||!url.searchParams.has('longitude')||!url.searchParams.get('latitude')?.trim()||!url.searchParams.get('longitude')?.trim()||!valid(requestedLatitude,90)||!valid(requestedLongitude,180))throw new Error('invalid_forecast_location_request');
  const gridLatitude=valid(latitude,90)?latitude:null,gridLongitude=valid(longitude,180)?longitude:null;
  const missing=(latitude===undefined||latitude===null)&&(longitude===undefined||longitude===null);
  const gridLocationStatus=missing?'missing':gridLatitude===null||gridLongitude===null?'invalid':
    Math.abs(gridLatitude-requestedLatitude)>0.25||Math.abs(gridLongitude-requestedLongitude)>0.25?'mismatch':'approximate';
  return {requestedLatitude,requestedLongitude,gridLatitude,gridLongitude,gridLocationStatus};
}
