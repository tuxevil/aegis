# AEGIS 5 — PR-03: consulta ciudadana de lectura

Fecha: 2026-10-21. Rama feat/aegis-5-pr-03; base actualizada sobre PR #10
(feat/aegis-5-pr-02, commit 344c08c). Continúa tras autorización del usuario,
conservando PR independientes y sin merge/deploy. No se inició PR-04.

## Resultado y alcance

Vista `/map`: búsqueda de áreas, lista paginada, filtro por origen, fechas Ecuador,
fuentes y correcciones desplegables, refresco manual y mapa SVG 2D opcional.
`/` y `/ui` siguen sirviendo exactamente la consola v4. Flags OFF por defecto.

API de lectura explícita y paginada: areas, outages, events/:id y evidence.
Proyección desde SQLite con puertas de revisión/publicación; sin acceso HTTP a
repositorios crudos, escrituras, recibos, endpoints Push o administración.
La modalidad demo usa únicamente SQLite en memoria, con tres escenarios sintéticos
visibles: programación, reporte no corroborado y original + retractación.

Mapa local Natural Earth de contexto continental, sin tiles externos, domicilios,
polígonos de cortes o supuesta asignación de circuito. Solo referencia cantonal
Pallatanga redondeada; territorios sin referencia siguen consultables en lista.
No se incorporan dependencias npm, framework de mapa/UI ni fuentes tipográficas
remotas. No hay nueva migración SQLite ni cambios a observations.json.

Detalles, rutas, límites, permisos, procedencia y comandos:
[guía PR-03](../architecture/aegis-5-blackout-map.md).

## Dependencia corregida durante este trabajo

PR #10 recibió dos observaciones automáticas sobre 76bb2e1. Ambas se corrigieron
en **su propia rama**, commit 344c08c, antes de rebasar PR-03:

- P1: lock BEGIN IMMEDIATE adquirido antes del snapshot y mantenido hasta commit
  de migración; backup usa lector separado. Regresión con escritor en otro proceso
  cubre la ventana tras snapshot y fallo de backup que libera el lock.
- P2: engines.node en package.json/package-lock.json alineados a >=22.16.

Base corregida: 55/55 tests en Node 24 y Node 22.16 Alpine. Las correcciones están
subidas y documentadas; no se afirma aprobación de revisión ni merge de dependencias.

## Pruebas reales

- Base inicial antes de cambios: npm ci, npm run check, 54/54 tests.
- Base corregida por revisión: 55/55 tests.
- PR-03 completo: **npm ci** (cero vulnerabilidades reportadas), **npm run check**,
  **npm test**: **71/71** en Node v24.21.0.
- Suite completa **71/71** también en node:22.16.0-alpine.
- `git diff --check`: sin errores.
- `docker build -t aegis-pr03-review .`: exitoso.
- Smoke HTTP dentro de esa imagen: flags OFF, live sin datos y demo; raíz, /ui,
  /map, assets, GeoJSON y API funcionan según modo. Sin servicios de producción.

Diez pruebas API nuevas: compatibilidad v4/flags OFF, tres escenarios y fechas,
búsqueda por ancestros, paginación, tipos, filtros por área/capa/UTC/bbox, validación,
protección de métodos/rutas, no contaminación demo/live, publicación restringida,
URL privada omitida, corrección paginada y rate limit. Las pruebas de publicación
comprueban que excluir una fuente/observación no elimina su historia almacenada.

Seis pruebas DOM nuevas: marcador demo, tres escenarios, fechas desconocidas,
mapa no cargado inicialmente, búsqueda/selección/capas/foco, evidencia de corrección,
red fallida con datos anteriores marcados, vacío posterior que limpia fichas,
mapa fallido con lista usable y texto externo que nunca se ejecuta como HTML.
Estas pruebas detectaron opciones mal cerradas en el selector inicial; se corrigió
el HTML y el flujo fue verificado además en navegador real.

## Navegador y capturas

Chromium headless real mediante Playwright instalado **fuera del proyecto**.
`node scripts/verify-blackout-browser.mjs` con módulo/navegador externos configurados:

| Viewport | Overflow horizontal | Teclado/foco, filtros | Mapa/zoom, correcciones |
| --- | --- | --- | --- |
| 320 px | No | OK | OK |
| 390 px | No | OK | OK |
| 768 px | No | OK | OK |
| 1440 px | No | OK | OK |

