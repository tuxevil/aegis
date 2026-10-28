(() => {
  "use strict";
  const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  let catalog=null,secret="",generation=0,busy=false;const selected=new Set();
  const status=text=>$("status").textContent=text;
  async function api(path,{method="GET",body,authenticated=false,publicData=false}={}) {
    const current=generation,headers={...(body?{"Content-Type":"application/json"}:{}),...(authenticated?{Authorization:"Bearer "+secret}:{})};
    const response=await fetch("/api/subscriptions"+path,{method,credentials:"omit",cache:"no-store",headers,...(body?{body:JSON.stringify(body)}:{})});
    if(!publicData&&current!==generation)throw new Error("La pantalla se limpió; respuesta descartada.");
    if(response.status===401){clear();throw new Error("Secreto no válido, dado de baja o vencido.");}
    if(!response.ok)throw new Error(response.status===429?"Límite de solicitudes. Espera un minuto.":response.status===409?"El desafío ya fue utilizado. Inicia de nuevo.":response.status===503?"El registro no está disponible temporalmente. No se ha confirmado esta operación; conserva tu secreto de gestión.":"No se pudo completar la operación. Revisa el consentimiento e inténtalo nuevamente.");
    const data=await response.json();if(!publicData&&current!==generation)throw new Error("La pantalla se limpió; respuesta descartada.");return data;
  }
  const run=fn=>async event=>{event?.preventDefault();if(busy)return;busy=true;$("save").disabled=true;try{await fn();}catch(error){status(error.message);}finally{busy=false;$("save").disabled=!catalog||Boolean(secret);}};
  function clear() {
    generation++;secret="";$("new-secret").value="";$("management-secret").value="";$("created").hidden=true;$("update").hidden=true;$("revoke").hidden=true;$("current").textContent="";$("consent").checked=false;$("push-interest").checked=false;selected.clear();if(catalog)renderCities();if(!busy)$("save").disabled=!catalog;status("Datos de pantalla limpiados. Esta acción no da de baja una preferencia guardada.");
  }
  function link(url,text) {let parsed;try{parsed=new URL(url);}catch{return el("p","Enlace no disponible.");}if(parsed.protocol!=="https:"||parsed.hostname!=="whatsapp.com"||!/^\/channel\/[A-Za-z0-9]+$/.test(parsed.pathname)||parsed.username||parsed.password)return el("p","Enlace no disponible.");const a=el("a",text);a.href=parsed.href;a.target="_blank";a.rel="noopener noreferrer";return a;}
  const normalize=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es");
  function renderCities() {
    $("cities").replaceChildren();const query=normalize($("search").value),province=$("province").value;
    const rows=catalog.areas.filter(a=>(!province||a.province===province)&&normalize(a.name+" "+a.province+" "+a.dpaCode).includes(query));
    for(const a of rows) {
      const article=el("article"),label=el("label"),checkbox=el("input");checkbox.type="checkbox";checkbox.checked=selected.has(a.id);checkbox.addEventListener("change",()=>checkbox.checked?selected.add(a.id):selected.delete(a.id));label.append(checkbox,document.createTextNode(` ${a.name} · ${a.province} · DPA ${a.dpaCode}`));article.append(label,el("p","Cobertura limitada; código pendiente de revalidación y sin geometría certificada."));
      const channel=catalog.channels.find(c=>c.cityId===a.id);
      if(channel?.inviteUrl)article.append(link(channel.inviteUrl,"Abrir enlace de canal comunicado por el propietario"),el("p","Enlace no comprobado por AEGIS. Seguirlo es voluntario; activa la campana en WhatsApp si lo deseas. No garantiza notificaciones. No hay integración automatizada."));
      else article.append(el("p","Sin canal de WhatsApp documentado para esta ciudad; en evaluación. Guardar interés no lo crea."));
      $("cities").append(article);
    }
    if(!rows.length)$("cities").append(el("p","Sin coincidencias en el catálogo piloto. No se inventaron otras ciudades ni coberturas."));
  }
  function prefs() {
    if(!$("consent").checked)throw new Error("Acepta el consentimiento de preferencias para continuar.");
    if(!selected.size||selected.size>5)throw new Error("Elige entre una y cinco zonas del catálogo.");
    return {areaIds:[...selected],consent:true,consentVersion:catalog.consentVersion,pushInterest:$("push-interest").checked};
  }
  function showManaged(data) {
    selected.clear();for(const id of data.areaIds)selected.add(id);$("push-interest").checked=data.pushInterest;$("consent").checked=false;renderCities();
    $("current").textContent=`Estado: ${data.state}. Vence: ${data.expiresAt}. Web Push desactivado; seguimiento de WhatsApp no confirmado.`;$("update").hidden=data.state!=="active";$("revoke").hidden=data.state!=="active";
  }
  $("province").addEventListener("change",()=>catalog&&renderCities());$("search").addEventListener("input",()=>catalog&&renderCities());
  $("interest").addEventListener("submit",run(async()=>{
    const preference=prefs(),current=generation;
    const challenge=await api("/challenge");status("Validando la solicitud. No se activarán avisos.");await new Promise(resolve=>setTimeout(resolve,challenge.minWaitMs));
    if(current!==generation)throw new Error("Solicitud descartada al limpiar pantalla.");
    const result=await api("/zones",{method:"POST",body:{...preference,challenge:challenge.challenge,website:$("website").value}});
    secret=result.managementSecret;$("new-secret").value=secret;$("created").hidden=false;showManaged(result);status("Interés guardado en modo de prueba. Guarda tu secreto privado. No se enviará ninguna alerta.");
  }));
  $("unlock").addEventListener("submit",run(async()=>{secret=$("management-secret").value.trim();$("management-secret").value="";$("new-secret").value="";$("created").hidden=true;const data=await api("/zones/me",{authenticated:true});showManaged(data);status("Preferencia consultada. No hay notificaciones habilitadas.");}));
  $("update").addEventListener("click",run(async()=>{const data=await api("/zones/me",{method:"PATCH",authenticated:true,body:prefs()});showManaged(data);status("Preferencia actualizada; no activa avisos.");}));
  $("revoke").addEventListener("click",run(async()=>{await api("/zones/me",{method:"DELETE",authenticated:true});clear();status("Preferencia dada de baja. Esto no cambia un seguimiento realizado directamente en WhatsApp.");}));
  $("forget").addEventListener("click",clear);
  $("copy").addEventListener("click",run(async()=>{if(!secret)throw new Error("No hay secreto en esta pantalla.");if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(secret);status("Secreto copiado. Guárdalo en un lugar privado.");}else{$("new-secret").focus();$("new-secret").select();status("Copia el secreto seleccionado y guárdalo en privado.");}}));
  api("/catalog",{publicData:true}).then(data=>{
    catalog=data;for(const p of [...new Set(data.areas.map(a=>a.province))].sort()){const option=el("option",p);option.value=p;$("province").append(option);}renderCities();
    $("national").append(link(data.nationalChannel.inviteUrl,"OpenAlert - Ecuador · enlace comunicado por el propietario"));$("save").disabled=false;status("Catálogo piloto cargado. Guardar interés no activa alertas.");
  }).catch(error=>status(error.message));
})();
