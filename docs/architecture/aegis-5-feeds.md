# PR-08 — Noticias y feeds acotados

Registro fijo de RSS institucional CELEC y Ministerio, candidatos técnicamente
verificados pero permisos pendientes. [Investigación primaria](../research/aegis-5-feeds-sources.md).
No ingesta en arranque, timer, LLM, HTTP admin, crawler de artículos ni Push.
OSINT_NEWS=false por defecto gobierna CLI mutante; lectura de cola es local.
Ninguna dependencia nueva. Reutiliza JSDOM existente, XML sin scripts/recursos.

## Fuente y permisos

Antes de capturar: permiso local append-only para proveedor, decisión, evidencia
HTTPS, razón/revisor institucional y vigencia máxima 180 días. La evidencia no
se descarga automáticamente. No guardar nombres personales o secretos en razones.
Es una atestación del operador, no certificación automática de licencia. Debe
cubrir metadatos/títulos/enlaces y frecuencia; sin permiso vigente falla cerrado.
Importar fixtures no acredita consulta de fuente; publicación exige permiso vigente
más revisión por ítem. No se otorgó ningún permiso real ni capturó contenido real
con el código del recolector en esta entrega. Investigación usó GET acotados.

```bash
# DB existente y migrada explícitamente, preservando DATA_DIR v4.
OSINT_NEWS=true npm run feeds -- grant < reviewed-permission.json
OSINT_NEWS=true OSINT_RIGHTS_REVIEWED=true npm run feeds -- fetch celec-news
OSINT_NEWS=true npm run feeds -- import celec-news < fixture.xml
npm run feeds -- queue
OSINT_NEWS=true npm run feeds -- review < reviewed-item.json
npm run feeds -- history ITEM_ID
```

Permiso JSON: provider_id, decision approved/rejected, valid_until ISO con zona,
evidence_url HTTPS sin credenciales/query/fragmento y reason de revisión. Máximo
180 días; usar rechazo explícito al revocar, conservando decisiones anteriores.
OSINT_RIGHTS_REVIEWED es confirmación adicional; no sustituye el registro vigente.
Estado de permiso revocado/expirado oculta la evidencia en lector público sin borrar
artículos/observaciones. La proyección pública recalcula afirmaciones con permisos vigentes, también en
casos mixtos. PR-05 permite persistir explícitamente ese recálculo como revisión
auditable; no modifica snapshots anteriores.

## Recolección y parseo

Dos requests máximos por ejecución: robots.txt y feed fijo HTTPS. TLS estándar,
redirects rechazados, sin cookies, timeout 10 s por request. Robots 32 KiB; RSS/Atom
256 KiB y máximo 100 ítems. Robots no verificable o regla wildcard ambigua =>
revisión; interpretación conservadora puede bloquear un caso permitido por una
regla Allow. No se sortean restricciones. Una lectura por hora como mínimo,
Crawl-delay mayor respetado hasta un día, persistido antes del fetch; error mantiene
cooldown. No retry en bucle ni scheduler. Cuotas son política interna, no permiso
concedido por el proveedor. ETag/Last-Modified se reutilizan; 304 requiere documento
previo. Error/ausencia/ítem desaparecido nunca cancela ni confirma reposición.

RSS2/Atom: título máximo 300 caracteres, enlace HTTPS del origen registrado,
publicación nullable, clasificación sugerida maintenance/outage/restoration/unknown.
Ignora description/content/images; no ejecuta texto ni sigue enlaces. DTD/entidades
externas/XML malformado/tamaño excedido se rechazan sin commit parcial. Se conserva
solo metadata, hash de documento y fechas, no texto completo/HTML/XML ni imágenes.
Hash SHA256 identifica bytes recibidos, no se presenta como archivo descargable.

URL canónica normaliza tracking conocido y fragmento sin descargar. Dedupe por
proveedor+URL+hash semántico de título/publicación; título normalizado identifica
copias entre artículos. Revisiones conservan primera publicación por URL y número
de copias: reeditar una noticia vieja con fecha nueva no borra su fecha anterior.
Enlace con query significativa puede quedar omitido por la política pública
heredada; no inventar otro documento. Coincidencia léxica no acredita un evento.

## Revisión y privacidad

Cola paginada 1–100, offset hasta 100000. Cada ítem requiere decisión manual única;
rechazado no se convierte después silenciosamente en aprobado. Nueva versión puede
recibir nueva revisión preservando la anterior. Aprobar exige permiso, rights_reviewed
true, área curada exacta, resumen propio revisado <=500 caracteres y reason.
occurred_at opcional ISO explícito, separado de published_at/first_seen/ingested.
No usar publicación como hora de un corte ni nombre ambiguo como área verificada.

La revisión crea fuente de tipo news (aunque institucional, official=false),
artefacto de metadatos y observación aprobada; **no evento, programación o alerta**.
Temporal confidence unknown sin hora explícita. Correlación PR-05 exige su propia
revisión de origen, tiempo y competencia; copias no se cuentan como independientes.
No puente de recibos ciudadanos a feeds. Un resumen necesita revisión de PII;
ningún detector automático asegura privacidad de texto o identidad de fuente.

## Persistencia, recursos y rollback

Migración 006 append-only para documentos/metadatos/revisiones/permisos y estado
mutable de reservas/validadores. 001–005 intactas. Crecimiento sujeto a DB_MAX_BYTES;
fallo atómico sin borrar historia. No purga silenciosa ni almacenamiento de cuerpos.
El límite global no incluye WAL/backups; operador debe revisar uso antes de volumen
alto. Snapshots previos bajo lock y restore en DB_DIR nuevo siguen PR-02.

CLI init/status es explícita: feeds no crea/migra DB. Rollback OSINT_NEWS=false y
reinicio, conservar base y DATA_DIR. Permisos revocados bloquean publicaciones
correspondientes; el flag de ingesta por sí solo no borra evidencia publicada.
Código anterior: SQLite OFF o snapshot pre-006 en otro directorio, sin sobrescribir
la base nueva. No producción, captación masiva ni jobs instalados.
Próximo PR-09 es exploración de viabilidad social, no requisito de los feeds.
