const namespace = "http://www.w3.org/2000/svg";
function svgNode(name, attributes = {}) {
  const element = document.createElementNS(namespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}
const project = ([longitude, latitude]) => [(longitude + 82) * 65, (2 - latitude) * 65];
export async function mountMap(container, onSelect) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
  let data;
  try {
    const response = await fetch("/assets/map/ecuador.geojson", { signal: controller.signal });
    if (!response.ok) throw new Error("Cartografía no disponible");
    data = await response.json();
  } finally { clearTimeout(timeout); }
  const svg = svgNode("svg", { viewBox: "0 0 520 500", role: "group", "aria-labelledby": "map-title", "aria-describedby": "map-description" });
  const title = svgNode("title", { id: "map-title" }); title.textContent = "Ecuador continental: referencias cantonales aproximadas";
  const description = svgNode("desc", { id: "map-description" });
  description.textContent = "Contorno Natural Earth simplificado. Los círculos no representan hogares ni perímetros de corte. Usa la lista para consultar las evidencias.";
  svg.append(title, description);
  for (let y = 65; y < 500; y += 65) svg.append(svgNode("path", { d: `M0 ${y} H520`, class: "map-grid" }));
  for (const feature of data.features) {
    if (feature.geometry.type !== "Polygon") continue;
    const d = feature.geometry.coordinates.map(ring => ring.map((point, index) => {
      if (point.length !== 2 || point.some(n => !Number.isFinite(n))) throw new Error("Geometría inválida");
      return `${index ? "L" : "M"}${project(point).join(",")}`;
    }).join(" ") + " Z").join(" ");
    svg.append(svgNode("path", { d, class: "map-land" }));
  }
  const markers = svgNode("g"); svg.append(markers); container.replaceChildren(svg);
  let zoom = 1;
  return {
    update(events) {
      markers.replaceChildren();
      for (const reference of data.references) {
        const count = events.filter(event => event.map_ref === reference.id).length;
        const [x, y] = project([reference.longitude, reference.latitude]);
        const group = svgNode("g");
        const marker = svgNode("circle", { cx: x, cy: y, r: 9, class: "map-reference", role: "button", tabindex: "0",
          "aria-label": `${reference.label}. ${count} fichas de esta página. Ir a la lista de evidencias.` });
        marker.addEventListener("click", onSelect);
        marker.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); onSelect(); } });
        const label = svgNode("text", { x: x + 16, y: y + 5, class: "map-label" }); label.textContent = `Pallatanga · ${count} fichas`;
        const tooltip = svgNode("title"); tooltip.textContent = reference.basis;
        group.append(marker, label, tooltip); markers.append(group);
      }
    },
    zoom(direction) {
      zoom = Math.max(1, Math.min(4, zoom + direction));
      if (zoom === 1) { svg.setAttribute("viewBox", "0 0 520 500"); return; }
      const [x, y] = project([-78.97, -2]);
      svg.setAttribute("viewBox", `${x - 260 / zoom} ${y - 250 / zoom} ${520 / zoom} ${500 / zoom}`);
    },
    reset() { zoom = 1; svg.setAttribute("viewBox", "0 0 520 500"); },
  };
}
