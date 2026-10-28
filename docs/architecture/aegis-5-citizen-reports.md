# AEGIS 5 — Reportes ciudadanos (PR-04)

## Alcance y activación

Sin cuenta: elegir sector concreto del catálogo, confirmar el área, declarar
falta de luz o retorno observado, hora opcional y consentimiento. No texto libre,
correo, nombre, dirección, GPS, uploads ni Push. Un reporte nunca cambia cotas,
fuentes v4 o un incidente a «oficial». PR-05 correlacionará evidencia; PR-04 solo
recibe, revisa y presenta agregados, sin crear incidentes públicos automáticamente.

```bash
# Demo aislada: se descartan los envíos al cerrar, no requiere secretos externos.
PUBLIC_API_V1=true BLACKOUT_MAP=true BLACKOUT_DEMO=true CITIZEN_REPORTS=true npm start
# Abrir /report, o su enlace desde /map.
```

`CITIZEN_REPORTS` sigue OFF. Requiere BLACKOUT_MAP + PUBLIC_API_V1 y, en live,
SQLITE_STORAGE con DB_DIR persistente. BLACKOUT_DEMO conserva su rechazo de live
SQLite simultáneo. Live exige REPORTS_ORIGIN como **origen HTTPS canónico exacto**
(ejemplo https://ejemplo.invalid, sin slash/ruta): falla antes de abrir el servicio
si no está configurado. No se modificó ninguna configuración de producción.

En demo puede derivarse el origen del host de la petición (solo datos sintéticos).
Origin/Referer no autentican un propietario: únicamente el recibo autoriza editar,
consultar o retirar. Para operación live hay que revisar catálogo sectorial,
privacidad/base jurídica, moderación y controles de infraestructura/volumen según
el diseño aprobado. Esta política técnica no afirma una certificación legal.
No se asumen APIs de captcha, credenciales ni servicios comerciales disponibles.

## Consentimiento y datos

`reports/policy.js` define versión `reports-2026-10-21` y texto público usado por
formulario/API. Casilla siempre desmarcada, consentimiento y confirmación de área
booleanos true validados antes de coerción. Crear/corregir requiere esa versión;
retirar solo requiere autorización y revisión esperada, sin renovar consentimiento.
Los inputs y respuestas tienen schemas cerrados. Se rechaza incluso texto extra
que parezca una nota inocua: no hay canal para insertar PII, XSS o SQL en resúmenes.

Sector debe existir en la modalidad de la base, ser tipo sector, precisión
`generalized_sector` y tener padre. Nombre libre, cantón/provincia y alias ambiguo
no se convierten automáticamente en sector/circuito. El catálogo debe ser curado
como público; no crear áreas con nombres/direcciones privadas. Sin sector fiable,
la UI explica que no puede enviar sobre una zona ambigua, sin inventar polígonos.

`reported_start_at` es la hora declarada del estado elegido, nullable; para
`restored` significa cuándo se observó retorno, no fin comprobado de un incidente.
ISO con zona explícita normalizado a UTC, últimos siete días y tolerancia máxima
de cinco minutos futuros por desfase de reloj. El formulario interpreta su campo
local en Ecuador UTC-05:00, sin depender de la zona del navegador.
`received_at` se obtiene siempre del clock del servidor, separado de la declaración.
No se rellena la hora ausente con recepción. Consentimiento se registra mediante
versión y fecha de recepción de la revisión create/correct.

## Recibo, idempotencia y cambios

El cliente genera mediante `crypto.getRandomValues`:

- token bearer de 32 bytes (256 bits, base64url de 43 caracteres);
- request_id UUID v4 aleatorio para reintentar el envío.

Servidor guarda únicamente SHA256 con separación de dominio del token, SHA256 del
request_id y hash del contenido normalizado. No necesita un secreto persistente
adicional. El token no aparece en respuestas API: lo conoce desde el inicio su
creador, que forma el código `report_id.token` tras confirmar recepción.

Código solo en pantalla/RAM, copia explícita por usuario, sin cookies ni
localStorage; no se manda por URL ni se captura en QA. Consultar/corregir/retirar
usa Authorization: Bearer y comparación de hash en tiempo constante. Sin token
correcto, mismo 404 que ID inexistente; sin correo/cuenta no hay recuperación.

Si se pierde una respuesta de creación, UI bloquea cambiar el envío y reintenta
con el mismo request_id/token/contenido. Resultado idempotente, incluso tras
reiniciar el servidor; cambios de contenido/token bajo el mismo ID dan conflicto.
La UI no guarda el envío pendiente fuera de RAM: cerrar la página antes de recibir
y guardar el código puede perder acceso. No prometer recuperación automática.

Raíz privada + revisiones inmutables. Corrección con expected_revision:

1. Token válido y revisión vigente; si cambió => 409.
2. Inserta revisión, conserva original y vuelve a pending (sale de agregados).
3. Repetir exactamente la corrección ya aplicada es idempotente.
4. Máximo 100 revisiones editables por raíz (incluye el alta), sin impedir su retiro final.

Retiro es terminal e idempotente, inserta revisión withdraw y excluye inmediatamente
el reporte del agregado. No se infiere reposición. Recibos/filas expirados ya no
autorizan acceso. No hay GET público de reportes pendientes individuales.

## API y protección de rutas

| Método/ruta | Acceso y efecto |
| --- | --- |
| GET /api/v1/reports/config | Política pública y modalidad synthetic, sin secretos |
| POST /api/v1/report-challenges | Comprobación efímera ligada a IP, no crea un reporte |
| POST /api/v1/reports | Consentimiento + sector + comprobación, responde 201 pending |
| GET /api/v1/reports/:id | Solo con recibo: representación propia sanitizada |
| PATCH /api/v1/reports/:id | Recibo + revisión esperada + consentimiento, nueva revisión pending |
| DELETE /api/v1/reports/:id | Recibo + revisión esperada, retiro |
| GET /api/v1/report-summary?area_id= | Agregado de sector, nunca recibo o IDs de reportes |

Ninguna exención por prefijo ni admin nuevo. Cada ruta/método se registra por
metadata explícita. Routes de gestión requieren X-Aegis-Request: citizen-report;
escrituras también JSON, origen exacto y rechazo de Sec-Fetch-Site: cross-site.
No cookies de autenticación, no CORS permisivo. GET de propietario conserva token
obligatorio y header custom; Origin cuando existe debe coincidir. No se aceptan
secrets en query. Bodies máximo 4096 bytes y propiedades desconocidas rechazadas.
Errores 400/403/404/409/413/429/500 con texto fijo, sin entrada o errores SQL.
Todo sin caché. Fastify no registra cuerpos/headers/IPs en logs de aplicación.

Referencia primaria del patrón de header custom y origen como mitigación CSRF,
no como autenticación: [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
Logs, headers y TLS en un proxy externo se revisan por separado; nunca registrar
Authorization ni cuerpos de estos endpoints. El servidor no confía en
X-Forwarded-For: detrás de proxy todos pueden compartir cuota conservadora.
No se habilitó trustProxy sin conocer una topología confiable.

## Abuso y límites del piloto

Se reutiliza rate-limit Fastify (60/min por ruta, con excepción localhost heredada)
y se añade guard propio **también para localhost**, sin excepción:

- 30 intentos protegidos por IP/hora, incluyendo gestión;
- máximo cinco altas exitosas por IP/hora;
- 20 comprobaciones por IP/hora y separación mínima de un segundo;
- nonce de un solo uso, ligado a huella de IP, válido máximo diez minutos;
- mínimo un segundo entre emisión y alta, honeypot vacío;
- después de dos altas se exige suma textual accesible; un nonce previo sin
  pregunta no evita esa progresión;
- duplicado de mismo contenido normalizado/IP bloqueado 30 minutos, sin fusionar
  reportantes de IPs distintas ni darles independencia por defecto;
- máximo 10000 sujetos y 20000 comprobaciones, sin desalojar cuotas activas para
  que un atacante las reinicie; al llegar al límite se rechaza temporalmente.

Solo HMAC de IP con clave aleatoria por proceso en RAM. No huella en SQLite,
backups, respuestas o fixtures; expiración fija hasta una hora, barrido amortizado
cada minuto, no refresco indefinido por actividad. El limiter Fastify/red también
procesa IP temporalmente en RAM. No hay un job pesado ni dependencia externa.

Estado se pierde al reiniciar, no se comparte entre réplicas. Esta versión es
para **un proceso**, revisión manual y volumen controlado. La suma/honeypot no es
un CAPTCHA robusto frente a bots adaptativos; no acredita humanidad ni evita
ataques distribuidos o rotación de IP. Una IP compartida puede bloquear usuarios
legítimos. Antes de captación masiva hace falta validar límites/integración de
infraestructura o proveedor de verificación según disponibilidad, términos y costo.
No se presenta un reporte como confirmado para compensar esas limitaciones.
[OWASP sobre defensa en capas](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html).

## Cola y publicación

Operador local con permisos de filesystem; **sin endpoint HTTP administrativo**:

```bash
DB_DIR=/ruta/persistente/v5 npm run storage -- init
DB_DIR=/ruta/persistente/v5 npm run reports -- queue
DB_DIR=/ruta/persistente/v5 npm run reports -- approve r_identificador 1
DB_DIR=/ruta/persistente/v5 npm run reports -- reject r_identificador 1
DB_DIR=/ruta/persistente/v5 npm run reports -- prune
```

CLI requiere base existente/actual: queue/review no crean ni migran. Queue devuelve
hasta 50 pendientes por vez, sin hashes/recibos/IP. Aprobar/rechazar requiere la
revisión exacta; un cambio concurrente obliga a volver a leer. Decisión y fecha
se guardan en citizen_report_reviews. No se puede aprobar una revisión ya retirada
ni cambiar silenciosamente una decisión: el autor debe presentar nueva corrección.
La CLI no está conectada a la demo del servidor (memoria efímera); QA usa inyección
local de store para probar moderación, sin habilitar un admin demo remoto.

Resumen usa solo revisión vigente aprobada y recibida en últimas 24 h. Por sector,
si hay menos de tres, devuelve suppressed=true y conteos null, no cero cortes.
Al alcanzar tres devuelve número de reportes moderados por estado declarado, sin
IDs, horas individuales, ubicación precisa o prueba de fuentes independientes.
Incluye generated_at (fecha de consulta, no del hecho). Está visible en formulario
y en /map al seleccionar un sector cuando el flag está ON. No cambia marcadores de incidentes ni pinta un área como apagada; sigue coverage
unknown. Corrección/retirada/rechazo deja de contar en la siguiente consulta.
No hay polling automático, las pantallas anteriores se refrescan manualmente.

## Persistencia, retención y recuperación

Migración 002 añade citizen_reports, citizen_report_revisions y citizen_report_reviews;
001 no se editó. FK, índices, transacciones, modo synthetic, límite DB_MAX_BYTES,
lock antes de snapshot y ledger/checksum existentes se conservan.
No se modifican sources/observations/events ni observations.json para recibir un
reporte. observation_id queda reservado, nullable, para el trabajo de PR-05.

Acceso y agregados excluyen registros expirados. Poda lógica: raíz a los 30 días
originales; retirados/rechazados siete días desde cambio, lo que ocurra antes.
Cascade borra revisiones/revisiones de moderación. Servicio ON poda al iniciar y
cada minuto, con reintento si backup ocupa conexión; CLI prune puede ejecutarse
cuando recepción está OFF. Configurar ese mantenimiento en operación, no se
instaló cron. El TTL es de registros activos, no borrado físico garantizado de
WAL, archivos libres o snapshots. La política informa que backups diarios conservan
siete versiones y pre-migration hasta revisión/borrado manual. Gestionar esas
copias y permisos según la política operativa antes de activar recepción live.

Rollback de aplicación: CITIZEN_REPORTS=false, reiniciar, conservar DB_DIR/DATA_DIR.
Con código anterior a 002, desactivar SQLITE_STORAGE para seguir v4 sin abrir un
esquema futuro. Para rollback de esquema, snapshot previo en **otro directorio**
y código compatible; conservar siempre la base v2 original con los envíos recibidos
después del snapshot. No destruir datos nuevos para volver atrás. Las pruebas
cubren migración v1→v2, snapshot, restore v1 y datos de v4/v5 preservados.

## QA reproducible

`npm ci && npm run check && npm test`: unidad/integración/API/DOM. Navegador opcional,
Playwright externo sin añadir dependencia npm al proyecto:

```bash
AEGIS_PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs \
AEGIS_CHROMIUM=/ruta/chrome \
node scripts/verify-reports-browser.mjs
```

Servidor loopback y demo; 320/390/768/1440 px, consentimiento desmarcado, sector,
crear, acceso con código, corregir, retirar y cero overflow. El código se usa solo
en RAM y los inputs ya están vacíos antes de capturar. Reportes/capturas en
artifacts/aegis5-pr04-* sin recibos, IPs ni tráfico externo.
Próximo bloque: PR-05 correlación/evidencia; no iniciado en esta entrega.
