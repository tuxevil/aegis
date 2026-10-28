# Auditoría de aceptación Multiamenaza — M0–M4 en sombra

Estado acumulado de desarrollo: 2026-10-28, PR #28 sobre #27/#26/#25/#24.
La planificación normativa sigue en START_HERE_CODEX y roadmap. Este documento
reconcilia las entregas incrementales; los informes M0/M1/M2 anteriores describen
su corte histórico, no una ausencia actual de código que apareció después.

**Resultado: no está probado el cierre integral del objetivo.** Hay software
probado para diagnóstico, archivo, consulta, evaluación y flujo editorial simulado.
Los gates de fuentes, territorio, corpus y operación no se deducen de tests verdes.
No hay avisos públicos operativos, Push/WAHA activos, despliegue ni merge a main.

Estados: **probado** = evidencia directa reproducida; **parcial** = software con
alcance o gate pendiente; **pendiente** = evidencia insuficiente/no ejecutado.

| Requisito normativo | Estado y evidencia inspeccionada | Límite que permanece |
| --- | --- | --- |
| M0 repo/rama/base y baseline sin pérdida | Probado: informe source-validation-results, baseline 50/50 Node, 6/6 Python; ramas/PR separados | No es inspección de producción/LXC |
| M0 seis GET y diagnóstico real sanitizado | Probado: source-probes initial/detailed y reportes posteriores | Éxito HTTP no certifica operación permanente |
| M0 fallos HTTP/PDF/JSON/TTL/modelo/reloj | Probado: sondas, warning-validity, ingestion tests | Fixtures identificados, no incidentes reales |
| M0 permisos/tasas/restricciones | Parcial: política conservadora, pausa 403/429; términos consultados | Permiso definitivo INAMHI/SNGR pendiente |
| Dependencias y errores preexistentes | Probado: npm ci actual 0 vulnerabilidades; cuatro iniciales corregidas en f22e4cc | GitHub aún informa una baja en main, que no se ha modificado |
| M1 Registry y HTTP aislado | Probado: registry/http; URLs cerradas, GET, límites, TLS verificado nuevo, cooldown durable | No scheduler operacional ni frecuencia certificada |
| M1 artefactos/versiones/capturas/reproceso | Probado: artifact-store, immutable-file, ingestion tests; PDF real M1 verificado | Archivo real de laboratorio en /tmp, no volumen resiliente |
| M1 adaptadores/envelope discriminado | Probado: PDF.js worker y AJV; pruebas de null/unidades/tipos/modelo | OCR y formatos no observados no se adivinan |
| M1 source_health/fallo parcial | Probado: ingestion.health y public-reader; degraded/stale/unknown | No monitorización de proveedor permanente |
| M1 persistencia/backup/rollback | Probado local: backup.test recupera histórico, fuentes/capas y journals a raíz nueva; SHA-256 y lectores readOnly sin reparar | No ensayo sobre volumen Proxmox ni copia externa cifrada |
| M2 pilotos/DPA/boundary version | Parcial: 0901/0608 documentados, geografía null y estado pendiente explícitos | Códigos actuales y polígonos INEC no certificados |
| M2 CRS/polígonos/paginación/transfer-limit | Probado offline: geography y arcgis-acquirer; puntos contrastados con PROJ | Topología, licencia y descarga completa real no verificadas |
| M2 consultas reales por cantón | Parcial: conteos/manifiestos IDs de ambos cantones y dos servicios | No se descargaron geometrías completas por falta de gates |
| M2 rutas explícitas/read-only/privacidad | Probado: public.test; DTO cerrado, filtros/cuotas, errores sanitizados | Observations/bulletins públicos vacíos hasta publicación auditada |
| M2 vista accesible, móvil y fallback | Probado: DOM/teclado y Chromium 320/1280 del informe M2 | Sin mapa de susceptibilidad no certificado |
| M3 conocimiento temporal y determinismo | Probado: knowledge-cutoff/assess/replay tests; correcciones sin futuro | No prueba disponibilidad web histórica del PDF |
| M3 identificación y disponibilidad modelo | Probado: explicit models ECMWF 200/control inválido 400, archivo hash; basis explícita | Validación local/licencia comercial/archivo histórico todavía abiertos |
| M3 motor territorial/evidencia/clases | Probado: official/forecast/observation/AEGIS_ASSESSMENT; static solo contexto | Fuente provincial o estación no equivale a barrio/cantón/cuenca |
| M3 corpus 21–27 y casos negativos | Parcial: 14 filas con referencias/gaps y outcome=null | No hay negativos reales compatibles revisados |
| M3 leadTime/FAR/missRate/detectionLag | Parcial: implementación verificada con fixtures y denominadores | Tasas reales desconocidas; no probabilidades de desastre |
| M4 API/admin autenticada y roles | Probado: admin tests; Bearer incluso local, límite antes de auth, importación calculada por servidor | Credenciales operativas no provisionadas ni solicitadas |
| M4 revisión humana, notas y ciclo | Probado: editorial tests; versiones, revisor distinto, corrección/expiración/retractación auditadas | Approved es revisión para simulación, nunca permiso de publicación |
| M4 interfaz editorial/selector | Probado en JSDOM y Chromium 320/1280: roles, flujo simulado, consentimiento/baja, teclado/foco, sin overflow/page errors; vistas móviles inspeccionadas | QA local sintético; no certifica operación pública |
| M4 CityChannel y enlaces | Parcial: directorio reportado, JID/OWNER/boundary null, propuesto | No hubo comprobación de sesión/roles, ni está autorizada |
| M4 preferencias por zona y consentimiento | Probado: subscriptions/API/UI tests; secreto hash, opt-in, baja, expiración, sin domicilio/teléfono | Retención/depuración LOPDP y recuperación con usuarios no aprobadas |
| M4 antiabuso y demanda | Probado de laboratorio: desafío firmado/único, límites, sin IP durable; agregados privados suprimidos <5 | No certifica defensa ante botnets o personas únicas |
| M4 PWA/WhatsApp opt-in independiente | Parcial: interés separado, serializador PWA simulado y enlaces manuales | Sin suscripción Push real, permiso navegador, JID o entrega verificada |
| M4 Outbox durable/dedupe/retries/dead-letter | Probado: outbox tests, reinicio, cancelación por fuente/estado/caducidad | Solo serializadores puros sin transporte de red |
| M4 templates y rectificación | Probado: español, autoridad/clase/fechas/vigencia/alcance; revisión posterior rotulada RECTIFICACIÓN | No afirma una publicación o entrega previa inexistente |
| M4 extremo a extremo | Probado: PDF sintético → archivo → motor → revisión → simulación; publishedAt null | No es ensayo de entrega operacional con proveedor |
| Preservación v4/flags/seguridad | Probado: suite completa y /ui 200 sin red/directorio experimental con flags OFF | Excepción TLS CELEC/CENACE heredada sigue documentada |
| M5 redundancia/observabilidad/restauración | Parcial: runbook de recuperación/incidentes y diseño de continuidad; restauración local sintética probada | No infraestructura externa provisionada, failover o SLA ensayados |
| M5 WAHA/OWNER/ToS/Meta y beta | Pendiente: prohibición expresa de usar sesión/crear canales/enviar | Requiere autorización separada, no implícita por disponer de enlaces |
| M5 publicación, retractación, entrega y kill switch | Parcial: bloqueo global incondicional y simulaciones locales | No beta pública ni controles de envío real implementados/activados |

