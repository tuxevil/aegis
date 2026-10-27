# AEGIS como plataforma abierta y verificable — diseño de colaboración

**Estado:** alcance propuesto para la implementación de Codex, 27-10-2026. El usuario reafirmó que AEGIS debe **diferenciarse por open source, colaboración y reparabilidad**, no intentar clonar una app cerrada ni hacer gatekeeping del conocimiento. Consultar [investigación de metodología pública Amaru](../research/amaru-methodology-open-sources-2026-10-27.md).

## North star
**Cualquiera puede identificar una fuente, comprobar una advertencia, reproducir un resultado y proponer una corrección.** La confianza procede de evidencias fechadas, contratos comprobables, gobernanza de cambios y trazabilidad; no del nombre de la marca, ni de presentar heurísticas como probabilidades.

Open source no implica que cualquier pull request se despliegue inmediatamente en un sistema de avisos de riesgo. El modelo es abierto **con puertas de calidad y revisión editorial**, manteniendo neutralidad institucional.

## Arquitectura objetivo: cuatro interfaces estables

1. **SourceAdapter**. \`id\`, \`supports\`, \`license\`, \`fetch({since,area,signal})\`, \`health()\`, \`sourceTermsUrl\`. Devuelve artefactos crudos, hash y timestamps distintos (edición/publicación/captura), estado \`error/stale/unknown\` explícito. HTTP controlado/allowlist, timeouts/cuota y pruebas sin red.
2. **Normalizer**. \`normalize(raw,sourceVersion)\` produce [envelope v1](../contracts/source-envelope.v1.schema.json), con geografía/escala, valores nulos y advertencias de calidad. Las fuentes sintéticas no pueden promocionarse a observaciones. El normalizador NO publica.
3. **HazardAssessor**. \`assess({territory,asOf,snapshotIds,policyVersion})\` devuelve \`candidate\` interno: \`assessmentId\`, \`ruleVersion\`, \`sourceSnapshots[]\`, \`reasonCodes[]\`, \`missingEvidence[]\`, \`areaPrecision\`, \`effective/expired\`, \`sourceSeverity\`, \`editorialSeverity\`, \`outcome=watch|prepare|unknown\`. Cada regla aislada, documentada, testeada y reproducible offline, sin exigir PR para tipos ajenos.
4. **NotificationTransport**. \`plan(candidate,registry)\` genera outbox revisable/dry-run. \`deliver(approved)\` solo cuando autorizado en servicio productivo, con kill switch, expiración, idempotencia y auditoría. Inicialmente ningún transporte real; separar canales WhatsApp de preferencias Web Push/RSS.

El contrato no obliga a construir cuatro runtimes/microservicios: pueden ser módulos JS ESM dentro del actual Fastify/Node, separados por test/inyección de dependencias, para no consumir recursos excesivos en el homelab.

## Ecosistema de contribución

**Primeras cuatro contribuciones fáciles (good first issue):**
- Corregir fecha/hora/vigencia y cambios de un boletín oficial a partir de un fixture **legalmente compartible**.
- Añadir metadatos de una fuente pública regional/cantonal mediante formulario reproducible y enlace a términos.
- Reportar un error de región, DPA, CRS, unidades o frescura con casos «actual»/«esperado», timestamps y fuente, **sin domicilios ni información personal**.
- Añadir un día histórico etiquetado con fuente oficial y *negative controls*, sin test que acceda a red ni cambiar pesos de modelo automáticamente.

**Contribuciones avanzadas:**
- Adaptadores y parsers con mocks, snapshots, límites y pruebas de corrupción.
- Propuesta de método \`HazardAssessor\`, con benchmark reproducible y análisis de falsas alarmas/casos fallidos, documentación de incertidumbre y aprobación editorial previa a uso externo.
- Traducción y accesibilidad, mejoras de UX móvil, reportes de cobertura sin números telefónicos, optimización de energía/carga.
- Complementos opcionales Amaru/Google/GEOGLOWS si API y licencias permiten; nunca dependencia de APIs pagadas para ejecutar los tests públicos.

**Flujo de PR**:
1. Issue y evidencia verificable (link original, fecha, ubicación administrativa, tipo de problema, permisología).
2. Rama corta y cambios acotados, pruebas unitarias/offline y replay positivo/negativo.
3. CI y checklist: \`npm run check\`, \`npm test\`, schemas, no secret scanning failures, tests sin red/wa, docs, no regresión Grid Sentinel.
4. Revisión de dos aspectos: *exactitud del dominio* (fuente, cronología, geografía) y *seguridad técnica* (código, rendimiento, URLs, seguridad/privacidad).
5. Merge autorizado, versionado, notas de cambio, **sin** activar publicación externa. Proceso de aprobación editorial y despliegue independientes del merge.

**¿Cómo medir apertura de verdad?**
- Tiempo hasta la primera respuesta y resolución por issue.
- Porcentaje de issues con reproducción e información suficiente.
- Número de contribuyentes y fuentes fuera del autor (con consentimiento), no «más PRs = más calidad».
- Tiempo desde aviso oficial hasta captura comprobada; retrasos y errores de cobertura.
- Benchmark público y changelog de reglas; comparativas antes/después.
- Errores reportados por ciudadanos corregidos con evidencia, sin divulgar datos personales.

## Datos y privacidad por diseño

- Código MIT existente; cada dataset documenta licencias y restricciones; scripts/test data distribuibles con derechos verificables. Open-Meteo código AGPLv3: **no incorporar código suyo a MIT sin analizar compatibilidad/licencia**, y su API gratis no permite usos comerciales. CC BY datos requiere atribución. Los términos RainViewer/Google Flood también deben evaluarse.
- Fuente/territorio son públicos; ubicación exacta de persona/telefono de WhatsApp, credenciales/URLs con token y fotos de hogares **no se aceptan como ejemplos de issues públicos**.
- Reporte ciudadano en fase posterior: moderación, no doxxing, límites, opt-in, atribución y consentimiento. Un reporte aislado no implica incidente corroborado.
- Permitir a la comunidad **proponer** reglas; no delegar de forma automática la aprobación de avisos, rotación de claves, accesos HA/WAHA, tareas de CI privilegiadas ni contenido que difunda peligro sin evidencia.

## Archivo histórico abierto + corpus de evaluación
Fichas de cada caso:
- \`caseId\`, \`phenomenon\`, \`territoryDpaCode\`, \`timeRange\`, \`firstEvidenceAvailableAt\`, \`cutoffs[]\`, \`historicalDocuments[]\`, \`hindsightOnly[]\`, \`eventLabel\`, \`labelSource\`, \`license\`, \`confidence\`, \`caveats\`.
- Incluir casos positivos, negativos y fuentes caídas; evitar probar solo el 26/10 en Guayaquil.
- Ingesta reproducible contra fixtures inmutables; no conectarse a proveedores externos en CI.
- Métricas por amenaza/región: falsos positivos, falsos negativos, detección/anticipación, alert fatigue, latencia de fuentes, calidad geográfica y tasa de cobertura, reportando denominadores y rangos de incertidumbre cuando sea posible.
- Método de predicción debe ser **independiente del benchmark**; no usar reportes publicados después como datos de entrada en el replay.
- **Amaru no es ground truth**: índice 60 «Alerta» es resultado de su modelo de pago/Dev y no se trata como evento observado.

## Qué cambia en Codex

**M0 (inmediato):** documentar muestras y errores verificados de proveedores, preparar CONTRIBUTING e issue templates. No rediseñar AEGIS entero, no implantar decenas de categorías desde el comienzo.

**M1:** un plugin adapter operativo con las mismas pruebas que terceros deben usar. Publicar contrato y plantilla de contribución.

**M2:** documentación legible del origen de cada indicador, link a código y fecha de última captura; página web con contribución/reportar problemas (enlazar GitHub, no abrir formulario inseguro de reportes con datos sensibles).

**M3:** motor de reglas transparente con benchmark independiente y archivos replay. Propuesta de cambios de reglas incluye informe comparativo de tasa de errores, no solamente score agregado.

**M4:** proceso editorial, outbox e integración de canales en dry-run; operadores verifican alertas antes de distribución.

**M5:** no autorizado; controles de emisión, SLO, seguridad, capacidad editorial, licencias y revisión humana antes de lanzamiento.

## Límites del uso de material de terceros
Investigar características y metodología pública es lícito en términos generales, pero licencias y condiciones de acceso concreto importan. No copiar código privado ni fórmulas protegidas obtenidas mediante bypass; no capturar datos Premium desde frontend no autorizado; no usar la API de Amaru 200/mes como si fuera feed público infinito; no republicar marcas/logos/textos del proveedor. Es preferible hablar con el equipo de Amaru si la integración mutua puede ser beneficiosa.

## Decisiones operativas abiertas
- Política exacta de aceptación de contribuyentes externos y revisores (inicialmente mantenedor único con proceso transparente, no afirmar comunidad consolidada).
- Primer release/tag y versionado semántico para APIs/contratos: proponer tras módulo M1.
- Licencia de corpus histórico por pieza; datos oficiales pueden tener restricciones no resueltas.
- Uso comercial/patrocinios y condiciones de proveedores, mantener gratuidad para avisos ciudadanos.
