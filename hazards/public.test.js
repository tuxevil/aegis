import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createApp} from "../backend.js";
import {HistoryStore} from "../history.js";
import {HazardPublicReader} from "./public-reader.js";
import {normalizeArcgisGeometry,verifyLayerCompleteness} from "./geography.js";
import {pilotAreas} from "./areas.js";

const appOptions={store:new HistoryStore(),mac:null,fetchUrl:async()=>({status:503,data:""})};
test("flag OFF preserva Grid Sentinel y no registra rutas multiamenaza",async t=>{
  const app=await createApp({...appOptions,hazardsEnabled:false});t.after(()=>app.close());
  assert.equal((await app.inject("/hazards/")).statusCode,404);
  assert.equal((await app.inject("/api/hazards/sources")).statusCode,404);
  assert.equal((await app.inject("/ui")).body.includes('href="/hazards/"'),false);
  assert.equal((await app.inject("/api/status")).statusCode,200);
});

test("GETs públicos explícitos, sin Origin; privados/HEAD/POST permanecen cerrados",async t=>{
  const app=await createApp({...appOptions,hazardsEnabled:true,hazardReader:new HazardPublicReader()});t.after(()=>app.close());
  const remote={remoteAddress:"192.0.2.42"};
  const sources=await app.inject({...remote,url:"/api/hazards/sources"});
  assert.equal(sources.statusCode,200);assert.equal(sources.json().dispatchMode,"DRY_RUN");
  assert.equal(sources.json().items.length,4);
  for(const url of ["/api/dams","/api/hazards/private","/api/hazards/sources/extra"]) {
    assert.equal((await app.inject({...remote,url})).statusCode,403);
  }
  for(const method of ["HEAD","POST"]) assert.equal((await app.inject({...remote,url:"/api/hazards/sources",method})).statusCode,403);
  for(const query of ["area=unknown","limit=100","offset=-1","url=https://private.example"]) {
    assert.equal((await app.inject({...remote,url:"/api/hazards/areas?"+query})).statusCode,400);
  }
  const area=(await app.inject({...remote,url:"/api/hazards/areas?area=0608&limit=1"})).json();
  assert.equal(area.items[0].name,"Pallatanga");assert.equal(area.items[0].geometry,null);
  assert.ok((await app.inject("/ui")).body.includes('href="/hazards/"'));
  assert.equal((await app.inject("/hazards/")).statusCode,200);
  assert.equal((await app.inject("/api/hazards/bulletins")).json().items.length,0);
});

test("fallo de disco no filtra secretos y declara cobertura desconocida",async t=>{
  const app=await createApp({...appOptions,hazardsEnabled:true,hazardReader:{read:async()=>{throw new Error("private path secret-key");}}});t.after(()=>app.close());
  const response=await app.inject({url:"/api/hazards/health",remoteAddress:"192.0.2.43"});
  assert.equal(response.statusCode,503);assert.equal(response.body.includes("secret"),false);
  assert.equal(response.json().coverageStatus,"unknown");
});

test("las rutas públicas limitan peticiones de clientes externos",async t=>{
  const app=await createApp({...appOptions,hazardsEnabled:true,hazardReader:new HazardPublicReader()});t.after(()=>app.close());
  for(let i=0;i<60;i++) assert.equal((await app.inject({url:"/api/hazards/sources",remoteAddress:"198.51.100.55"})).statusCode,200);
  const limited=await app.inject({url:"/api/hazards/sources",remoteAddress:"198.51.100.55"});
  assert.equal(limited.statusCode,429);assert.ok(limited.headers["retry-after"]);
});

test("fuentes desconocidas no crean datos ni convierten ausencia en cero",async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-public-"));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const reader=new HazardPublicReader({dataDir:dir});
  assert.ok((await reader.read("health")).items.every(s=>s.status==="unknown"&&s.lastRetrievedAt===null));
  assert.deepEqual(await fs.readdir(dir),[]);
  assert.ok(pilotAreas().every(a=>a.geometry===null&&a.boundaryVersion===null&&a.coverageStatus==="limited"));
  assert.equal((await reader.read("sources",{area:"pallatanga"})).items.some(s=>s.sourceId==="openmeteo.singlerun.test"),false);
});

test("DTO de respuesta excluye claves nuevas, raw y secretos por defecto",async t=>{
  const reader={read:async()=>({...await new HazardPublicReader().read("sources"),secret:"private-key",
    items:[{sourceId:"inamhi.warning.pdf",owner:"INAMHI",sourceUrl:"https://www.inamhi.gob.ec/pronostico/advertencia.pdf",raw:{storageKey:"private-path"},session:"secret-session"}]})};
  const app=await createApp({...appOptions,hazardsEnabled:true,hazardReader:reader});t.after(()=>app.close());
  const response=await app.inject({url:"/api/hazards/sources",remoteAddress:"192.0.2.44"});
  assert.equal(response.statusCode,200);
  for(const value of ["private-key","private-path","secret-session","storageKey"]) assert.equal(response.body.includes(value),false);
});

