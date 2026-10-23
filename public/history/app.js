(() => {
  const $ = (id) => document.getElementById(id),
    state = { area: null, next: null, query: null, busy: false };
  const labels = {
    reported: "Reportado",
    corroborated: "Corroborado",
    official: "Oficial",
    ended: "Finalizado con evidencia",
    unknown: "Desconocido",
    support: "Respaldo",
    refute: "Refutación",
    retraction: "Corrección / retractación",
  };
  const local = (date) =>
      new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 16),
    format = (value) =>
      value
        ? new Date(value).toLocaleString("es-EC", {
            timeZone: "America/Guayaquil",
          })
        : "Desconocido";
  $("known").value = local(new Date());
  $("from").value = $("to").value = local(new Date()).slice(0, 10);
  async function request(url) {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw Error(
        "Consulta no disponible. Comprueba rango, permisos y conexión.",
      );
    return response;
  }
  const note = (text) => ($("status").textContent = text);
  $("find").onclick = async () => {
    try {
      const response = await request(
          "/api/v1/areas?limit=20&q=" + encodeURIComponent($("search").value),
        ),
        json = await response.json();
      $("areas").replaceChildren();
      for (const area of json.data) {
        const li = document.createElement("li"),
          button = document.createElement("button");
        button.type = "button";
        button.textContent = area.name;
        button.onclick = () => {
          state.area = area.id;
          $("area-label").textContent = "Área elegida: " + area.name;
          $("areas").replaceChildren();
        };
        li.append(button);
        $("areas").append(li);
      }
    } catch (error) {
      note(error.message);
    }
  };
  function query() {
    if (!state.area || !$("from").value || !$("to").value || !$("known").value)
      throw Error("Selecciona área y las dos fechas.");
    const upper = new Date($("to").value + "T00:00:00-05:00");
    upper.setUTCDate(upper.getUTCDate() + 1);
    return new URLSearchParams({
      area_id: state.area,
      from: new Date($("from").value + "T00:00:00-05:00").toISOString(),
      to: upper.toISOString(),
      known_at: new Date($("known").value + "-05:00").toISOString(),
      limit: "20",
      offset: "0",
    });
  }
  function render(value) {
    $("results").replaceChildren();
    $("planned")?.replaceChildren();
    for (const row of value.data) {
      const card = document.createElement("article"),
        title = document.createElement("h2");
      title.textContent = `${row.area_name} · ${row.type === "scheduled" ? "Programación, no corte observado" : row.type === "unplanned" ? "Interrupción reportada" : "Naturaleza desconocida"}`;
      card.append(title);
      for (const text of [
        row.synthetic ? "DATOS DE EJEMPLO" : "Evidencia revisada",
        `Estado registrado: ${labels[row.status] || row.status} · revisión ${row.revision}`,
        `Inicio: ${format(row.start_at)} · fin: ${format(row.end_at)}`,
        `AEGIS conocía esta revisión desde: ${format(row.recorded_at)}`,
        `Duración respaldada: ${row.duration_seconds === null ? "desconocida" : row.duration_seconds + " segundos"}`,
        row.redacted
          ? "Histórico parcial por privacidad o revisión vigente."
          : "Cobertura limitada al área indicada.",
      ]) {
        const p = document.createElement("p");
        p.textContent = text;
        card.append(p);
      }
      for (const source of row.evidence) {
        const p = document.createElement("p");
        p.textContent = `${source.source_name} · ${labels[source.relation] || source.relation} · publicación ${format(source.source_published_at)} · ingesta ${format(source.ingested_at)} `;
        if (source.source_url) {
          const link = document.createElement("a");
          link.href = source.source_url;
          link.rel = "noopener noreferrer";
          link.textContent = "Fuente";
          p.append(link);
        }
        card.append(p);
      }
      $("results").append(card);
    }
    note(
      `${value.meta.synthetic ? "DATOS SINTÉTICOS · " : ""}${value.data.length} revisiones. Corte temporal: ${format(value.meta.known_at)}. Sin filas no significa sin cortes.`,
    );
    state.next = value.meta.next_offset;
    $("next").disabled = state.next === null;
    $("json").disabled = $("csv").disabled = false;
    $("results").focus();
  }
  async function load(parameters) {
    if (state.busy) return;
    state.busy = true;
    state.generation = (state.generation || 0) + 1;
    note("Consultando…");
    $("results").replaceChildren();
    $("planned")?.replaceChildren();
    $("json").disabled = $("csv").disabled = $("next").disabled = true;
    try {
      const value = await (
        await request("/api/v1/timeline?" + parameters)
      ).json();
      state.query = parameters;
      render(value);
    } catch (error) {
      note(error.message);
    } finally {
      state.busy = false;
    }
  }
  $("filters").onsubmit = (event) => {
    event.preventDefault();
    try {
      load(query());
    } catch (error) {
      note(error.message);
    }
  };
  $("next").onclick = () => {
    if (state.query && state.next !== null) {
      const parameters = new URLSearchParams(state.query);
      parameters.set("offset", state.next);
      load(parameters);
    }
  };
  for (const [id, delta] of [
    ["back", -1],
    ["forward", 1],
  ])
    $(id).onclick = () => {
      const value = new Date($("known").value + "-05:00");
      if (!Number.isFinite(value.getTime())) return;
      value.setUTCHours(value.getUTCHours() + delta);
      $("known").value = local(value);
    };
  for (const type of ["json", "csv"])
    $(type).onclick = async () => {
      if (!state.query) return;
      try {
        const params = new URLSearchParams(state.query);
        params.set("format", type);
        const blob = await (await request("/api/v1/timeline?" + params)).blob(),
          url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = "aegis-timeline." + type;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) {
        note(error.message);
      }
    };
  $("compare-planned")?.addEventListener("click", async () => {
    if (state.busy) return;
    const generation = state.generation;
    try {
      const params = state.query || query();
      const value = await (
        await request("/api/v1/timeline/schedules?" + params)
      ).json();
      if (generation !== state.generation) return;
      $("planned").replaceChildren();
      const heading = document.createElement("h2");
      heading.textContent =
        "Programación conocida entonces · no observación de corte";
      $("planned").append(heading);
      for (const row of value.data) {
        const p = document.createElement("p"),
          link = document.createElement("a");
        p.textContent = `${row.synthetic ? "DATOS SINTÉTICOS · " : ""}${row.area_name}: planificado ${format(row.start_at)} a ${format(row.end_at)} · revisión ${row.revision_no} · ${row.status === "historical_cancelled" ? "cancelación documentada" : "programación histórica revisada"}. Revisada ${format(row.reviewed_at)}. No acredita duración efectiva. `;
        link.href = row.source_url;
        link.textContent = "Documento oficial";
        link.rel = "noopener noreferrer";
        p.append(link);
        $("planned").append(p);
      }
      if (!value.data.length) {
        const p = document.createElement("p");
        p.textContent =
          "Sin programación histórica publicable en esta página. No significa ausencia de cortes.";
        $("planned").append(p);
      }
      note(
        "Comparación del mismo corte temporal. Programado y reportado permanecen separados; más páginas se consultan por API.",
      );
    } catch (error) {
      $("planned").replaceChildren();
      note(error.message);
    }
  });
})();
