# API pública v1 de lectura

`PUBLIC_API_V1=false` por defecto. Con flag ON:

- GET `/api/v1/openapi.json`: OpenAPI 3.1 de las rutas GET públicas **habilitadas**
  en este proceso. No lista propietarios, POST/PATCH/DELETE o administración.
- GET `/api/v1/health/quality`: contadores agregados desde arranque de GET públicos,
  errores4xx/5xx/429 y cargas de fuentes v4, sin IP, rutas individuales o secretos.
- GET `/api/v1/health/public`: contrato de salud PR01 conservado; no certifica fuentes.

[`openapi.json`](openapi.json) es un catálogo reproducible de todas las capacidades
GET con flags locales, no afirmación de que estén activas en producción. Generación:
`npm run openapi`, base sintética en memoria, sin fuentes/Push ni datos de usuario.
Mismo comando puede recibir un archivo de salida. Solo schema, no claves generadas.

## Flags y contratos

| Rutas | Flag además de PUBLIC_API_V1 |
| --- | --- |
| areas, outages, events/:id, evidence | BLACKOUT_MAP |
| schedules | OFFICIAL_SCHEDULES + SQLITE_STORAGE, sin BLACKOUT_DEMO |
| timeline | TIME_MACHINE + BLACKOUT_MAP + almacenamiento |
| timeline/schedules | TIME_MACHINE + OFFICIAL_SCHEDULES y gates previos |
| infrastructure | EXPLORER_3D |
| reports/config, report-summary | CITIZEN_REPORTS y gates previos |
| push/public-key | PUSH_ALERTS y gates previos; no expone clave privada |

GET no requiere falsificar Origin/Referer. Esos headers nunca autentican escritura
o gestión privada. No CORS permisivo, no confiar en X-Forwarded-For, no publicar
credenciales detrás de barrera de host. Cada ruta pública es explícita y validada;
OpenAPI se deriva de su schema real y solo captura metadata pública GET.

Consulta con cliente HTTP y HTTPS propio configurado, nunca un dominio de ejemplo:

```bash
curl --fail --silent https://example.invalid/api/v1/health/public
curl --fail --silent 'https://example.invalid/api/v1/areas?q=Pallatanga&limit=20'
curl --fail --silent 'https://example.invalid/api/v1/schedules?area_id=REVIEWED_SECTOR&from=2026-10-22T00%3A00%3A00-05%3A00&to=2026-10-23T00%3A00%3A00-05%3A00'
```

Fechas ISO con zona; Ecuador continental UTC−05:00. from/to semántica depende de
ruta: outages filtra updated_at, schedules intersección programada y timeline
intervalo del hecho separado de known_at. No tratar estas fechas como equivalentes.
Cada guía de arquitectura define sus límites. Query desconocida=>400; no agregar
secretos o flags en URL. 60 solicitudes/min por ruta/IP remota, global200/min con
excepción localhost heredada; no es protección distribuida. Consultar a ritmo
conservador, sin poll rápido; ante429 respetar espera y no multiplicar procesos.

Listas paginadas: limit/offset y next_offset. Nunca asumir ausencia de cortes por
cero filas o dato stale. El catálogo público es curado, no polígonos/circuitos
universales. Synthetic siempre explícito. evidence conserva fuente/publicación/
ingesta; revisión no rejuvenece hechos. null es desconocido, no0. Horario publicado
no confirma interrupción ni regreso; estado industrial no se convierte en residencial.

## Telemetría y límites de observación

Contadores por proceso, reinician en restart; requests excluye la solicitud quality
aún no completada. onResponse cuenta solo rutas registradas GET públicas; no
incluye propietarios, abuso de privados o endpoints desconocidos. sources cuenta
invocaciones del loader v4 al vencer caché, no cada HTTP subrequest, ni porcentaje
de cobertura. Fallo de un parser interno que devuelve dato ausente sin lanzar no
se presenta como error de loader. Timestamp de último éxito global no acredita
que todas las fuentes estén vigentes: consultar metadata/frescura de cada dato.
No logs de cuerpos, Authorization, endpointPush o IP. Observabilidad privada de
infraestructura/proxy se configura por operador, no se instaló stack de métricas.
No predicción o alerta física basada en estas cifras.

OpenAPI se valida con schemas/fixtures y reproducción exacta del export sin red.
Cambiar schema requiere regenerar catálogo y revisar clientes; conservar semántica
v1 y coordinar cambios incompatibles en nueva versión. Sin Swagger UI remoto o deps
nuevas. [Home Assistant](../../examples/home-assistant/README.md) es opt-in y read-only.

La obligatoriedad de area_id en report-summary se declara ahora también en schema
(runtime ya la exigía); el catálogo verifica ese contrato y reproducción sin red.
OpenAPI se validó formalmente con openapi-spec-validator temporal fuera de las
dependencias del proyecto. PyYAML/Jinja2 temporales validan ejemplo HA mediante
scripts/verify-ha-example.py; no se ejecutó una instancia HA ni acciones reales.
