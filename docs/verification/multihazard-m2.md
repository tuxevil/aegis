# M2 — Explorador de fuentes y base territorial

2026-10-27, rama `feat/multiamenaza-m2`, sobre M1 `fc48000`.
**Implementación parcial; no se cerró el gate de geografía.** No hubo despliegue,
publicación, creación de canales ni actividad WAHA.

## Entregado

`HAZARDS_ENABLED=true` registra `/hazards/`, un enlace desde la consola y cinco
GETs públicos explícitos: `/api/hazards/sources`, `/areas`, `/observations`,
`/bulletins`, `/health` (todos bajo `/api/hazards`). OFF por defecto conserva v4.
Los GET no necesitan Origin/Referer; no se abre un prefijo completo. HEAD, POST,
rutas privadas y sufijos no pasan por la excepción pública. Filtros validados por
cantón piloto, limit 1–50, offset 0–10000, rate limit 60/min por cliente y caché 30s.
DTOs de respuesta cerrados excluyen raw, claves de almacenamiento, sesiones y
campos añadidos por accidente. Fallos devuelven 503 sanitizado y cobertura unknown.

La vista es una lista accesible de bajo consumo con Guayaquil/Pallatanga,
procedencia, antigüedad y cobertura limitada, sin mapas externos. Los datos de
la prueba histórica Open-Meteo de Guayaquil no se presentan como fuente local de
Pallatanga. El catálogo INAMHI/SNGR es de referencias potenciales, no demuestra
que la muestra de una entidad tenga cobertura de ninguno de los dos pilotos.
Los datos de investigación no se retransmiten: `observations` y `bulletins` permanecen vacíos
hasta tener revisión/licencia/publicación auditable. Ese gate es explícito,
no una afirmación de ausencia de amenazas. No existe un catálogo de avisos públicos
operativo ni un flujo editorial en este incremento.

Normalización privada de polígonos/multipartes/huecos EPSG:32717→4326 con proj4
2.22.0, origen/transformación preservados. Rechaza líneas, anillos abiertos o
degenerados, CRS distinto y presupuestos excedidos. Verificador de capa completa
exige manifiesto de IDs sin duplicados, ausencia de transfer-limit y conjunto exacto.
**No es todavía un descargador completo por lotes/paginación** ni certificación
de topología cartográfica. Geometría de pilotos continúa `null`.

Se refuerza M1: `Retry-After` y cooldown de errores se conservan en journal y se
comprueban antes de red después de reiniciar CLI; las capturas nuevas registran
HTTP/latencia. Una nueva interpretación de bytes antiguos no cambia fecha real
de captura ni cuenta como nuevo GET. No hay purga de historia.

## Evidencia territorial real y limitaciones

- El índice consultado del [catálogo INEC REEM 2024](https://anda.inec.gob.ec/anda5/index.php/catalog/1312/variable/F18/V1136?name=codigo_canton)
  enumera Pallatanga 0608 y Guayaquil 0901. La apertura directa respondió 403;
  se detuvo ese acceso, sin eludir restricciones. Por ello los códigos se guardan
  como `documented_pending_revalidation`, no como geografía validada de 2026.
- El [MGN2026 oficial](https://www.ecuadorencifras.gob.ec/documentos/web-inec/Geografia_Estadistica/Documentos/marco_geoestadistico_2026.pdf)
  se pudo leer. Describe áreas basadas en límites CONALI y sistema oficial
  SIRGAS-Ecuador. No convierte automáticamente la capa REST de líneas en polígonos.
  La herramienta web no pudo abrir `FeatureServer/1?f=pjson` en esta ejecución;
  sigue aplicándose la advertencia de la auditoría anterior.
- Sin GeoPackage/capa poligonal verificados, versión, datum y permisos no se
  ejecutaron intersecciones ni se atribuyeron avisos a barrios. La geometría de
  SNGR no se descargó masivamente. Una consulta alternativa a inundaciones,
  `objectIds=1` sin `resultRecordCount`, sí devolvió una entidad a las
  `2026-10-27T19:01:48.991Z`: HTTP 200, 531 bytes, 872 ms, claves FID/sui/DPA,
  sin geometría. [Evidencia](source-probes/2026-10-27-flood-object-id.json).
  Se corrigió la sonda de muestra; eso no valida descarga completa, licencia
  ni relación espacial de esa entidad con los pilotos.

Se contrastaron dos puntos **aproximados de modelo**, no domicilios, con pyproj
3.7.2/PROJ instalado solo en venv temporal de QA. Transformador `always_xy=True`,
EPSG:4326→32717: Guayaquil (-79.88,-2.19)→(624545.501265455,9757891.494397871),
Pallatanga (-78.96629,-1.99856)→(726211.9769363626,9778958.11702944).
Los tests invierten esos valores con proj4js y tolerancia 1e-7 grados; también
comprueban el meridiano central -81°, Ecuador, false northing 10,000,000 m.
Esto valida reproyección numérica de puntos, no fronteras ni cobertura de amenazas.

## Pruebas reproducidas

Baseline v4 más pruebas nuevas de rutas/gates, paginación, cuota 429, privacidad
de DTOs, fallos de disco, CRS, multipartes/huecos, manifiestos incompletos y XSS.
`npm ci` y auditoría sin vulnerabilidades; checks, Node tests, contratos Python y
replay se ejecutan por hito. Ver resultados del commit/entrega correspondiente.
Resultado final: **79/79 pruebas Node**, **6/6 contratos Python** y **24/24 pruebas
multiamenaza dentro de Node 22 Alpine** sin red; checks y replay correctos.

Chromium real: 320 y 1280 px, sin overflow horizontal, cambio a Pallatanga,
skip-link/teclado y cero page errors. Red externa bloqueada; almacenamiento de QA
en memoria, sin estación privada. Capturas locales en `/tmp/aegis-m2-browser-final`.
Repetición sobre la versión revisada en `/tmp/aegis-m2-browser-reviewed`.
Se inspeccionó visualmente la vista móvil.

```sh
# Playwright es dependencia opcional de QA, fuera del runtime.
AEGIS_PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs \
AEGIS_CHROMIUM_EXECUTABLE=/ruta/chrome \
node scripts/verify-hazards-browser.mjs --out=/ruta/nueva/capturas
```

Se construyó localmente `aegis-multihazard:dev` con Node 22 Alpine y se probó sin
red el CLI seguro, checks y extracción PDF en worker. Se corrigió `.dockerignore`
para incluir únicamente el contrato requerido por el runtime dentro de docs.
No se publicaron imágenes ni se arrancaron contenedores operativos.

## Pendiente para cerrar M2 y siguientes hitos

Descargador completo SNGR sin truncamiento, validación/licencia de polígonos y
códigos administrativos actuales, revisión contra fuente institucional y consulta
real por cantón con evidencia publicada. El explorador mantiene fallback útil
sin fingir esas capacidades. M3 (evaluaciones/corpus en sombra), M4 (editorial,
suscripciones/outbox simulada) y preparación M5 siguen en el objetivo activo.
M5 requiere las autorizaciones explícitas originales; no se activará por este trabajo.

Rollback: apagar `HAZARDS_ENABLED`; queda v4 y se conserva DATA_DIR. No hay
migración ni nueva escritura de observaciones históricas por la vista pública.
