# M1 — Captura y normalización en laboratorio

2026-10-27; rama `feat/multiamenaza-m1`, sobre M0 `f8cbb3c`.
Dependencias de baseline corregidas en `f22e4cc`, sin cambios de API v4.

## Entregado

- Catálogo de fuentes fijas (GET, owner, licencia, TTL, cooldown, timeout y tamaño).
  No scheduler; fuentes accesibles únicamente mediante opt-in manual.
- HTTP aislado, sin redirects, cuerpos acotados, pausa 403/429 con Retry-After,
  backoff exponencial/jitter entre invocaciones y una solicitud activa por host.
- Archivo v1 independiente por origen, hash SHA-256, índice inmutable, revisiones
  por contenido, repetición de captura, journal de fallos, cuotas sin eliminación,
  lock de escritor, verificación y restore a ruta nueva probado.
- Adaptadores PDF INAMHI, muestra JSON SNGR y corrida histórica Open-Meteo.
  AJV draft 2020-12 valida el envelope del repositorio y schemas por `kind`.
- Extracción PDF.js en worker con timeout, memoria/páginas/texto acotados y
  evaluación de código desactivada. Fechas Ecuador→UTC, caducidad y datos parciales.
- Reprocesamiento de bytes existentes sin red, manteniendo `retrievedAt`,
  `firstSeenAt` y hash; nueva interpretación inmutable con referencia original.
- CLI `scripts/ingest-hazards.mjs`, modo seguro sin argumentos. El contenedor
  incluye archivos necesarios pero sigue arrancando solo `backend.js`.

## Prueba real (no fixture)

Una consulta INAMHI con archivo local de investigación explícito:

```sh
node scripts/ingest-hazards.mjs --live --research-archive \
  --source=inamhi.warning.pdf --data-dir=/tmp/aegis-m1-research-20261027
node scripts/ingest-hazards.mjs --verify \
  --data-dir=/tmp/aegis-m1-research-20261027
```

Captura `58ce1212-bae2-4779-b460-380674a3c81f`, recibida
`2026-10-27T18:47:23.430Z`. Los bytes y el índice privado están exclusivamente
en `/tmp`, no en el repo público; almacenamiento temporal no sustituye un volumen
operativo respaldado. La licencia permanece `pending`, sin redistribución.

El primer parseo conservó estado `unknown`: PDF.js entrega glifos fragmentados,
y unirlos con espacios rompía número y fechas. Se corrigió preservando espacios
reales y finales de línea de PDF.js, con prueba de regresión sintética.
Se reprocesó **sin nuevo GET**:

```sh
node scripts/ingest-hazards.mjs \
  --reprocess=58ce1212-bae2-4779-b460-380674a3c81f \
  --data-dir=/tmp/aegis-m1-research-20261027
```

Interpretación `c3cee83b-82db-4221-92f8-720e13692476`, misma revisión de contenido,
número 83, emisión `2026-10-25T19:00:00.000Z`, vigencia
`2026-10-25T21:00:00.000Z`–`2026-10-29T04:00:00.000Z`.
Verificación: dos registros, un artefacto. Conserva `partial`, mapa no revisado y
licencia pendiente. Ninguna fecha de disponibilidad histórica fue inventada.

## Pruebas y límites

Pruebas cubren PDF sintético extraído realmente, duplicados/revisión, reinicio,
backup a destino nuevo, hash corrupto, cuotas, lock, formato incompatible,
separación fixture/live, opt-ins, fallos que preservan última captura, salud stale,
errores HTTP/ArcGIS, nulls, unidades/UTC, modelo ausente y glifos fragmentados.
Ejecutar `npm ci`, `npm run check`, `npm test` y los contratos Python del M0.
Resultado inicial: 69/69 pruebas Node y 6/6 contratos Python, checks y
replay correctos; `npm ci` y `npm audit` sin vulnerabilidades reportadas.
Antes del PR se incorporaron el cooldown durable probado tras reinicio y la
corrección del empaquetado Docker: el conjunto Node se amplía a 70 pruebas.
Check ahora incluye todos los módulos raíz, public, hazards, replay y scripts.

Rollback: dejar de ejecutar ingesta, conservar `DATA_DIR/hazards/v1`; no hay
migración de `observations.json`. Para backup y restore, seguir
[diseño de almacenamiento](../architecture/multihazard-ingestion.md).
Si un proceso muere reteniendo `writer.lock`, comprobar que no quede un escritor
vivo antes de retirar únicamente ese lock. No borrar datos o archivos de formato.

Los adaptadores SNGR/Open-Meteo tienen pruebas contractuales offline, no se
certificaron capas completas, CRS, modelo ni fuentes operacionales. No hay parser
OCR, inferencia de barrios, descarga por lotes ni geografía aprobada. El adaptador
SNGR es deliberadamente de muestra de una entidad; el caso inundaciones mantiene
el bloqueo externo M0. El parser INAMHI admite el formato observado de vigencia
dentro del mismo mes; otro formato queda desconocido para revisión, no se adivina.
Las cuotas se configuran por constructor; retención `preserve`, sin GC destructivo.

M1 demuestra el flujo técnico con una fuente real, sin certificar permiso ni
vigencia operativa permanente. M2–M4 y los gates externos siguen pendientes.
Durante estos ensayos no se desplegó ni se envió ninguna notificación; la entrega
se prepara para revisión en PR draft, separada de activación operacional.

## Exclusión de ingesta por host y archivo

IngestionService ya coordina instancias/procesos antes del GET y hasta persistir
el resultado. Competidor source_busy no consulta ni inventa fallo; otros hosts
pueden avanzar. ReadOnly y capacidad de índices se comprueban antes de red.
No expira/borra locks por edad ni elude Retry-After. Backup detecta la exclusión.
Pruebas con proceso Node separado y transporte simulado, sin proveedores reales.
[Alcance y recuperación](../architecture/ingestion-concurrency.md).

Validación: npm ci 0 vulnerabilidades, check, **228/228** Node, **173/173** en
contenedor reconstruido sin red, **6/6** Python, ambos replays/diff-check. El ensayo
de proceso separado y backup es sintético; no se consultaron proveedores ni se
eliminaron locks de archivos reales. CI de 37e2e03 success, run 40687614235.
