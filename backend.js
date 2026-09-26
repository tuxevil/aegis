const fastify = require('fastify')({ logger: false });
const https   = require('https');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');

// ─── CORS ────────────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const PORT = process.env.PORT || 3010;

// ─── IN-MEMORY CACHE (TTL) ───────────────────────────────────────────────────
// ─── SSLI STATE (Soil Saturation Landslide Index) ────────────────────────────
// Persiste entre llamadas; se resetea al cambiar de día UTC
let ssliState = { date: null, yesterday: 0, lastDailyMm: 0 };

function computeSSLI(dateutc, rainDailyMm) {
  const date = new Date(dateutc).toDateString();
  if (ssliState.date !== date) {
    if (ssliState.date !== null) {
      ssliState.yesterday = (0.8 * ssliState.yesterday) + ssliState.lastDailyMm;
    }
    ssliState.date = date;
  }
  ssliState.lastDailyMm = rainDailyMm;
  return ssliState.yesterday + rainDailyMm;
}

// ─── CACHES (evita re-fetchear fuentes lentas en cada request) ───────────────
const CACHE = {
  enso:   { ts: 0, data: null, ttl: 3600_000 },   // 1 h
  cenace: { ts: 0, data: null, ttl: 1800_000 },    // 30 min
  dams:   { ts: 0, data: null, ttl:  600_000 },    // 10 min
  weather:{ ts: 0, data: null, ttl:  300_000 },    // 5 min
};

function fromCache(key) {
  const c = CACHE[key];
  if (c.data && Date.now() - c.ts < c.ttl) return c.data;
  return null;
}

function toCache(key, data) {
  CACHE[key].data = data;
  CACHE[key].ts   = Date.now();
  return data;
}

// ─── HTTP HELPER ─────────────────────────────────────────────────────────────
function fetchUrl(urlStr, { rejectUnauthorized = true, timeoutMs = 9000 } = {}) {
  return new Promise((resolve, reject) => {
    const u      = new URL(urlStr);
    const client = u.protocol === 'https:' ? https : http;
    const opts   = {
      hostname:          u.hostname,
      port:              u.port || (u.protocol === 'https:' ? 443 : 80),
      path:              u.pathname + u.search,
      method:            'GET',
      rejectUnauthorized,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    };
    let data = '';
    const req = client.request(opts, res => {
      res.on('data', c => (data += c));
      res.on('end',  () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`Timeout ${urlStr}`)); });
    req.end();
  });
}

// ─── CELEC ORDS HELPER ───────────────────────────────────────────────────────
// La API devuelve 24 registros empezando en `fecha`. Para obtener los datos
// MÁS RECIENTES usamos fecha=HOY y filtramos nulls, luego ordenamos desc.
function celecUrl(mrid, nowDate) {
  const pad   = n => String(n).padStart(2, '0');
  const fecha = `${pad(nowDate.getDate())}/${pad(nowDate.getMonth()+1)}/${nowDate.getFullYear()} 00:00:00`;
  const start = new Date(nowDate.getTime() - 2*86400_000).toISOString();
  const end   = nowDate.toISOString();
  return `https://generacioncsr.celec.gob.ec:8443/ords/csr/sardomcsr/pointValues?mrid=${mrid}`
    + `&fechaInicio=${encodeURIComponent(start)}&fechaFin=${encodeURIComponent(end)}`
    + `&fecha=${encodeURIComponent(fecha)}`;
}

async function fetchMrid(mrid, nowDate) {
  try {
    const res  = await fetchUrl(celecUrl(mrid, nowDate), { rejectUnauthorized: false });
    if (res.status !== 200) return null;
    const items = JSON.parse(res.data).items || [];
    const valid = items.filter(i => i.valueedit !== null)
                       .sort((a,b) => new Date(b.loctimestamp) - new Date(a.loctimestamp));
    return valid.length ? valid[0] : null;
  } catch { return null; }
}

