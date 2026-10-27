# M2 — Colecciones SNGR verificables y diagnóstico por cantón

2026-10-27. Incremento de M2 sobre PR #26, sin desplegar ni publicar avisos.
Completa la adquisición **en software probado offline**. Los gates de permisos,
geometría administrativa y validación operacional siguen abiertos.

## Implementación

`SngrLayerAcquirer` consulta metadatos, conteo y manifiesto de IDs por cantón;
descarga páginas ordenadas para MULTIAMENAZAS y lotes `objectIds` para el MapServer
sin paginación. Repite IDs, conteo y metadatos al terminar. Un manifiesto estable
pero truncado se rechaza si no coincide con el conteo. También se rechazan IDs
duplicados/faltantes, una página parcial, cambios del marcador de edición, DPA
incorrecto, campos ausentes y CRS distinto de EPSG:32717.

Los request builders solo admiten dos fuentes, pilotos registrados, IDs enteros,
offsets/count acotados y campos fijos. No hay URL ni SQL arbitrarios, redirects,
POST o acceso a WAHA. Los perfiles de adquisición son internos y no aparecen en
el catálogo público. Los límites predeterminados son 5000 entidades, 64 requests,
32 MB recibidos y 500000 puntos. Cada request está limitado a 2 MB; las páginas
tienen hasta 100 entidades. El intervalo de un segundo entre requests es una
precaución de laboratorio, **no una frecuencia aprobada por el proveedor**.
No hay scheduler ni reintentos automáticos. Una falla o 429 detiene la colección.

`LayerResearchService` exige opt-in de red y archivo de investigación cuando la
licencia está pendiente. Una lease exclusiva por host/directorio evita procesos
duplicados; el cooldown de una hora por adquisición y Retry-After de errores se
conservan entre reinicios. Una lease existente se considera bloqueo conservador,
no prueba de que exista un proceso vivo. No se borra automáticamente tras timeout.

El almacén está separado de los sobres de observaciones y del lector público:
`DATA_DIR/hazards/layers/v1/{captured_source,synthetic_fixture}`. Conserva bytes,
hash, URL exacta, timestamps y envelopes por request; coordenadas normalizadas en
EPSG:4326, origen EPSG:32717 explícito. No atribuye cobertura cantonal a metadatos
nacionales. Solo después de comprobar el conjunto completo se añade un manifiesto
inmutable bajo `collections/`. El fallo de una nueva captura nunca reemplaza una
colección completa anterior. Los snapshots tienen checksum y revisión de contenido.

Una colección completa de IDs **no** demuestra fronteras actuales, calidad
topológica, licencia, actualización garantizada o un pronóstico. Si el proveedor
no declara marcador de edición, la atomicidad queda `unknown`. En todos los casos
se mantiene `partial`, `publicationBlocked=true`, `DRY_RUN` y publicación OFF.
No hay geometrías públicas ni clasificación de barrios por riesgo.

## Resultados reales del laboratorio

Se hicieron consultas pequeñas de metadatos/IDs y consultas separadas de conteo,
**sin geometría ni archivo de capas completas reales**. Los informes contienen
solo URLs fijas, fechas, hashes, tamaños y cantidades; no los IDs ni bytes crudos.

| Servicio | Cantón/filtro DPA | IDs observados | Conteo separado | Paginación |
| --- | --- | ---: | ---: | --- |
| Susceptibilidad inundaciones | Guayaquil / 0901 | 1138 | 1138 | false |
| Susceptibilidad inundaciones | Pallatanga / 0608 | 17 | 17 | false |
| MULTIAMENAZAS | Guayaquil / 0901 | 40 | 40 | true |
| MULTIAMENAZAS | Pallatanga / 0608 | 4 | 4 | true |

Son registros de susceptibilidad estática, **no incidentes, personas afectadas ni
probabilidades**. Los IDs se observaron entre 19:20Z y 19:24Z; los conteos se
consultaron posteriormente. La coincidencia apoya ese diagnóstico, no prueba una
instantánea atómica ni valida el catálogo administrativo INEC de 2026.

