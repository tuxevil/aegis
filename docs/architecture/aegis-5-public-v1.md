# API pública v1 — fundaciones PR-01

Los contratos ejecutables están en `api/schemas.js`; los ejemplos públicos en
`test/fixtures/public-v1.json` son **sintéticos** y nunca se cargan en el servidor.
Se usa Fastify y su validación/serialización existente, sin nuevas dependencias.

## Activación y acceso

`PUBLIC_API_V1=true npm start` registra únicamente `GET /api/v1/health/public`.
No requiere Origin/Referer, autenticación ni datos de fuentes. Respuesta:

```json
{"api_version":"1","status":"foundation","timestamp":"2026-10-21T15:00:00.000Z","coverage":"unknown"}
```

La fecha es la del clock inyectable `now`; no representa una observación.
`foundation` indica disponibilidad del contrato, no salud de fuentes ni ausencia
de cortes. No recibe parámetros: query desconocida devuelve 400. No habilita CORS.
Límite: 60 GET/minuto por IP remota; localhost conserva la excepción v4.
No confiar en X-Forwarded-For: no se habilitó trustProxy.

La allowlist consiste en rutas registradas con `config.publicApiV1: true` y
método GET; no se abre `/api/v1/*`. HEAD, escrituras, rutas desconocidas y privadas
siguen bajo la política v4 (403 remoto; localhost puede obtener 404). La salud
con flag OFF tampoco está registrada: 403 remoto/404 local, igual que cualquier
ruta API inexistente v4. La política heredada de `/api/status` sigue intacta.
No hay endpoints admin autenticados nuevos: siguen sin implementar y cerrados.

Los errores de rutas v1 registradas usan `{error:{code,message}}` con mensajes
fijos: INVALID_REQUEST (400), RATE_LIMITED (429), INTERNAL_ERROR (500).
NOT_FOUND queda reservado en el schema; las denegaciones del hook v4 conservan
su respuesta heredada. No se devuelven mensajes de dependencias ni valores de entrada.

## Flags

`feature-flags.js` enumera PUBLIC_API_V1 y los ocho flags del ADR-001:
BLACKOUT_MAP, CITIZEN_REPORTS, OFFICIAL_SCHEDULES, PUSH_ALERTS, OSINT_NEWS,
OSINT_X, TIME_MACHINE, EXPLORER_3D. Todos OFF; entorno acepta solo `true` exacto.
`createApp({flags})` permite inyección booleana para pruebas. La configuración se
normaliza y congela al crear la aplicación; requiere reinicio para cambiarla.
Los ocho flags de producto son reservas sin comportamiento en PR-01: ponerlos
ON no implementa ni activa mapa, reportes, ingesta o envíos. Son gates de entrega,
no permisos de usuario. PUBLIC_API_V1 permite probar fundaciones sin activar mapa.

## DTOs y límites

Todos los objetos exigen sus campos y excluyen propiedades adicionales. Los
schemas sirven como validación de entrada y allowlist de salida de futuros
handlers; la serialización excluye campos extra. No reemplazan moderación,
verificación de fuentes, autorización ni revisión de URLs antes de publicar.

| Schema | Contenido público |
| --- | --- |
| area | Identificador, nombre, padre, tipo administrativo/sector, precisión, código opcional, referencia/versionado de polígono |
| evidence | Fuente y clase, URL HTTPS opcional, artefacto, resumen, relación support/refute/retraction, fechas separadas y precisión |
| event | Área, tipo y estado reportado/corroborado/oficial/terminado/desconocido, inicio/fin nullable y fundamento, evidencias y explicación |
| schedule | Emisor, área, fechas UTC, texto horario original America/Guayaquil, tipo, artefacto, revisión, predecesor, confianza y estado de revisión/vigencia |
| error | Código enumerado y mensaje acotado |

IDs: 1–128 caracteres alfanuméricos, guion o guion bajo; textos: 1–2000;
URLs: máximo 2048; referencias de evidencia: máximo 100, sin duplicados.
`null` conserva desconocimiento; no se transforma en cero, cadena vacía ni hora
inventada. Cada entidad lleva `synthetic` explícito. No hay coordenadas de hogar,
IPs, MAC, recibos, endpoints Push ni payloads crudos en estos DTOs.

Schemas de forma no prueban que evidencia sea oficial, que dos fuentes sean
independientes o que fin sea posterior a inicio. Esas reglas y filtros temporales,
paginación, bbox y geografía verificable corresponden a sus futuros handlers.
Los contratos iniciales podrán ampliarse de forma compatible antes de consumidores
live. No se registran áreas/eventos/evidencias/cronogramas/timeline vacíos que
puedan confundirse con cobertura real: se implementarán según backlog.

## Inyección y rollback

Se conserva `createApp({fetchUrl, store, now, mac})`, añadiendo `flags`.
La salud usa solo clock; no consulta red, no escribe historial ni crea storage v5.
Sin SQLite, migración, jobs ni transporte Push. DATA_DIR y formato JSON v4 intactos.
Rollback: PUBLIC_API_V1=false y reinicio, o volver a v4 sin tocar el volumen.
