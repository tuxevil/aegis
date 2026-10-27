import { probes } from "../scripts/probe-aegis-sources.mjs";

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
export class SourceRegistry {
  get(id) {
    const entry=entries.find(e=>e.id===id);
    if(!entry) throw new Error("unknown_source");
    return structuredClone(entry);
  }
  list() { return structuredClone(entries); }
}

export const safeMode=Object.freeze({alertsPublishEnabled:false,dispatchMode:"DRY_RUN"});
