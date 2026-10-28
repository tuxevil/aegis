import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastLocation} from './forecast-location.js';
import {OpenMeteoSingleRunsAdapter} from './adapters.js';
import {SourceRegistry} from './registry.js';
import {validateEnvelope} from './envelope.js';
import {captureRecord} from './fixtures/captures.js';
import {assessHazard} from './assess.js';
const source=new SourceRegistry().get('openmeteo.singlerun.ecmwf');
async function normalize(point) {
  const at='2026-10-27T18:00:00.000Z',data={...point,utc_offset_seconds:0,hourly_units:{precipitation:'mm'},hourly:{time:['2026-10-27T18:00'],precipitation:[null]}};
  return new OpenMeteoSingleRunsAdapter().normalize(Buffer.from(JSON.stringify(data)),source,{retrievedAt:at,mediaType:'application/json'},
    {recordOrigin:'captured_source',sha256:'a'.repeat(64),byteLength:100,storageKey:'raw/'+'a'.repeat(64),firstSeenAt:at});
}
test('punto solicitado y celda devuelta se conservan separados sin afirmar pertenencia cantonal',async()=>{
  const e=await normalize({latitude:-2.15,longitude:-79.85});validateEnvelope(e);
  assert.equal(e.details.requestedLatitude,-2.19);assert.equal(e.details.gridLatitude,-2.15);
  assert.equal(e.details.requestedLongitude,-79.88);assert.equal(e.details.gridLongitude,-79.85);
  assert.equal(e.details.gridLocationStatus,'approximate');assert.equal(e.quality.dataStatus,'partial');
  assert.ok(e.quality.blockers.includes('model_grid_not_canton_coverage'));assert.equal(e.quality.parserVersion,'multihazard-forecast-1.1.0');
});
test('celda ausente es null/unknown; no se sustituyen las coordenadas por el punto solicitado',async()=>{
  for(const point of [{},{latitude:null,longitude:null}]) {
    const e=await normalize(point);validateEnvelope(e);assert.equal(e.details.gridLatitude,null);assert.equal(e.details.gridLongitude,null);
    assert.equal(e.details.gridLocationStatus,'missing');assert.equal(e.quality.dataStatus,'unknown');
  }
});
test('coordenadas inválidas, incompletas y desplazamiento grueso quedan invalid sin coerción',async()=>{
  for(const point of [{latitude:'-2.19',longitude:-79.88},{latitude:91,longitude:-79.88},{latitude:-2.19},
    {latitude:0,longitude:0},{latitude:48.85,longitude:2.35}]) {
    const e=await normalize(point);validateEnvelope(e);assert.equal(e.quality.dataStatus,'invalid');
    assert.ok(['invalid','mismatch'].includes(e.details.gridLocationStatus));
  }
  assert.equal(forecastLocation(source.url,{latitude:-2.19,longitude:-79.88}).gridLocationStatus,'approximate');
});
test('evaluación muestra los puntos revisables y rechaza metadatos incoherentes o legado sin celda',()=>{
  const r=captureRecord({kind:'forecast_run'}),asOf='2026-10-27T18:05:00Z';
  r.envelope.details.time=Array.from({length:24},(_,i)=>new Date(Date.parse('2026-10-27T20:00:00Z')+i*3600000).toISOString());r.envelope.details.precipitationMm=Array(24).fill(1);
  const assess=()=>assessHazard({records:[r],asOf,area:'guayaquil'});
  assert.equal(assess().candidates[0].facts.modelPoint.gridLatitude,-2.19);
  r.envelope.details.requestedLatitude=-1.99856;assert.equal(assess().candidates.length,0);
  r.envelope.details.requestedLatitude=-2.19;r.envelope.details.gridLatitude=0;assert.equal(assess().excluded.at(-1).reason,'forecast_grid_unverified');
  for(const key of ['requestedLatitude','requestedLongitude','gridLatitude','gridLongitude','gridLocationStatus'])delete r.envelope.details[key];
  validateEnvelope(r.envelope);assert.equal(assess().candidates.length,0);
});

test('solicitud sin coordenadas válidas no se interpreta como cero',()=>{
  for(const query of ['', '?latitude=&longitude=-79', '?latitude=NaN&longitude=-79', '?latitude=-91&longitude=-79'])
    assert.throws(()=>forecastLocation('https://example.invalid/'+query),/invalid_forecast_location_request/);
});
