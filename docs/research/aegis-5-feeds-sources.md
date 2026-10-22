# PR-08: candidatos de noticias energéticas y condiciones de ingestión

Verificado el 22 de octubre de 2026. Investigación técnica, sin autorización jurídica inferida, sin contactos ni ingestión productiva. Las solicitudes fueron HTTPS con validación TLS estándar de Python; no se omitieron certificados. El navegador de investigación no pudo interpretar los RSS, por lo que se comprobó su XML directamente con urllib y ElementTree. Son observaciones puntuales, no garantías futuras.

## Inventario fijo

| ID propuesto | Fuente primaria / URL exacta del feed | Evidencia técnica | Estado recomendado |
|---|---|---|---|
| `celec-noticias` | CELEC EP — https://www.celec.gob.ec/feed/ | 200; `application/rss+xml`; RSS 2.0; 10 ítems; 49.601 bytes; ETag y Last-Modified presentes; syndication hourly / 1 | Candidato técnicamente viable, derechos pendientes, desactivado |
| `mae-noticias` | Ministerio de Ambiente y Energía — https://www.ambienteyenergia.gob.ec/feed/ | 200; `application/rss+xml`; RSS 2.0; 10 ítems; 41.303 bytes; ETag y Last-Modified presentes; syndication hourly / 1; enlace RSS declarado en HTML institucional | Candidato técnicamente viable, derechos pendientes, desactivado |
| `cenace-noticias` | CENACE — https://www.cenace.gob.ec/feed/ | Falló validación de cadena TLS (`unable to get local issuer certificate`) tanto en feed como robots desde este entorno | Excluir del recolector habilitable hasta corregir/verificar cadena; no usar TLS inseguro |

Los sitios de [CELEC](https://www.celec.gob.ec/noticias/) y [CENACE](https://www.cenace.gob.ec/) identifican institucionalmente sus noticias. El feed ministerial mezcla electricidad, petróleo y ambiente: filtrar por reglas locales explicables y conservar condición de noticia, nunca convertir coincidencias de palabras en incidente confirmado. Los enlaces de CELEC contienen parámetros UTM; no deben seguirse para obtener artículos automáticamente. El `guid` puede ser un identificador opaco, distinto del enlace canónico.

## Robots, licencia y límites

[Robots CELEC](https://www.celec.gob.ec/robots.txt) y [robots ministerial](https://www.ambienteyenergia.gob.ec/robots.txt) devolvieron `User-agent: *`, exclusión `/wp-admin/`, excepción `/wp-admin/admin-ajax.php`; no incluyen Crawl-delay y no prohíben `/feed/` en esta captura. Esto NO concede licencia de publicación: [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309) separa el protocolo de robots de autorización de acceso.

CELEC muestra «Todos los derechos reservados» en su [página institucional de reglamento](https://www.celec.gob.ec/reglamento-de-contrataciones-por-giro-especifico-del-negocio-de-la-empresa-publica-estrategica-corporacion-electrica-del-ecuador-celec-ep/). Ninguno de los dos feeds contiene `channel/copyright`. No se localizó en las fuentes comprobadas una licencia expresa que autorice republicar noticias, imágenes, cuerpos o extractos en AEGIS. Ausencia de copyright RSS no significa dominio público. No se afirma que no exista otra licencia: queda pendiente revisión humana del titular y alcance concreto.

Gate recomendado: registro local auditado de `permission_status=pending|approved|rejected`, evidencia URL/documento, fecha, revisor, alcance exacto (metadatos/título/enlace/extracto), frecuencia y expiración. Solo `approved` y no vencido permite recolectar/publicar; los fixtures sintéticos pueden usar un permiso expresamente ficticio separado. Ante evidencia desconocida, caducada o revocada, ocultar salida afectada sin borrar historial. No reemplazar permiso por un simple flag de entorno ni por robots permitido.

No se encontró SLA ni cuota oficial para estos feeds en lo revisado. La sugerencia técnica conservadora es como máximo una lectura por hora por fuente (coincide con `sy:updatePeriod` observado), solicitudes condicionales ETag/Last-Modified, timeout y límite de bytes/ítems, backoff 429/5xx, sin crawlear cuerpos de artículos ni imágenes. Es una propuesta interna, no un límite concedido por el titular. Comprobar robots/política al aprobar y periódicamente; no programar capturas productivas en este PR sin autorización verificable.

## Fixtures y parseo mínimo

Basar las pruebas de candidatos en [RSS 2.0](https://www.rssboard.org/rss-specification): `rss/channel/item`, `title`, `link`, `guid`, `pubDate`, `description` con CDATA y entidades; añadir namespaces WordPress `dc`, `content`, `atom`, `sy` sin necesitarlos para el contrato. No guardar HTML completo de `content:encoded`: ignorarlo. Usar títulos, extractos y enlaces inventados bajo `example.invalid`; nunca copiar artículos reales como fixtures. `description` no es seguro por ser RSS: extraer texto plano acotado y presentar vía textContent. Rechazar DTD, entidades externas, XML malformado y fechas inválidas sin sustituirlas por fecha actual.

Si PR-08 exige Atom, añadir fixture sintético independiente conforme a [RFC 4287](https://www.rfc-editor.org/rfc/rfc4287): namespace `http://www.w3.org/2005/Atom`, `feed/entry`, id, title, updated/published, link rel=alternate y summary tipo text/html. Atom es cobertura de formato; no se observó un candidato Atom ecuatoriano en esta revisión. Las fechas de publicación, de observación y de última captura exitosa deben persistir separadas. Un 304 conserva el contenido y registra validación; un error, feed vacío o ítem desaparecido no demuestra cancelación/corrección ni ausencia de incidentes.

Pruebas recomendadas: RSS2 y Atom sintéticos; duplicado mismo guid/enlace; revisión misma identidad con título modificado; CDATA/entidades; link externo/privado rechazado; 304/429/timeout; permiso pendiente/revocado; fuente stale; HTML inyectado; truncado por bytes; la noticia se etiqueta como fuente institucional, no como horario oficial o incidente inferido. No llamar LLM ni asignar «confirmado» por texto noticioso.
