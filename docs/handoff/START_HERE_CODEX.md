# AEGIS Multiamenaza — START HERE (entrega de planificación a Codex)

## Ensayo autorizado en desarrollo — en ejecución desde29/10/2026

El propietario autorizó siete días sintéticos **en esta máquina**, sin Proxmox.
Se inició Docker detached con red none y volumen exclusivo; deadline original
2026-11-05T23:22:04.474Z. [Identidad, supervisión y limitaciones](../verification/integration/seven-day-development.md).
No recrear contenedor/imagen ni resetear plazo. Siete días siguen pendientes.
No se preparan/envían correos INAMHI: el borrador viejo es solo antecedente opcional;
una consulta pública puntual se evalúa con base pública, separada de automatización
y redistribución. Su ejecución todavía requiere aprobación específica del propietario.
Ver [base pública acotada](../verification/integration/inamhi-public-use-review.md)
y [comando/política de una consulta](../runbooks/inamhi-single-query-proposal.md).
El puente existente se conserva; una corrección hace que repetir una aprobación
consumida salga con error y no recicle el éxito anterior. No actualizar la imagen
del ensayo en marcha al incorporar cambios de la consulta manual.

## Prioridad vigente: validación operacional y observación en sombra (29/10/2026)

Se mantienen suspendidas nuevas funciones de producto. Revisar críticamente el
runtime #32–#34 antes de operar continuamente, sin contar el AI check HTTP402
como aprobación. [Revisión y reproducciones](../verification/integration/operational-review-2026-10-29.md).
El laboratorio network:none sigue intacto; diseñar salida controlada por separado,
sin activarla, modificar protecciones GitHub, acceder a Proxmox o publicar avisos.
No afirmar estabilidad de días sin tiempo real observado y fuentes autorizadas.
La propuesta de ruleset es un archivo revisable, no una regla aplicada.
La [preparación de salida controlada](../runbooks/shadow-observation-preparation.md)
es una propuesta inactiva: sin runner continuo, firewall verificado ni autorización.
El preflight solo comprueba el plan y rechaza activación por argumentos o entorno.
El encargo completo añade operación medible: [runner/contrato](../contracts/shadow-operation-v1.md),
[ensayo7–14 días](../runbooks/shadow-observation-7-14-days.md),
[matriz de permisos](../verification/integration/operational-source-matrix.md) y
[GO/NO-GO con evidencias](../verification/integration/shadow-operational-readiness.md).
Existe runner sintético con estado/cuotas/heartbeat/recuperación; no un puente
continuo de fuentes reales certificado. No convertir pruebas aceleradas en días.
La [prueba de tiempo real](../verification/integration/offline-soak-2026-10-29.md)
duró123.346 segundos con reinicio/pausa/restore. Se corrigió el deadline reiniciado
por proceso. Siete días siguen sin ejecutar; run.json preserva el plazo entre reinicios.
INAMHI es el primer piloto: [puente manual y condiciones pendientes](../verification/integration/inamhi-first-source.md).
Default sin red; propuesta inválida para ejecutar. Una autorización permite un solo
intento privado, nunca polling continuo. No se descargó ahora el PDF de INAMHI.
La [prueba de red por kernel](../runbooks/inamhi-network-lab.md) solo es de fixtures
aislados. [GO/NO-GO separados](../verification/integration/first-source-go-no-go.md):
no autoriza red real, Proxmox, consulta manual o publicación. El riesgo TLS Grid
se investigó por handshake; código/config productivos conservados.

## Prioridad vigente: consolidación y preparación supervisada (28/10/2026)

El propietario suspendió temporalmente el desarrollo intensivo de funcionalidades.
Integrar AEGIS 5 (#8–#21) y Multiamenaza (#23–#31), preservar Grid/HA/cronogramas,
probar contratos y preparar staging aislado. La [matriz de integración](../verification/integration/integration-matrix.md)
y su snapshot registran heads/baselines reales. Los encargos históricos de empezar
en PR-01/M0 son contexto, no reinician el trabajo. No añadir funciones ajenas a
integración, validación, seguridad o reproducibilidad. Sin main/producción/SSH a
Proxmox/puertos nuevos, datos reales, Push/WAHA o avisos reales. DRY_RUN obligatorio.
El bloqueo anterior de certificación no impide esta nueva etapa autorizada.

Entregas de consolidación: PR #32 (matriz), PR #33 (runtime conjunto, ambos
ancestros conservados) y rama `integration/aegis-staging` (aislamiento/recuperación).
Consultar [validación ejecutada](../verification/integration/validation-report.md),
[runbook de staging](../runbooks/supervised-staging.md) y
[preparación para piloto](../verification/integration/pilot-readiness.md).
No confundir el entorno offline comprobado con despliegue autorizado o precisión
operacional. Retomar desde esos resultados y los heads actuales de GitHub.

