const date=value=>value?`${value} (${new Intl.DateTimeFormat("es-EC",{timeZone:"America/Guayaquil",dateStyle:"short",timeStyle:"short"}).format(new Date(value))}, Ecuador)` :"desconocida";
const xml=value=>String(value).replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[c]));
export function renderPreview(alert,{kind="notice"}={}) {
  if(!["notice","correction","retraction"].includes(kind))throw new Error("invalid_template_kind");
  const c=alert.candidate;
  const official=c.messageClass==="OFFICIAL";
  const text=["SIMULACIÓN INTERNA · NO PUBLICADO",kind==="correction"?"RECTIFICACIÓN":kind==="retraction"?"RETRACTACIÓN":"AVISO EN REVISIÓN",
    official?"Fuente: aviso oficial de INAMHI; AEGIS es un observatorio independiente.":"Evaluación independiente AEGIS · regla experimental; no es un aviso oficial.",
    `Territorio de consulta: ${c.areaId}. Alcance de la evidencia: ${c.scope.name} (${c.scope.precision}).`,
    official?`Boletín ${c.facts.bulletinNumber}. Nivel literal de la fuente: ${c.sourceRiskLevel}.`:`Evidencia: ${c.evidenceClass}. Severidad editorial: ${c.severity}; confianza en evidencia: ${c.confidenceInEvidence}.`,
    ...c.sourceRefs.map(ref=>`Fuente original: ${ref.sourceUrl}\nEmisión declarada: ${date(ref.issuedAt)}\nCaptura AEGIS: ${date(ref.retrievedAt)}\nProcesamiento AEGIS: ${date(ref.processedAt)}`),
    `Vigencia: ${date(c.validFrom)} → ${date(c.validTo)}.`,
    "Difusión real por AEGIS: ninguna. No hay confirmación de entrega.",
    "Cobertura limitada. No predice calles inundadas ni probabilidades de desastre.",
    "Consulte la fuente original y siga las indicaciones oficiales. AEGIS no emite órdenes de evacuación.",
    c.recordOrigin==="synthetic_fixture"?"DATOS SINTÉTICOS DE PRUEBA; no representan un aviso real.":"Publicación bloqueada hasta validar derechos, geografía y operación."];
  return {text:text.join("\n\n"),messageClass:c.messageClass,evidenceClass:c.evidenceClass,kind,simulation:true,sent:false};
}
// All adapters are pure serialization; none accepts URLs, endpoints or sessions.
export function simulateTransport(target,preview,alert) {
  if(target.mode!=="DRY_RUN"||target.realDeliveryEnabled!==false||target.providerChannelId!==null)throw new Error("real_transport_prohibited");
  if(!["portal","rss","pwa","waha"].includes(target.transport))throw new Error("unknown_simulation_transport");
  const payload=target.transport==="rss"?`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>AEGIS simulación privada</title><description>No publicado</description><link>https://example.invalid/</link><item><guid isPermaLink="false">${xml(alert.id+":"+alert.revision)}</guid><title>${xml(preview.messageClass+" · simulación")}</title><description>${xml(preview.text)}</description></item></channel></rss>`:
    target.transport==="pwa"?{title:"AEGIS · simulación",body:preview.text,tag:`${alert.id}:${alert.revision}`,permissionRequested:false,pushSent:false}:preview.text;
  return {transport:target.transport,payload,simulation:true,sent:false,providerMessageId:null};
}
