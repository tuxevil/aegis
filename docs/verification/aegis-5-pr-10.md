# PR-10 — Replay temporal y exportación

2026-10-22. Rama feat/aegis-5-pr-10 sobre PR-09 (#17). Runtime sigue sobre
PR-08; PR-09 solo decisión social documental. Sin merge/deploy ni historia real
importada o modificada. [Contrato y límites](../architecture/aegis-5-timeline.md).

TIME_MACHINE OFF, /history/ y GET timeline con corte known_at, rango del hecho,
revisión auditable, evidencia/procedencia y exportación de página CSV/JSON. Solo
historial existente del motor, sin inventar datos de 2024. Programado no se cuenta
como duración efectiva; fin desconocido conserva null. Privacidad/permiso/hold
actuales prevalecen sobre replay, con degradación explícita de historial parcial.
Sin migración ni dependencias nuevas; v4 y sus fuentes se conservan.

Pruebas dirigidas: antes/después de corrección, tiempo del hecho vs ingesta,
evidencia privada/hold no resucita, rangos/fecha/SQLi, CSV seguro, API GET/campos
cerrados/flags y DOM XSS/fallo de red. Restauración con orígenes independientes
comprueba cuándo se puede mostrar duración; un solo retorno no basta.

Instalación npm ci audit0, check correcto. La primera prueba API encontró el
known_at undefined serializado literalmente por el harness; query del test
corregida sin relajar contrato. Primer intento de navegador coincidió con npm ci
y falló por módulo en reinstalación; se repitió después de instalación estable.
No se deshabilitaron pruebas ni ocultaron fallos de runtime.

Chromium 320/390/768/1440: búsqueda/selección por teclado, mismo caso reported→unknown
entre dos cortes, sin overflow, errores JS o requests externos. Labels en español,
captura móvil inspeccionada. Artefactos fuera de Git: aegis5-pr10-{width}.png y
browser.json. UI no requiere WebGL, cuenta o permisos; no teléfono físico o lector
de pantalla certificado. Fixtures sintéticos visibles en cada ficha.

Límites: privacidad puede reducir filas de página, next_offset sigue siendo el
indicador de continuación. Área exacta, no circuitos inferidos. Programaciones
PR-06 no se convierten automáticamente en eventos históricos; demo sin revisiones
puede quedar vacía. Sin importación histórica libre ni estadísticas nacionales.
Consulta/exportación paginada, no descarga masiva de datos privados o cuerpos.
No se equiparan publicaciones periodísticas, horarios y cortes observados.

Rollback TIME_MACHINE=false + reinicio, preservar base/revisiones/JSON. No schema
nuevo. Próximo PR-11: explorador ilustrativo 2D/prototipo 3D con fallback y límites
explícitos; sin modelo de volumen hasta gate documental PR-12.

Resultados finales: **173/173** Node24 y **173/173** Node22.16 Alpine sin red,
repo read-only. npm ci audit0 y check correctos. Imagen aegis-pr10-review construida.
Recorrido Chromium repetido tras traducir labels de estado/relación: cuatro
viewports aprobados. Sin nueva migración ni dependencia.

Imagen empaquetada sin red: **6/6** pruebas timeline, con helpers/fixtures
montados y código de producto dentro de la imagen.
