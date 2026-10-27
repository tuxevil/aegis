# AEGIS Multiamenaza — plan de ejecución para Codex

Fecha: 2026-10-27. Handoff normativo: [START_HERE_CODEX](../handoff/START_HERE_CODEX.md).
**Punto de partida:** proyecto existente v4 Node/Fastify/ESM, interfaz energía/Pallatanga operativa. Rama preexistente \`feature/guayaquil-replay-whatsapp\`, PR #23 en borrador, con replay offline, contratos y sondas READ ONLY. **No** está desplegado el sistema de alertas.

## Orden y entregas incrementales

Se diseñaron 6 hitos con alcance y criterios de salida. Codex puede iniciar inmediatamente M0 sin preguntas ni secretos. Antes de pasar a cada hito deberá ejecutar tests, reportar evidencia, limitaciones y enlazar commits/PR. **Los gates externos no requieren bloquear la investigación/implementación anterior al gate.** No realizar acciones públicas irreversible sin aprobación explícita.

### M0 — Auditoría ejecutable de fuentes (primer encargo)

**Objetivo:** pasar de documentación a pruebas HTTP de solo lectura en entorno de desarrollo/staging.

1. Revisar \`README.md\`, ADR, contrato v1, auditoría y runbook. Ejecutar \`npm ci\`, \`npm run check\`, \`npm test\`. No romper Grid Sentinel.
2. Ejecutar sondas \`node scripts/probe-aegis-sources.mjs --live --out=...\` **solo desde entorno de desarrollo/staging autorizado, nunca en producción**; confirmar DNS, reloj UTC, metadatos y respuestas. No convertir un resultado \`reachable\` en estado operacional.
3. Diagnosticar con capturas sanitizadas: PDF INAMHI \`%PDF-\`, \`issuedAt\`/vigencia/n.º 83 si sigue disponible; SNGR FeatureServer y MapServer con una entidad sin geometría; Open-Meteo Single Runs de fecha histórica y modelo identificado. Medir GET status, \`Content-Type\`, límites, ETag, redirecciones, latencia, 429 y cambios.
4. Crear matriz \`docs/research/source-validation-results.md\` con estado, fecha y evidencia concreta por fuente; **no commitear material licenciado/sensible ni valores de API keys**.
5. Testear fallos desde mocks: HTML disfrazado de PDF, JSON error HTTP 200, timeout, datos viejos, límite 2000, modelo sin ID, source not found, reloj incoherente.
6. Investigar si pruebas HTTP cumplen condiciones de uso de proveedor. Si 403/429 no intentar eludir restricciones.

**Aceptación:** reportes de respuesta reales o bloqueo reproducible documentado; tests green; \`ALERTS_PUBLISH_ENABLED=false\`; cero publicaciones. Si un servicio falla, mostrar fallback y continuar con el resto de manera independiente.

### M1 — Capa de ingesta, archivo y normalización

**Objetivo:** transformar bytes fuente en registros auditablemente versionados.

- Adaptadores \`InamhiPdfAdapter\`, \`SngrArcgisAdapter\`, \`OpenMeteoSingleRunsAdapter\` con aislamiento HTTP y pruebas contractuales; no atar directamente endpoints al front.
- \`SourceRegistry\` con URL allowlist, método GET, polling opt-in, owner, estado de licencia, métricas de salud, TTL y políticas por fuente.
- \`RawArtifactStore\` con bytes content-addressed \`sha256\`, índice y timestamps de cada captura (que pueden repetirse sin cambios), versioning, retención configurable y migración; persistencia bajo \`DATA_DIR\` con volumen en Coolify.
- Validación JSON Schema del envelope y validaciones discriminadas por \`kind\`. Parseo de texto y metadatos no autoriza geometría precisa. \`recordOrigin=synthetic_fixture\` nunca se mezcla con capturas.
- \`source_health\` con \`healthy/degraded/stale/unknown\` y ejemplos de errores; preservar HTTP response timing, no ocultar faltantes bajo \`0\`.
- Antes de cambio estructural grande: diseño breve e interfaces. Elegir librerías mínimas, no reescribir \`history.js\` actual.

**Aceptación:** una fuente funciona de extremo a extremo con artefacto crudo persistido, hash, corrección de fechas, versiones, estados de fallos, tests positivos/negativos y rollback. Salida sigue siendo **solo consulta**, sin avisos.

### M2 — Modelo territorial y explorador público de fuentes

- Registrar ciudades piloto y códigos DPA del INEC, con límites y versiones **validados**. No usar \`limite_cantonal\` líneas ArcGIS como polígonos.
- Normalizar capas SNGR en EPSG:4326 sin perder dato original EPSG:32717 ni versión/escala. Cubrir errores \`exceededTransferLimit\` y APIs con/sin paginación.
- Incorporar en navegación actual un módulo de amenazas (sin reemplazar Grid Sentinel) con fuentes, fechas, alcance provincial/cantonal, advertencia de cobertura limitada y mapa sencillo si datos realmente disponibles.
- Vista geográfica NO debe colorear sectores de una ciudad como «se inundarán» a partir de susceptibilidad estática.
- Proponer endpoints read-only (ajustar si colisionan con rutas actuales): \`GET /api/hazards/sources\`, \`GET /api/hazards/areas\`, \`GET /api/hazards/observations\`, \`GET /api/hazards/bulletins\`, \`GET /api/hazards/health\`. Paginados, filtrados, rate-limited, semántica de \`stale\`; nunca secretos.
- Si falla SNGR, exponer enlaces a documentos/estado \`unknown\`, sin mostrar falsa seguridad.

**Aceptación:** consulta Guayaquil/Pallatanga funciona con procedencia verificable y tests de CRS, límites, contenido faltante. Portal responde accesible y responsive; energía intacta.

### M3 — Evaluación en sombra y replay histórico

- Integrar corpus histórico con procedencia, al menos fechas 21–27/10/2026 y muestras sin incidentes si están disponibles; no inventar las que falten.
- \`replayCase\` se mantiene determinista, sin futuro. Model runs incluyen momento UTC de inicialización y disponibilidad verificable (o margen estimado anotado).
- Motor \`assessHazard\` modular por fenómeno y territorio. Genera **candidatos internos**, no alertas públicas: source refs, razones, limitaciones, vigencia, calidad, severidad editorial propuesta y recomendaciones referenciadas.
- Salidas comparables con boletines originales y reportes de impacto posteriores; métricas del corpus: \`leadTime\`, \`falseAlertRate\`, \`missRate\`, \`sourceDetectionLag\`, cobertura y eventos sin evidencia; no calcular «probabilidad de inundación» con muestras escasas.
- Distinción clases: OFFICIAL/OBSERVATION/FORECAST/AEGIS_ASSESSMENT. Una publicación periodística posterior no puede insertarse antes de su timestamp en replay.

**Aceptación:** prueba de no filtración de datos futuros, correcciones, cronología reproducible, reportes de falsos positivos/negativos y límites del corpus.

### M4 — Centro editorial, suscripciones y outbox en simulación

- API/admin autenticada para revisión de candidatos, notas, aprobación, corrección, expiración y retractación con auditoría y roles mínimos. No incluir API keys privadas en cliente.
- Registry \`CityChannel\`: ciudad/ID DPA/versión geométrica, \`channelId @newsletter\`, \`inviteUrl\`, estado propuesto/verificado/pausado, rol OWNER comprobado manualmente.
- Motor de suscripciones por zona para web/PWA y enlace de seguimiento WhatsApp; **no recoger domicilios si basta cantón**, no almacenar listados de números para alertas masivas.
- \`Outbox\` durable con idempotencia \`alertId:revision:cityId:channelId\`, dedupe, expiración, reintentos y dead-letter; capacidades por transporte sin disparos reales. Mock WAHA + RSS + pruebas PWA.
- Templates en español que distingan emisión y difusión, autoridad, ubicación, validez, enlace original, incertidumbre y disclaimer. Prueba editorial humana incluso si el dato es oficial; no órdenes propias.

**Aceptación:** extremo a extremo \`ingest → candidate → human review → DRY_RUN outbox\`, rectificación/expiración sin duplicación, tests y métricas. \`ALERTS_PUBLISH_ENABLED=false\` siempre.

### M5 — Beta limitada controlada (NO autorizada automáticamente por este documento)

- Diseñar despliegue público redundante y restauración ante cortes, observabilidad y límites de abuso. Revisar LOPDP y licencias; resolver permisos de retransmisión.
- Validar WAHA real (motor, roles OWNER, riesgos de cuenta, política Meta) **solo cuando el propietario autorice explícitamente operar con su sesión**. Inicialmente canal de prueba o publicación manual sin contenido alarmante, con aprobación humana.
- Activar solo las fuentes y ciudades verificadas. Suscripción voluntaria, guía campana WhatsApp, redundancia con portal y web push. Métricas de entrega únicamente si plataforma las expone de manera legítima.
- Runbook de incidentes: fuente caída, API malformada, rectificación, canal suspendido, suspensión total \`kill switch\`, responsabilidad editorial. Simulacros antes de tráfico ciudadano.
- No habilitar inferencias automáticas de evacuación ni alertas en tiempo real sin evidencia científica y protocolos institucionales.

**Aceptación para proponer salida pública:** fuente y permiso verificados, niveles y geografía auditados, pruebas con incidentes/no-incidentes, aprobaciones de operador, publicación y retractación ensayadas, seguridad probada, redundancia funcional. Solicitar aprobación expresa separada para creación de canales y para cualquier envío real.

## Criterio transversal: código abierto que acepte contribuciones

Además de ingesta/avisos, AEGIS debe ofrecer **reglas inspeccionables, ejemplos reproducibles y un proceso sencillo de correcciones de terceros**, no solo publicar el código. Seguir [open-source-collaboration.md](open-source-collaboration.md) y [amaru-methodology-open-sources-2026-10-27.md](../research/amaru-methodology-open-sources-2026-10-27.md).

**M0:** incluir resultados de Amaru como comparación de proveedor, nunca verdad-terreno; respetar 200 llamadas/mes. Revisar licencias de Google Flood (API piloto), RainViewer (restricciones actuales), MET Norway y Open-Meteo. La sonda Dev para Guayaquil ya devolvió una muestra válida, por lo que no repetir consultas solo por confirmación.

**M1:** construir el primer conector con contrato probado y un ejemplo para futuros colaboradores.

**M2:** exponer fuentes, fechas, atribuciones, limitaciones y enlaces a código y proceso de reporte de errores.

**M3:** motor `HazardAssessor` versionado con razones de salida y conjunto de validación público, positivos y negativos; comparar antes/después con métricas de falsos avisos y omisiones.

**M4:** revisión editorial protegida: que alguien pueda proponer una corrección no le da permiso a publicar avisos ni acceder a WAHA.

## Reglas para iteraciones de Codex

1. **No hacer merge a \`main\` ni desplegar sin autorización.** Trabajo en rama de feature y PR. Un PR draft puede acumular la preparación; código nuevo preferiblemente en ramas nuevas respecto a la planificación según flujo local.
2. Cada hito tiene tests unitarios, integrados con mocks/fuentes reales etiquetados; documentación, changelog, degradación y resultados verificables.
3. Mantener \`npm run check\` y \`npm test\`; los workflows existentes de replay y contratos deben continuar pasando.
4. Evitar romper endpoints de energía o publicar identificadores privados de sensores; nada de SSRF, scraping agresivo ni rutas de backend sin auth.
5. Si aparecen incompatibilidades con fuentes, registrar \`BLOCKED_EXTERNAL\` y continuar con un stub/mocks **claramente marcados**, no fabricar un dato exitoso.
6. No poner fechas/horas de backtest inferidas en el campo \`availabilityVerifiedAt\`.
7. No emitir mensajes en canales de terceros, cuentas de tuxevil ni grupos privados sin aprobación expresa.
8. El código no se considera aprobado para avisos públicos solo porque CI esté verde.

## Definición de finalización de la planificación

**Listo para arrancar desarrollo M0:** Sí, tras leer [hand-off](../handoff/START_HERE_CODEX.md), [ADRs](architecture-decisions.md), [contrato](../contracts/source-connectors-v1.md) y [runbook](../runbooks/source-probe-staging.md). **Listo para operar alertas públicas:** No; los gates son parte de fases futuras.
