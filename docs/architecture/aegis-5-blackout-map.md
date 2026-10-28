# AEGIS 5 — Blackout Map de lectura (PR-03)

PR-04 añade recepción opt-in y resúmenes moderados por sector bajo su propio flag;
ver [reportes ciudadanos](aegis-5-citizen-reports.md). Este documento describe la
base de lectura y demo de PR-03, que sigue funcionando con reportes OFF.

## Activación y compatibilidad

```bash
# Demo local, Node >=22.16. No credenciales ni DB_DIR requeridos.
PUBLIC_API_V1=true BLACKOUT_MAP=true BLACKOUT_DEMO=true npm start
# Abrir http://localhost:3010/map
```

Todos los flags siguen OFF por defecto. BLACKOUT_MAP requiere PUBLIC_API_V1.
BLACKOUT_DEMO requiere BLACKOUT_MAP y rechaza SQLITE_STORAGE=true: crea una base
sintética en memoria, se borra al cerrar y nunca accede a DB_DIR. El fixture
`demo/blackout.json` solo se carga con ese flag explícito. No desplazar sus fechas
para aparentar noticias recientes. La etiqueta de demo aparece en banner, fichas,
evidencias y metadatos API. La geografía base real no convierte los eventos en reales.

Con BLACKOUT_MAP=true y BLACKOUT_DEMO=false, SQLITE_STORAGE=true conecta el lector
público al store live existente. Sin SQLite el resultado es vacío y cobertura
unknown, sin cargar datos demo. No se crean áreas ni eventos live automáticamente.
Administradores aún no tienen UI/API de publicación: no hay escritores públicos.

`/map` es la entrada ciudadana de este piloto. `/` y `/ui` conservan los mismos
bytes de consola v4; no hay redirección ni sustitución de su inicio. Activar mapa
no cambia caché, fuentes, atajos ni historial JSON de v4. El cambio de inicio
público general queda sujeto a revisión/activación posterior. No se migró esquema
SQLite ni se cambió el formato de persistencia en PR-03.

## Contratos y endpoints

Se mantienen los DTO de PR-01, con `map_ref` opcional en el concepto de área
(se entrega siempre en estas rutas, nullable) y `area_name` + `map_ref` en eventos.
`map_ref` es una referencia cartográfica controlada; nunca coordenadas de entrada
arbitrarias. No se exponen filas de repositorios crudas. GET explícito por ruta,
sin exigir Origin/Referer falsos. Métodos de escritura, admin, ingest, reportes,
suscripciones y rutas v4 privadas siguen denegados remotamente. Sin CORS nuevo.

| GET | Parámetros admitidos | Resultado |
| --- | --- | --- |
| /api/v1/areas | q, type, parent_id, limit, offset | Catálogo público de áreas y precisión |
| /api/v1/outages | area_id, layer, from, to, bbox, limit, offset | Fichas revisadas, separando programación y reporte |
| /api/v1/events/:id | ninguno | Ficha publicada o error 404 sanitizado |
| /api/v1/events/:id/evidence | limit, offset | Evidencias públicas del evento, en orden de ingesta |

El endpoint de salud PR-01 conserva su contrato. No hay schedules/timeline hasta
sus PR correspondientes. Evidencias de ID no publicado devuelven lista vacía,
para no enumerar contenido privado. Eventos sin evidencia publicable dan 404.

Listas: limit 1–50 (20 default), offset 0–10000, consulta limit+1 para next_offset.
Respuestas `{data,meta}`: api_version, mode demo/live, synthetic, coverage unknown,
generated_at, limit, offset, next_offset nullable. generated_at fecha la consulta,
no la medición ni vigencia. Respuestas y errores sin caché (`no-store`).

Búsqueda q hasta 100 caracteres, sin sensibilidad a mayúsculas/acentos, trata %/_
como literales. Incluye nombres de ancestros para encontrar sectores de un cantón;
parent_id es padre directo, type filtra provincia/cantón/parroquia/sector.
La recursión tiene máximo tres aristas (cuatro niveles), también frente a ciclos.
Catálogo de áreas se considera curado/público: no guardar nombres o direcciones
privadas allí. La geografía no se valida por el número de reportes.

area_id incluye descendientes. layer filtra origen de evidencias revisadas:
official=authority, citizen=citizen/sensor, osint=news/social. No activa ingesta
OSINT ni convierte un reporte de prensa en oficial. from/to son **updated_at del
registro**, UTC normalizado desde ISO con zona, intervalo [from,to), máximo 90 días
cuando ambos límites se indican. No equivalen a «hubo un corte en esas horas».
Orden eventos: updated_at descendente + id; evidencias: ingested_at + id.
Paginación offset es eventual, no un snapshot entre requests; la UI evita duplicar
fichas si nuevos registros desplazan las páginas.

bbox = oeste,sur,este,norte; rango acotado a [-93,-6,-74,3], sin inversiones ni
valores inválidos. Solo filtra referencias cantonales verificadas disponibles;
no prueba intersección con perímetro de corte. Áreas sin referencia quedan fuera
de bbox pero pueden consultarse por lista/area_id. Los filtros desconocidos,
fechas inválidas, límites excesivos y IDs malformados devuelven 400 fijo.
60 solicitudes/minuto por IP/ruta, respetando excepción localhost heredada.
No confiar en X-Forwarded-For. Errores no devuelven mensajes de SQLite ni entrada.

