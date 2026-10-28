# PR-06 — Captura versionada de cronogramas oficiales

## Fuente y alcance

El [registro previo de fuentes](../research/aegis-5-official-schedules-sources.md)
selecciona HTML de EEASA, URL fija `https://www.eeasa.com.ec/trabajos-programadas/`.
La fuente publica tarjetas con fecha, intervalo, sector y motivo; el adaptador
extrae esos registros, no busca tablas inexistentes. Es mantenimiento local,
**no racionamiento nacional ni observación de interrupción efectiva**. PDFs y
Centrosur quedan investigados, sin añadir dependencias PDF/OCR ni conectores.

Registro en `schedules/providers.js`: emisor, HTTPS allowlist, zona continental,
versión `eeasa-html-1`, formato y estado de permisos `review-required`. Acceso
público y robots no prueban licencia. No se confirmó autorización de archivo o
redistribución amplia; operación pública y polling siguen OFF. La revisión local
exige atestar derechos para cada versión que se publique; no certifica legalidad.

`OFFICIAL_SCHEDULES=false` por defecto. Activado en servidor requiere
`PUBLIC_API_V1=true`, `SQLITE_STORAGE=true`, sin `BLACKOUT_DEMO`; expone solo el GET
explicado abajo. El flag también autoriza mutaciones de CLI, que pueden ejecutarse
sin arrancar servidor. No hay timer, polling, cron, adaptador remoto activado al
arrancar, Push ni automatización física. Los métodos internos son para código de
confianza y no verifican el flag: como los repositorios existentes, no son API HTTP.

## Captura y recursos

`schedules/capture.js` usa fetch con TLS estándar, timeout 10 s, credenciales omitidas
y redirects rechazados. URL solo del registro, sin parámetro de URL libre, enlaces
seguidos, cookies, scripts remotos ni fallback TLS inseguro de v4. Una solicitud
por ejecución, sin retry automático. Valida status 200/304, MIME HTML, header y
stream con máximo **256 KiB**. PDF/charset no soportado o cuerpo desconocido queda
fuera de extracción; nunca se interpreta como cronograma vacío autoritativo.

Una reserva SQLite de captura aplica mínimo 15 min entre intentos por proveedor,
incluso entre procesos y después de reinicio/fallo. No es periodicidad recomendada
ni permiso de polling. ETag/Last-Modified se conservan solo tras resultado válido;
304 requiere un original conocido. Un error semántico seguido de 304 válido puede
recuperar el documento conocido sin inventar una versión de horarios. Fallos usan
códigos fijos, sin URLs privadas ni cuerpos en logs. Captura real en base sintética
se rechaza. Tests inyectan fetch/clock; producción usa el mismo camino.

Originales se conservan como BLOB privado dentro de SQLite: SHA256 de bytes de
contenido HTML recibido, URL, MIME, parser, publicación de página si existe,
primera adquisición e instante de incorporación. No se confunde gzip de transporte
con contenido. `acquisition=https/local_import` distingue descarga de importación;
importar un archivo **no** acredita haber consultado de nuevo al proveedor.
`last_checked_at` live solo procede de una comprobación de red registrada; el
fixture sintético usa su reloj inyectado. Fecha de publicación desconocida es null.

Así backups SQLite incluyen originales y ledger sin coordinar archivos externos.
No hay endpoint público de descarga, ni ruta estática a BLOB. Ningún HTML original
real entra en fixtures o git. Cuota global `DB_MAX_BYTES` (64 MiB por defecto),
256 KiB por documento, ≤100 tarjetas por extracción, páginas de consultas y
candidatos acotadas. Al llenar la cuota falla atómicamente, conserva historial y
requiere mantenimiento; no purga auditoría silenciosamente. Páginas con navegación
cambiante pueden producir hashes nuevos aunque los registros no cambien: se
reutilizan revisiones semánticas, no se finge identidad del original. Este piloto
manual no promete almacenamiento indefinido ni acceso masivo sin revisión.

## Extracción, tiempo y clasificación

Reutiliza JSDOM ya presente en dependencias: sin scripts ni carga de subrecursos.
Valida contenedor/título real, etiquetas únicas, fecha española completa válida,
día de semana e intervalo HH:mm del mismo día. Ruta antigua puede responder HTTP
200 con página no encontrada: se conserva el artefacto en cuarentena sin retirar
horarios. Cero tarjetas, múltiples ventanas sin ID para un mismo sector/día,
fechas ambiguas, cruces nocturnos no explícitos, cambios de layout o campos
incompletos exigen revisión; no se aproximan ni adivinan.

Interpreta `America/Guayaquil`, UTC−05:00 continental y comprueba conversión con
Intl. Almacena UTC con zona y fecha/hora original; no depende del TZ del proceso ni
DST de otros países. No se interpreta la zona de Galápagos ni una fecha publicada
como instante del corte. Horarios futuros siguen siendo programación.

Clasificación conservadora por motivo: mantenimiento/distribución; alta tensión,
transmisión o grandes usuarios => categoría industrial separada; desconocido =>
confianza de extracción baja y no publicable. Nunca etiqueta automáticamente
`residential`, ni transforma mantenimiento industrial en aviso residencial.
`parser_confidence=1` indica coincidencia estricta con el formato, no certeza de
que hubo un corte ni puntuación estadística validada.

## Identidad, revisiones y geografía

Migración **004**, sin modificar 001–003, agrega:

- `schedule_documents`: original inmutable con adquisición y error de parseo.
- `schedule_captures` y `schedule_capture_rows`: orden de versiones observadas y
  presencia por captura; misma URL con otro hash conserva ambos originales.
