# A.E.G.I.S.-GRID — El Niño & Grid Sentinel

**Advanced Ecological & Grid Intelligence System.**

Sistema de alerta temprana que cruza el microclima de la cordillera andina (Pallatanga) con el estado del Sistema Nacional Interconectado (SNI) de Ecuador, pensado para anticipar deslaves viales y apagones durante un evento El Niño severo.

![Status](https://img.shields.io/badge/Status-OPERATIVE-00ff00?style=for-the-badge)
![Node](https://img.shields.io/badge/Node-22-green?style=flat-square)
![Coolify](https://img.shields.io/badge/Coolify-Ready-blueviolet?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Qué monitorea

| Módulo | Fuente | Qué calcula |
|---|---|---|
| **Riesgo de deslave (SSLI)** | Estación Ambient Weather local | Índice de saturación de suelo (API) + lluvia horaria → niveles Bajo / Moderado / Crítico |
| **Embalses (DDPM)** | CELEC SUR ORDS (REST público) | Cota, caudal y turbinas en línea de Mazar, Paute-Molino, Sopladora y Minas San Francisco; días estimados a parada forzada de Mazar |
| **Demanda nacional** | CENACE Info Operativa (scraper) | Mix hidro/térmico/importado/renovable + demanda actual en MW |
| **ENSO** | NOAA CPC (TXT semanal) | Anomalías Niño 1+2 y 3.4, tendencia semanal y riesgo local vs. red oriental |

> Nota de alcance: los umbrales SSLI y la tasa de vaciado de Mazar son heurísticas operativas, no pronósticos oficiales. Para decisiones críticas, contrasta siempre con INAMHI, CELEC y CENACE.

## Arquitectura

```text
Fuentes públicas (Ambient / CELEC / CENACE / NOAA)
        │  fetch server-side con caché en memoria
        ▼
backend.js (Fastify) ── /api/weather · /api/dams · /api/cenace · /api/enso
        │  agregación interna vía 127.0.0.1
        ▼
GET /api/status (único fetch del frontend) ──► frontend.html (dashboard, Chart.js)
```

- Caché en memoria por endpoint para no saturar fuentes lentas.
- `/api/*` restringido a localhost, salvo `/api/status` cuando el `Origin`/`Referer` coincide con el `Host` (ver [modelo de seguridad](#seguridad).
- `/` y `/ui` sirven el mismo dashboard.

## API

| Endpoint | TTL | Responde |
|---|---|---|
| `GET /api/weather` | 5 min | Temp, humedad, lluvia, viento, presión, índice SSLI y riesgo de deslave |
| `GET /api/dams` | 10 min | Cota/caudal/turbinas de los 4 embalses + estado y días a parada de Mazar |
| `GET /api/cenace` | 30 min | Composición diaria (MWh), hidro por central y MW actuales por fuente |
| `GET /api/enso` | 60 min | SSTA Niño 1+2/3/3.4/4, tendencia, nivel de alerta y riesgos local/red |
| `GET /api/status` | — | Agregado de los 4 anteriores (`timestamp` + 4 bloques) |
| `GET /` , `GET /ui` | — | Dashboard HTML |

## Inicio rápido

Requisitos: Node 22+.

```bash
cp .env.example .env   # completa AMBIENT_MAC
npm install
npm start              # http://localhost:3010/
```

## Configuración

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `AMBIENT_MAC` | Sí | — | MAC de tu estación Ambient Weather (`/api/weather` responde 500 sin ella) |
| `PORT` | No | `3010` | Puerto de escucha |

`.env` nunca se commitea (ver `.gitignore`). En producción define las variables en el gestor del host.

## Despliegue en Coolify (v4)

Dos caminos equivalentes:

- **Nixpacks (recomendado):** Build Pack automático, detecta `package.json` y corre `npm start`.
- **Dockerfile:** Build Pack `Dockerfile`, puerto `3010`.

En ambos casos define en **Environment Variables**: `AMBIENT_MAC` y (opcional) `PORT`.

## Docker local

```bash
docker build -t aegis-grid .
docker run --rm -p 3010:3010 -e AMBIENT_MAC="AA:BB:CC:DD:EE:FF" aegis-grid
```

## Estructura

```text
backend.js       API Fastify (ESM) + scrapers + caché + agregador + rate limit
frontend.html    Dashboard (Tailwind CDN + Chart.js + temas claro/oscuro/auto)
Dockerfile       Imagen Node 22 Alpine
package.json     Deps y script start
.env.example     Plantilla de variables (sin secretos reales)
```

## Seguridad

- Ningún secreto vive en el repo: la única credencial operativa (`AMBIENT_MAC`, identificador de estación pública) entra por variable de entorno.
- Acceso `/api/*` solo localhost; `/api/status` además acepta fetch del propio dashboard (misma-host `Origin`/`Referer`). **Esto es ofuscación anti-escáner, no autenticación**: el `Referer` es falsificable. No expongas datos sensibles detrás de esta API.
- Rate limiting global (`@fastify/rate-limit`): 200 req/min por IP en todas las rutas; localhost exento para no romper la auto-agregación de `/api/status`.
- CELEC/CENACE se consultan con verificación TLS desactivada (`rejectUnauthorized: false`) porque sus hosts usan cadenas no estándar; el riesgo asociado es MITM en esas fuentes. Si las entidades publican certificados válidos, reactiva la verificación.
- Ver `SECURITY.md` para reportar vulnerabilidades.

## Fuentes de datos

- CELEC SUR ORDS — `generacioncsr.celec.gob.ec:8443`
- CENACE — `cenace.gob.ec/info-operativa/InformacionOperativa.htm`
- NOAA CPC — `cpc.ncep.noaa.gov/data/indices/rel_wksst9120.txt`
- Ambient Weather — `lightning.ambientweather.net/device-data`

Scrapers frágiles por naturaleza: si una fuente cambia su HTML/JS, el endpoint correspondiente devuelve `500`/`404` con mensaje y el resto del dashboard sigue funcionando (`Promise.allSettled`).

## Contribuir

Ver `CONTRIBUTING.md`. Flujo corto: rama → cambio mínimo → `node --check backend.js` → PR describiendo fuente afectada y cómo verificarla.

## Licencia

MIT — ver `LICENSE`.
