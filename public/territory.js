(() => {
  'use strict';
  const $=id=>document.getElementById(id),node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const svgNode=tag=>document.createElementNS('http://www.w3.org/2000/svg',tag);
  let token='',generation=0,offset=0;
  const status=text=>$('status').textContent=text;
  function clear() {for(const id of ['map','features','selection','provenance'])$(id).replaceChildren();$('page-info').textContent='';$('previous').disabled=true;$('next').disabled=true;}
  function disconnect() {generation++;token='';$('credential').value='';clear();$('private').hidden=true;$('logout').hidden=true;status('Sin sesión. Vista privada limpiada.');}
  async function api(path,current) {
    const response=await fetch('/api/admin/alerts'+path,{credentials:'omit',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token}});
    if(current!==generation)throw new Error('Consulta anterior descartada.');
    if(response.status===401){disconnect();throw new Error('Acceso no válido o revocado.');}
    if(!response.ok)throw new Error(response.status===429?'Límite de solicitudes. Espere un minuto.':'Archivo no disponible o página fuera de presupuesto. No se puede evaluar el riesgo.');
    const result=await response.json();if(current!==generation)throw new Error('Consulta anterior descartada.');return result;
  }
  const run=action=>async event=>{event?.preventDefault();try {await action();}catch(error){status(error.message);}};
  function polygons(geometry) {
    if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type))throw new Error('Geometría no verificable.');
    return geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  }
  function render(data) {
    if(data.alertsPublishEnabled!==false||data.notForPrediction!==true||!['synthetic_fixture','captured_source'].includes(data.recordOrigin)||data.privateReviewOnly!==true||data.publicationBlocked!==true||data.dispatchMode!=='DRY_RUN'||data.evidenceClass!=='STATIC_EXPOSURE'||!Array.isArray(data.features)||data.features.length>50)throw new Error('Respuesta territorial no verificable.');
    $('provenance').append(node('p',data.recordOrigin==='synthetic_fixture'?'DATOS SINTÉTICOS DE PRUEBA; no representan un mapa real.':'Archivo de investigación privado; no autorizado para publicación.'),node('p',data.notice));
    if(!data.snapshot){status('Sin colección verificable para esta consulta. No significa ausencia de amenaza.');return;}
    $('provenance').append(node('p',`Fuente: ${data.owner}. Piloto: ${data.areaId} · DPA ${data.dpaCode}. Archivo: ${data.snapshot.completedAt}. Revisión ${data.snapshot.revision}.`),
      node('p',`Origen CRS ${data.snapshot.sourceCrs} → ${data.snapshot.targetCrs}. Topología: ${data.snapshot.topologyStatus}. Estabilidad de captura: ${data.snapshot.snapshotAtomicity}. Derechos: ${data.licensingStatus}.`));
    const trace=node('details');trace.append(node('summary','Referencia de la colección'),node('pre',JSON.stringify({snapshotId:data.snapshot.id,contentHash:data.snapshot.contentHash,sourceUrl:data.sourceUrl},null,2)));$('provenance').append(trace);
    try {const url=new URL(data.sourceUrl);if(url.protocol==='https:'&&url.hostname==='sgrportal.gestionderiesgos.gob.ec'&&!url.username&&!url.password){const link=node('a','Consultar la capa original');link.href=url.href;link.rel='noreferrer';$('provenance').append(link);}}catch { /* No unverified clickable URLs. */ }
    const points=[];
    for(const f of data.features)for(const polygon of polygons(f.geometry))for(const ring of polygon) {
      if(!Array.isArray(ring)||ring.length<4)throw new Error('Geometría no verificable.');
      for(const p of ring){if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90||points.length>=100000)throw new Error('Geometría no verificable.');points.push(p);}
    }
    const bounds=points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
    const svg=svgNode('svg');svg.setAttribute('viewBox','0 0 800 500');svg.setAttribute('role','img');svg.setAttribute('aria-labelledby','shape-title shape-description');
    const title=svgNode('title');title.id='shape-title';title.textContent='Esquema de polígonos archivados de esta página';
    const description=svgNode('desc');description.id='shape-description';description.textContent='Lista de atributos equivalente debajo. No es predicción ni mapa de barrios. El resaltado indica selección.';svg.append(title,description);
    const latFactor=points.length?Math.max(.01,Math.cos((bounds[1]+bounds[3])/2*Math.PI/180)):1;
    const scale=points.length?Math.min(760/Math.max((bounds[2]-bounds[0])*latFactor,1e-9),460/Math.max(bounds[3]-bounds[1],1e-9)):1;
    const paths=new Map(),buttons=new Map();
    function select(feature) {
      for(const [id,path] of paths)path.classList.toggle('selected',id===feature.id);
      for(const [id,button] of buttons)button.setAttribute('aria-pressed',String(id===feature.id));
      $('selection').replaceChildren(node('h3',`Objeto ${feature.id}`),node('pre',JSON.stringify(feature.properties,null,2)));
    }
    for(const feature of data.features) {
      const path=svgNode('path');path.setAttribute('fill-rule','evenodd');
      path.setAttribute('d',polygons(feature.geometry).map(polygon=>polygon.map(ring=>ring.map((p,i)=>(i?'L':'M')+(20+(p[0]-bounds[0])*latFactor*scale).toFixed(3)+' '+(20+(bounds[3]-p[1])*scale).toFixed(3)).join(' ')+' Z').join(' ')).join(' '));svg.append(path);paths.set(feature.id,path);
      const li=node('li'),button=node('button',`Objeto ${feature.id} · ${feature.properties.categoryRaw} · DPA ${feature.properties.cantonCode}`);button.type='button';button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>select(feature));buttons.set(feature.id,button);li.append(button);$('features').append(li);
    }
    if(points.length)$('map').append(svg);else $('map').append(node('p','Colección consultada sin objetos en esta página. No significa ausencia de amenaza.'));
    $('page-info').textContent=`${data.features.length} objetos en esta página, de ${data.pagination.total} en la colección. No es cobertura territorial certificada.`;
    $('previous').disabled=offset===0;$('next').disabled=data.pagination.hasMore!==true;
    status('Consulta privada completada. Geometría para revisión; no hay publicación ni aviso.');
  }
  async function refresh() {
    if(!token)throw new Error('Conecte una sesión editorial.');const current=++generation;clear();status('Leyendo archivo territorial privado…');
    const params=new URLSearchParams({area:$('area').value,sourceId:$('source').value,limit:'20',offset:String(offset)});
    const data=await api('/territory?'+params,current);try {render(data);}catch(error){clear();throw error;}
  }
  $('login').addEventListener('submit',run(async()=>{generation++;clear();$('private').hidden=true;token=$('credential').value.trim();$('credential').value='';const current=generation;await api('/session',current);$('private').hidden=false;$('logout').hidden=false;offset=0;await refresh();}));
  $('logout').addEventListener('click',disconnect);
  $('filters').addEventListener('submit',run(async()=>{offset=0;await refresh();}));
  for(const id of ['area','source'])$(id).addEventListener('change',run(async()=>{offset=0;await refresh();}));
  $('previous').addEventListener('click',run(async()=>{offset=Math.max(0,offset-20);await refresh();}));
  $('next').addEventListener('click',run(async()=>{offset+=20;await refresh();}));
})();