## Publicación y privacidad

`storage/public-reader.js` constituye el límite interno de lectura pública:

- observación moderation_state=approved;
- vínculo human_reviewed=true;
- fuente enabled=true y access_policy='public';
- entidades de la misma modalidad synthetic que su base;
- estado official exige evidencia de respaldo de authority con official=true.

El resto permanece almacenado sin publicarse, incluso por URL directa. Se
seleccionan campos DTO: no dedupe_key, stored_ref, sha256, políticas de acceso,
moderación, recibos o metadatos privados. Fuente/URL/fechas se proyectan desde
observación, artefacto y fuente; publicación original del artefacto se usa cuando
no hay fecha más específica en la observación. Desconocido permanece null.
URLs solo HTTPS, sin credenciales, query ni fragmento; las demás se omiten, no se
normalizan hacia otra supuesta evidencia. Ingestores futuros deberán conservar
URLs originales en privado y proporcionar enlaces públicos versionados seguros.
La UI nunca crea enlaces a documentos ficticios de demo.

Revisión humana debe verificar que textos/IDs/URLs públicos no contengan datos
personales. No existe detector automático de PII ni moderación nueva en PR-03.
Corroboración/correlación se implementará en PR-05; estados importados requieren
revisión competente y explicación. Un flag o dos IDs de fuente no acreditan
independencia. Se preserva original + retractación, sin calcular una reposición
por falta de reportes ni por vencimiento de un reloj.

## Mapa, origen y rendimiento

Mapa SVG 2D nativo, sin framework o dependencia nueva. HTML/CSS/JS locales,
tipografías de sistema, CSP local-only, sin geolocalización ni servicios de tiles.
Primero se carga lista; módulo cartográfico y GeoJSON solo tras «Cargar mapa».
Fallos de cualquiera dejan lista/búsqueda/evidencias utilizables. Sin polling:
actualización manual, timeout de requests 10 s y estado explícito de datos antiguos.
Al cambiar filtro no se mantienen marcadores de fichas del ámbito anterior.

Contorno continental Natural Earth 1:110.000.000, dominio público:
[condiciones](https://www.naturalearthdata.com/about/terms-of-use/).
Se extrajo exclusivamente Ecuador del GeoJSON oficial fijado en commit
`9380cca83db5f9aef52d5e762765100745f84b27`:
[archivo de origen](https://github.com/nvkelso/natural-earth-vector/blob/9380cca83db5f9aef52d5e762765100745f84b27/geojson/ne_110m_admin_0_countries.geojson).
El asset local registra URL, SHA256 del archivo original y fecha de recuperación.
Es contexto geográfico simplificado, no cartografía catastral ni de circuitos.
Ese archivo no representa Galápagos; se indica expresamente, y la lista no se
limita por la visualización continental.

Solo hay una referencia de cabecera: Pallatanga, -2.00/-78.97, redondeada de la
ubicación cantonal del pronóstico ya documentada en AEGIS v4. Se asigna a áreas
cuyo ancestro es cantón Pallatanga bajo provincia Chimborazo, no a coordenadas
presentadas por reportantes. Sectores demo A/B/C son ficticios, sin polígonos.
El marcador cuenta fichas **cargadas en esta página**, no hogares, cortes ni todas
las evidencias. No se colorea una provincia/cantón como apagada. Zoom y retorno
a la lista tienen controles de teclado; referencias sin ancla quedan solo en lista.

Limitación deliberada: no polígonos sectoriales ni mapa detallado nacional hasta
verificar cartografía, asignación a circuitos y licencias. No se supone que GPS
identifica un alimentador. Datos ausentes siguen siendo suministro desconocido.

## Pruebas visuales reproducibles

`npm ci && npm run check && npm test` no requiere navegador. Prueba opcional:

```bash
# Playwright instalado fuera de dependencias de runtime, Chromium disponible.
AEGIS_PLAYWRIGHT_MODULE=/ruta/a/playwright/index.mjs \
AEGIS_CHROMIUM=/ruta/a/chrome \
node scripts/verify-blackout-browser.mjs
```

Sin variables usa un paquete `playwright` accesible y su navegador instalado.
El script levanta únicamente servidor loopback con HistoryStore en memoria y demo,
prueba 320/390/768/1440 px, teclado/foco, búsqueda, filtros, mapa/zoom y corrección;
inyecta fallo de cartografía/red y verifica lista/antigüedad. Guarda capturas y
reporte en artifacts/ (ignorado por Git), comprueba ausencia de requests externos
y excepciones JS. No usa credenciales, fuentes live ni datos de producción.

## Rollback y siguiente dependencia

BLACKOUT_MAP=false y BLACKOUT_DEMO=false, reiniciar. Quitar PUBLIC_API_V1 si también
se desea cerrar salud. Stores JSON/SQLite conservados; sin migración que revertir.
No deploy, merge ni activación productiva en esta entrega. PR-04 añadirá reportes
con consentimiento, recibos privados y controles antiabuso; este PR no presenta
formularios activos ni suscripciones de mentira.
