import proj4 from "proj4";

const area=ring=>ring.slice(1).reduce((s,p,i)=>s+ring[i][0]*p[1]-p[0]*ring[i][1],0)/2;
function inside(point,ring) {
  let result=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) result=!result;
  }
  return result;
}

// Private normalization utility, not a claim that any administrative boundary
// or susceptibility dataset has passed geographic/rights review.
export function normalizeArcgisGeometry(input,{sourceCrs,maxPoints=100000}={}) {
  if(sourceCrs!==32717) throw new Error("unsupported_source_crs");
  if(!Array.isArray(input?.rings)||!input.rings.length||input.rings.length>256) throw new Error("polygon_required");
  let points=0;
  const rings=input.rings.map(ring=>{
    if(!Array.isArray(ring)||ring.length<4) throw new Error("degenerate_ring");
    points+=ring.length;if(points>maxPoints) throw new Error("geometry_too_large");
    for(const p of ring) if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)) throw new Error("invalid_coordinate");
    if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1]||Math.abs(area(ring))<1e-6) throw new Error("degenerate_ring");
    return ring.map(p=>[...p]);
  });
  const magnitudes=rings.map(r=>Math.abs(area(r)));
  const parents=rings.map((r,i)=>rings.map((candidate,j)=>j).filter(j=>j!==i && magnitudes[j]>magnitudes[i] && inside(r[0],rings[j]))
    .sort((a,b)=>magnitudes[a]-magnitudes[b])[0]??null);
  const depth=i=>parents[i]===null?0:1+depth(parents[i]);
  const projected=rings.map(r=>r.map(p=>{
    const point=proj4("EPSG:32717","EPSG:4326",p);
    if(!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90) throw new Error("invalid_projected_coordinate");
    return point;
  }));
  const oriented=(ring,outer)=>((area(ring)>0)===outer?ring:[...ring].reverse());
  const polygons=[];
  rings.forEach((r,i)=>{
    if(depth(i)%2===0) polygons.push([oriented(projected[i],true),...rings.map((_,j)=>j).filter(j=>parents[j]===i).map(j=>oriented(projected[j],false))]);
  });
  return {geometry:polygons.length===1?{type:"Polygon",coordinates:polygons[0]}:{type:"MultiPolygon",coordinates:polygons},
    provenance:{sourceCrs:32717,targetCrs:4326,engine:"proj4@2.22.0",validationStatus:"requires_dataset_review"}};
}

// Complete bounded acquisition must be checked against a provider ID manifest;
// a successful page or maxRecordCount alone can never prove completeness.
export function verifyLayerCompleteness({expectedIds,features,idField,exceededTransferLimit=false}) {
  if(exceededTransferLimit || !Array.isArray(expectedIds) || !Array.isArray(features) || expectedIds.length>100000 || features.length>100000)
    throw new Error("incomplete_layer");
  if(expectedIds.some(id=>!Number.isSafeInteger(id)) || new Set(expectedIds).size!==expectedIds.length) throw new Error("invalid_id_manifest");
  const actual=features.map(f=>f.attributes?.[idField]);
  const expected=new Set(expectedIds);
  if(actual.some(id=>!Number.isSafeInteger(id)) || new Set(actual).size!==actual.length || actual.length!==expectedIds.length || actual.some(id=>!expected.has(id)))
    throw new Error("incomplete_layer");
  return {complete:true,count:actual.length};
}
