# Auditoría de fuentes y viabilidad — AEGIS Multiamenaza

**Fecha:** 2026-10-27 (America/Guayaquil)  
**Estado:** investigación de fuentes, sin integración operativa.  
**Objetivo:** determinar qué puede alimentar un observatorio público de prevención en **Guayaquil** y **Pallatanga** sin presentar fuentes débiles como información en tiempo real.  
**Documentos relacionados:** [plan de producto](../design/aegis-multiamenaza-plan.md), [replay de Guayaquil](guayaquil-2026-10-26-replay.md).

## Convención de evidencia

- **V0 — Localizada:** sitio, documentación o producto identificados.
- **V1 — Inspección remota:** el navegador permitió leer PDF original o metadatos reales del servicio.
- **V2 — Integración:** desde la infraestructura de AEGIS se completó descarga pequeña, validación de esquema y fecha, respuesta de error y persistencia. **Ninguna fuente de esta auditoría alcanzó V2.** El entorno de investigación no pudo abrir conexiones externas desde su terminal; se inspeccionaron URLs con navegador/herramienta de búsqueda.
- **V3 — Lista para producción:** V2 + licencia/permiso documentados, latencia y caída medidas, archivos/versiones conservados, validación territorial e historial negativo/positivo, seguridad operativa y redundancia.
- **Permiso de consulta pública != licencia de redistribución ni autorización para automatizar.** Documentar por producto, no asumir herencia entre páginas oficiales.

## Hallazgo principal: advertencia INAMHI 83 del 25-10-2026