**Fecha del corte de decisiones:** 27 de octubre de 2026, Ecuador (America/Guayaquil).
**Estado del producto:** planificación y diseño COMPLETADOS para iniciar implementación. Los conectores externos y las notificaciones públicas NO están certificados ni activados.
**Repositorio:** \`tuxevil/aegis\`. **Rama de documentación y PoC:** \`feature/guayaquil-replay-whatsapp\`. **PR de contexto:** https://github.com/tuxevil/aegis/pull/23 (draft). \`main\` no debe fusionarse/desplegarse automáticamente por este handoff.

## 1. Esta es la fuente de verdad para nuevos agentes

El propietario pidió cerrar aquí la planificación, pasar a un agente Codex encargado del **desarrollo por fases** y preservar íntegro el contexto. No hacer que el propietario vuelva a decidir aspectos ya cerrados. No arrancar desde cero. Leer en orden:

1. **Este documento** — objetivos, límites, prioridad, contexto y protocolo de inicio.
2. [Decisiones/ADR](../design/architecture-decisions.md) — políticas arquitectónicas y decisiones cerradas.
3. [Roadmap de implementación M0–M5](../design/implementation-roadmap.md) — entregables, orden, acceptance gates.
4. [Contratos de conectores v1](../contracts/source-connectors-v1.md), [JSON Schema](../contracts/source-envelope.v1.schema.json), [fixture INAMHI sintético](../contracts/examples/inamhi-warning83.fixture.json).
5. [Auditoría de fuentes](../research/auditoria-fuentes-alertas-2026-10-27.md) y [procedimiento de sonda](../runbooks/source-probe-staging.md).
6. [Replay del desastre Guayaquil](../research/guayaquil-2026-10-26-replay.md), [diseño WhatsApp por ciudad](../design/whatsapp-ciudades.md), [estrategia de descubrimiento por ciudad — nombre del canal nacional CONFIRMADO](../design/channel-discovery-proposal.md), [solicitudes institucionales redactadas, NO enviadas](../research/solicitudes-datos-inamhi-sngr.md).
7. [Plan maestro de producto](../design/aegis-multiamenaza-plan.md); [README del producto existente](../../README.md), \`package.json\`, \`sources.js\`, \`assessment.js\`, \`history.js\`, \`backend.js\`, \`public/app.js\`, tests existentes y archivo de despliegue.

**Jerarquía en caso de contradicción:** (A) este handoff y ADR; (B) roadmap; (C) contratos; (D) evidencia histórica/auditoría; (E) planes exploratorios anteriores; (F) código existente para su comportamiento actual. Ningún documento otorga licencia sobre datos de terceros ni permiso de publicar avisos reales.

## 2. Qué se quiere resolver (razón de ser)

Los ecuatorianos reciben boletines dispersos, a menudo PDFs difíciles de entender o encontrar, mientras una tormenta, crecida, deslizamiento o crisis energética afecta lugares concretos. AEGIS convertirá fuentes originales transparentes en avisos preventivos claros, fechados, territorialmente pertinentes y auditables. **No** sustituye INAMHI, SNGR, ECU 911 o autoridades; nunca inventa evacuaciones ni predice una calle inundada sin evidencia y validación.

El evento motivador fue la lluvia extrema de **Guayaquil del lunes 26/10/2026**. Boletín INAMHI N.º 83 oficialmente emitido **25/10 14:00**, vigencia desde **25/10 16:00 hasta 28/10 23:00**, mayor intensidad prevista días 26–27. Primera difusión periodística independiente detectada **25/10 18:01**, antes de lluvia muy intensa del 26 entre 13–15h. Hubo inundaciones de madrugada también: **no** afirmar que toda la inundación era anticipable con 23 horas ni que se conocía el barrio exacto. La hora de emisión oficial NO prueba la hora de subida a internet. Fuente primaria PDF mutable: https://www.inamhi.gob.ec/pronostico/advertencia.pdf ; no se ha demostrado su captura histórica. Tests anti-hindsight ya existen.

## 3. Resultado deseado

AEGIS será un **observatorio ciudadano open-source y gratuito en sus avisos esenciales**, una plataforma paraguas con:
- **Grid Sentinel (preservar):** energía nacional, Mazar/CENACE, ENSO, Pallatanga, estación local, dashboard existente.
- **Weather Sentinel (nuevo):** alertas meteorológicas, observación y pronóstico de lluvias/tormentas.
- **Flood Sentinel (nuevo):** inundaciones, ríos, mareas, susceptibilidad y pronósticos fluviales (sin confundir estas categorías).
- **Terrain Sentinel (nuevo):** laderas, deslizamientos y novedades viales, prudencia en precisión local.
- **AEGIS Alerts (transversal):** eventos, atribución y vigencia, geografía, evaluación, revisión, historial, enlaces y distribución opt-in.

**Pilotos:** Guayaquil (lluvia/inundación) y Pallatanga (lluvia/laderas/rutas). Interfaz pública accesible en móviles, baja transferencia de datos, enlaces compartibles e información legible en lugar de jerga institucional. Un ciudadano podrá elegir su cantón/zona sin domicilio exacto. Canales WhatsApp por ciudad, empezando por Guayaquil y Pallatanga; no se crean canales masivamente ni se asume que WhatsApp Channels entrega push (por defecto las notificaciones están silenciadas). PWA/web, RSS y portal como respaldo. La sesión WAHA de la línea pública de tuxevil es una **posibilidad futura**, no autorización de acceso/operación.

## 4. Infraestructura y código real a respetar

Repositorio Node >=22 ESM/Fastify 5, Chart.js, frontend vanilla, histórico persistente \`history.js\` en \`DATA_DIR\`, endpoint \`/api/status\`, \`sources.js\`, \`assessment.js\`, \`backend.js\`, docker/coolify. Despliegue del servidor local Proxmox en contenedores LXC; datos de clima Ambient Weather y una estación local ya alimentan algunas vistas. Existen otros servicios (Home Assistant Container en LXC, WAHA y automatización) pero **no deben acoplarse mediante secretos/IP privadas en el repositorio**. Este proyecto no depende de Home Assistant OS ni Supervisor.

El homelab off-grid es apropiado para laboratorio, sensores y pruebas; un servicio público de aviso de riesgos debe tener alojamiento externo redundante y recuperación ante falta de energía/internet. Mantener activos y tests de Grid Sentinel sin regresiones. No reescribir app completa, no sobreingeniería de base de datos al comienzo.

## 5. Estado técnico al entregar

**Existe y funciona en CI (offline):** replay determinista \`replay/engine.js\`, fixture \`replay/guayaquil-2026-10-26.json\`, \`scripts/replay-guayaquil.mjs\`, tests y workflow; sonda opt-in \`scripts/probe-aegis-sources.mjs\` con seis GET predefinidos, pruebas de mocks; contrato JSON Schema y prueba Python. Los workflows de replay y contratos pasaron en el PR anterior.

**No existe aún:** conectores operativos permanentes, ingestión archival verificable, corpus amplio positivo/negativo, motor de evaluación multiamenaza validado, polígonos INEC confirmados, permisos definitivos INAMHI/SNGR, fuentes calibradas por cuenca, integración de canales WhatsApp con AEGIS, PWA notificadora, centro editorial, alertas públicas o SLA. Un \`GET\` exitoso no equivale a validación operacional.

**Fuentes prioritarias para comenzar:** INAMHI PDF de avisos, SNGR REST inundaciones/multiamenazas, Open-Meteo Single Runs para pronósticos históricos. GEOGLOWS (datos CC BY 4.0), INOCAR, SNGR incidentes, INAMHI estaciones, NASA LHASA en fases posteriores. **Open-Meteo Free es de uso no comercial**; patrocinios/anuncios o servicios comerciales requieren reevaluar acceso. La fuente SNGR de inundaciones limita registros a 2000 y no soporta paginación; MULTIAMENAZAS soporta paginación; EPSG:32717; campos y URLs en contrato. Algunas capas del INEC MGN2026 son líneas, no polígonos. Un boletín INAMHI específico para Pallatanga enlazado en octubre 2026 está fechado mayo 2025: riesgo real de \`stale\`.

## 6. Requisitos no negociables

- **No enviar alertas** ni activar publicaciones sin aprobación explícita futura. Interruptor global \`ALERTS_PUBLISH_ENABLED=false\` por defecto cuando exista; \`DRY_RUN\` en replay, outbox, WAHA y notificaciones durante fases M0–M4.
- **No crear canales WhatsApp ni tocar la sesión pública tuxevil** durante diagnóstico o desarrollo inicial. WAHA queda como adaptador sustituible y mockeable, revisión de compatibilidad/ToS antes de actividad real.
- **No confundir emisión, disponibilidad, descarga, validez, observación, corrida de modelo o difusión.** Timestamps en UTC con origen local preservado; almacenar bytes/hashes de manera inmutable cuando legal.
- **No confundir susceptibilidad estática con predicción dinámica**, geografía provincial con barrio, \`null\` con cero, falta de datos con riesgo bajo, confidence-in-evidence con probabilidad de ocurrencia, ni AEGIS con autoridades oficiales.
- No redistribuir masivamente documentos/capas con licencia \`pending\`; solicitar aclaración institucional según los borradores existentes. No inventar respuesta/autorización.
- Código MIT ≠ datos de dominio público; finanzas futuras: alertas ciudadanas gratis, comercialización separada/licenciada.
- Calidad de software: fallos parciales por fuente, retries/backoff/circuit breaker, safe HTTP GET, rate limits, sin SSRF ni exposición de sesiones, pruebas documentadas, accesibilidad móvil, fuente y fecha visibles, auditoría y corrección.
- Agente puede operar y crear código en rama dev sin consultar por cada paso rutinario, pero debe solicitar autorización específica antes de envío externo público, creación de canales, cambios irreversibles a producción, uso de WhatsApp real, pago o contacto institucional.

### Marca pública, descubrimiento por ciudad (nueva propuesta, no definitiva)

La marca **AEGIS** se conserva para código, OSS y motor. **Estado comunicado por el propietario:** ya creó manualmente **«OpenAlert - Ecuador»** y **«OpenAlert - Guayaquil»**, proporcionó ambos enlaces públicos de invitación y publicó una pregunta abierta sobre ciudades en el nacional. **Directorio machine-readable:** [openalert-channels.json](../design/openalert-channels.json). Se propone `OpenAlert - [Ciudad]` para expansión posterior, pero el nombre comercial general del portal no está decidido. «Alertas Ecuador» ya identifica un portal oficial de la SNGR; evitar confusión y suplantación. Existen terceros que usan el nombre OpenAlert (IoT, interoperabilidad de emergencia, Nostr), así que no se debe suponer exclusividad de marca o dominio. Además, se propuso **un canal nacional inicial con encuesta/pregunta manual en WhatsApp y selector web por DPA** para medir demanda de otras ciudades antes de crear canales locales. WhatsApp admite encuestas/preguntas en canales, pero WAHA documenta `sendPoll` a canales como no soportado; no prometer automatización. El nuevo plan de descubrimiento se encuentra en [channel-discovery-proposal](../design/channel-discovery-proposal.md). Codex puede preparar selector/analítica agregada con mocks y textos de ejemplo usando los nombres y URLs definitivas. No confundir URL de invitación de WhatsApp con el `@newsletter` JID requerido por WAHA. **No crear canales adicionales, publicar avisos ni renombrar sistemas de producción sin aprobación operativa.**

### Amaru: integración de tercero en evaluación, no autorización de uso operativo

El propietario descubrió **Amaru** (https://amaruapp.com), proveedor que ya ofrece mapas de riesgo, alertas por zona, reportes ciudadanos y análisis Mazar; solicitó una **API key gratuita Dev** para explorar su utilidad. **No incluir esa credencial en código, GitHub, ejemplos ni logs, ni pedir que vuelva a enviarla por chat.** Documentación investigada: [evaluación API Amaru](../research/amaru-api-evaluation-2026-10-27.md); sonda opt-in de una sola petición: `scripts/probe-amaru.mjs`, con `AMARU_API_KEY` almacenada en variable de entorno privada. El entorno de investigación no pudo conectar DNS desde terminal; endpoint anónimo devolvió 401, **en ese primer intento no se verificó una consulta autenticada**; la muestra posterior confirmada por el operador se registra en la nota de actualización siguiente. Plan Dev anunciado: **200 llamadas/mes** y solo índice/nivel de riesgo + clima, sin factores/ríos/reportes ni webhooks. Por ahora investigar y evaluar **como señal de riesgo de tercero complementaria**, NO reemplazar fuentes oficiales ni asumir acceso gratis continuo o licencia de redistribución. El cambio estratégico a considerar es construir sobre fuentes existentes donde sea apropiado, dando a AEGIS/OpenAlert diferenciación en capturas de boletines, historial versionado y difusión territorial. No incorporar Amaru al pipeline de alertas hasta demostrar datos, permisos y disponibilidad.

### Nota de actualización: Amaru, fuentes abiertas y comunidad

El usuario confirmó una consulta válida a Amaru Dev el 27/10/2026 20:19:56 UTC para Guayaquil: HTTP 200, índice 60 (etiqueta propia «Alerta»), 29.6 °C y 0.6 mm/h. El error inicial fue probablemente un falso positivo del script ante un campo `error` presente con valor no comprobado. Amaru es fuente externa complementaria, no ground truth, sin factores explicativos en plan Dev. No gastar más cuota sin motivo ni insertar clave en el código.

La nueva diferenciación estratégica para AEGIS es **apertura comprobable**, colaboración mediante issues/PR, reglas de evaluación reproducibles y benchmarking con datos positivos y negativos. Leer [comparación técnica](../research/amaru-methodology-open-sources-2026-10-27.md), [diseño de colaboración](../design/open-source-collaboration.md) y [CONTRIBUTING](../../CONTRIBUTING.md). No clonar ni extraer código privado ni datos Premium de Amaru. El roadmap conserva fases M0–M5 y publicación en dry-run hasta aprobación.

## 7. Qué debe hacer Codex AL COMENZAR (M0)

1. Validar que está en repo/branch esperado; revisar \`git status\` y prevenir pérdida de cambios locales. Si no existe la rama de investigación local, traerla/fetch; no asumir que el handoff está en \`main\`.
2. Leer documentos en el orden indicado y hacer resumen de entendimiento con hallazgos/decisiones **sin rediseñar**.
3. Ejecutar \`npm ci\`, \`npm run check\`, \`npm test\` y workflows relevantes; registrar baseline sin cambios. No reportar resultados inventados.
4. Validar fuente por fuente con \`scripts/probe-aegis-sources.mjs --live\` **únicamente en staging/laboratorio con salida a internet y permisos**, siguiendo runbook. Si conexión bloqueada o licencia dudosa, documentar y seguir con mocks. **No** sondear producción o proveedor agresivamente.
5. Crear \`docs/research/source-validation-results.md\` con fecha/URL/evidencia/resultados reales, brechas, conclusiones; no revelar secretos/credenciales.
6. Preparar e implementar M1 después de M0, en cambio incremental y probado; seguir [roadmap](../design/implementation-roadmap.md). Al terminar cada hito, informar commits, tests, evidencia, próximos pasos y gates externos.

El trabajo está autorizado para arrancar **hasta y durante M0–M4 en modo sombra/dry-run**, progresando de forma incremental según validaciones, no para publicar en M5. Se permite al agente tomar decisiones técnicas menores si respeta las ADR y deja justificación escrita. No esperar confirmación para cada prueba segura; no introducir credenciales faltantes como requisito.

## 8. Qué esperamos como primer resultado de Codex

Una auditoría ejecutada en entorno real: qué endpoints funcionan, qué devuelven, con qué timestamps, límites/licencias y fallos. Baseline del repo sin regresiones y propuesta detallada del primer adaptador INAMHI con tests. Aunque ninguna fuente funcione, entregar estado \`BLOCKED_EXTERNAL\` fundamentado y seguir con fixtures claramente sintéticos.

**Cierre de planificación:** APROBADO para implementación incremental. **Cierre de seguridad/operación de alertas:** PENDIENTE y separado; nunca deducir permiso de este handoff.