## Evidencia acumulada verificable

Los apartados siguientes registran cortes históricos de cada incremento. La última
verificación completa de código antes de esta revisión corresponde a 743607f:
**208/208** Node, **153/153** contenedor construido sin red, **6/6** Python,
npm ci sin vulnerabilidades, check/replays correctos; /ui 200 con flags OFF.
Su CI remota se comprueba por SHA, sin trasladar un verde anterior a otro commit.
Chromium 320/1280 del incremento 7de9836 cubre aviso/retractación simulados,
consentimiento/baja/teclado/foco; no acredita geografía ni entrega operacional.

No se tocaron canales. Bytes de proveedor y secretos permanecen privados.
Tests de software no prueban derechos de uso, exactitud cartográfica, reducción
de daño, disponibilidad permanente, cumplimiento legal o entrega ciudadana.

## Trabajo siguiente que sigue siendo ejecutable sin activar avisos

1. Tras ensayo integral local correcto, revisar procedimientos con operador y
   resolver infraestructura/retención antes de proponer simulacro operacional.
2. Completar revisión de retención/seguridad del flujo público de preferencias;
   la QA Chromium de ambas vistas ya pasó con datos sintéticos y red externa bloqueada.
3. Buscar evidencia institucional accesible para cartografía/códigos y completar
   el corpus solo con procedencia verificable; no eludir 403 ni inventar negativos.
4. Proponer activación únicamente después de resolver gates y contar con revisión
   concreta. Esta auditoría no solicita ni concede aprobación de envío/despliegue.


## Incremento de recuperación integral

