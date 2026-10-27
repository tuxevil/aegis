# M4 — Núcleo editorial y outbox exclusivamente simulada

2026-10-27. Incremento de software, no cierre del hito ni autorización operativa.
Rama `feat/multiamenaza-m4`, sobre M3 (#27). Grid Sentinel no cambia.

## Implementado

- `AlertJournal`: transacciones privadas inmutables bajo `DATA_DIR/alerts/v1/`
  separadas por origen, permisos 0700/0600, hashes encadenados, secuencia continua,
  reloj monotónico, bloqueo exclusivo y presupuestos de eventos/bytes.
- `EditorialService`: draft → pending_review → approved; devolución, notas,
  expiración, retractación y sustitución auditadas con actor/rol/motivo. Control
  de versión evita pisar revisiones concurrentes. Editor y aprobador distintos.
- `archiveEvidenceVerifier`: verifica hashes del archivo y vuelve a ejecutar el
  motor al corte actual. Identidad, contenido y versión fuente deben coincidir;
  conservar ID pero alterar hechos no evita el control. No hay consultas externas.
- `DryRunOutbox`: aprobación exacta y evidencia actual antes de encolar/simular;
  dedupe `alertId:revision:cityId:targetId`, persistencia/reinicio, caducidad,
  cancelación por retractación/cambio de fuente, backoff acotado y dead-letter.
- Serializadores puros para portal/RSS/PWA/WAHA. No existe transporte de envío,
  endpoint Push, sesión, llamada WAHA ni ID real. `simulated` nunca significa
  `sent`; `publishedAt` permanece null y `ALERTS_PUBLISH_ENABLED=false`.
- Plantillas españolas separan OFFICIAL de AEGIS_ASSESSMENT, evidencia, alcance,
  emisión/captura/procesamiento, vigencia y ausencia de difusión real. RSS escapa
  XML; hay rótulos de rectificación/retractación y datos sintéticos.
- Directorio CityChannel conserva los enlaces públicos reportados por el dueño
  para Guayaquil/nacional. JID, OWNER y límites siguen sin verificar; Pallatanga
  no recibe un enlace inventado. Los cuatro destinos son IDs de simulación.

El simulador admite un fallo inyectado para probar retries; no recibe URLs o
sesiones. No se guardan mensajes de excepción arbitrarios. La implementación
solo permite destinos internos conocidos; un `@newsletter` se rechaza.

## Persistencia y recuperación

No se migra ni sobrescribe `history.js`, fuentes o credenciales. Antes de usar un
archivo existente, respaldar DATA_DIR y verificar tanto fuentes como journal.
Rollback: deshabilitar consumidor editorial, conservar el directorio; restaurar
backup a raíz nueva y verificarlo. No truncar ni reparar registros automáticamente.
Un lock tras caída exige inspección de proceso antes de retirarlo manualmente.
Los hashes detectan alteración accidental y de entradas encadenadas; no sustituyen
una firma ni backup externo frente a un administrador que reescriba todo el volumen
(o elimine su cola final). Sin promesa de almacenamiento distribuido o SLA.

El estado `approved` significa aprobación editorial **para la simulación**, no
permiso de publicar. Los gates de licencia/geografía/modelos/corpus no se cierran
con una transición. Tampoco se resuelven permisos de WhatsApp por seguir un enlace.

## Verificación y pendiente

14 pruebas dirigidas verifican roles/versiones/revisor distinto, mutación/futuro,
hashes/huecos/locks/capacidad, origen, reinicio, dedupe, expiración, retractación,
cambio de fuente, backoff/dead-letter y escape XML. Incluyen extracción de PDF
sintético real → archivo hash → motor → revisión → outbox DRY_RUN, sin red.

Pendiente: suscripciones por zona con antiabuso y secretos de gestión,
consentimiento PWA independiente y onboarding de canales. Las rutas editoriales
solo son accesibles con Bearer; ningún candidato interno se expone al público. Rectificaciones ensayadas aquí son
revisiones internas; no se afirma envío correctivo real o publicación previa.
M5 sigue sujeto a aprobación separada; no se ha desplegado ni usado WAHA.

Baseline de este incremento: `npm ci` (0 vulnerabilidades), `npm run check`,
`npm test` **129/129**, Python **6/6**, ambos replays y `git diff --check` correctos.
Primer build Docker falló al excluir el directorio de canales en `.dockerignore`;
se permitió solo ese archivo, se reconstruyó y pasaron **74/74** pruebas
hazards+alerts con `--network none`. No se descargaron fuentes adicionales.


## Segundo incremento — API e interfaz editorial

Flag `ALERTS_ADMIN_ENABLED` apagado por defecto e independiente del explorador.
Activarlo requiere `ALERTS_ADMIN_CREDENTIALS_JSON`: array de objetos cerrados
`{id, role, tokenSha256}` con IDs/digests únicos y rol editor o approver.
Los tokens se generan externamente con al menos 32 bytes aleatorios (base64url);
solo su SHA-256 se configura en servidor. No hay credenciales de ejemplo válidas
ni claves embebidas. Revocación/rotación mediante configuración y reinicio.
Acceso remoto solo con TLS y la política de acceso de la instalación.

`/editorial/` sirve únicamente la carcasa vacía. La API privada exige Bearer
incluyendo localhost, tiene límite antes de autenticar, errores sanitizados,
`no-store`, cuerpos de 16 KiB, paginación y rechazo de campos desconocidos.
La autenticación no usa cookies, Origin ni Referer.

| Ruta bajo `/api/admin/alerts` | Acción |
| --- | --- |
| GET `/session` | Identidad/rol autenticados |
| GET base (sin slash final) | Revisiones paginadas |
| GET/POST `/candidates` | Evaluar archivo actual / importar ID calculado por servidor |
| POST `/:id/transitions` | Motivo y expectedVersion obligatorios |
| POST `/:id/outbox` | Encolar destino interno de simulación |
| GET `/outbox` | Outbox paginada |
| POST `/outbox/process` | Procesar simulación por clave |

La API no admite envelopes/candidatos suministrados por el cliente ni operaciones
publish/send. Al importar vuelve a evaluar la evidencia al reloj de servidor.
Interfaz vanilla sin scripts externos, CSP restrictiva, teclado/foco, etiquetas,
status live y diseño móvil. El token solo vive en memoria; no usa localStorage,
sessionStorage, cookie o query. Al salir/401 limpia vistas e ignora respuestas
pendientes. Datos fuente y notas se muestran mediante textContent, no HTML.

Pruebas adicionales: seis de API y cuatro de navegador. La primera ejecución
detectó que el 401 precedía al rate limiter; se adelantó el limitador y se verificó
429 también en localhost. Tests de credencial/query/cookie/Origin, roles,
versiones, candidato falsificado, payload grande, fallos privados y limpieza de
sesión están verdes. No se habilitó el flag ni se desplegó servidor alguno.


Verificación local del segundo incremento: `npm run check`, **139/139** Node,
**6/6** Python, ambos replays y diff-check correctos. Docker **84/84** pruebas
hazards+alerts con red deshabilitada. CI del primer incremento `36f44d0` pasó;
la CI del nuevo commit se registra por separado en el PR #28.
