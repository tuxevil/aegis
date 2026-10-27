import { probes } from "../scripts/probe-aegis-sources.mjs";
import {pilotArea} from "./areas.js";

// No caller-supplied URLs. Polling remains opt-in and has no background scheduler.
const entries = probes.filter(p=>p.type!=="layer").map(p=>({
  ...p, method:"GET", owner:p.id.startsWith("sngr")?"SNGR":p.id.startsWith("inamhi")?"INAMHI":"Open-Meteo",
  title:p.type==="pdf"?"Advertencias meteorológicas":p.type==="forecast"?"Pronóstico histórico de lluvia":p.id.includes("multihazard")?"Susceptibilidad multiamenaza":"Susceptibilidad a inundaciones",
  areaIds:p.type==="forecast"?["guayaquil"]:["guayaquil","pallatanga"],
  licensing:{status:p.id.startsWith("openmeteo")?"restricted":"pending",licenseId:p.id.startsWith("openmeteo")?"CC-BY-4.0":null,
    attribution:p.id.startsWith("openmeteo")?"Open-Meteo":p.id.startsWith("sngr")?"SNGR":"INAMHI"},
  ttlMs:p.type==="arcgis-query"?86400000:3600000,
  cooldownMs:300000,timeoutMs:12000,pollingEnabled:false,
}));
const layers=[
  {id:"sngr.multihazard.layer",sample:"sngr.multihazard.single",idField:"objectid",categoryField:"susc_total"},
  {id:"sngr.flood.layer",sample:"sngr.flood.single",idField:"FID",categoryField:"sui"},
].map(layer=>{
  const sample=entries.find(e=>e.id===layer.sample);
  return {...sample,...layer,url:sample.url.split("?")[0],type:"arcgis-layer",internal:true,
    maxBytes:2_000_000,cooldownMs:1000,acquisitionCooldownMs:3600000};
});
const localSources=[{id:"grid.pallatanga.weather",type:"local-observation",internal:true,method:null,
  url:"https://ambientweather.net/",owner:"Estación comunitaria Pallatanga / Ambient Weather",areaIds:["pallatanga"],
  ttlMs:3600000,pollingEnabled:false,licensing:{status:"pending",licenseId:null,attribution:"Estación comunitaria de Pallatanga"}}];
const modelUrl=new URL(entries.find(e=>e.type==="forecast").url);modelUrl.searchParams.set("models","ecmwf_ifs");
const modelSources=[{...entries.find(e=>e.type==="forecast"),id:"openmeteo.singlerun.ecmwf",url:modelUrl.href,
  title:"Corrida histórica ECMWF IFS · punto de Guayaquil",requestedModel:"ecmwf_ifs",modelSelectionVerified:true,
  modelSelectionProof:"docs/verification/source-probes/2026-10-27-model-selection.json"}];
export class SourceRegistry {
  get(id) {
    const entry=[...entries,...layers,...localSources,...modelSources].find(e=>e.id===id);
    if(!entry) throw new Error("unknown_source");
    return structuredClone(entry);
  }
  list() { return structuredClone([...entries.filter(e=>e.type!=="forecast"),...modelSources]); }
  layerSources() {return structuredClone(layers);}
  requestUrl(id,request) {
    const source=this.get(id);
    if(source.type==="local-observation")throw new Error("non_network_source");
    if(!source.internal) {
      if(request!==undefined) throw new Error("invalid_source_request");
      return source.url;
    }
    if(!request || Object.keys(request).some(k=>!["mode","area","offset","count","ids"].includes(k))) throw new Error("invalid_source_request");
    const area=pilotArea(request.area);
    if(!area) throw new Error("invalid_source_area");
    const url=new URL(source.url);
    if(request.mode==="metadata") {
      if(request.offset!==undefined||request.count!==undefined||request.ids!==undefined) throw new Error("invalid_source_request");
      url.pathname=url.pathname.replace(/\/query$/,"");url.searchParams.set("f","json");return url.href;
    }
    const params={where:`dpa_canton='${area.dpaCode}'`,f:"json",returnGeometry:"false"};
    if(["ids","count"].includes(request.mode)) {
      if(request.offset!==undefined||request.count!==undefined||request.ids!==undefined) throw new Error("invalid_source_request");
      params[request.mode==="ids"?"returnIdsOnly":"returnCountOnly"]="true";
    } else if(request.mode==="page") {
      if(!Number.isSafeInteger(request.offset)||request.offset<0||request.offset>100000||!Number.isSafeInteger(request.count)||request.count<1||request.count>1000||request.ids!==undefined)
        throw new Error("invalid_source_request");
      Object.assign(params,{resultOffset:String(request.offset),resultRecordCount:String(request.count),orderByFields:source.idField});
    } else if(request.mode==="batch") {
      if(!Array.isArray(request.ids)||!request.ids.length||request.ids.length>1000||request.ids.some(i=>!Number.isSafeInteger(i)||i<0)||new Set(request.ids).size!==request.ids.length||request.offset!==undefined||request.count!==undefined)
        throw new Error("invalid_source_request");
      params.objectIds=request.ids.join(",");
    } else throw new Error("invalid_source_request");
    if(!["ids","count"].includes(request.mode)) Object.assign(params,{outFields:[source.idField,source.categoryField,"dpa_canton","dpa_descan",...(source.idField==="objectid"?["tipo_amen"]:[])].join(","),returnGeometry:"true",outSR:"32717"});
    for(const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
    return url.href;
  }
}

export const safeMode=Object.freeze({alertsPublishEnabled:false,dispatchMode:"DRY_RUN"});