Añadidos backup.js/CLI seguro, lectores readOnly y runbook
[multihazard-recovery](../runbooks/multihazard-recovery.md). La suite se amplía a
**166/166** Node, **111/111** en Docker sin red y **6/6** Python, con npm ci sin
vulnerabilidades, check/replays/diff-check correctos. Los ensayos no certifican
hardware ni recuperación de producción. CI anterior 8a77905 pasó en Node 22/24 y
contenedor (run 40597525877); la CI del nuevo commit se registra en el PR #28.


## Nueva evidencia territorial

[IEDG/CONALI 2026](multihazard-territory-research.md): descarga real privada,
polígonos de los dos pilotos válidos sin reparar y códigos corroborados por DBF.
El PRJ identifica 32717 pero PDF dice 4326; autorización de publicación/catálogo
siguen pendientes. INEC limite_cantonal confirmado como línea. No cambia el gate
ni se publican geometrías. Datos Abiertos devolvió 403 y se detuvo ese acceso.

## Revisión adicional del opt-out

La revisión encontró y reprodujo un fallo de capacidad que podía impedir bajas.
Se corrigió reservando eventos/bytes para revocaciones antes de aceptar altas/cambios,
sin borrar historia, aumentar cuotas ni almacenar eventos hipotéticos. Regresiones
de eventos/bytes, reinicio, varios usuarios, API y fallo temporal del navegador
cubren el límite. Mantener pendiente dimensionamiento real y revisión de retención;
no se convierte esa corrección en garantía de disponibilidad física o cumplimiento legal.
Resultado de este incremento: **172/172** Node, **117/117** Docker sin red,
**6/6** Python, instalación/check/replays/diff-check correctos.

## Lectura pública estricta

Se reprodujo y corrigió una escritura incidental desde GET sobre un almacén
incompleto. PublicReader usa readOnly y solo carga registros para health; los
catálogos estáticos siguen disponibles ante fallo privado. Se prueba 503/unknown
sin inicialización y respuestas de catálogo útiles, sin publicar datos de fuente.

Resultado de lectura estricta: **173/173** Node, **118/118** Docker sin red,
**6/6** Python, check/replays/diff-check correctos.


## Vigencia futura de avisos conocidos

Probado: revisión preventiva antes de validFrom, identidad estable al llegar la
vigencia, exclusión antes de conocimiento/al vencer y vista previa temporal
explícita. El candidato sigue privado, con revisión humana y publicación bloqueada.
Resultado acumulado: **175/175** Node, **120/120** Docker sin red y **6/6** Python.

## Ciclo repetido de evidencia verificado

La identidad incorpora todo el contenido revisable, calidad/parser y política;
excluye únicamente reloj de evaluación y metadatos de transporte. Reimportar o
recapturar bytes idénticos conserva la edición original, su digest y aprobación.
La procedencia original se reconstruye al corte original y la confirmación actual
se audita por separado. Cambios reales requieren nueva revisión.

Se prueban TTL, fallos conocidos sin fuga de futuro, URL oficial mutable,
Retry-After, reprocess sin renovar descarga, referencias falsificadas, API repetida
y archivo físico sintético con dos capturas/un artefacto/una simulación.
Ver [identidad y frescura](../architecture/evidence-identity.md).
Node: **189/189**; Python: **6/6**; check y ambos replays correctos.
La reconstrucción Docker encontró un fallo externo de autorización/conectividad
con Docker Hub; no se oculta como prueba aprobada. Un primer ensayo montando todo
el repositorio falló 5 pruebas PDF por sustituir las dependencias Alpine con las
del host. Con solo código montado y dependencias nativas de la imagen pasan **134/134**
pruebas sin red. Eso verifica el código actual, no una reconstrucción de imagen.
Los gates institucionales, cartográficos, históricos y de activación siguen abiertos.

## Corridas manuales de los dos pilotos

El perfil ECMWF admite selección UTC/piloto acotada, sin URLs ni coordenadas del
operador. Reproceso y evaluación conservan URL/ámbito/disponibilidad, evitando
confundir dos puntos en una corrida. No hay polling automático ni consultas reales
nuevas en esta validación. Ver [diseño y uso](../architecture/manual-forecast-runs.md).
La validación externa de nuevas combinaciones y derechos sigue pendiente.

Validación de este incremento: npm ci sin vulnerabilidades, check, **194/194**
Node, **139/139** en imagen local con dependencias nativas/código actual y red
bloqueada, **6/6** Python, ambos replays y diff-check correctos. No se reconstruyó
la imagen contra Docker Hub en este ensayo. CI de 90d25a3 pasó en Node 22/24 y
contenedor (run 40608037142); el nuevo commit requiere su propia CI.