test("UTM 17 Sur respeta eje lon/lat y no usa líneas como polígonos",()=>{
  // EPSG reference: central meridian -81°, false northing 10,000,000 m at equator.
  const ring=[[500000,10000000],[500100,10000000],[500100,9999900],[500000,9999900],[500000,10000000]];
  const normalized=normalizeArcgisGeometry({rings:[ring]},{sourceCrs:32717});
  const point=normalized.geometry.coordinates[0].find(p=>Math.abs(p[0]+81)<1e-10&&Math.abs(p[1])<1e-10);
  assert.ok(point);assert.equal(normalized.provenance.sourceCrs,32717);
  assert.equal(normalized.provenance.targetCrs,4326);
  assert.throws(()=>normalizeArcgisGeometry({paths:[ring]},{sourceCrs:32717}),/polygon_required/);
  assert.throws(()=>normalizeArcgisGeometry({rings:[ring]},{sourceCrs:3857}),/unsupported_source_crs/);
  assert.throws(()=>normalizeArcgisGeometry({rings:[[[1,1],[2,2],[3,3],[1,1]]]},{sourceCrs:32717}),/degenerate_ring/);
  // Independent reference computed with pyproj 3.7.2 / PROJ, not proj4js.
  // Approximate public model points, never household or verified hazard geometry.
  for(const [x,y,lon,lat] of [[624545.501265455,9757891.494397871,-79.88,-2.19],
    [726211.9769363626,9778958.11702944,-78.96629,-1.99856]]) {
    const tiny=[[x,y],[x+100,y],[x+100,y+100],[x,y+100],[x,y]];
    const converted=normalizeArcgisGeometry({rings:[tiny]},{sourceCrs:32717}).geometry.coordinates[0];
    assert.ok(converted.some(p=>Math.abs(p[0]-lon)<1e-7 && Math.abs(p[1]-lat)<1e-7));
  }
});

test("multipartes/islas y huecos se conservan; capa truncada o duplicada se bloquea",()=>{
  const square=(x,y,size)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
  const output=normalizeArcgisGeometry({rings:[square(500000,9800000,1000),square(500200,9800200,100),square(510000,9800000,500)]},{sourceCrs:32717});
  assert.equal(output.geometry.type,"MultiPolygon");assert.equal(output.geometry.coordinates.length,2);
  assert.equal(output.geometry.coordinates[0].length,2);
  const features=[{attributes:{id:1}},{attributes:{id:2}}];
  assert.deepEqual(verifyLayerCompleteness({expectedIds:[1,2],features,idField:"id"}),{complete:true,count:2});
  for(const data of [{expectedIds:[1,2,3],features},{expectedIds:[1,2],features:[features[0],features[0]]},{expectedIds:[1,2],features,exceededTransferLimit:true}])
    assert.throws(()=>verifyLayerCompleteness({...data,idField:"id"}),/incomplete_layer/);
});

test("portal móvil usa texto seguro, muestra fallos y conserva selección sin mapas",async t=>{
  const html=await fs.readFile(new URL("../public/hazards.html",import.meta.url),"utf8");
  const script=await fs.readFile(new URL("../public/hazards.js",import.meta.url),"utf8");
  const dom=new JSDOM(html,{url:"https://example.test/hazards/",runScripts:"outside-only"});t.after(()=>dom.window.close());
  const requested=[];
  dom.window.fetch=async url=>{
    requested.push(url);
    if(url.includes("health")) return {ok:false};
    return {ok:true,json:async()=>({items:url.includes("areas")?[{name:"<img src=x onerror=alert(1)>",province:"Guayas"}]:[{owner:"SNGR",sourceId:"test",sourceUrl:"javascript:alert(1)"}]})};
  };
  dom.window.eval(script);await new Promise(r=>setTimeout(r,10));
  const d=dom.window.document;
  assert.equal(d.querySelectorAll("#coverage img").length,0);
  assert.match(d.getElementById("status").textContent,/degradada/);
  assert.equal(d.querySelectorAll("#sources a").length,0);
  d.getElementById("area").value="pallatanga";
  d.getElementById("area").dispatchEvent(new dom.window.Event("change"));
  await new Promise(r=>setTimeout(r,10));assert.ok(requested.some(url=>url.includes("area=pallatanga")));
  assert.equal(d.querySelectorAll("canvas,iframe").length,0);
  assert.equal(d.querySelector('meta[name="viewport"]').content,"width=device-width,initial-scale=1");
});

test("GET público no repara ni inicializa un archivo con formato pero directorios faltantes",async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"aegis-readonly-public-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const sourceRoot=path.join(root,"hazards","v1","captured_source");await fs.mkdir(sourceRoot,{recursive:true});
  await fs.writeFile(path.join(sourceRoot,"format.json"),JSON.stringify({version:1,origin:"captured_source",namespace:"sources"}));
  const app=await createApp({...appOptions,hazardsEnabled:true,hazardReader:new HazardPublicReader({dataDir:root})});t.after(()=>app.close());
  const response=await app.inject({url:"/api/hazards/health",remoteAddress:"192.0.2.87"});
  assert.equal(response.statusCode,503);assert.equal(response.json().coverageStatus,"unknown");assert.deepEqual(await fs.readdir(sourceRoot),["format.json"]);
  for(const collection of ["sources","areas"]) {
    const catalog=await app.inject({url:"/api/hazards/"+collection,remoteAddress:"192.0.2.87"});assert.equal(catalog.statusCode,200);assert.ok(catalog.json().items.length>0);
  }
  assert.deepEqual(await fs.readdir(sourceRoot),["format.json"]);
});
