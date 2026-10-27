(() => {
  "use strict";
  const $=id=>document.getElementById(id),element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  let token="",actor=null,generation=0,offset=0,outboxOffset=0;
  const status=text=>$("status").textContent=text;
  function disconnect() {
    token="";actor=null;generation++;$("credential").value="";$("private").hidden=true;$("logout").hidden=true;
    for(const id of ["candidates","alerts","outbox"])$(id).replaceChildren();status("Sin sesión. Vista privada limpiada.");
  }
  async function api(path,{method="GET",body}={}) {
    if(!token)throw new Error("Conecte una sesión editorial.");
    const current=generation;
    const response=await fetch("/api/admin/alerts"+path,{method,credentials:"omit",cache:"no-store",headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(current!==generation)throw new Error("Sesión cerrada; respuesta descartada.");
    if(response.status===401){disconnect();throw new Error("Acceso no válido o revocado.");}
    if(!response.ok)throw new Error(response.status===409?"La evidencia o revisión cambió. Actualice antes de continuar.":response.status===403?"Su rol no permite esta acción.":response.status===429?"Límite de solicitudes. Espere un minuto.":"No fue posible completar la operación ("+response.status+").");
    const data=await response.json();if(current!==generation)throw new Error("Sesión cerrada; respuesta descartada.");return data;
  }
  const run=action=>async event=>{event?.preventDefault();try {await action();}catch(error){status(error.message);}};
  function button(label,action) {const b=element("button",label);b.type="button";b.addEventListener("click",run(async()=>{b.disabled=true;try{await action();}finally{b.disabled=false;}}));return b;}
  function candidateView(c) {
    const article=element("article");article.append(element("h3",`${c.messageClass} · ${c.areaId}`),element("p",c.recordOrigin==="synthetic_fixture"?"DATOS SINTÉTICOS DE PRUEBA; no representan observaciones ni avisos reales.":"Captura de fuente; pendiente de validación operacional."),element("p",`Alcance: ${c.scope.name} (${c.scope.precision}). Vigencia: ${c.validFrom} → ${c.validTo}.`));
    const details=element("details"),summary=element("summary","Evidencia, procedencia y limitaciones"),pre=element("pre",JSON.stringify({facts:c.facts,sourceRefs:c.sourceRefs,limitations:c.limitations},null,2));details.append(summary,pre);article.append(details);return article;
  }
  async function refresh() {
    const [alerts,outbox]=await Promise.all([api(`?limit=20&offset=${offset}`),api(`/outbox?limit=20&offset=${outboxOffset}`)]);
    $("alerts").replaceChildren();$("outbox").replaceChildren();
    $("alert-page").textContent=`${alerts.items.length} revisiones visibles de ${alerts.total}.`;
    $("previous").disabled=offset===0;$("next").disabled=offset+20>=alerts.total;
    $("outbox-previous").disabled=outboxOffset===0;$("outbox-next").disabled=outboxOffset+20>=outbox.total;
    for(const alert of alerts.items) {
      const article=candidateView(alert.candidate);article.append(element("p",`Revisión ${alert.revision} · estado ${alert.state} · versión de edición ${alert.version}. Publicación real: ninguna.`));
      const audit=element("details");audit.append(element("summary","Historial editorial"),element("pre",JSON.stringify(alert.notes,null,2)));article.append(audit);
      const reason=element("textarea"),label=element("label","Motivo de la acción (obligatorio)");reason.id="reason-"+alert.id;reason.maxLength=2000;label.htmlFor=reason.id;article.append(label,reason);
      const actions=element("div");actions.className="actions";
      const choices=actor.role==="editor"?[["note","Añadir nota"],["submit","Solicitar revisión"],["return","Devolver a borrador"],["expire","Registrar caducidad"],["supersede","Sustituir por corrección"]]:[["approve","Aprobar para simulación"],["retract","Retractar revisión"]];
      const allowed={note:["draft","pending_review","approved"],submit:["draft"],return:["pending_review"],expire:["draft","pending_review","approved"],supersede:["draft","pending_review","approved"],approve:["pending_review"],retract:["approved"]};
      for(const [action,title] of choices)if(allowed[action].includes(alert.state))actions.append(button(title,async()=>{
        if(!reason.value.trim())throw new Error("Escriba el motivo antes de actuar.");
        await api(`/${alert.id}/transitions`,{method:"POST",body:{action,reason:reason.value,expectedVersion:alert.version}});await refresh();status("Transición registrada; publicación bloqueada.");
      }));
      if(actor.role==="approver"&&alert.state==="approved")for(const transport of ["portal","rss","pwa","waha"])actions.append(button("Encolar simulación "+transport.toUpperCase(),async()=>{
        await api(`/${alert.id}/outbox`,{method:"POST",body:{targetId:`simulation-${transport}-${alert.candidate.areaId}`}});await refresh();status("Simulación encolada. No se envió ningún aviso.");
      }));
      article.append(actions);$("alerts").append(article);
    }
    for(const item of outbox.items) {
      const article=element("article");article.append(element("h3",`${item.target.transport.toUpperCase()} · ${item.state}`),element("p",`Intentos: ${item.attempts}. Vence: ${item.expiresAt}. Envío real: ninguno.`));
      if(item.result){const details=element("details");details.append(element("summary","Vista previa simulada"),element("pre",typeof item.result.payload==="string"?item.result.payload:JSON.stringify(item.result.payload,null,2)));article.append(details);}
      if(actor.role==="approver"&&["queued","retry"].includes(item.state))article.append(button("Procesar simulación",async()=>{await api("/outbox/process",{method:"POST",body:{key:item.key}});await refresh();status("Procesamiento simulado completado; sin envío real.");}));
      $("outbox").append(article);
    }
  }
  // Keep the credential out of URLs and browser storage.
  $("login").addEventListener("submit",run(async()=>{
    const supplied=$("credential").value.trim();disconnect();token=supplied;generation++;
    try {actor=(await api("/session")).actor;offset=0;outboxOffset=0;await refresh();$("private").hidden=false;$("logout").hidden=false;status(`Sesión ${actor.id} · rol ${actor.role}. DRY_RUN.`);}
    catch(error){disconnect();throw error;}
  }));
  $("logout").addEventListener("click",disconnect);
  $("refresh").addEventListener("click",run(refresh));
  $("previous").addEventListener("click",run(async()=>{offset=Math.max(0,offset-20);await refresh();}));
  $("next").addEventListener("click",run(async()=>{offset+=20;await refresh();}));
  $("outbox-previous").addEventListener("click",run(async()=>{outboxOffset=Math.max(0,outboxOffset-20);await refresh();}));
  $("outbox-next").addEventListener("click",run(async()=>{outboxOffset+=20;await refresh();}));
  $("candidate-form").addEventListener("submit",run(async()=>{
    const area=$("area").value,result=await api("/candidates?area="+encodeURIComponent(area));$("candidates").replaceChildren();
    for(const c of result.candidates){const article=candidateView(c);if(actor.role==="editor")article.append(button("Importar borrador para revisión",async()=>{await api("/candidates",{method:"POST",body:{area,candidateId:c.id}});await refresh();status("Borrador importado; todavía no aprobado.");}));$("candidates").append(article);}
    if(!result.candidates.length)$("candidates").append(element("p","No hay candidatos sustentados al corte actual. Esto no significa ausencia de riesgo."));
  }));
})();
