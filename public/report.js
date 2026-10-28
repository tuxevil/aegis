(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = { config: null, selected: null, challenge: null, ready: false, owner: null, token: null,
    pending: null, offset: 0, query: "", searchVersion: 0, busy: false };
  const statusNames = { pending: "En revisión", approved: "Aprobado para resúmenes", rejected: "No aprobado", withdrawn: "Retirado" };
  let readyTimer;
  const formatter = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", dateStyle: "medium", timeStyle: "short" });
  function text(tag, value) { const node = document.createElement(tag); node.textContent = value; return node; }
  async function api(path, { method = "GET", body, token } = {}) {
    const headers = { "X-Aegis-Request": "citizen-report" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`/api/v1/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) { const error = new Error(result.error?.message || "No se pudo completar la solicitud."); error.status = response.status; error.code = result.error?.code; throw error; }
      return result;
    } finally { clearTimeout(timer); }
  }
  function updateSubmit() { $("send-report").disabled = state.busy || !state.config || (!state.owner && !state.ready) || state.owner?.status === "withdrawn"; }
  function selected(area) {
    state.selected = area; $("chosen-sector").textContent = `Sector elegido: ${area.name}`; $("sector-confirm").checked = false;
    $("sector-options").replaceChildren(); $("sector-more").hidden = true;
    const id = area.id;
    api(`report-summary?area_id=${encodeURIComponent(id)}`).then(summary => {
      if (state.selected?.id !== id) return;
      $("sector-summary").textContent = summary.suppressed
        ? "Información agregada insuficiente: no se publican grupos menores de tres reportes revisados. Se desconoce el suministro."
        : `${summary.approved_reports} reportes revisados en 24 horas: ${summary.outage_reports} de falta de luz y ${summary.restoration_reports} de retorno observado. No prueban fuentes independientes ni suministro en todo el sector.`;
      $("sector-summary").append(document.createTextNode(` Consulta: ${formatter.format(new Date(summary.generated_at))}, hora de Ecuador.`));
    }).catch(() => { if (state.selected?.id === id) $("sector-summary").textContent = "No se pudo consultar el resumen. Se desconoce el suministro."; });
  }
  async function search(append = false) {
    const version = ++state.searchVersion;
    if (!append) {
      state.query = $("sector-query").value.trim(); state.offset = 0; state.selected = null;
      $("sector-confirm").checked = false; $("chosen-sector").textContent = "Selecciona un sector concreto de los resultados.";
      $("sector-options").replaceChildren(); $("sector-summary").textContent = "";
    }
    $("sector-status").textContent = "Buscando sectores…"; $("sector-more").hidden = true;
    try {
      const result = await api(`areas?type=sector&limit=20&offset=${state.offset}&q=${encodeURIComponent(state.query)}`);
      if (version !== state.searchVersion) return;
      for (const area of result.data) {
        const button = text("button", `${area.name}${area.synthetic ? " · ejemplo sintético" : ""}`); button.type = "button";
        button.addEventListener("click", () => selected(area)); $("sector-options").append(button);
      }
      state.offset = result.meta.next_offset; $("sector-more").hidden = state.offset === null;
      $("sector-status").textContent = result.data.length ? "Elige un sector y confirma que corresponde a tu observación." : "No hay un sector verificable en el catálogo para esta búsqueda. No se enviará un reporte sobre una zona ambigua.";
    } catch { if (version === state.searchVersion) $("sector-status").textContent = "No se pudo consultar el catálogo. Inténtalo más tarde."; }
  }
  async function renew() {
    clearTimeout(readyTimer); state.ready = false; state.challenge = null; updateSubmit();
    $("verification-status").textContent = "Preparando comprobación…";
    try {
      const challenge = await api("report-challenges", { method: "POST", body: {} });
      state.challenge = challenge; $("challenge-answer").value = "";
      $("question-group").hidden = !challenge.question;
      $("challenge-answer").required = Boolean(challenge.question);
      $("question-label").textContent = challenge.question || "Comprobación adicional";
      readyTimer = setTimeout(() => { state.ready = true; $("verification-status").textContent = challenge.question ? "Responde la comprobación antes de enviar." : "Comprobación lista."; updateSubmit(); }, challenge.min_wait_seconds * 1000);
    } catch (error) { $("verification-status").textContent = error.message || "No se pudo preparar la comprobación."; }
  }
  function localTime(value) {
    if (!value) return null;
    const date = new Date(`${value}:00-05:00`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(date.getTime())) throw new Error("Usa una fecha y hora válidas de Ecuador, o deja el campo vacío.");
    return date.toISOString();
  }
  function input() {
    if (!state.selected || !$("sector-confirm").checked || !$("report-consent").checked) throw new Error("Elige y confirma un sector, y acepta el uso de datos antes de enviar.");
    return { area_id: state.selected.id, area_confirmed: true, consent: true, consent_version: state.config.policy.consent_version,
      declaration: $("declaration").value, reported_start_at: localTime($("reported-time").value) };
  }
  function credentials() {
    const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
    const receipt_token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const uuid = new Uint8Array(16); crypto.getRandomValues(uuid);
    uuid[6] = (uuid[6] & 15) | 64; uuid[8] = (uuid[8] & 63) | 128;
    const hex = [...uuid].map(value => value.toString(16).padStart(2, "0")).join("");
    return { request_id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, receipt_token };
  }
  function lockUncertain(lock) {
    for (const element of document.querySelectorAll("#report-form input,#report-form select,#sector-search input,#sector-search button,#sector-options button,#sector-confirm")) element.disabled = lock;
  }
  function ownerMode(report, token) {
    state.owner = report; state.token = token; state.pending = null;
    lockUncertain(false);
    selected({ id: report.area_id, name: report.area_name });
    $("form-title").textContent = "Corregir mi reporte"; $("send-report").textContent = "Guardar corrección";
    $("correction-fields").hidden = false; $("correction-reason").required = true; $("correction-reason").value = "";
    $("verification").hidden = true; $("challenge-answer").required = false;
    $("declaration").value = report.declaration;
    $("reported-time").value = report.reported_start_at ? new Date(Date.parse(report.reported_start_at) - 5 * 3600000).toISOString().slice(0, 16) : "";
    $("report-consent").checked = false; $("withdraw-confirm").checked = false;
    $("withdraw-controls").hidden = report.status === "withdrawn";
    $("manage-status").textContent = `${statusNames[report.status]} · revisión ${report.revision}. Recibido: ${formatter.format(new Date(report.received_at))}, hora de Ecuador.`;
    updateSubmit();
  }
  async function submit() {
    if (state.busy) return;
    state.busy = true; updateSubmit(); $("report-status").textContent = "Procesando tu solicitud…";
    try {
      if (state.owner) {
        const body = { ...input(), expected_revision: state.owner.revision, reason: $("correction-reason").value };
        const report = await api(`reports/${encodeURIComponent(state.owner.report_id)}`, { method: "PATCH", body, token: state.token });
        ownerMode(report, state.token); $("report-status").textContent = "Corrección recibida. Vuelve a revisión y deja de contar como aprobado mientras se revisa.";
      } else {
        if (!state.pending) {
          if (!state.ready || !state.challenge) throw new Error("Renueva la comprobación antes de enviar.");
          state.pending = { ...input(), ...credentials(), challenge_id: state.challenge.challenge_id,
            answer: $("challenge-answer").value.trim(), website: $("website").value };
        }
        lockUncertain(true);
        const pending = state.pending;
        const report = await api("reports", { method: "POST", body: pending });
        $("private-receipt").value = `${report.report_id}.${pending.receipt_token}`;
        $("receipt-panel").hidden = false;
        ownerMode(report, pending.receipt_token);
        $("report-status").textContent = report.status === "pending"
          ? "Reporte recibido, pendiente de revisión. Guarda tu código privado. No confirma un corte ni genera alertas."
          : `Envío recuperado. Estado: ${statusNames[report.status]}. Guarda tu código privado; no confirma un corte ni genera alertas.`;
        $("receipt-title").setAttribute("tabindex", "-1"); $("receipt-title").focus();
      }
    } catch (error) {
      const uncertain = !state.owner && state.pending && (!error.status || error.status >= 500);
      if (uncertain) {
        $("send-report").textContent = "Reintentar mismo envío";
        $("report-status").textContent = "No se pudo confirmar la recepción. Mantén esta página abierta y reintenta el mismo envío; no se duplicará.";
      } else {
        state.pending = null; lockUncertain(false); $("report-status").textContent = error.message || "No se pudo completar la solicitud.";
        if (!state.owner && ["VERIFICATION_REQUIRED", "CONFLICT"].includes(error.code)) await renew();
      }
    } finally { state.busy = false; updateSubmit(); }
  }
  async function load() {
    const match = /^(r_[a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec($("management-code").value.trim());
    if (!match) { $("manage-status").textContent = "Introduce el código privado completo, sin enlaces ni espacios."; return; }
    try {
      const report = await api(`reports/${match[1]}`, { token: match[2] });
      $("receipt-panel").hidden = true; $("private-receipt").value = ""; $("management-code").value = "";
      ownerMode(report, match[2]); $("form-title").setAttribute("tabindex", "-1"); $("form-title").focus();
    } catch (error) { $("management-code").value = ""; $("manage-status").textContent = error.message; }
  }
  async function withdraw() {
    if (!state.owner || !$("withdraw-confirm").checked) { $("manage-status").textContent = "Marca que quieres retirar este reporte antes de continuar."; return; }
    $("withdraw-report").disabled = true;
    try {
      const report = await api(`reports/${encodeURIComponent(state.owner.report_id)}`, { method: "DELETE", body: { expected_revision: state.owner.revision }, token: state.token });
      ownerMode(report, state.token); $("report-status").textContent = "Reporte retirado. Deja de contar en los resúmenes de inmediato.";
    } catch (error) { $("manage-status").textContent = error.message; }
    finally { $("withdraw-report").disabled = false; }
  }
  async function newMode() {
    if (!$("receipt-panel").hidden) { $("copy-status").textContent = "Guarda tu código y usa el botón de borrado antes de comenzar otro reporte."; $("private-receipt").focus(); return; }
    if (state.pending) { $("report-status").textContent = "Confirma primero el envío pendiente mediante Reintentar mismo envío."; return; }
    state.owner = null; state.token = null; lockUncertain(false);
    $("report-form").reset(); $("form-title").textContent = "2. Cuenta lo observado"; $("send-report").textContent = "Enviar a revisión";
    $("correction-fields").hidden = true; $("correction-reason").required = false; $("verification").hidden = false;
    $("withdraw-controls").hidden = true; $("management-code").value = ""; $("manage-status").textContent = ""; $("report-status").textContent = "";
    await renew();
  }
  async function initialize() {
    try {
      const config = await api("reports/config"); state.config = config;
      $("report-mode").textContent = config.synthetic ? "DEMO · Envíos sintéticos en memoria: se borran al cerrar el servidor. No son avisos reales." : "RECEPCIÓN CIUDADANA · Los reportes requieren revisión antes de incluirse en resúmenes por sector.";
      for (const [key, value] of Object.entries(config.policy)) if (key !== "consent_version") $("policy-content").append(text("p", value));
      await renew();
    } catch { $("report-mode").textContent = "Recepción no disponible. No se enviará ningún reporte."; }
  }
  $("sector-search").addEventListener("submit", event => { event.preventDefault(); search(); });
  $("sector-more").addEventListener("click", () => search(true));
  $("report-form").addEventListener("submit", event => { event.preventDefault(); submit(); });
  $("load-report").addEventListener("submit", event => { event.preventDefault(); load(); });
  $("withdraw-report").addEventListener("click", withdraw); $("renew-challenge").addEventListener("click", renew);
  $("new-mode").addEventListener("click", newMode);
  $("clear-receipt").addEventListener("click", () => { $("private-receipt").value = ""; $("receipt-panel").hidden = true; $("copy-status").textContent = ""; newMode(); });
  $("copy-receipt").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("private-receipt").value); $("copy-status").textContent = "Código copiado. Guárdalo en un lugar privado."; }
    catch { $("private-receipt").focus(); $("private-receipt").select(); $("copy-status").textContent = "Seleccionado: cópialo manualmente y guárdalo en privado."; }
  });
  window.AegisReports = { ready: initialize(), search, submit, load, withdraw, renew };
})();
