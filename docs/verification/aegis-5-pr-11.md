# PR-11 — Exploración educativa 2D y prototipo progresivo

2026-10-22. Rama feat/aegis-5-pr-11 sobre PR-10 (#18). Sin merge/deploy ni DEM,
imágenes, capturas de usuario o volúmenes reales incorporados. Investigación
primaria: [terreno/licencias](../research/aegis-5-terrain-sources.md), producida
mediante skill research y agente de fondo. [Diseño](../architecture/aegis-5-explorer.md).

EXPLORER_3D OFF, /explorer/ con observación Mazar/fecha/frescura/tabla/historial y
referencias 2153/2115/2098 separadas. API pública estrecha usa caché/store v4, sin
endpoints crudos o identificadores de estación. 3D por gesto: malla matemática
local, explícitamente ilustrativa, no terreno geográfico validado o batimetría.
Canvas2D sin WebGL/dependencias, recursos remotos o animación. Fallback a 2D/texto
cuando canvas/import falla. CCS explica flujo/desarenado/compensación sin inventar
caudal o sedimentos actuales ni representarlo como reserva estacional de Mazar.

Base173 tests. npm ci audit0, check y **177/177** Node24; cuatro pruebas nuevas de
proyección/frescura/privacidad/compatibilidad/API/escena/DOM/fallback. No columnas
ni porcentaje de volumen/energía. 2115 no se equipara a apagón y 2098 conserva
papel de diseño. Sin migración/dependencias nuevas.

Chromium real 320/390/768/1440, fuente simulada explícitamente marcada sintética en
capturas: no overflow, errores JS o requests externos. Sin importar escena antes
de gesto, giro con teclado, cierre devuelve foco, canvas null mantiene 2D. Captura
móvil inspeccionada. Artefactos locales ignorados: aegis5-pr11-{width}.png y
browser.json. No hardware móvil físico ni certificación de lector de pantalla.

Límites: no DEM/tile real, geografía/batimetría/datum de embalse validados, frontera
satélite o curvas de volumen. Licencias/fuentes investigadas no convierten malla
propia en terreno medido. Falta revalidación primaria operativa de 2115, conservado
por invariantes repo. No se promete volumen/energía/autonomía o predicción. TLS
de fuente operacional hereda limitación de v4 y no se declara validación nueva.

Rollback flagOFF + reinicio sin borrar stores; no cambio de esquema. Próximo PR12:
NO-GO para cota-volumen real hasta datos/licencia/datum/validación disponibles.

Final: **177/177** también en Node22.16 Alpine sin red/read-only. Docker
aegis-pr11-review construido; **4/4** tests contra código/HTML/JS empaquetados
sin red. git diff --check limpio, sin despliegue.

Revisión: fallo de refresh CELEC se propaga por metadata Symbol no serializable
a la proyección estrecha, conservando lectura/fecha y todos los campos JSON v4.
El enlace al mapa solo aparece cuando BLACKOUT_MAP está activo. Regresión añadida;
npm ci audit0, check y **178/178** en esta rama antes de integrar fixes previos.
