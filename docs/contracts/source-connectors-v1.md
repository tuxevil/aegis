# AEGIS · Contrato de conectores v1.0 (diseño pre-implementación)
Fecha de corte: 2026-10-27. Estado: **propuesto, no aprobado para producción**. Esta especificación complementa la [auditoría de fuentes](../research/auditoria-fuentes-alertas-2026-10-27.md) y el [plan maestro](../design/aegis-multiamenaza-plan.md).

## 0. Objetivo y alcance
Fijar un contrato estable entre fuentes externas y un futuro repositorio de observaciones, advertencias, mapas y pronósticos de AEGIS. **NO** diseñar todavía el motor de despacho de alertas ni publicar en WAHA. El backend existente (Fastify/Node 22) debe poder convivir con los conectores nuevos sin reescribir Grid Sentinel.

La prueba documental verificó campos reales de INAMHI N.º 83, SNGR MapServer/FeatureServer y documentación de Open-Meteo Single Runs. **No** se obtuvo respuesta live de consultas `/query` ni de la API de Open-Meteo desde el entorno de terminal: hubo fallo DNS/sin salida a internet. Una inspección de metadatos remotos **no es prueba de acceso operativa**. Los ejemplos normalizados en `examples/` son **fixtures sintéticos identificados como tales**: nunca se presentarán como mediciones reales ni se enviarán a usuarios.

## 1. Invariantes globales
- Cada muestra tiene `schemaVersion`, `sourceId`, `kind`, `retrievedAt`, `sourceUrl`, `raw`, `time`, `spatial`, `licensing`, `quality`, `details`. Validar contra [JSON Schema](./source-envelope.v1.schema.json).
- Fechas: UTC ISO8601 terminado en `Z` en almacenamiento. Original textual, huso `America/Guayaquil`, offset y precisión (fecha vs fecha+hora) conservados por separado. **Jamás** inferir `publishedAt` a partir de `issuedAt` o `Last-Modified`.
- `retrievedAt`: reloj de AEGIS al finalizar descarga. `firstSeenAt`: primera captura del hash exacto en AEGIS. `issuedAt` y `validFrom/validTo`: solo cuando constan en la fuente. `runInitializedAt`: no significa que el pronóstico ya fuera accesible; `availabilityVerifiedAt` requiere evidencia.
- Repositorio inmutable `raw/sha256/<digest>`: bytes originales, metadatos HTTP, URL canónica, fecha captura, `parserVersion`, y registro de revisiones. Un hash igual puede representar una nueva captura del mismo documento (registrar ambas observaciones).
- `dataStatus`: `valid`, `partial`, `stale`, `invalid`, `unknown`. Desactualizado, sin datos o fallo de fuente **nunca equivale a peligro bajo**.
- `licenseStatus`: `verified`, `restricted`, `pending`. Mientras `pending`, **no redistribuir masivamente bytes o capas completas**; reservar uso de investigación y enlaces atribuibles sujetos a términos.
- Alcance `spatial.precision`: `country`, `region`, `province`, `canton`, `parish`, `station`, `river_reach`, `polygon`, `point`, `unknown`. No convertir automáticamente una advertencia provincial en una predicción confirmada de barrio.
- No existe campo de `probabilityOfFlooding` inferido del color de mapa estático. `sourceRiskLevel` se guarda literalmente y se separa de criterios de AEGIS.
- Reintentos con backoff, jitter y límite; `429` y `Retry-After` respetados. Timeout no puede bloquear otras fuentes. `200 OK` con HTML/JSON error donde se esperaba PDF/GeoJSON => error de tipo, no éxito.
- URL de destino fijada por configuración/allowlist; sin URL arbitraria derivada de documentos externos. Limitar bytes, redirecciones, tiempo, profundidad de geometrias y concurrencia; sanitizar logs. No copiar tokens/teléfonos/MAC/direcciones personales.

