# Auditoría de aceptación Multiamenaza — M0–M4 en sombra

Corte de implementación: 2026-10-27, `bcc0c47`, PR #28 sobre #27/#26/#25/#24.
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

## Evidencia actual reproducida

- `npm ci`: 0 vulnerabilidades; check y Node **157/157**.
- Contrato Python **6/6**, ambos CLI replay y diff-check correctos.
- Docker construido: **102/102** hazards+alerts con `--network none`.
- Docker con `/app/docs/design` vacío en tmpfs: `/ui` **200**, flags OFF.
- CI de `bcc0c47`: Node 22/24 y smoke contenedor terminaron **success**;
  [run 40596729727](https://github.com/tuxevil/aegis/actions/runs/40596729727).

No se han capturado nuevas fuentes en este incremento ni se tocaron canales.
Los bytes de proveedor y secretos de laboratorio no se incluyen en este documento.
Los tests de software no prueban derechos de uso, exactitud cartográfica, reducción
de daño, disponibilidad de un proveedor, cumplimiento legal o entrega ciudadana.

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
