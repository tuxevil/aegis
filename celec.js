// CELEC consulta un día civil de Ecuador, independientemente del TZ del servidor.
const ecuadorDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', year: 'numeric'
});
const lastReadings = new Map();

export function celecUrl(mrid, nowDate, dayDate = nowDate) {
  const fecha = `${ecuadorDate.format(dayDate)} 00:00:00`;
  const start = new Date(nowDate.getTime() - 2 * 86400_000).toISOString();
  const end = nowDate.toISOString();
  return `https://generacioncsr.celec.gob.ec:8443/ords/csr/sardomcsr/pointValues?mrid=${mrid}`
    + `&fechaInicio=${encodeURIComponent(start)}&fechaFin=${encodeURIComponent(end)}`
    + `&fecha=${encodeURIComponent(fecha)}`;
}

export async function fetchMrid(mrid, nowDate, fetchUrl) {
  // A medianoche el día nuevo puede no tener muestras aún. El rango ISO
  // conserva el mismo instante final al consultar el día anterior.
  for (const dayDate of [nowDate, new Date(nowDate.getTime() - 86400_000)]) {
    try {
      const res = await fetchUrl(celecUrl(mrid, nowDate, dayDate), { rejectUnauthorized: false });
      if (res.status !== 200) break;
      const items = JSON.parse(res.data).items || [];
      const valid = items.filter(i => Number.isFinite(i.valueedit) && Number.isFinite(Date.parse(i.loctimestamp)))
        .sort((a, b) => Date.parse(b.loctimestamp) - Date.parse(a.loctimestamp));
      if (valid.length) {
        const previous = lastReadings.get(mrid);
        const latest = previous && Date.parse(previous.loctimestamp) > Date.parse(valid[0].loctimestamp)
          ? previous : valid[0];
        lastReadings.set(mrid, latest);
        return latest;
      }
    } catch { break; }
  }
  // No reemplazar una medición válida por null. Se conserva su fecha original
  // para que el dashboard pueda indicar la antigüedad real del dato.
  return lastReadings.get(mrid) ?? null;
}