## 2. Envelope de ejemplo
Se adjunta un fixture sintético en `examples/inamhi-warning83.fixture.json`, con datos derivados de los **campos del PDF real** (fecha, boletín, región) pero `retrievedAt` y `raw` deliberadamente SIN valor verificado. Es un ejemplo de transformación, **no un registro de ingesta que haya ocurrido**.

Tipos de `details` propuestos por clase:
- `official_warning`: `bulletinNumber`, `phenomena[]`, `authority`, `sourceRiskLevel`, `textSummary` (breve), `sourceDocumentRef`, `areasMentioned[]`; revisión de mapa por separado.
- `static_exposure`: `layerId`, `objectId`, `categoryRaw`, `categoryNormalized`, `geometryType`, `geometryRef`, `scaleUnknown`; **nunca** incluir `predictedAt`.
- `forecast_run`: `providerModel`, `gridLatitude`, `gridLongitude`, `runInitializedAt`, `timeStep`, `precipitationMm`, `ensembleMember` si procede; cada corrida/version conserva su propia identidad.
- `observation`: `stationId`, `measuredAt`, `unit`, `qualityFlag`; no imponer valor cero ante lectura ausente.
- `situation_report`: `eventTime`, `reportedAt`, `territory`, `verificationStatus`, `affectedAssets`.

## 3. Contrato C01: INAMHI · boletines PDF
**Fuente verificada en inspección:** https://www.inamhi.gob.ec/pronostico/advertencia.pdf (PDF de 1 página que al 27/10 servía **N.º 83**). Contenido real declarado: `issuedAt=2026-10-25T19:00:00Z` (25 oct 14:00 Ecuador), `validFrom=2026-10-25T21:00:00Z` (16:00), `validTo=2026-10-29T04:00:00Z` (28 oct 23:00), riesgo **MEDIO – MUY ALTO** a escala regional, Guayas incluida.

**Ingestión de prueba:** GET `advertencia.pdf`, timeout y tamaño acotados. Aceptar solo PDF auténtico por firma `%PDF-`, contenido/longitud apropiados y páginas legibles. Registrar respuesta exacta y hash. El `ETag` o `Last-Modified` puede faltar o estar mal configurado: no confiar en eso para deduplicar contenido. **No forzar polling intenso sin consultar términos/política del proveedor**.

**Parseo obligatorio:** número, fecha/hora de emisión y zona horaria, rango de vigencia, fenómeno, nivel fuente, texto de zonas, mapa e incertidumbre de extracción. Si texto contradice mapa, la geometría requiere evaluación manual y el estado queda `partial`; no producir polígonos de amenaza desde OCR automático sin validación. Una URL mutable no preserva versiones previas.

**Errores exigidos:** sitio responde HTML, PDF antiguo, vencido, inesperado n.º de boletín, PDF con solo imágenes, duplicado sin cambio, emisión futura, fecha de fin anterior al inicio, mapa no procesable, sitio fuera de línea, 403/429.

**Aprobación C01:** descarga real desde entorno de AEGIS + hash y archivo, extracción verificable del boletín 83, pruebas con fichero vigente/caducado/HTML simulados, política de reproducción definida con INAMHI. Datos históricos emitidos ≠ datos que AEGIS pudo haber recibido entonces.

## 4. Contratos C02 y C03: SNGR · mapas ArcGIS
- **C02** `https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Susceptibilidad_de_Inundaciones/MapServer/0`: `esriGeometryPolygon`, campos comprobados `FID`, `sui`, `dpa_canton`, `dpa_descan`, `dpa_parroq`, `dpa_provin`; categorías `ALTA`, `MEDIA`, `BAJA`; `maxRecordCount=2000`, **`supportsPagination=false`**, formatos JSON/GeoJSON, origen EPSG:32717.
- **C03** `https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/MULTIAMENAZAS_SGR/FeatureServer/0`: `esriGeometryPolygon`, campos comprobados `objectid`, `tipo_amen`, `susc_total`, `dpa_canton`, `dpa_descan`, `dpa_parroq`, `dpa_provin`; `maxRecordCount=2000`, **`supportsPagination=true`**, origen EPSG:32717. Categorías reportan susceptibilidad a inundaciones y movimientos en masa.

