import {createHash} from 'node:crypto';
import {LayerResearchService} from './layer-research.js';
import {SourceRegistry,safeMode} from './registry.js';
import {pilotArea} from './areas.js';
import {utcMillis} from './time.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function pointCount(geometry) {
  if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type))throw new Error('invalid_territory_preview');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  let count=0;
  for(const polygon of polygons)for(const ring of polygon) {
    if(ring.length<4||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw new Error('invalid_territory_preview');
    for(const p of ring) {
      if(p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw new Error('invalid_territory_preview');
      count++;
    }
  }
  return count;
}
// Private review projection only. No network, publication, reprojection or repair.
export class TerritoryPreviewReader {
  constructor({store,registry=new SourceRegistry(),now=()=>new Date().toISOString(),maxPoints=100000,maxBytes=2000000}={}) {
    if(!store||store.namespace!=='layers'||store.readOnly!==true||!Number.isSafeInteger(maxPoints)||maxPoints<1||maxPoints>100000||
      !Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2000000)throw new Error('invalid_territory_reader_configuration');
    Object.assign(this,{store,registry,now,maxPoints,maxBytes});
  }
  async read({sourceId,area,limit=20,offset=0}={}) {
    const territory=pilotArea(area),source=this.registry.get(sourceId);
    if(!territory||source.type!=='arcgis-layer'||!Number.isSafeInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new Error('invalid_territory_request');
    const generatedAt=this.now();if(!Number.isFinite(utcMillis(generatedAt)))throw new Error('invalid_territory_clock');
    const service=new LayerResearchService({store:this.store,registry:this.registry});
    const snapshot=(await service.snapshots()).filter(s=>s.sourceId===sourceId&&s.areaId===territory.id).at(-1);
    const base={schemaVersion:'1.0',generatedAt,...safeMode,publicationBlocked:true,privateReviewOnly:true,recordOrigin:this.store.origin,
      evidenceClass:'STATIC_EXPOSURE',notForPrediction:true,areaId:territory.id,dpaCode:territory.dpaCode,boundaryVersion:null,
      sourceId,sourceUrl:source.url,owner:source.owner,licensingStatus:source.licensing.status,
      notice:'Susceptibilidad estática para revisión privada. No confirma un incidente ni predice una inundación o deslizamiento. Límites y derechos de publicación pendientes.'};
    if(!snapshot)return {...base,status:'unknown',snapshot:null,features:[],pagination:{limit,offset,total:null,hasMore:false}};
    if(snapshot.dpaCode!==territory.dpaCode||!Number.isFinite(utcMillis(snapshot.completedAt))||utcMillis(snapshot.completedAt)>utcMillis(generatedAt))throw new Error('invalid_territory_snapshot');
    await service.verify(sourceId,territory.id);
    const byId=new Map((await this.store.records()).map(r=>[r.id,r]));
    const selected=snapshot.artifactIds.map(id=>byId.get(id));
    if(hash(selected.map(r=>({sha256:r.sha256,url:r.envelope.sourceUrl})))!==snapshot.contentHash)throw new Error('invalid_territory_snapshot');
    const features=[];
    for(const record of selected) {
      const d=record.envelope.details;
      if(d.captureRole!=='features')continue;
      if(!d.geometryIncluded||d.sourceCrs!==32717||d.targetCrs!==4326||d.transformEngine!=='proj4@2.22.0')throw new Error('invalid_territory_preview');
      for(const feature of d.features) {
        if(feature.cantonCode!==territory.dpaCode||!Number.isSafeInteger(feature.objectId)||typeof feature.categoryRaw!=='string'||!feature.categoryRaw)throw new Error('invalid_territory_preview');
        features.push({type:'Feature',id:feature.objectId,geometry:feature.geometry,
          properties:{categoryRaw:feature.categoryRaw,cantonCode:feature.cantonCode,hazardRaw:feature.hazardRaw??null}});
      }
    }
    features.sort((a,b)=>a.id-b.id);
    if(features.length!==snapshot.featureCount||features.some((f,i)=>f.id!==snapshot.idManifest[i]))throw new Error('invalid_territory_snapshot');
    const page=features.slice(offset,offset+limit);let points=0;
    for(const feature of page) {points+=pointCount(feature.geometry);if(points>this.maxPoints)throw new Error('territory_preview_budget');}
    const result={...base,status:'partial',snapshot:{id:snapshot.id,revision:snapshot.revision,completedAt:snapshot.completedAt,
      contentHash:snapshot.contentHash,completeness:'verified_id_manifest',snapshotAtomicity:snapshot.snapshotAtomicity==='provider_edit_marker_unchanged'?'provider_edit_marker_unchanged':'unknown',sourceCrs:32717,targetCrs:4326,topologyStatus:'unverified'},
      features:structuredClone(page),pagination:{limit,offset,total:features.length,hasMore:offset+limit<features.length}};
    if(Buffer.byteLength(JSON.stringify(result))>this.maxBytes)throw new Error('territory_preview_budget');
    return result;
  }
}
