/* AEGIS citizen read-only view. Local scripts, text nodes, no polling or precise GPS. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = { mode: null, areas: new Map(), events: [], areaId: "", areaOffset: null,
    eventOffset: null, areaQuery: "", searchVersion: 0, eventVersion: 0, map: null, mapLoading: false };
  const kinds = { province: "Provincia", canton: "Cantón", parish: "Parroquia", sector: "Sector" };
  const statuses = { reported: "Reportado · sin confirmar", corroborated: "Corroborado", official: "Oficial",
    ended: "Finalizado según evidencia", unknown: "Desconocido / corregido" };
  const relations = { support: "Evidencia de respaldo", refute: "Evidencia contradictoria", retraction: "Corrección / retractación" };
  const dateFormat = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", dateStyle: "medium", timeStyle: "short" });
  function date(value) { return value && Number.isFinite(Date.parse(value)) ? `${dateFormat.format(new Date(value))} (Ecuador)` : "Desconocido"; }
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  async function request(url) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
      if (!response.ok) throw new Error("Servicio no disponible");
      const body = await response.json();
      if (!Array.isArray(body.data) || !["demo", "live"].includes(body.meta?.mode)) throw new Error("Respuesta inválida");
      if (state.mode && state.mode !== body.meta.mode) throw new Error("Cambió el modo: recarga la página");
      state.mode = body.meta.mode;
      $("mode-banner").classList.toggle("live", state.mode === "live");
      $("mode-banner").textContent = state.mode === "demo"
        ? "DATOS DE EJEMPLO · Demo sintética con fechas fijas. Ningún reporte, entidad u horario de estas fichas es real."
        : "CONSULTA PÚBLICA · Cobertura desconocida y parcial. Solo se muestran evidencias revisadas; no es un aviso operativo.";
      return body;
    } finally { clearTimeout(timeout); }
  }
  function queryUrl(endpoint, params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== "") query.set(key, value);
    return `/api/v1/${endpoint}?${query}`;
  }
  async function searchAreas(append = false) {
    const version = ++state.searchVersion;
    const q = $("area-search").value.trim();
    if (!append) { state.areaOffset = 0; state.areaQuery = q; $("area-options").replaceChildren(); }
    $("area-results").hidden = false;
    $("area-message").textContent = "Buscando áreas…";
    $("more-areas").hidden = true;
    try {
      const body = await request(queryUrl("areas", { q: state.areaQuery, limit: 20, offset: state.areaOffset }));
      if (version !== state.searchVersion) return;
      for (const area of body.data) {
        state.areas.set(area.id, area);
        const button = node("button", area.name);
        button.type = "button";
        button.append(node("small", `${kinds[area.type] || "Área"} · ${area.synthetic ? "ejemplo" : "precisión administrativa"}`));
        button.addEventListener("click", () => selectArea(area));
        $("area-options").append(button);
      }
      state.areaOffset = body.meta.next_offset;
      $("more-areas").hidden = state.areaOffset === null;
      $("area-message").textContent = body.data.length ? "Selecciona el ámbito que quieres consultar:" : "No hay áreas verificadas para esta búsqueda. No implica ausencia de cortes.";
    } catch {
      if (version === state.searchVersion) $("area-message").textContent = "No se pudo consultar el catálogo de áreas. Inténtalo de nuevo.";
    }
  }
  async function selectArea(area) {
    state.areaId = area.id;
    $("selected-area").textContent = `${kinds[area.type] || "Área"}: ${area.name}`;
    $("clear-area").hidden = false;
    $("area-results").hidden = true;
    await loadEvents({ clear: true });
    $("results").focus();
  }
  function timeBlock(label, value) {
    const block = node("div"); block.append(node("span", label), node("strong", date(value))); return block;
  }
  function eventCard(event) {
    const article = node("article", undefined, "event-card");
    const title = node("h3", event.area_name || "Área sin referencia");
    title.id = `event-${event.id}`;
    article.setAttribute("aria-labelledby", title.id);
    const meta = node("div", undefined, "card-meta");
    meta.append(node("span", event.type === "scheduled" ? (event.status === "official" ? "Programación oficial" : "Programación reportada") : statuses[event.status] || "Desconocido", `badge ${event.status}`));
    if (event.synthetic) meta.append(node("span", "EJEMPLO SINTÉTICO", "demo-tag"));
    article.append(meta, title, node("p", event.confidence_explanation));
    const times = node("div", undefined, "event-times");
    times.append(timeBlock(event.type === "scheduled" ? "Inicio programado" : "Inicio observado / declarado", event.start_at),
      timeBlock(event.type === "scheduled" ? "Fin programado" : "Fin respaldado por evidencia", event.end_at));
    article.append(times);
    if (event.type === "scheduled") article.append(node("p", "Horario programado: no confirma un corte ocurrido ni garantiza reposición.", "freshness"));
    const old = !event.synthetic && (!event.last_evidence_at || Date.now() - Date.parse(event.last_evidence_at) > 24 * 3600000);
    article.append(node("p", `${old ? "Evidencia antigua o sin fecha · " : ""}Última evidencia: ${date(event.last_evidence_at)}`, "freshness"));
    article.append(node("p", `Registro actualizado: ${date(event.updated_at)}. Precisión de área, sin domicilios.`, "freshness"));
    const details = node("details"), summary = node("summary", "Ver fuentes y correcciones");
    const content = node("div");
    details.append(summary, content);
    let loaded = false, loading = false, offset = 0;
    async function loadEvidence() {
      if (loading) return;
      loading = true;
      const previousMore = content.querySelector("button");
      if (previousMore) previousMore.remove();
      const status = node("p", "Consultando evidencia…", "muted"); status.setAttribute("role", "status"); content.append(status);
      try {
        const body = await request(queryUrl(`events/${encodeURIComponent(event.id)}/evidence`, { limit: 20, offset }));
        const list = node("ul", undefined, "evidence-list");
        for (const evidence of body.data) {
          const item = node("li");
          item.append(node("strong", `${relations[evidence.relation] || "Evidencia"} · ${evidence.source_name}`), node("p", evidence.summary));
          const observed = node("time", `Observación: ${date(evidence.observed_at)}`);
          if (evidence.observed_at) observed.dateTime = evidence.observed_at;
          item.append(observed, node("time", `Publicación: ${date(evidence.source_published_at)}`), node("time", `Incorporada a AEGIS: ${date(evidence.ingested_at)}`));
          if (evidence.synthetic) item.append(node("p", "Fuente sintética de ejemplo; sin documento oficial real.", "demo-tag"));
          else if (evidence.source_url) {
            try {
              const url = new URL(evidence.source_url);
              if (url.protocol === "https:" && !url.username && !url.password) {
                const anchor = node("a", "Abrir fuente original ↗"); anchor.href = url.href;
                anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; item.append(anchor);
              }
            } catch { /* An invalid external link is never rendered. */ }
          }
          list.append(item);
        }
        if (!body.data.length && offset === 0) content.append(node("p", "No hay evidencia pública disponible. El estado no puede confirmarse.", "muted"));
        content.append(list); offset = body.meta.next_offset; loaded = true;
        if (offset !== null) {
          const more = node("button", "Más evidencias", "secondary"); more.type = "button";
          more.addEventListener("click", loadEvidence); content.append(more);
        }
        status.remove();
      } catch {
        status.textContent = "No se pudo cargar la evidencia. Cierra y vuelve a abrir para reintentar.";
        loaded = false;
      } finally { loading = false; }
    }
    details.addEventListener("toggle", () => { if (details.open && !loaded) loadEvidence(); });
    article.append(details); return article;
  }
  async function loadEvents({ append = false, clear = false } = {}) {
    const version = ++state.eventVersion;
    if (clear) {
      state.events = []; $("event-list").replaceChildren();
      if (state.map) state.map.update([]);
    }
    $("event-list").setAttribute("aria-busy", "true"); $("refresh").disabled = true; $("more-events").hidden = true;
    $("request-status").textContent = "Consultando información…";
    try {
      const body = await request(queryUrl("outages", { area_id: state.areaId, layer: $("layer").value,
        limit: 20, offset: append ? state.eventOffset : 0 }));
      if (version !== state.eventVersion) return;
      if (!append) { state.events = []; $("event-list").replaceChildren(); }
      for (const event of body.data) {
        if (!state.events.some(previous => previous.id === event.id)) {
          state.events.push(event); $("event-list").append(eventCard(event));
        }
      }
      state.eventOffset = body.meta.next_offset;
      $("more-events").hidden = state.eventOffset === null;
      if (!state.events.length) $("event-list").append(node("p", "Sin información verificada para este ámbito o filtro. Se desconoce el estado del suministro.", "empty"));
      $("request-status").textContent = `${state.events.length} fichas cargadas${body.meta.next_offset === null ? "" : " · hay más resultados"}. Cobertura desconocida.`;
      $("fetched-at").textContent = `Consulta: ${date(body.meta.generated_at)}. Esta fecha no sustituye la fecha de las evidencias.`;
      if (state.map) state.map.update(state.events);
    } catch {
      if (version !== state.eventVersion) return;
      if (!state.mode) $("mode-banner").textContent = "INFORMACIÓN NO DISPONIBLE · No se pudo verificar el modo ni las fuentes de esta consulta.";
      $("request-status").textContent = state.events.length
        ? "No se pudo actualizar. Se conservan las fichas de la consulta anterior, que pueden estar desactualizadas."
        : "No se pudo consultar la fuente. El estado del suministro es desconocido. Puedes reintentar con Actualizar.";
    } finally {
      if (version === state.eventVersion) { $("event-list").setAttribute("aria-busy", "false"); $("refresh").disabled = false; }
    }
  }
  async function showMap() {
    if (state.mapLoading) return;
    if (state.map) {
      const hidden = !$("map-frame").hidden;
      $("map-frame").hidden = hidden; $("toggle-map").setAttribute("aria-expanded", String(!hidden));
      $("toggle-map").textContent = hidden ? "Mostrar mapa" : "Ocultar mapa"; return;
    }
    state.mapLoading = true; $("toggle-map").disabled = true;
    $("map-status").textContent = "Cargando cartografía local…";
    try {
      const module = await import("/assets/blackout-map.js");
      state.map = await module.mountMap($("map-canvas"), () => $("results").focus());
      state.map.update(state.events);
      $("map-reset").addEventListener("click", () => state.map.reset());
      $("map-zoom-in").addEventListener("click", () => state.map.zoom(1));
      $("map-zoom-out").addEventListener("click", () => state.map.zoom(-1));
      $("map-frame").hidden = false; $("toggle-map").setAttribute("aria-expanded", "true");
      $("toggle-map").textContent = "Ocultar mapa";
      $("map-status").textContent = "Referencia cantonal, no cobertura de cortes. El número corresponde solo a las fichas cargadas.";
    } catch {
      $("map-status").textContent = "Mapa no disponible. La lista y las evidencias siguen funcionando; puedes volver a intentar cargarlo.";
    } finally { state.mapLoading = false; $("toggle-map").disabled = false; }
  }
  $("search-form").addEventListener("submit", event => { event.preventDefault(); searchAreas(); });
  $("more-areas").addEventListener("click", () => searchAreas(true));
  $("more-events").addEventListener("click", () => loadEvents({ append: true }));
  $("refresh").addEventListener("click", () => loadEvents());
  $("layer").addEventListener("change", () => loadEvents({ clear: true }));
  $("toggle-map").addEventListener("click", showMap);
  $("clear-area").addEventListener("click", () => {
    state.areaId = ""; $("selected-area").textContent = "Todas las áreas disponibles";
    $("clear-area").hidden = true; loadEvents({ clear: true });
  });
  // Kept small like the existing v4 Aegis interface; useful for diagnostics/DOM tests.
  window.AegisBlackout = { refresh: loadEvents, search: searchAreas, selectArea, showMap, ready: loadEvents() };
})();