**Prueba de consulta sin geometría primero**, solo un registro:
```bash
curl -fsS --max-time 12 --get \
  'https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/MULTIAMENAZAS_SGR/FeatureServer/0/query' \
  --data-urlencode 'where=1=1' \
  --data-urlencode 'outFields=objectid,tipo_amen,susc_total,dpa_canton,dpa_descan' \
  --data-urlencode 'returnGeometry=false' \
  --data-urlencode 'resultRecordCount=1' \
  --data-urlencode 'f=json'
```
**Aún no ejecutado con éxito desde staging**. Confirmar `features[].attributes` y detectar errores de ArcGIS devueltos con HTTP 200 (`error` JSON). Para C02 consultar `returnIdsOnly=true` y lotes `objectIds` o particiones espaciales (ambos **por validar**) ante ausencia de paginación. Para C03: `resultOffset` + `resultRecordCount` + `orderByFields=objectid`, y verificar conjunto completo contra IDs y conteo. **Si hay truncamiento, no desplegar capa incompleta.**

Por defecto conservar EPSG de origen y transformar explícitamente a WGS84 GeoJSON EPSG:4326; registrar motor de reproyección y tolerancia. Probar polígonos multiparte, geometrías degeneradas, cruce de límites, ausencia de categorías, duplicación de IDs y modificaciones silenciosas. La categoría de susceptibilidad es **contexto estático** (no predicción ni observación de inundación). Licencia de reutilización por confirmar con SNGR y entidades participantes.

**Aprobación C02/C03:** metadatos y 1 entidad real descargados, procedimiento completo sin truncamiento, CRS correcto, comparativa con fuente institucional, permiso y actualización de capas documentados.

## 5. Contrato C04: Open-Meteo · Single Runs
Documentación: https://open-meteo.com/en/docs/single-runs-api . Endpoint: `https://single-runs-api.open-meteo.com/v1/forecast`. Parámetros: `latitude`, `longitude`, `run=YYYY-MM-DDTHH:MM` **UTC de inicialización**, `hourly=precipitation`, `forecast_days`, `timezone=UTC`. ECMWF IFS HRES inicia a las 00, 06, 12, 18 UTC. La fecha de inicialización **NO es** la de disponibilidad: el proveedor describe retraso típico de 4–6 h para modelos globales. Selección exacta de `models` y respuesta JSON deben comprobarse en staging.

**Prueba propuesta, no aún verificada:**
```bash
curl -fsS --max-time 20 --get 'https://single-runs-api.open-meteo.com/v1/forecast' \
 --data-urlencode 'latitude=-2.19' --data-urlencode 'longitude=-79.88' \
 --data-urlencode 'run=2026-10-25T00:00' --data-urlencode 'hourly=precipitation' \
 --data-urlencode 'forecast_days=3' --data-urlencode 'timezone=UTC'
```
**Respuesta esperada documentada**, no observada en este intento: arrays `hourly.time[]` y `hourly.precipitation[]` y `hourly_units`, con `latitude`, `longitude`, `utc_offset_seconds`; validar longitud/orden/unidades/presencia de nulls. El punto `(-2.19,-79.88)` es un punto de prueba aproximado de Guayaquil, no una dirección de usuario ni resolución de inundaciones de barrios.

**Antifiltración temporal:** en un replay a hora `T`, usar solo pronósticos con `availabilityVerifiedAt <= T`; si se carece de tal marca histórica, no afirmar disponibilidad real y documentar margen conservador, diferenciándolo de backtest estricto. Comparar con **observaciones posteriores solo en evaluación**, no como feature de predicción.

**Restricción comercial:** la Free API solo permite uso **no comercial** (<10k/día, <5k/h, <600/min) y donaciones voluntarias; la presencia de suscripciones o publicidad está listada como uso comercial. Revisar términos antes de patrocinio o monetización. Fuente: https://open-meteo.com/en/terms .