Evidencia por fuente en `docs/verification/source-probes/2026-10-27-*-manifest.json`
y `2026-10-27-*-count.json`. La primera consulta MULTIAMENAZAS/Guayaquil falló con
`provider_json_error`; se conserva `multi-guayaquil-initial-error.json`. Ese primer
informe no retuvo la fase del error: no se inventó una causa. Se mejoró la sonda
para conservar evidencia parcial y códigos numéricos sanitizados. Una comprobación
manual posterior obtuvo 40 IDs. No hubo 403/429 en estas pruebas reales; dichos
casos se prueban con mocks y siempre detienen las consultas.

No se solicitó ni obtuvo autorización institucional; licencias siguen `pending`.
Tampoco se descargaron polígonos administrativos ni se alteró `codeStatus` de los
pilotos a partir de una coincidencia en SNGR. No se tocó la sesión de WhatsApp.

## Reproducción y verificación

Sin argumentos ambos CLI son seguros y no hacen red ni escrituras:

```sh
node scripts/probe-sngr-manifest.mjs
node scripts/acquire-sngr.mjs
```

Diagnóstico voluntario (tres GET: metadatos, conteo, IDs; nunca geometría):

```sh
node scripts/probe-sngr-manifest.mjs --live \
  --source=sngr.flood.layer --area=guayaquil --out=/tmp/informe-nuevo.json
# Para contrastar un manifiesto previo sin descargarlo otra vez: --count-only
```

La colección completa es una capacidad de investigación opt-in; no se ejecutó
contra las capas reales en esta entrega mientras están pendientes sus permisos:

```sh
node scripts/acquire-sngr.mjs --live --research-archive \
  --source=sngr.flood.layer --area=guayaquil --data-dir=/ruta/laboratorio
node scripts/acquire-sngr.mjs --verify \
  --source=sngr.flood.layer --area=guayaquil --data-dir=/ruta/laboratorio
node scripts/acquire-sngr.mjs --verify-all --data-dir=/ruta/laboratorio
```

Las pruebas usan respuestas y cuadrados **sintéticos**; el transporte de fixtures
no tiene acceso a fetch y no puede archivarse como `captured_source`. Cubren 2501
entidades paginadas, MapServer por IDs, conteos inconsistentes, cambios durante la
descarga, archivo/versionado/reinicio, backup restaurado a ruta nueva, checksums,
fallo parcial, aislamiento de almacenamiento, límites y exclusión mutua. El
histórico v4 se compara antes/después para probar que no se modifica.
Resultado local final: `npm ci`, `npm run check`, **91/91 pruebas Node**,
**6/6 contratos Python**, replay y **36/36 pruebas multiamenaza en Node 22 Alpine
sin red**. No cambió la interfaz visual respecto al QA Chromium del incremento M2
anterior; las pruebas DOM y de rutas se incluyen en la regresión completa.

Backup: detener escritores y copiar todo `DATA_DIR/hazards/` a una ruta nueva,
incluyendo fuentes y `layers/`; ejecutar verificadores de ambos almacenes. Nunca
restaurar encima de una instancia activa. La compatibilidad con el formato v1 de
fuentes sin namespace se conserva. El namespace de capas es nuevo, aditivo; no
mueve ni migra observaciones anteriores. Rollback: desactivar el módulo/CLI,
conservar archivos. Para recuperar una lease huérfana, verificar primero procesos
y handles; no decidir que el trabajo terminó solo por la existencia o edad del lock.

**Pendiente para cerrar M2:** permiso y validación de una colección real completa,
cartografía administrativa/versiones/atribución verificadas, comprobación
institucional de geografía y política de actualización. El motor M3 solo podrá
usar estas capas como contexto estático, nunca como prueba de una amenaza dinámica.