// ─── PLOTLY TYPED-ARRAY DECODER ──────────────────────────────────────────────
// CENACE usa bdata (base64 float64 little-endian) en las curvas de área.
function decodePlotlyY(yRaw) {
  if (Array.isArray(yRaw)) return yRaw;
  if (yRaw && typeof yRaw === 'object' && yRaw.bdata) {
    const buf  = Buffer.from(yRaw.bdata, 'base64');
    const dtMap= { f8: 8, f4: 4, i4: 4, i2: 2 };
    const sz   = dtMap[yRaw.dtype] || 8;
    const out  = [];
    for (let i = 0; i + sz <= buf.length; i += sz) {
      out.push(yRaw.dtype === 'f4' ? buf.readFloatLE(i) : buf.readDoubleLE(i));
    }
    return out;
  }
  return [];
}

function safeCenaceJson(raw) {
  return raw
    .replace(/\\u00e1/g,'á').replace(/\\u00e9/g,'é').replace(/\\u00ed/g,'í')
    .replace(/\\u00f3/g,'ó').replace(/\\u00fa/g,'ú').replace(/\\u00f1/g,'ñ')
    .replace(/\\u00c9/g,'É').replace(/\\u00c1/g,'Á').replace(/\\u00d3/g,'Ó')
    .replace(/\\u00c7/g,'Ç').replace(/\\u00ba/g,'º').replace(/\\u00b2/g,'²')
    .replace(/,\s*\]/g,']').replace(/,\s*\}/g,'}');
}

// ─── ENDPOINT 1: CLIMA LOCAL + SSLI ──────────────────────────────────────────
fastify.get('/api/weather', async (req, reply) => {
  const cached = fromCache('weather');
  if (cached) return reply.headers(CORS).send(cached);

  const mac   = 'AA:BB:CC:DD:EE:FF';
  const start = Date.now() - 1_800_000;
  const url   = `https://lightning.ambientweather.net/device-data`
    + `?macAddress=${encodeURIComponent(mac)}&dataKey=deviceSummaries&start=${start}&limit=1`;

  try {
    const res  = await fetchUrl(url);
    const json = JSON.parse(res.data);
    if (!json.data?.length) return reply.headers(CORS).code(404).send({ error: 'No data' });

    const d            = json.data[0];
    const tempC        = ((d.tempf - 32) * 5 / 9);
    const rainDailyMm  = d.dailyrainin  * 25.4;
    const rainRateMmHr = d.hourlyrainin * 25.4;
    const ssli         = computeSSLI(d.dateutc, rainDailyMm);

    let landslideRisk = 'Bajo';
    if      (ssli > 35 && rainRateMmHr > 15) landslideRisk = 'CRÍTICO — ALTA PROBABILIDAD DE DESLAVE';
    else if (ssli > 20 || rainRateMmHr > 8)  landslideRisk = 'Moderado — Vigilancia activa';

    // Tendencia barométrica (presión cayendo = tormenta inminente)
    const baroRate = d.baromrelin - (d.baromabsin || d.baromrelin); // relativa vs absoluta
    let baroTrend = 'Estable';
    if (d.hourlyrainin > 0 && d.solarradiation < 10) baroTrend = 'Descendente — posible lluvia';

    const payload = {
      timestamp:      new Date(d.dateutc).toISOString(),
      tempC:          +tempC.toFixed(1),
      humidity:       d.humidity,
      dewPointC:      +((d.tempf - (9/5) * (d.humidity < 13 ? (d.tempf - 14.55 - 0.114*(d.tempf - 14.55)*(1 - 0.01*d.humidity)) : (d.humidity - 100) * 0.14)) * 5/9).toFixed(1),
      rainRateMmHr:   +rainRateMmHr.toFixed(2),
      rainDailyMm:    +rainDailyMm.toFixed(2),
      rainMonthlyMm:  +(d.monthlyrainin  * 25.4).toFixed(2),
      rainYearlyMm:   +(d.yearlyrainin   * 25.4).toFixed(0),
      windSpeedKmh:   +(d.windspeedmph   * 1.60934).toFixed(1),
      windGustKmh:    +(d.windgustmph    * 1.60934).toFixed(1),
      windDirDeg:     d.winddir,
      solarRadiation: d.solarradiation,
      uvIndex:        d.uv,
      pressureHpa:    +(d.baromrelin * 33.8639).toFixed(1),
      baroTrend,
      ssliIndex:      +ssli.toFixed(2),
      landslideRisk
    };

    return reply.headers(CORS).send(toCache('weather', payload));
  } catch (e) {
    return reply.headers(CORS).code(500).send({ error: e.message });
  }
});