## Validación real Pallatanga y aislamiento de frescura

Un único GET de investigación para ECMWF/Pallatanga, corrida 27/10 12 UTC,
respondió 200 en 1115 ms. Archivo privado verificado: 1 captura/1 artefacto,
1993 bytes, 72 tiempos y 1 valor faltante. Disponibilidad comprobada realmente
28/10 00:24:00.019Z (27 local), no al inicializar. Evaluación unknown/0 candidatos,
no «sin riesgo». [Metadatos](source-probes/2026-10-27-pallatanga-manual-forecast.json);
no se publican bytes ni se aprueban candidatos reales. Términos consultados:
https://open-meteo.com/en/terms ; no se infieren permisos de operación/publicación.

Se reprodujo con tres pruebas fallidas la mezcla de puntos en health: una captura
reciente de Pallatanga renovaba el estado filtrado de Guayaquil y solo se verificaba
el artefacto más reciente global. Corregido: selección y verificación por punto,
unknown si falta el punto o URL registrada, sin recorrer cada corrida histórica.
La salud sigue siendo de disponibilidad/captura, nunca de seguridad del territorio.

Verificación acumulada: check, **197/197** Node, **142/142** con código actual
y dependencias nativas de imagen local sin red, **6/6** Python, ambos replays
y diff-check correctos; dependencias sin cambios desde npm ci (0 vulnerabilidades).
CI de a713092: success Node 22/24 y contenedor, run 40608435679.

## Retractación de una simulación completada

Ya no se limita a cancelar una cola pendiente: se puede encolar/procesar retiro
editorial simulado, enlazado a un ítem previamente simulado del mismo transporte.
No inventa publicación, entrega ni cancelación oficial. Digest/historia original
permanecen intactos; acción separada e idempotente, caducidad propia de laboratorio.
Una aprobación caducada puede corregirse; borradores nunca aprobados no pueden
usar esa excepción. UI y API autenticada cubiertas, sin transporte de red.
Ver [contrato y límites](../architecture/dry-run-retractions.md).

Validación: npm ci 0 vulnerabilidades, check, **202/202** Node, **147/147** en
imagen local con código actual y dependencias nativas/red bloqueada, **6/6** Python,
ambos replays y diff-check. UI nueva verificada en DOM; no se afirma nuevo ensayo
Chromium de estos controles. CI anterior 149e15f success, run 40608697068.

## Chromium del flujo de retractación y enlace territorial

El script reproducible verify-alerts-browser.mjs ahora recorre aviso y retractación
simulados en WAHA, verifica ambos ítems mediante API autenticada y ausencia de
envío/ID de proveedor. Chromium pasó 320/1280 px, consentimiento/baja, teclado,
foco, sin overflow ni errores de página; toda conexión fuera de localhost bloqueada.
Captura móvil inspeccionada con ambas vistas previas expandidas: origen sintético,
ninguna difusión y retiro editorial sin cancelación oficial explícitos. Artefactos
privados en /tmp/aegis-browser-retractions-20261027; no se publican capturas.

Reproducido y corregido: el catálogo filtrado Pallatanga enlazaba el JSON de muestra
histórica de Guayaquil. Ahora ambos pilotos enlazan la documentación oficial de
Single Runs; los envelopes internos mantienen URL exacta de corrida/punto. La
allowlist del navegador admite el dominio oficial y sigue excluyendo credenciales.
No se consultó ninguna corrida nueva para esta corrección.

Check, **203/203** Node, **148/148** en imagen local con código actual/dependencias
nativas y sin red, **6/6** Python, ambos replays y diff-check correctos. Dependencias
sin cambios desde npm ci sin vulnerabilidades del incremento anterior. CI de
abd33fc terminó success (Node 22/24 + contenedor), run 40609038855.

## Coordenadas del proveedor conservadas y verificadas

El pronóstico ya diferencia punto solicitado y celda devuelta; missing/null no se
rellena con cero ni con coordenadas solicitadas. Nuevos campos discriminados,
parser versionado y comprobación de coherencia en evaluación. Metadatos ausentes
o contradictorios impiden proponer pronóstico; el límite técnico no certifica
pertenencia cantonal ni riesgo. Legado legible, sin migración destructiva.
Ver [diseño y límites](../architecture/forecast-grid-provenance.md).

Reproceso privado real sin red: dos registros/un artefacto, SHA y captura original
preservados, horarios originales de descarga/disponibilidad intactos. No renueva
TTL, no hubo aprobación ni notificación. Evidencia sanitizada en source-probes.

