export const CELEC_REFRESH_FAILURE=Symbol.for("aegis.celec.refresh-failure");
// CELEC consulta un día civil de Ecuador, independientemente del TZ del servidor.
const ecuadorDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Guayaquil",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
import { HistoryStore } from "./history.js";
const history = new HistoryStore();

export function mridReadings(mrid) {
  return history
    .read(String(mrid))
    .reverse()
    .map((r) => ({ ...r }));
}

export function celecUrl(mrid, nowDate, dayDate = nowDate, lookbackDays = 2) {
  const fecha = `${ecuadorDate.format(dayDate)} 00:00:00`;
  const start = new Date(
    nowDate.getTime() - lookbackDays * 86400_000,
  ).toISOString();
  const end = nowDate.toISOString();
  return (
    `https://generacioncsr.celec.gob.ec:8443/ords/csr/sardomcsr/pointValues?mrid=${mrid}` +
    `&fechaInicio=${encodeURIComponent(start)}&fechaFin=${encodeURIComponent(end)}` +
    `&fecha=${encodeURIComponent(fecha)}`
  );
}

export async function fetchMrid(
  mrid,
  nowDate,
  fetchUrl,
  { days = 1, store = history } = {},
) {
  // A medianoche el día nuevo puede no tener muestras aún. El rango ISO
  // conserva el mismo instante final al consultar el día anterior.
  let refreshFailed=false;
  for (let day = 0; day < Math.max(2, days); day++) {
    const dayDate = new Date(nowDate.getTime() - day * 86400_000);
    try {
      const res = await fetchUrl(
        celecUrl(mrid, nowDate, dayDate, Math.max(2, days)),
        {
          rejectUnauthorized: false,
        },
      );
      if (res.status !== 200) {refreshFailed=true;break;}
      const items = JSON.parse(res.data).items || [];
      const valid = items
        .filter(
          (i) =>
            Number.isFinite(i.valueedit) &&
            Number.isFinite(Date.parse(i.loctimestamp)) &&
            Date.parse(i.loctimestamp) <= nowDate.getTime() + 300000,
        )
        .sort(
          (a, b) => Date.parse(b.loctimestamp) - Date.parse(a.loctimestamp),
        );
      if (valid.length) {
        store.record(String(mrid), valid, nowDate);
        if (days === 1) return store.read(String(mrid)).at(-1) ?? null;
      }
    } catch {
      refreshFailed=true;break;
    }
  }
  // No reemplazar una medición válida por null. Se conserva su fecha original
  // para que el dashboard pueda indicar la antigüedad real del dato.
  const previous=store.read(String(mrid)).at(-1) ?? null;
  if(previous&&refreshFailed)Object.defineProperty(previous,CELEC_REFRESH_FAILURE,{value:true});
  return previous;
}