// ─── ENDPOINT 2: EMBALSES EN TIEMPO REAL ─────────────────────────────────────
// MRIDs mapeados por reverse-engineering del JS de CELEC SUR:
//   Mazar:     cota=30031, caudal_entrada=30538, unidades_linea=30503
//   Molino:    cota=24019, caudal_real=24811,   caudal_cuenca=24812
//   Sopladora: cota=90919, caudal=90537,         unidades=90503
//   Minas SF:  cota=650919,caudal=650538,         unidades=650503
fastify.get('/api/dams', async (req, reply) => {
  const cached = fromCache('dams');
  if (cached) return reply.headers(CORS).send(cached);

  const now = new Date();

  const [
    mazarCota, mazarCaud, mazarUnits,
    molinoCota, molinoCaudReal, molinoCaudCuenca,
    sopCota,   sopCaud,  sopUnits,
    msfCota,   msfCaud,  msfUnits
  ] = await Promise.all([
    fetchMrid(30031, now), fetchMrid(30538, now), fetchMrid(30503, now),
    fetchMrid(24019, now), fetchMrid(24811, now), fetchMrid(24812, now),
    fetchMrid(90919, now), fetchMrid(90537, now), fetchMrid(90503, now),
    fetchMrid(650919,now), fetchMrid(650538,now), fetchMrid(650503,now)
  ]);

  // Modelo DDPM: velocidad de vaciado de Mazar
  // Rango útil: 2153m (lleno) → 2098m (parada forzada)
  // tasa por defecto: 0.25 m/día si no hay histórico propio
  const MAZAR_MIN  = 2098;
  const MAZAR_WARN = 2115;
  const MAZAR_CRIT = 2110;
  const depRate    = 0.25;

  const cota = mazarCota?.valueedit ?? null;
  let mazStatus   = 'Sin Datos';
  let daysLeft    = null;
  if (cota !== null) {
    daysLeft  = +((cota - MAZAR_MIN) / depRate).toFixed(1);
    mazStatus = cota < MAZAR_CRIT ? 'EMERGENCIA CRÍTICA' :
                cota < MAZAR_WARN ? 'ALERTA APAGÓN'       : 'Estable';
  }

  const payload = {
    timestamp: now.toISOString(),
    mazar: {
      cotaMsnm:        cota?.toFixed(2) ?? null,
      caudalEntradaM3s:mazarCaud?.valueedit?.toFixed(1)  ?? null,
      unidadesLinea:   mazarUnits?.valueedit ?? null,
      timestamp:       mazarCota?.loctimestamp ?? null,
      daysToShutdown:  daysLeft,
      status:          mazStatus
    },
    molino: {
      cotaMsnm:         molinoCota?.valueedit?.toFixed(2)     ?? null,
      caudalRealM3s:    molinoCaudReal?.valueedit?.toFixed(1)  ?? null,
      caudalCuencaM3s:  molinoCaudCuenca?.valueedit?.toFixed(1)  ?? null,
      timestamp:        molinoCota?.loctimestamp ?? null,
    },
    sopladora: {
      cotaMsnm:      sopCota?.valueedit?.toFixed(2)  ?? null,
      caudalM3s:     sopCaud?.valueedit?.toFixed(1)  ?? null,
      unidadesLinea: sopUnits?.valueedit ?? null,
      timestamp:     sopCota?.loctimestamp ?? null,
    },
    minasSF: {
      cotaMsnm:      msfCota?.valueedit?.toFixed(2)  ?? null,
      caudalM3s:     msfCaud?.valueedit?.toFixed(1)  ?? null,
      unidadesLinea: msfUnits?.valueedit ?? null,
      timestamp:     msfCota?.loctimestamp ?? null,
    }
  };

  return reply.headers(CORS).send(toCache('dams', payload));
});

