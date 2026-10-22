# PR-06 — Fuente oficial y captura de cronogramas

Rama `feat/aegis-5-pr-06`, base apilada `feat/aegis-5-pr-05` (PR #13).
Sin merge, deploy, datos/volúmenes de producción o credenciales. No se implementó
PR-07. Fuente, decisiones y límites: [investigación](../research/aegis-5-official-schedules-sources.md)
y [arquitectura/operación](../architecture/aegis-5-schedules.md).

## Base revisada

Antes de crear esta rama se corrigió en PR-05 el finding sobre sustituciones que
dejaban de ser publicables pero seguían suprimiendo su predecesor. Commit
`51172ea`, regresión para retirada/rechazo/fuente deshabilitada, check y **109/109**
pruebas Node 24. El historial completo de decisiones permanece. La corrección se
publicó en su propia rama, no se mezcló como cambio PR-06. Baseline previo al fix:
`npm ci` (audit 0), check y 108/108. No hubo fallos preexistentes.

## Cambios entregados

- Investigación primaria antes de codificar adaptador; proveedor EEASA registrado
  con URL exacta, formato y condiciones pendientes de derechos/operación pública.
- Captura manual HTTPS acotada y condicional, sin redirects, cookies o scripts,
  con lease/cooldown SQLite persistente. No descarga al arrancar ni polling.
- Parser HTML real por tarjetas; fechas completas/UTC Ecuador, distinción
  mantenimiento/industrial/desconocido, tiempos ambiguos a revisión.
- Migración 004: originales privados BLOB con SHA256, capturas, revisiones y
  presencia por documento, correspondencias exactas y decisiones append-only.
- Hora cambiada en misma URL genera revisión antes/después; documento que vuelve
  a un hash anterior conserva nuevo estado observado. Filas ausentes y fallos
  nunca generan cancelación o reposición. Ningún incidente se crea automáticamente.
- GET explícito `/api/v1/schedules` por área y fecha, paginado, con procedencia,
  incertidumbre y frescura. Sin escrituras HTTP o descarga pública del original.
- Flag OFFICIAL_SCHEDULES OFF; dependencias v4 y reportes conservadas, sin nuevas
  dependencias de aplicación. JSDOM ya existía. Formato de módulos nuevos con
  Prettier 3.6.2 temporal, sin añadir paquete ni modificar package-lock.

## Pruebas y evidencia reales

- Node **24.21.0**: `npm run check` y `npm test`, **129/129** aprobadas.
- Node mínimo **22.16.0-alpine**, repo montado read-only: check y **129/129**.
  node:sqlite emite advertencia experimental esperada; sin fallos.
- **20 pruebas nuevas**, fixtures estructurales sintéticos en
  `test/fixtures/schedules/`. Fuente real no copiada al repositorio.
- Docker `aegis-pr06-review`: build aprobado; smoke de código empaquetado verifica
  migración 004, original íntegro, revisión de zona/derechos, cambio silencioso,
  GET público actualizado, métodos privados y `/ui` v4.
- Captura HTTPS real explícita, limitada a la URL registrada, en DB_DIR temporal
  **live separada de cualquier volumen de producción**: 209.915 bytes,
  SHA256 `2d0ef2c0338b682f999c1ba7b9c433100f27f9ffd6f39a170232074d09fbd28f`,
  dos entradas extraídas, dos pendientes, publicación de página desconocida null.
  Backup verificado creado con originales dentro de SQLite. Sin correspondencias
  territoriales ni aprobaciones reales: ninguna entrada real publicada.
- Descarga anterior por GET directo: 210.028 bytes, hash diferente por contenido
  mutable de página, mismo formato reconocido. No se confundieron esas capturas
  con fixtures ni con cambios confirmados de horarios reales.
- `git diff --check` aprobado. UI sin cambios; no screenshots nuevas. Pruebas DOM
  de consola/mapa/reportes y regresiones de acceso v4 siguen en la suite completa.

Las primeras ejecuciones durante desarrollo detectaron un placeholder SQL de
revisión incorrecto y la prueba de cuota de 256 KiB, ya menor que el nuevo esquema.
Ambos corregidos: la prueba usa 512 KiB y sigue forzando FULL/reversión del lote.
La cuota de producto (64 MiB por defecto) no cambió. Prueba adicional fuerza FULL
al guardar un original y demuestra que conserva bytes, filas e historia previos.
No queda fallo conocido en la suite.

## Aceptación

- [x] Proveedor oficial investigado y registrado antes del adaptador.
- [x] Descarga HTML versionada, original, URL/SHA/fechas/parser preservados.
- [x] Formato de fuente específico; PDF/OCR no requerido para el HTML elegido.
- [x] Categorías locales/mantenimiento/industrial separadas; no alerta residencial
  derivada de alta tensión o grandes usuarios.
- [x] Sector solo con correspondencia exacta revisada; ambiguo/confianza baja no
  publicable. Corregir correspondencia exige nueva revisión para la nueva área.
- [x] Consulta pública por zona/rango, paginación, privacidad y procedencia.
- [x] Fixture de reemplazo silencioso con horas antes/después y revisión específica.
- [x] Desaparición/fallo/HTTP 200 semántico404/304 sin original no son cancelación.
- [x] UTC/Ecuador, cruce de fecha UTC y TZ/DST externos independientes.
- [x] Importación local no equivale a comprobar fuente, ni toma la frescura de otro
  hash previamente descargado.
- [x] Dedupe de bytes, A→B→A, auditoría de revisiones/aprobaciones y revocación.
- [x] Cuotas/cooldown entre conexiones, originales privados, backup/restore y
  rollback v3 en directorio nuevo sin perder la base v4.
- [x] Rutas v4/DOM/reportes, Docker, Node 22/24 y flags apagados.

## Límites, rollback y próximo paso

Viabilidad técnica del piloto HTML demostrada; **licencia/condiciones de archivo y
republicación, periodicidad y catálogo territorial siguen sin validar para live**.
El catálogo de fixtures no prueba asignaciones de EEASA, circuitos o Pallatanga.
Aprobación humana por CLI y derechos revisados son necesarios, no certificación
legal. No se contactó a terceros ni se asumió acceso autenticado o servicios pagos.

Natural key sector+fecha carece de ID oficial estable: cambios de fecha/sector se
tratan como nueva entrada+ausencia; múltiples ventanas ambiguas se cuarentenan.
No geocoding, OCR, ingestión de PDFs, clasificación estadística, UI nueva, alertas
ni cancelación automática. Parser estricto y límite 256 KiB pueden requerir otra
versión al crecer/cambiar la página; el fallo conserva últimos horarios y duda.
Seis horas de frescura/15 min de cooldown son reglas conservadoras de piloto,
no SLA ni permiso del proveedor. Auditoría/originales consumen cuota y backups.

Rollback: OFFICIAL_SCHEDULES=false oculta ruta y bloquea CLI mutante; preservar DB
v4 y DATA_DIR JSON. Código anterior usa SQLite OFF o snapshot pre-004 restaurado
en otro directorio. Nunca sobrescribir la base con nuevos artefactos o auditoría.

Próximo tras revisar dependencias y gates de fuente: **PR-07**, suscripciones
anónimas/PWA/Web Push opt-in; no enviar avisos sin derechos, geografía y versión
fiable. Ninguno de esos mecanismos se implementó o activó aquí.

## Corrección de revisión posterior

Una reserva de captura running limpiaba la validación visible anterior. Ahora se
consulta el último resultado completado del historial mientras existe una reserva,
conservando hora y frescura originales incluso si el proceso se interrumpe. No se
rejuvenece la evidencia; después del TTL real pasa a stale. Regresión añadida.
Check y suite completa tras el fix: **130/130** en Node 24.21.0.
