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

Pendiente: API/admin autenticada, interfaz editorial accesible, suscripciones por
zona con antiabuso y secretos de gestión, consentimiento PWA independiente y
onboarding de canales. No hay todavía rutas administrativas o ciudadanas de M4;
ningún candidato interno se expone al público. Rectificaciones ensayadas aquí son
revisiones internas; no se afirma envío correctivo real o publicación previa.
M5 sigue sujeto a aprobación separada; no se ha desplegado ni usado WAHA.

Baseline de este incremento: `npm ci` (0 vulnerabilidades), `npm run check`,
`npm test` **129/129**, Python **6/6**, ambos replays y `git diff --check` correctos.
Primer build Docker falló al excluir el directorio de canales en `.dockerignore`;
se permitió solo ese archivo, se reconstruyó y pasaron **74/74** pruebas
hazards+alerts con `--network none`. No se descargaron fuentes adicionales.
