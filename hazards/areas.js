const codeSource="https://anda.inec.gob.ec/anda5/index.php/catalog/1312/variable/F18/V1136?name=codigo_canton";
const areas=[
  {id:"guayaquil",dpaCode:"0901",name:"Guayaquil",province:"Guayas"},
  {id:"pallatanga",dpaCode:"0608",name:"Pallatanga",province:"Chimborazo"},
].map(area=>({...area,precision:"canton",codeSource,codeStatus:"documented_pending_revalidation",
  boundaryVersion:null,geometry:null,coverageStatus:"limited",boundaryStatus:"unverified",
  limitations:["Sin polígonos administrativos validados; no hay cobertura por barrio ni predicción de inundación."]}));
export function pilotAreas() {return structuredClone(areas);}
export function pilotArea(id) {return pilotAreas().find(a=>a.id===id||a.dpaCode===id)||null;}
