# PR-06: fuentes oficiales de cronogramas

Investigación: 2026-10-22. Fuentes primarias consultadas mediante HTTP GET, sin autenticación, ejecución de JavaScript ni envío de formularios. Las páginas mutables deben verificarse de nuevo antes de habilitar captura operativa. Este documento registra hechos observados y límites técnicos; no certifica autorización de redistribución.

## Resultado para el piloto

La candidata más sencilla es [Trabajos Programados de EEASA](https://www.eeasa.com.ec/trabajos-programadas/): entrega tarjetas HTML con fecha completa, intervalo horario, sector y motivo en la respuesta inicial. Es técnicamente viable un adaptador acotado, probado con fixtures y **desactivado por defecto**. No requiere navegador ni parser PDF. La publicación automática queda pendiente de verificar condiciones de uso, autoridad territorial y mapeos geográficos: una URL pública o `robots.txt` permisivo no otorgan una licencia de reutilización.

No debe confundirse mantenimiento programado con racionamiento nacional o interrupción observada. Una programación tampoco confirma que el servicio haya sido efectivamente interrumpido o restablecido. La fuente publica los avisos como trabajos programados; AEGIS debe preservar esa categoría y procedencia. [Página primaria](https://www.eeasa.com.ec/trabajos-programadas/).

## EEASA: HTML real

URL exacta vigente: `https://www.eeasa.com.ec/trabajos-programadas/` (la terminación es `programadas`, aunque el título usa masculino). Respuesta inicial observada con `main#main`, título Trabajos Programados y dos tarjetas; no se encontró tabla ni necesidad de llamadas adicionales para esos datos. [Fuente](https://www.eeasa.com.ec/trabajos-programadas/).

Selectores observados, que son un contrato del adaptador y no una garantía del proveedor:

- Contenedor: `main#main section.eeasa-container`.
- Registro: `.card .card-body` dentro de ese contenedor.
- Fecha: `h5.card-title`, con etiqueta `strong` y texto posterior.
- Horario, sector y motivo: `p.card-text`, distinguidos por la etiqueta `strong`; no depender de su posición global en el documento.
- Encabezado de grupo: `h4`, separado del motivo específico de cada tarjeta.

Ejemplos estructurales observados el 22 de octubre: fecha completa `jueves, 22 - octubre - 2026`, intervalos `09:00 a 13:00` y `10:30 a 15:30`. El segundo sector identifica explícitamente una parroquia y cantón (Río Verde, Baños); el primero nombra vías sin cantón explícito. Por ello, el primer texto **no** justifica inferir una localidad ni generar coordenadas. Esos datos proceden de [la respuesta HTML oficial](https://www.eeasa.com.ec/trabajos-programadas/); usar fixtures sintéticos para pruebas públicas en vez de copiar la página completa con scripts, navegación o políticas.

La tarjeta observada no contiene identificador estable, hora de publicación, versión de documento, zona horaria explícita, geometría ni indicador de cancelación. `fetched_at` debe ser fecha de captura, nunca inventarse como fecha de publicación. Cualquier interpretación de hora local Ecuador necesita configuración documentada y revisable. Un cambio de contenido merece nueva versión; la desaparición de una tarjeta no demuestra cancelación. [Estructura primaria](https://www.eeasa.com.ec/trabajos-programadas/).

### Ruta antigua y PDF

`https://www.eeasa.com.ec/suspensiones-programadas/` respondió con un cuerpo que muestra una página no encontrada aunque la descarga HTTP pudo completarse. Un adaptador debe validar título/estructura y reportar error de formato, sin tratar cero tarjetas como ausencia de cortes. [Ruta antigua](https://www.eeasa.com.ec/suspensiones-programadas/).

[Cronograma de Mantenimientos](https://www.eeasa.com.ec/cronograma-de-mantenimientos/) no contiene filas HTML de horarios en la respuesta observada. Incluye un bloque WordPress con enlace `a[href$=".pdf"]` y un identificador DOM generado. El archivo enlazado es [Mantenimientos sábado 17](https://www.eeasa.com.ec/content/uploads/2026/10/MANTENIMIENTOS-EEASA-SABADO-17.pdf), MIME `application/pdf`, 3.446.847 bytes, SHA-256 `2da45aeded27c171fb63f53664da86eb53fb2e33bc7db7bb37c74bee2ece9c88` en esta captura. No se extrajo ni verificó su contenido interior: **no afirmar que tiene capa de texto, OCR suficiente o una tabla estable**. Su nombre tampoco basta para inferir todas sus fechas. Queda fuera del adaptador HTML del piloto; requiere evaluación separada de layout, tablas, texto/OCR, límites de recursos y fixtures revisados.

### Robots, condiciones y redistribución

El [robots.txt de EEASA](https://www.eeasa.com.ec/robots.txt) observado no prohíbe las rutas anteriores; enumera exclusiones para administración y ciertos directorios WooCommerce, además de un bloque general sin exclusiones. No publica `Crawl-delay` en el cuerpo observado. Eso no establece un ritmo autorizado ni permite asumir acceso masivo.

Las páginas enlazan políticas de datos personales y cookies, entre ellas la [política de tratamiento de datos personales de 2024](https://www.eeasa.com.ec/content/uploads/2024/08/RESOLUCION-0369-2024-RESOLUCION-POLITICA-DE-TRATAMIENTO-DE-DATOS-PERSONALES-signed.pdf). No se verificó una licencia abierta para cronogramas ni términos específicos que autoricen scraping, archivo histórico o redistribución de PDFs/imágenes. No se debe interpretar una política de privacidad como licencia de contenido. Antes de habilitar operación pública: confirmar permiso/condiciones, periodicidad y contacto operativo, conservación de artefactos y redistribución. Mientras tanto, conservar URL/hash/metadatos y usar datos sintéticos en demos; cualquier captura real debe ser explícita y limitada.

## Alternativa: Centrosur

[Trabajos programados](https://www.centrosur.gob.ec/suspensiones-programadas/) muestra encabezados mensuales y enlaces/imágenes; el texto extraído no ofrece un contrato de tarjetas de fecha/hora/sector comparable al HTML de EEASA. La [página intermedia de programación](https://www.centrosur.gob.ec/intermedia-programacion/) distingue documentos PDF de contingencia/otros programas y la consulta de trabajos. No asumir un único formato ni reutilizar reglas de EEASA.

Centrosur también expone un [servicio ArcGIS de interrupciones](https://geoservicios.centrosur.gob.ec/geoservicios/rest/services/Interrupciones), cuya [capa de zonas](https://geoservicios.centrosur.gob.ec/geoservicios/rest/services/Interrupciones/ServicioCortes/MapServer/1) declara campos de horarios y alimentadores, geometría poligonal, límite de 2.000 registros y soporte JSON/GeoJSON. Esto prueba disponibilidad técnica de un servicio, **no** vigencia, licencia, cobertura completa ni permiso de republicación. El nombre «Hoy» de una capa no debe reemplazar la fecha del dato. Es una evaluación independiente futura, no una dependencia del piloto HTML.

El [robots.txt de Centrosur](https://www.centrosur.gob.ec/robots.txt) observado tiene un bloque general sin exclusiones. No se verificó licencia de reutilización o condiciones de ingesta para esos productos. Los sectores de EEASA y Centrosur tampoco autorizan extender cobertura a Pallatanga por proximidad: cada aviso necesita correspondencia territorial explícita y revisada.

## Criterios de implementación recomendados

Estas son propuestas conservadoras derivadas de los límites anteriores, no compromisos del proveedor:

- Registro de proveedor con URL fija HTTPS, alcance, formato, versión del parser y estado de permisos; ningún URL arbitrario del usuario.
- Capturas con timeout, tamaño máximo, sin scripts/cookies, hashes y archivo/versionado; conservar fallo de red o formato como desconocido, sin producir un cronograma vacío autoritativo.
- Validación estricta de fecha completa, intervalo horario y etiquetas; formatos desconocidos van a revisión. No deducir cancelación o restauración por omisión ni vencimiento de la hora prevista.
- Geografía sólo mediante correspondencias explícitas con catálogo revisado; un texto de vías o sector ambiguo permanece pendiente. Ningún geocoding a vivienda.
- Historial de versiones y correcciones; idempotencia por contenido; revisión humana antes de publicación. Fechas de vigencia, captura y publicación se mantienen separadas.
- Flag oficial OFF y sin polling operativo hasta validar permisos, fuente, geografía y revisión de seguridad. Los fixtures sintéticos cubren extracción y cambios sin presentar datos reales como validados.

## Reproducibilidad y límites

Las herramientas de navegación web devolvieron timeout para varias páginas de EEASA; las respuestas HTML y PDF se verificaron mediante GET directo en este entorno. No hubo bypass de autenticación ni descarga de cuentas/medidores. No se instaló ninguna dependencia ni se ejecutó OCR. La investigación no comprobó archivo histórico completo, disponibilidad sostenida, ETag/Last-Modified estables, licencia, permisos, condiciones contractuales, todos los datos del PDF ni la autoridad territorial de un catálogo AEGIS particular. Esas verificaciones siguen pendientes antes de habilitar una fuente operativa.