**Aprobación C04:** solicitud histórica real + selección de modelo inequívoca + run y disponibilidad auditables + muestras de fechas faltantes + autorización conforme al modelo de financiación.

## 6. Contratos pospuestos, no descartados
- **C05 GEOGLOWS:** datos CC BY 4.0 con atribución, API JSON/CSV documentada; exige `river_id` de 9 dígitos comprobado geográficamente, fecha exacta de corrida, umbrales modelados y validación de observaciones locales. No extrapolar caudal a altura de calle. https://training.geoglows.org/rfs/tutorials/data-service/ y https://geoglows.ecmwf.int/license
- **C06 INOCAR:** mareas con datum MLWS, portuario y hora local; descubrir feed/permiso. No transformar altura de pleamar en inundación directa.
- **C07 estaciones INAMHI:** documentación/API oficial sin confirmar, no scrapear una app sin permiso; identificar estaciones, unidad, frecuencia, controles de calidad y nulos.
- **C08 INEC polígonos:** adquirir geometría de cantones/parroquias y vigencia del MGN2026; las capas 1 y 2 inspeccionadas del FeatureServer son líneas, no polígonos.

## 7. Estados y política de funcionamiento degradado
| Caso | Estado proveedor | Alerta pública |
| --- | --- | --- |
| Descarga correcta y documento vigente | valid si verificado | Todavía requiere revisión editorial |
| Recurso HTTP 200 que contiene HTML en vez de PDF | invalid | Bloquear |
| Documento viejo retornado desde URL actual | stale | Bloquear nuevos avisos y mostrar última lectura con fecha |
| ArcGIS devuelve `exceededTransferLimit=true` / conteo incompleto | partial | Bloquear inferencia territorial |
| Fuente sin licencia verificable | licensing.pending | Investigar; no redistribuir capa/archivo en masa |
| Modelo inicializado antes de T, pero publicado después de T | unavailableAtReplayCutoff | Excluir del backtest estricto |
| Falla de fuente por horas | stale/unknown | Informar cobertura degradada, no anunciar seguridad |

## 8. Pruebas de aceptación obligatorias antes del prompt de implementación

**Integridad/fecha:** PDF válido; HTML con HTTP 200; boletín vencido; edición corregida; UTC/local; fin anterior a inicio; hash estable; redirecciones; respuesta grande; hash duplicado y revisión nueva; desaparición de fuente.

**Geografía:** reproyección EPSG:32717→4326, muestras Guayaquil y Pallatanga, multipolígonos, resultado vacío, `exceededTransferLimit`, más de 2000 entidades, errores devueltos con HTTP 200, geodatos con campo/código DPA faltante.

**Pronósticos:** arrays de distinta longitud, precipitación negativa, nulos, unidades mm vs otro formato, run inexistente, fecha UTC, model-run publicada después del corte, diferencia entre modelo y observación.

**Resiliencia:** timeout, 429 con `Retry-After`, 5xx, DNS, payload no esperado, latencia y metadatos de caché; fuente caída sin impacto en Grid Sentinel.

**Seguridad y privacidad:** URL allowlist, redirecciones externas rechazadas, techo de bytes, no secretos en logs, pruebas exclusivamente GET en entorno de staging, cero envíos WhatsApp, `alerts_publish_enabled=false`.

## 9. Definition of Ready, con evidencia requerida

Para cerrar un conector se exige: (a) salida HTTP real reproducible desde LXC, (b) contrato y schema probados, (c) captura raw/sha y versionado, (d) licencia/atribución evaluada, (e) caducidad y fallos probados, (f) precisión territorial declarada, (g) informe breve de incidentes y owner, (h) tiempos de actualización reales medidos.

**No existe aún un conector certificado listo para alertar.** La presente especificación cubre exactamente lo que probará la fase de diagnóstico, sin pedirle a Codex implementar un predictor ni un despachador.