- `schedule_entries` y `schedule_revisions`: identidad sector normalizado+fecha,
  campos antes/después, predecesor y motivo del cambio. Sin ID estable en la fuente,
  no se emparejan por intuición sectores o fechas distintas. Cambiar fecha/sector
  produce nueva identidad y ausencia de anterior, nunca cancelación implícita.
- `schedule_bindings`: correspondencias exactas versionadas a sectores curados,
  con referencia oficial, razón y revisión optimista. Solo normaliza Unicode,
  mayúsculas/espacios; no geocoding, coordenadas domésticas ni asignación aproximada
  de circuito. No se crea catálogo live automáticamente desde texto del proveedor.
- `schedule_reviews`: decisiones append-only sobre una revisión concreta, derechos,
  zona y razón. Pueden rechazarse después; nunca sobrescribe una aprobación.
- `schedule_fetch_state/history`: reserva/cooldown y comprobaciones con resultados.

Mismo contenido consecutivo es idempotente; revertir A→B→A reutiliza bytes A pero
conserva una nueva revisión cuando cambia el horario efectivo. Cambio solo de
navegación no obliga a reaprobar horarios idénticos. Una fila desaparecida se
registra `row_present=0`, sin inventar cancelación. Fallo de red/parseo no produce
revisiones de ausencia. Originales, revisiones, correspondencias y decisiones
están protegidos contra UPDATE/DELETE por triggers (no contra un administrador
capaz de cambiar el esquema).

Publicar requiere extracción estricta, presencia explícita, correspondencia exacta
y derechos revisados. Corregir una correspondencia preserva versiones y suprime
la publicación anterior hasta volver a revisar la revisión para la nueva zona.
Sector ambiguo o circuito sin comprobación permanece pendiente, sin alerta. No se
introdujeron mapas de circuitos, autoridad territorial para Pallatanga ni unión a
incidentes PR-05. Reportes ciudadanos conservan sus gates/privacidad anteriores.

## GET público y frescura

```text
GET /api/v1/schedules?area_id=ID&from=ISO_OFFSET&to=ISO_OFFSET[&type=maintenance|industrial|residential|unknown][&limit=20&offset=0]
```

Ruta GET explícita, rate limit 60/min; no Origin/Referer como autorización de
escritura. Área y rango requeridos, máximo 31 días, intersección `[from,to)`, limit
1–50 y offset 0–10000. Rechaza campos extra, IDs/días inválidos y otros métodos.
Sin CORS añadido. No requiere BLACKOUT_MAP ni cambia `/`, `/ui` o APIs v4.

Envelope `{data,meta}` y schema cerrado. Reusa scheduleSchema PR-01 y agrega
entry_id, area_name, source_url fijo, sha256, parser_version, acquisition,
fetched_at, source_published_at nullable, last_checked_at nullable, source_status
y latest_revision_no. No expone sector crudo, motivos, revisores, cuerpo o rutas de
almacenamiento. IDs de evidencia están vacíos porque un cronograma/documento no
se convirtió en incidente observado. `synthetic` y coverage=unknown siempre.

Solo versiones aprobadas se muestran. Mientras una versión cambiada espera
revisión, puede mostrarse la última aprobada como **unverified**, con horarios y
proveniencia originales y source_status=changed. Ausencia => missing; fallo =>
failed; más de seis horas sin comprobación válida => stale. Publicación vigente
revisada y fresca => current/published o revised. La API no emite cancelled por
omisión, timeout, paso del horario ni silencio; tampoco confirma reposición.
Sin filas publicables significa cobertura desconocida, no «sin cortes».

## CLI local

DB existente e inicializada/migrada con `npm run storage -- init`. La CLI de
cronogramas usa `allowMigrations:false`; no crea o migra una DB al consultar.
Cuidar DB_DIR/SQLITE_DEMO antes de operar; solo fixtures en base sintética.

```bash
OFFICIAL_SCHEDULES=true npm run schedules -- fetch eeasa-maintenance
OFFICIAL_SCHEDULES=true npm run schedules -- import eeasa-maintenance < original.html
npm run schedules -- queue
OFFICIAL_SCHEDULES=true npm run schedules -- bind < reviewed-binding.json
OFFICIAL_SCHEDULES=true npm run schedules -- review < reviewed-decision.json
npm run schedules -- history ENTRY_ID
umask 077
node scripts/schedules.js document ARTIFACT_ID > original-private.html
```

Usar `node` para exportar bytes sin los mensajes del wrapper npm. `bind/review`
aceptan JSON ≤16 KiB. Correspondencia: provider_id, sector_label, area_id,
reference_url oficial HTTPS sin query/credenciales, review_reason y
expected_binding (0 inicial). Decisión: revision_id, decision reviewed/rejected,
rights_reviewed boolean estricto, review_reason y expected_review (0 inicial).
Conflicto de versión no se sobrescribe. La revisión histórica incluye todas las
decisiones y versiones anteriores. CLI devuelve primeras 50 filas; módulo soporta
limit≤100/offset≤100000. La interfaz no envía Push ni publica pendientes por sí sola.

## Migración, rollback y gate pendiente

Snapshot pre-004 bajo bloqueo de escritor, migración/transacciones/checksums/FKs
y backups/restauración de PR-02 siguen vigentes. La nueva base se conserva al
retroceder. OFFICIAL_SCHEDULES=false oculta la ruta y bloquea CLI mutante, sin borrar
originales. Código anterior: SQLite OFF o snapshot pre-004 en **otro DB_DIR**;
nunca restaurar encima del volumen actual ni alterar DATA_DIR JSON v4.

Pendiente antes de operación pública: condiciones/licencia/periodicidad de fuente,
catálogo territorial/circuitos comprobados, revisión de moderación/seguridad y
capacidad de almacenamiento/backup. No hay parser PDF/OCR, cancelación automática,
UI nueva o PR-07 (suscripciones/Push) en este PR.