Verificación 28/10: npm ci 0 vulnerabilidades, check, **208/208** Node y **6/6**
Python, replays/diff-check correctos. Imagen local anterior no disponible; se
reconstruyó Docker correctamente y pasan **153/153** sin red. /ui 200 con flags
OFF y directorio experimental oculto; CLI sin opciones no ingiere ni publica.
CI anterior 7de9836 success Node 22/24 + contenedor, run 40609316312.

## Revisión de métricas por ventana completa

Cobertura parcial de una señal ya no cuenta como TP/FP: inicio y fin deben cubrir
la ventana homogénea revisada. Datos faltantes se excluyen de denominadores; no se
recorta automáticamente la evaluación ni se inventan negativos. Fallo reproducido
antes de la corrección. Ver [política](../architecture/replay-metric-windows.md).

Verificación del incremento: npm ci 0 vulnerabilidades, check, **209/209** Node,
**154/154** con código hazards actual montado en imagen local/dependencias nativas
y red bloqueada, **6/6** Python, ambos replays y diff-check. CI de 743607f terminó
success en Node 22/24 y contenedor: run 40683853168. Nuevo head requiere su CI.

## Proyección territorial privada verificada

Añadidos TerritoryPreviewReader y CLI inspect-territory: lectura estricta del
archivo de capas, SHA/manifiesto/contentHash/DPA y presupuestos antes de generar
páginas privadas de polígonos. Ausente unknown/total null se distingue de colección
completa vacía, sin inferir seguridad. Salida nueva 0600 fuera de DATA_DIR y
sin geometría en stdout; sin endpoints públicos ni solicitudes reales.
[Interfaz y límites](../architecture/private-territory-preview.md). No se declara
mapa público ni cartografía certificada; sigue pendiente la vista gráfica privada.

Validación: npm ci 0 vulnerabilidades, check, **216/216** Node, **161/161** con
código hazards/scripts actual y dependencias nativas de imagen local sin red,
**6/6** Python, ambos replays y diff-check. Incluye rechazo de destino vía symlink
y conservación de snapshotAtomicity. Solo archivos sintéticos; sin descarga de
geometrías reales. CI anterior 9041b64 success, run 40684268535.

## Vista gráfica territorial privada

Implementada /editorial/territory/ y GET /api/admin/alerts/territory, detrás del
flag editorial OFF por defecto y Bearer. Dibujo SVG local de la página, con huecos,
selección por lista, categoría literal/DPA y procedencia. Sin colores de riesgo,
mapas externos ni afirmación de límites/cobertura territorial. No hay geometrías
en rutas hazards públicas; el archivo real no se sustituye por datos sintéticos.

JSDOM y endpoint autenticado probados; Chromium 320/1280 pasó esquema/selección,
referencia expandida, piloto sin colección, logout/teclado, sin overflow ni errores.
Captura móvil inspeccionada, con aviso sintético visible; artefactos privados en
/tmp/aegis-browser-territory-final-20261028. Cero geometrías reales nuevas o HTTP
a proveedores. [Contrato de vista](../architecture/private-territory-preview.md).

Validación: npm ci 0 vulnerabilidades, check, **220/220** Node, **165/165** en
contenedor reconstruido y sin red, **6/6** Python, ambos replays y diff-check.
Revisiones finales específicas: API sin inicializar archivo ausente y multipartes
en DOM correctas. Grid /ui 200 y vista territorial 404 con flags OFF/directorio
experimental oculto, sin red. CI de 4c9a9a5 success, run 40685382332.

## Consistencia de colección al paginar

La revisión territorial ya fija snapshotId entre páginas; no mezcla capturas si
aparece una colección nueva. Consulta explícita/cambio de filtros carga la última.
CLI admite --snapshot; API liga ID a fuente/piloto/origen y devuelve 404 sin
fallback si no corresponde. Verificación SHA/manifiesto/contentHash se aplica a
la colección elegida. Pruebas de archivo físico, API y DOM; ningún HTTP externo.

Verificación: npm ci 0 vulnerabilidades, check, **222/222** Node, **167/167**
en contenedor reconstruido sin red, **6/6** Python, ambos replays/diff-check.
Chromium 320/1280 confirmó entrada de una nueva colección entre páginas,
conservación de la anterior y carga explícita de la nueva. Captura móvil revisada,
fixtures privados; sin overflow/page errors ni conexión externa. Artefactos:
/tmp/aegis-browser-territory-pinned-20261028. CI ed780ca success, run 40686681755.
