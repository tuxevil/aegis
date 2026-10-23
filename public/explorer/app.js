(() => {
  const $ = (id) => document.getElementById(id),
    ns = "http://www.w3.org/2000/svg";
  let data = null;
  const format = (value) =>
    value
      ? new Date(value).toLocaleString("es-EC", {
          timeZone: "America/Guayaquil",
        })
      : "Fecha desconocida";
  function node(tag, attributes, text) {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes))
      el.setAttribute(key, value);
    if (text) el.textContent = text;
    return el;
  }
  const y = (value) => 270 - (value - 2090) * 3.6;
  function marker(group, value, label, color) {
    group.append(
      node("line", {
        x1: 60,
        y1: y(value),
        x2: 475,
        y2: y(value),
        stroke: color,
        "stroke-width": 2,
      }),
    );
    group.append(
      node(
        "text",
        { x: 70, y: y(value) - 5, fill: color, "font-size": 13 },
        label,
      ),
    );
  }
  function draw(value, timestamp) {
    $("observed").replaceChildren();
    if (Number.isFinite(value)) {
      if (value >= 2090 && value <= 2158)
        marker(
          $("observed"),
          value,
          `Observación ${value.toFixed(2)} m`,
          "#00634f",
        );
      else
        $("observed").append(
          node(
            "text",
            { x: 70, y: 20 },
            "Observación fuera del eje ilustrativo.",
          ),
        );
    }
    $("history-value").textContent = Number.isFinite(value)
      ? `${value.toFixed(2)} m · observación ${format(timestamp)}. No es una reserva.`
      : "Cota desconocida; no se sustituye por cero.";
  }
  for (const [value, label, color] of [
    [2153, "2153 m · máximo de diseño", "#365c66"],
    [2115, "2115 m · referencia de seguridad", "#9c4a00"],
    [2098, "2098 m · mínimo de diseño", "#684a85"],
  ])
    marker($("references"), value, label, color);
  async function load() {
    try {
      $("status").textContent = "Consultando fuente…";
      const response = await fetch("/api/v1/infrastructure", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error();
      data = await response.json();
      const m = data.measurement,
        states = {
          current: "Lectura reciente",
          stale: "Lectura desactualizada",
          missing: "Sin lectura disponible",
          failed: "Falló la actualización; lectura anterior si existe",
        };
      $("status").textContent =
        `${states[m.state]} · consulta ${format(data.generated_at)}.`;
      $("measurement").textContent = Number.isFinite(m.value_m)
        ? `${m.value_m.toFixed(2)} m · medida ${format(m.observed_at)}.`
        : "Cota desconocida, no cero.";
      draw(m.value_m, m.observed_at);
      $("readings").replaceChildren();
      $("history").replaceChildren();
      const initial = document.createElement("option");
      initial.value = "";
      initial.textContent = "Lectura más reciente";
      $("history").append(initial);
      for (const [index, p] of data.observations.entries()) {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = `${format(p.observed_at)} · ${p.value_m} m`;
        $("history").append(option);
        const row = document.createElement("tr");
        for (const value of [format(p.observed_at), String(p.value_m)]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        }
        $("readings").append(row);
      }
    } catch {
      $("status").textContent =
        "Fuente no disponible. No se afirma una cota vigente.";
      $("measurement").textContent =
        "Cota desconocida; vuelve a consultar la fuente.";
      $("observed").replaceChildren();
      $("history").replaceChildren();
      $("readings").replaceChildren();
      data = null;
    }
  }
  $("history").onchange = () => {
    const value = $("history").value,
      p = value === "" ? data?.measurement : data?.observations[Number(value)];
    if (p) draw(p.value_m, p.observed_at);
  };
  $("refresh").onclick = load;
  $("load-3d").onclick = async () => {
    try {
      const module = await import("/explorer/scene.js");
      if (!module.drawScene($("scene"), Number($("rotation").value)))
        throw Error();
      $("three").hidden = false;
      $("fallback").textContent =
        "3D ilustrativo calculado localmente, sin DEM ni batimetría. Datos y referencias permanecen en 2D.";
      $("rotation").oninput = () =>
        module.drawScene($("scene"), Number($("rotation").value));
    } catch {
      $("three").hidden = true;
      $("fallback").textContent =
        "Esquema 3D no disponible. Conserva la vista 2D, la tabla y las referencias.";
    }
  };
  $("close-3d").onclick = () => {
    $("three").hidden = true;
    $("load-3d").focus();
  };
  load();
})();
