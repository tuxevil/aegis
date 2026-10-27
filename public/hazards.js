(() => {
  const labels={unknown:"Sin datos suficientes",degraded:"Validación incompleta",stale:"Datos antiguos",healthy:"Fuente disponible"};
  const allowedHosts=new Set(["www.inamhi.gob.ec","sgrportal.gestionderiesgos.gob.ec","single-runs-api.open-meteo.com"]);
  const byId=id=>document.getElementById(id);
  let generation=0;
  async function read(collection,area) {
    const response=await fetch(`/api/hazards/${collection}?area=${encodeURIComponent(area)}&limit=50`);
    if(!response.ok) throw new Error("unavailable");
    const body=await response.json();
    if(!Array.isArray(body.items)) throw new Error("invalid_response");
    return body.items;
  }
  async function refresh(event) {
    event?.preventDefault();const current=++generation,area=byId("area").value;
    byId("status").textContent="Consultando cobertura…";
    const [areas,sources,health]=await Promise.allSettled([read("areas",area),read("sources",area),read("health",area)]);
    if(current!==generation) return;
    byId("coverage").replaceChildren();byId("sources").replaceChildren();
    const coverage=document.createElement("p");
    const selected=areas.status==="fulfilled"?areas.value[0]:null;
    coverage.textContent=selected?`${selected.name} · ${selected.province}. Cobertura limitada. Límites administrativos sin validar; no hay precisión por barrio.`:"Cobertura territorial desconocida. No podemos evaluar el riesgo local.";
    byId("coverage").append(coverage);
    if(sources.status==="fulfilled") for(const source of sources.value) {
      const li=document.createElement("li"),title=document.createElement("strong"),detail=document.createElement("p");
      title.textContent=`${source.owner} · ${source.title||"Fuente de referencia"}`;
      const state=health.status==="fulfilled"?health.value.find(h=>h.sourceId===source.sourceId):null;
      let date="Sin captura reciente verificada";
      if(state?.lastRetrievedAt && Number.isFinite(Date.parse(state.lastRetrievedAt))) date="Última captura: "+new Intl.DateTimeFormat("es-EC",{timeZone:"America/Guayaquil",dateStyle:"medium",timeStyle:"short"}).format(new Date(state.lastRetrievedAt))+" (Ecuador)";
      detail.textContent=`${labels[state?.status]||labels.unknown}. ${date}. Permisos de publicación sin certificar.`;
      li.append(title,detail);
      try {
        const url=new URL(source.sourceUrl);
        if(url.protocol==="https:" && allowedHosts.has(url.hostname) && !url.username && !url.password) {
          const link=document.createElement("a");link.href=url.href;link.textContent="Consultar fuente original";link.rel="noreferrer";li.append(link);
        }
      } catch { /* Invalid links are not made clickable. */ }
      byId("sources").append(li);
    }
    byId("status").textContent=[areas,sources,health].some(r=>r.status==="rejected")?"Hay fuentes no disponibles. Cobertura degradada; no equivale a ausencia de riesgo.":"Consulta completada. Modo laboratorio: no se publican ni envían alertas.";
  }
  byId("area-form").addEventListener("submit",refresh);
  byId("area").addEventListener("change",refresh);
  refresh();
})();
