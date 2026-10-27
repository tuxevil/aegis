// Synthetic administrative attributes and arbitrary test squares, NOT real maps.
import {pilotArea} from "../areas.js";
import {SourceRegistry} from "../registry.js";
export function layerFixtures({sourceId="sngr.flood.layer",area="guayaquil",count=3,pageSize=2,pagination=false,category="ALTA",lastEditDate=1}={}) {
  const source=new SourceRegistry().get(sourceId),territory=pilotArea(area);
  const ids=Array.from({length:count},(_,i)=>i+1);
  const metadata={geometryType:"esriGeometryPolygon",extent:{spatialReference:{wkid:32717}},
    fields:[source.idField,source.categoryField,"dpa_canton","dpa_descan"].map(name=>({name})),maxRecordCount:pageSize,
    advancedQueryCapabilities:{supportsPagination:pagination},editingInfo:lastEditDate===null?{}:{lastEditDate}};
  const manifest={objectIdFieldName:source.idField,objectIds:[...ids].reverse()};
  const fixtures=[{payload:metadata},{payload:{count}},{payload:manifest}];
  for(let offset=0;offset<count;offset+=pageSize) {
    fixtures.push({payload:{spatialReference:{wkid:32717},exceededTransferLimit:pagination&&offset+pageSize<count,
      features:ids.slice(offset,offset+pageSize).map(id=>({attributes:{[source.idField]:id,[source.categoryField]:category,
        dpa_canton:territory.dpaCode,dpa_descan:territory.name},geometry:{rings:[[
          [600000+id*10,9800000],[600005+id*10,9800000],[600005+id*10,9800005],[600000+id*10,9800005],[600000+id*10,9800000],
        ]]}}))}});
  }
  fixtures.push({payload:structuredClone(manifest)},{payload:{count}},{payload:structuredClone(metadata)});
  return structuredClone(fixtures);
}