El script verifica búsqueda con Enter, selección con teclado y foco en resultados,
estado desconocido al filtrar, todas las fichas al limpiar, mapa cargado solo tras
acción humana, marcador accesible, zoom/reset y dos evidencias de corrección.
Inyecta fallo del GeoJSON y de red API: la lista permanece y se avisa antigüedad.
Sin excepciones JS no controladas ni solicitudes fuera de loopback. Recorrido demo
completo medido por Resource/Navigation Timing: **44.326 bytes** transferidos por
viewport, incluyendo HTML y las interacciones; es una medición local concreta,
no un benchmark de campo o promesa para datasets grandes.

Capturas y reporte fuera de Git, sin datos personales:

- artifacts/aegis5-pr03-320.png
- artifacts/aegis5-pr03-390.png
- artifacts/aegis5-pr03-768.png
- artifacts/aegis5-pr03-1440.png
- artifacts/aegis5-pr03-browser.json

Se inspeccionaron visualmente las capturas móvil/escritorio. El flujo no requiere
GPS, WebGL, permisos de notificación ni cuenta. No se hicieron pruebas manuales
con lector de pantalla ni en un teléfono físico; ARIA/semántica y teclado están
cubiertos por DOM y Chromium, sin afirmar certificación de accesibilidad.

## Aceptación PR-03

- [x] Entrada ciudadana dedicada y buscador por tipos administrativos/sector.
- [x] Lista utilizable sin cargar mapa; fallback por fallo de cartografía.
- [x] API paginada de áreas/eventos/evidencias, GET sin headers falsificados.
- [x] Leyenda con texto, procedencia, fechas originales y estado desconocido.
- [x] Capas por fuente; OSINT vacío cuando no existe evidencia revisada.
- [x] Navegación a consola v4 y regresiones de v4 pasan.
- [x] Demo: programación, reporte aislado y evento corregido, todos sintéticos.
- [x] 320 px, teclado/foco y ARIA/semántica, mapa sin domicilios ni zonas apagadas.
- [x] Flags OFF, no nuevas dependencias ni alertas reales.
- [x] Docker, documentación, límites y rollback.

## Límites y próximo paso

No se importó cartografía sectorial/circuitos ni evidencia live. No hay cobertura
nacional afirmada, búsqueda de domicilios o confirmación automática de suministro.
Catálogo de áreas debe ser curado como público; revisión humana debe comprobar
que resúmenes/IDs/URLs no contienen PII antes de aprobarlos. Corroboración requiere
investigación de independencia y reglas posteriores de PR-05; no se infiere del
número de reposts. El contorno simplificado excluye Galápagos, explícito en UI.

El inicio v4 permanece en `/`; `/map` es el piloto público revisable. Activación
productiva y cambio de inicio requieren su revisión. Sin formulario, recibo,
moderación nueva, suscripciones, ingesta OSINT, timeline o 3D en esta entrega.
Rollback: BLACKOUT_MAP=false y BLACKOUT_DEMO=false, reiniciar sin tocar stores.
Próximo tras revisión/dependencias: PR-04, reportes con consentimiento y antiabuso.

## Revalidación 2026-10-22

Se incorporó la actualización documental de PR-02 (`ad85d8b`) a esta rama,
sin cambiar main ni fusionar PRs. `npm ci` correcto (cero vulnerabilidades),
`npm run check` y `npm test` **71/71** en Node v24.21.0. Suite completa
**71/71** en Node 22.16.0 Alpine, sin red y con repositorio en solo lectura.

Se repitió el script de Chromium en 320/390/768/1440 px: sin overflow,
sin errores JS ni solicitudes externas; teclado, filtros, mapa y correcciones OK.
Fallos inyectados de cartografía/API conservan la lista y señalan antigüedad.
Recorrido local: 44.326 bytes por viewport, incluidas interacciones.
Capturas móvil/escritorio inspeccionadas; artefactos en artifacts/ fuera de Git.
No se probaron dispositivo físico ni lector de pantalla. Flags siguen OFF;
sin datos live, migraciones adicionales, despliegue ni activación productiva.
Próximo bloque: PR-04 tras revisión de dependencias, fuera de esta entrega.