// ─── ENDPOINT 3: CENACE — COMPOSICIÓN + CURVA HORARIA EN TIEMPO REAL ─────────
fastify.get('/api/cenace', async (req, reply) => {
  const cached = fromCache('cenace');
  if (cached) return reply.headers(CORS).send(cached);

  try {
    const res = await fetchUrl('https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm',
                               { rejectUnauthorized: false, timeoutMs: 12000 });

    const plots = [...res.data.matchAll(
      /Plotly\.newPlot\(\s*["']([^"']+)["']\s*,\s*(\[.*?\])\s*,\s*\{/gs
    )];

    let composition    = null;
    let hydro          = [];
    let hourly         = null;

    for (const m of plots) {
      const raw = safeCenaceJson(m[2]);
      let data;
      try { data = JSON.parse(raw); } catch { continue; }
      if (!Array.isArray(data) || !data.length) continue;

      const t0     = data[0];
      const names  = data.map(t => t.name || '');
      const labels = t0.labels || [];
      const type0  = t0.type;

      // 1. Composición diaria (pie)
      if (type0 === 'pie' && labels.some(l => /HIDROEL/i.test(l)) && !composition) {
        composition = {};
        labels.forEach((l, i) => { composition[l.toLowerCase()] = Math.round(t0.values[i]); });
      }

      // 2. Desglose de centrales hidro (bar) — el más detallado (mayor cantidad de traces)
      if (type0 === 'bar' && names.some(n => /Coca Codo|Mazar|Paute/i.test(n))) {
        if (data.length > hydro.length) {
          hydro = data.map(t => ({ central: t.name?.trim(), generationMWh: Math.round(t.y?.[0] ?? 0) }));
        }
      }

      // 3. Curva horaria (area/scatter con x = '00:00', '00:30'...) — último segmento del día
      if (!hourly && Array.isArray(t0.x) && t0.x.length >= 48 && /^[0-2]\d:\d\d$/.test(t0.x[0])) {
        const xLabels = t0.x;
        const traces  = {};
        for (const t of data) {
          const vals  = decodePlotlyY(t.y);
          // Último valor no-NaN
          const valid = vals.map((v, i) => [xLabels[i], v]).filter(([, v]) => typeof v === 'number' && !isNaN(v));
          if (valid.length) traces[t.name] = { lastMW: +valid[valid.length-1][1].toFixed(1), lastTime: valid[valid.length-1][0] };
        }
        hourly = traces;
      }
    }

    const payload = {
      timestamp: new Date().toISOString(),
      composition,
      hydroGenerators:   hydro,
      hourlyCurrentMW:   hourly
    };

    return reply.headers(CORS).send(toCache('cenace', payload));
  } catch (e) {
    return reply.headers(CORS).code(500).send({ error: e.message });
  }
});

// ─── ENDPOINT 4: NOAA ENSO INDICES ───────────────────────────────────────────
fastify.get('/api/enso', async (req, reply) => {
  const cached = fromCache('enso');
  if (cached) return reply.headers(CORS).send(cached);

  try {
    const res   = await fetchUrl('https://www.cpc.ncep.noaa.gov/data/indices/rel_wksst9120.txt');
    const lines = res.data.split('\n');
    const rows  = lines
      .map(l => l.trim().split(/\s+/))
      .filter(p => p.length >= 5 && /^\d{2}[A-Z]{3}\d{4}$/.test(p[0]));

    if (!rows.length) return reply.headers(CORS).code(404).send({ error: 'No data' });

    const last    = rows[rows.length - 1];
    const nino12  = parseFloat(last[1]);
    const nino34  = parseFloat(last[3]);

    // Tendencia: comparar con semana anterior
    const prev    = rows.length > 1 ? rows[rows.length - 2] : null;
    const trend12 = prev ? (nino12 - parseFloat(prev[1])).toFixed(2) : null;
    const trend34 = prev ? (nino34 - parseFloat(prev[3])).toFixed(2) : null;

    // Clasificación científica NOAA:
    // El Niño: Niño 3.4 >= +0.5 durante 5 semanas consecutivas
    // Super El Niño: >= +1.5
    let alertLevel = 'Neutro';
    if      (nino34 >= 1.5 || nino12 >= 2.0) alertLevel = '🔴 SUPER EL NIÑO — ALERTA MÁXIMA';
    else if (nino34 >= 0.8 || nino12 >= 1.0) alertLevel = '🟠 EL NIÑO — MONITOREO ACTIVO';
    else if (nino34 >= 0.5 || nino12 >= 0.5) alertLevel = '🟡 CALENTAMIENTO — VIGILANCIA';
    else if (nino34 <= -0.5)                  alertLevel = '🔵 LA NIÑA — Sin riesgo local';

    // Riesgo específico para Pallatanga
    const localRisk = nino12 >= 1.2
      ? 'ALTO — Lluvia extrema en Andes occidentales probable'
      : nino12 >= 0.8
      ? 'MODERADO — Aumenta probabilidad de lluvia local'
      : 'BAJO';

    // Riesgo específico para embalses del oriente
    const gridRisk = nino34 >= 0.8
      ? 'ALTO — Sequía en cuenca oriental probable (Mazar en riesgo)'
      : nino34 >= 0.5
      ? 'MODERADO — Reducción de caudales posible'
      : 'BAJO';

    const payload = {
      dateReported: last[0],
      nino12SSTA:   nino12,
      nino3SSTA:    parseFloat(last[2]),
      nino34SSTA:   nino34,
      nino4SSTA:    parseFloat(last[4]),
      trend: { nino12: trend12, nino34: trend34 },
      alertLevel,
      localRisk,
      gridRisk
    };

    return reply.headers(CORS).send(toCache('enso', payload));
  } catch (e) {
    return reply.headers(CORS).code(500).send({ error: e.message });
  }
});

// ─── ACCESO: /api PROTEGIDA, UI SÍ LEE DATOS ───────────────────────────────────
// - localhost: acceso total (el propio backend agrega vía 127.0.0.1).
// - /api/status: además se permite si el fetch lo inicia el propio dashboard
//   (Referer/Origin del mismo host). Así la UI remota muestra datos, pero el
//   acceso directo (curl, navegador, otro sitio) sigue devolviendo 403.
//   Nota: el Referer es falsificable; esto oculta de escáneres, no es auth real.
// - resto de /api/*: solo localhost.
function isLocalIp(ip) {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
function hostOf(v) {
  if (!v) return null;
  try {
    const u = new URL(v.includes('://') ? v : `http://${v}`);
    return u.hostname || null;
  } catch { return null; }
}
fastify.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api')) return;
  const ip = req.ip || req.socket?.remoteAddress;
  if (isLocalIp(ip)) return; // local: todo permitido
  if (req.url.startsWith('/api/status')) {
    const srv = hostOf(req.headers.host);
    const org = hostOf(req.headers.origin);
    const ref = hostOf(req.headers.referer);
    if (srv && (org === srv || ref === srv)) return; // fetch iniciado por el dashboard
  }
  return reply.headers(CORS).code(403).send({ error: 'API restringida: acceso directo no permitido' });
});

// ─── ENDPOINT 5: RESUMEN TÁCTICO UNIFICADO ───────────────────────────────────
// Un solo fetch para el frontend — agrega los 4 endpoints con sus caches
fastify.get('/api/status', async (req, reply) => {
  const [weather, dams, cenace, enso] = await Promise.allSettled([
    fetch(`http://127.0.0.1:${PORT}/api/weather`).then(r => r.json()),
    fetch(`http://127.0.0.1:${PORT}/api/dams`).then(r => r.json()),
    fetch(`http://127.0.0.1:${PORT}/api/cenace`).then(r => r.json()),
    fetch(`http://127.0.0.1:${PORT}/api/enso`).then(r => r.json()),
  ]);

  return reply.headers(CORS).send({
    timestamp: new Date().toISOString(),
    weather:  weather.status  === 'fulfilled' ? weather.value  : null,
    dams:     dams.status     === 'fulfilled' ? dams.value     : null,
    cenace:   cenace.status   === 'fulfilled' ? cenace.value   : null,
    enso:     enso.status     === 'fulfilled' ? enso.value     : null,
  });
});

// ─── STATIC UI ───────────────────────────────────────────────────────────────
// La raíz abre directamente el dashboard (mismo contenido que /ui, por compatibilidad)
const serveUI = async (req, reply) =>
  reply.type('text/html').send(fs.readFileSync(path.join(__dirname, 'frontend.html')));

fastify.get('/ui', serveUI);

fastify.get('/', serveUI);

// ─── BOOT ─────────────────────────────────────────────────────────────────────
const boot = async () => {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`AEGIS Grid running on port ${PORT}`);
};
boot();