Documento fuente abierto y examinado, **incluido su mapa**:
[INAMHI, advertencia.pdf](https://www.inamhi.gob.ec/pronostico/advertencia.pdf). Al momento de esta auditoría el recurso servía **Boletín Meteorológico N.º 83** con:
- **Emisión declarada:** domingo 25 de octubre de 2026 a las **14:00**.
- **Vigencia declarada:** 25 oct 16:00 a 28 oct 23:00.
- **Mayor intensidad pronosticada:** 26 y 27 de octubre.
- **Peligros explícitos:** lluvias, descargas, viento, acumulación de agua, crecidas y laderas en áreas susceptibles; Guayas incluida entre las zonas.
- **Precisión:** escala regional/provincial y mapa, **no precisión de calle ni obligación de inundación para Guayaquil**.

**Corrección de interpretación temporal:** la publicación identificada previamente en El Universo a las 18:01 del 25/10 da evidencia de **disponibilidad pública en prensa**, no constituye la hora de emisión INAMHI. Diferenciar: `issuedAt=2026-10-25T14:00:00-05:00`, `effectiveAt=2026-10-25T16:00:00-05:00`, `firstIndependentPublicEvidence=2026-10-25T18:01:00-05:00`, `ingestedAt=null` histórico. La primera disponibilidad real del PDF web no está demostrada. De 14:00 del domingo a 13:00 del lunes hay 23 h *de emisión declarada a ventana de lluvia*, **no 23 h de anticipación realmente verificada de una plataforma**.

**Regla de arquitectura:** la URL `advertencia.pdf` se sobrescribe con nuevas ediciones; guardar copia cruda de cada revisión; checksum SHA-256, `firstSeenAt`, `lastSeenAt`, `issuedAt`, `validFrom`, `validTo`, `retrievedAt`, `documentNumber`, `parserVersion`, `sourceUrl`. Controlar `Content-Type`, firma PDF y tamaño; hacer parsing secundario y revisión cuando cambian mapas/no extraíbles.

## Matriz técnica inicial

| Fuente | Prueba de evidencia | Datos/cobertura | Restricción o hallazgo | Uso seguro | Próxima validación |
| --- | --- | --- | --- | --- | --- |
| **INAMHI avisos PDF** | **V1**; PDF 83 abierto y mapa inspeccionado | Lluvias/tormentas regionales, plazos, mapas | URLs apuntan a **versión más reciente**; `nowcasting.pdf` dio timeout en consulta; licencia concreta de republicación sin confirmar | **P0** retransmisión atribuida tras validar vigencia | Descargar desde LXC, repetir cada 5–10 min de forma respetuosa, archivar bytes+hash, medir cambio y errores |
| **INAMHI boletín Pallatanga** | **V1**; PDF inspeccionado | Boletín cantonal | Enlace muestra **n.º 26 del 01-05-2025**, obsoleto al 27-10-2026 | No publicar como vigente | Validar `issuedAt` y `validTo`; solicitar feed vigente |
| **INAMHI visor hidrometeorológico** | **V0**; página de referencia oficial | Estaciones y descargas, tiempo real anunciado | No se comprobó API pública, contrato, latencia, cobertura o histórico por estación | P1, sólo tras pruebas | Documentar endpoints y muestra anonimizada, gap de horas sin datos |
| **SNGR susceptibilidad inundaciones** | **V1**; REST MapServer/0 metadatos | Polígonos; `sui` ALTA/MEDIA/BAJA, `dpa_descan`, etc. EPSG:32717 | `supportsQueryFormats=JSON/geoJSON/PBF`, **`maxRecordCount=2000`**, `supportsPagination=false`, `supportsHistoricMoment=false`; copyright institucional, licencia incierta | **P0** contexto de exposición, NO alerta dinámica | Probar filtros espaciales/atributos y descarga por cantón sin truncar; reproyectar a EPSG:4326 |
| **SNGR MULTIAMENAZAS** | **V1**; REST FeatureServer/0 metadatos | Polígonos susceptibilidad inundaciones y movimientos en masa, atributos DPA | `maxRecordCount=2000`, paginación declarada true; geometría EPSG:32717; licencia y método original sin verificar | **P0** contexto geométrico | Comparar redundancias/discrepancias con capa inundaciones; consultas muestra y exactitud |
| **INEC marco geoestadístico 2026** | **V1**; servicio FeatureServer examinado | Corte enero 2026, provincias/cantones/parroquias/zonas | **Capas 1 y 2 son líneas, NO polígonos**; no sirve hacer intersección de áreas directamente. Fuente no ofrece licencia inequívoca desde metadatos | **P0** códigos y límites; conseguir polígonos oficiales GPKG | Inspeccionar paquete GeoPackage del MGN 2026, licencia y campo DPA |
| **SNGR monitoreo** | **V1**; índice de reportes inspeccionado | Reporte de amenazas, vías, ríos, eventos cada 12 h nominales | En revisión de 27/10 el índice visible terminaba en reporte **23/10 09:00**. Puede ser atraso del sitio/índice, no evidencia suficiente de interrupción institucional. Informes 12 h NO nowcasting | P1 seguimiento y verificación | Contrastar nuevas publicaciones, URL directa y contenido de un reporte fechado |
| **GEOGLOWS ECMWF** | **V0/V1 documentación y licencia** | Caudales de ríos modelados; forecast, retrospective, thresholds; river_id 9 dígitos | API REST documentada, pero no comprobada descarga para un río ecuatoriano; **datos CC BY 4.0**, software BSD-3; error de río/resolución y dinámica local | **P1** alerta fluvial **sólo tras calibrar**; no representa calles inundadas | Identificar tramos de Guayas y Pallatanga, descargar sample y validar contra observaciones |
| **INOCAR mareas** | **V0**; página índice legible en búsqueda | Previsión 25 estaciones, MLWS; formulario histórico desde 2003 | No se verificó respuesta automática del iframe/form (timeouts). Las alturas respecto MLWS NO son niveles de calle | **P1** contexto de pleamar | Localizar API, términos y compatibilidad de referencia vertical |
| **Open-Meteo forecast** | **V1 documentación**; ya usado en AEGIS | Previsión meteorológica horaria; API REST | Free API **solo uso no comercial**, <10.000/día, <5.000/h, <600/min; atribución. Sponsor/anuncios/suscripciones podrían volver AEGIS comercial | **P0** apoyo experimental, diferenciando modelo de observación | Evaluar licencia/costo según financiación, monitorizar modelo y fechas |
| **Open-Meteo Single Runs / Previous Runs** | **V1 documentación** | **Pronósticos históricos originales** por `run`, y por desfases 1–7 días | Historic Weather/ERA5 **no equivale** a pronóstico disponible antes del evento; Single Runs permite backtest sin fuga temporal si se usa run anterior | **P0** backtesting del 26/10 y negativos | Probar ECMWF IFS 25/10 para Guayaquil y otros puntos; comparar modelos |
| **NASA LHASA 2** | **V1 documentación/repositorio** | Estimación cercana a 1 km y escala diaria de deslizamientos por lluvia | Servicio **best-effort**, cuatro veces al día típicamente, con frecuentes caídas; datasets de nowcast pueden llegar horas tarde | P2 vigilancia de laderas, no alertas de derrumbe puntual | Probar datos reales y licencia de cada producto; evaluar operación propia |
| **Copernicus GloFAS** | **V0** | Pronóstico fluvial global | Licencias/registro, ámbito y latencia de ruta concreta aún sin probar | P2 respaldo de contexto | Comparar GEOGLOWS y GloFAS por cuenca |
| **IGM cartografía 1:25.000** | **V1 documentación** | Geomorfología, riesgos, vulnerabilidad por cantón | Portal identifica **CC BY-NC 4.0** para sus productos: excluir de bundle comercial sin otra autorización | P2 investigación contextual | Usar visualización sólo dentro de términos, alternativa autorizada |

### URL y documentación primaria

- INAMHI avisos: https://servicios.inamhi.gob.ec/alertas/
- Boletín original mutable: https://www.inamhi.gob.ec/pronostico/advertencia.pdf
- Boletín Pallatanga (actualmente antiguo): https://www.inamhi.gob.ec/riobamba/bolesprbp.pdf
- INAMHI datos liberados (acceso sin cobro, **no licencia abierta concreta**): https://www.inamhi.gob.ec/info-liberada/
- ArcGIS inundaciones: https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Susceptibilidad_de_Inundaciones/MapServer/0?f=pjson
- ArcGIS MULTIAMENAZAS: https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/MULTIAMENAZAS_SGR/FeatureServer/0?f=pjson
- INEC MGN 2026: https://idgn.ecuadorencifras.gob.ec/server/rest/services/mgn_26/service_mgn26/FeatureServer
- SNGR reportes 2025–26: https://www.gestionderiesgos.gob.ec/reportes-de-monitoreo-de-amenazas-y-eventos-peligrosos-2025/
- GEOGLOWS API: https://training.geoglows.org/rfs/tutorials/data-service/
- GEOGLOWS licencias: https://geoglows.ecmwf.int/license
- INOCAR: https://inocar.mil.ec/web/index.php/tabla-de-mareas y https://www.inocar.mil.ec/mareas/form_mareas.php
- Open-Meteo previsiones pasadas: https://open-meteo.com/en/docs/single-runs-api y https://open-meteo.com/en/docs/previous-runs-api
- Open-Meteo términos: https://open-meteo.com/en/terms
- NASA LHASA: https://github.com/nasa/LHASA
- INEC MGN 2026 explicación: https://www.ecuadorencifras.gob.ec/documentos/web-inec/Geografia_Estadistica/Documentos/marco_geoestadistico_2026.pdf
- IGM dataset y restricciones: https://www.geoportaligm.gob.ec/proyecto_nacional/

## Qué debe corregirse respecto al plan preliminar

1. **Primera evidencia fuerte de Guayaquil:** ya se obtuvo el PDF 83; cambiar «falta recuperar PDF original» por «falta archivarlo de forma inmutable con captura/fecha verificable, y recuperar revisiones históricas».
2. INAMHI emitió N.º 83 a las **14:00**; la prensa lo difundió a las **18:01**. NO alterar `publishedAt=18:01` del fixture de prensa como si fuera difusión web oficial a las 14:00.
3. El módulo de Pallatanga necesita validación de vigencia extrema: PDF enlazado llevaba más de 17 meses sin actualizarse.
4. Prioridad geográfica: usar capa SNGR **para susceptibilidad**, no inferencia probabilística; tener EPSG:32717, paginación y límites claros. Del INEC 2026 se deben descargar **polígonos**, porque su REST `limite_cantonal` es polilínea.
5. **Open-Meteo no es automáticamente gratis para AEGIS patrocinado**, aunque datos sean CC BY. Contrato de API gratuito restringido a fines no comerciales.
6. Para retrotest **no usar ERA5, lluvia observada ni informe del día siguiente como input de pronóstico**. Preferir Open-Meteo Single Runs con `run` anterior a la hora simulada, sin confundir hora de inicialización del modelo con hora efectiva de disponibilidad en API.
7. Toda fuente futura pasa por `source_health`: timestamps de documento, ingesta, errores, edad, validez, cobertura, revisión y permiso.

## Propuesta de política de captura y datos

| Datos | Frecuencia exploratoria inicial | Procesamiento | Retención propuesta |
| --- | --- | --- | --- |
| PDF INAMHI | sondeo cada 5–10 min, con condicionales HTTP/backoff respetuoso | guardar bytes exactos y SHA-256 si cambia; extraer texto y visualizar mapa para revisión | originales permanentemente mientras lo permita licencia; índice y metadatos abiertos |
| ArcGIS mapas SNGR | 1/día o semanal según cambios reales | consultar identificadores/cantones, control de máximo resultados, validar geometrías, serializar versión | snapshots de cambios, licencia pendiente |
| INAMHI estaciones | 5–15 min **solo si el feed es legítimo y su intervalo lo soporta** | timestamps por sensor; unidad/estación; discontinuidades; nunca imputar cero | serie temporal 1–5 años según permisos |
| GEOGLOWS | según hora de corrida documentada | guardar `model_run`, `river_id`, timestamps/ensambles; calibrar | forecast individual versionado |
| INOCAR | actualización diaria de pronóstico | puerto, datum MLWS, hora local, elevación; no inferir impacto urbano | versiones/años permitidos |
| Open-Meteo | respetar cuotas y términos | conservar ID de modelo y corrida, pronóstico sin fuga | pronósticos necesarios para validación |
| SNGR situacionales | sondeo tras horarios publicados | fecha efectiva, revisión y enlace PDF; registro de incidentes | documento y metadatos mientras sea legal |

Son **hipótesis de polling**, no intervalos aceptados por proveedores ni prueba de que el dato se actualice en ese plazo.

## Definición de implementación de un adaptador

Un adaptador no debería entrar en producción sin:
- Ejemplo real descargado y persistido desde LXC/staging de AEGIS, HTTP status, content-type, tamaño, caché/ETag, paginación y cuota medidos.
- Parseo determinista de `issuedAt` vs `ingestedAt`; zona horaria y vigencia; validación de documento PDF o respuesta GeoJSON.
- Manejo de empty/missing/stale, anticorrupción HTML por PDF, errores de host, anticuado, formato cambiado y ratelimit, circuito de reintento con jitter.
- Resolución geográfica honestamente contextualizada (provincia ≠ cantón ≠ parroquia ≠ barrio ≠ vivienda).
- Condiciones de atribución, licencia, archivo/publicación, y modo degradado revisados.
- Al menos un test de evento negativo y uno positivo, prueba de duplicación, de retractación y de `time travel`.
- Logs sanitizados (no credenciales, teléfonos ni direcciones personales); alerta sobre adaptador inactivo.

## Trámite de información institucional

INAMHI comunicó el 01-04-2025 acceso libre sin cobro y canales de solicitud: `datos@inamhi.gob.ec` y WhatsApp `+593 97 981 3027`. Esto ayuda a solicitar acceso institucional y autorizar difusión, pero **no prueba una licencia de automatización/redistribución específica**.

**Borrador de preguntas a INAMHI** (para contacto humano, aún no enviado):
- ¿Ofrecen canal machine-readable de advertencias, actualizaciones y revocaciones (CAP 1.2, Atom/RSS, GeoJSON o API) con cobertura territorial y versionado?
- ¿Cómo obtener archivos históricos de avisos emitidos, incluido N.º 83 del 25-10-2026 y nowcasting del 26-10-2026?
- ¿Tienen API oficial de observaciones de estaciones, acceso histórico, nivel de calidad, cadencia y metadatos?
- ¿Cuáles son las condiciones de atribución, republicación automática de avisos y almacenamiento de documentos con fines ciudadanos gratuitos?
- ¿Hay un punto de contacto para avisar errores y validar la integración?

Para SNGR, pedir definiciones/escala de susceptibilidad, licencia de reutilización, metadatos, fecha de revisión, archivos y feed de incidentes/estado vial.

## Siguiente sprint de investigación (antes de pedir a Codex construir alertas)

1. **Prueba de acceso real desde LXC** con comandos HTTP de solo lectura; registrar respuestas, errores y tiempos de cada servicio.
2. **Solicitud institucional INAMHI/SNGR** sobre API, archivo, reutilización y datos territoriales.
3. **Corpus 21–27/10 Guayaquil**, mezclando avisos originales, datos posteriores en canal separado, pronósticos de corridas anteriores, controles negativos.
4. **Cartografía**: obtener polígonos cantonal/parroquial INEC 2026 legítimos, documentar código de cada ciudad y datum.
5. **GEOGLOWS**: 2–4 ríos prioritarios con LINKNO y validación visual/geográfica. No habilitar envío mientras no exista calibración.
6. **Prueba editorial en sombra**: borradores ciudad, sin envío; revisión manual de contenido/verificación.
7. **Revisión comercial/legal**: contrato Open-Meteo, IGM y políticas WhatsApp; separar code MIT, datos de terceros y suscripciones ciudadanas.

**Gate de salida:** al menos un aviso INAMHI original con fechas/vigencia y captura reproducible, un recurso geoespacial real consultado en staging con licencia aclarada, y un canal de distribución en *dry-run* con mensajes auditables. Ninguna alerta pública automática antes de esas pruebas.

## Hallazgo adicional: cuándo estuvo realmente disponible un pronóstico histórico

[Open-Meteo Single Runs](https://open-meteo.com/en/docs/single-runs-api) especifica que `run=YYYY-MM-DDTHH:MM` representa **la inicialización en UTC**, **NO la publicación**. Los modelos globales pueden requerir 4–6 horas después del `run` para distribuir productos. Por ello el backtest necesita `runInitializedAt` y `earliestConservativeAvailableAt` independientes; si no hay fuente de disponibilidad histórica, aplicar una espera conservadora y declarar hipótesis. Ejemplo para la tormenta Guayaquil: evaluar por separado el IFS inicializado el **25-10 12:00 UTC** (07:00 Ecuador), cuyo pronóstico posiblemente pudo distribuirse hacia **11:00–13:00 Ecuador** según margen genérico del proveedor; no reclamar esas horas como evidencia de entrega real. El endpoint documentado es `https://single-runs-api.open-meteo.com/v1/forecast` y es apto para consulta con `run` y `latitude`/`longitude`/variables, **no ensayado aún desde LXC**.

## Precaución cartográfica INEC

El [servidor MGN 2026 del INEC](https://idgn.ecuadorencifras.gob.ec/server/rest/services/mgn_26/service_mgn26/FeatureServer) declara corte enero 2026. Pero la capa [`limite_cantonal` (1)](https://idgn.ecuadorencifras.gob.ec/server/rest/services/mgn_26/service_mgn26/FeatureServer/1) y [`limite_parroquial` (2)](https://idgn.ecuadorencifras.gob.ec/server/rest/services/mgn_26/service_mgn26/FeatureServer/2) tienen geometría `esriGeometryPolyline`, no `Polygon`. No construir zonas de suscripción con ellas directamente; buscar polígonos administrativos oficiales en GeoPackage nacional o capas adicionales apropiadas y verificar denominaciones/códigos.

## Otros caveats

- La página [INAMHI acceso sin cobro](https://www.inamhi.gob.ec/info-liberada/) declara liberación para uso público desde 2025. **No otorga licencia explícita CC BY**, ni garantiza una API de notificaciones: obtener aclaración por escrito.
- Página de datos INAMHI y mapa SNGR pueden contener contenido cambiante que se sobrescribe. No conservar solo URL.
- NASA LHASA tiene un repositorio de código y publica mapas en modo *best effort*, usualmente cuatro veces al día con caídas frecuentes. El indicador de deslizamiento no sustituye alerta de movimiento de tierra.
