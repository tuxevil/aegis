# AEGIS 5.0 — Technical design / ADR-001

Estado: diseño propuesto, sin cambios de runtime. Fecha: 2026-10-21.
Regla: evolución incremental sobre main v4; compatibilidad del dashboard y de sus endpoints existentes.

## 1. Arquitectura elegida

Monolito modular Node >=22 + Fastify, frontend JS/CSS existente, servicios de ingestión como módulos y jobs limitados (en el mismo despliegue o worker independiente si la carga lo exige). No incorporar un framework UI pesado por defecto.

Diagrama de flujo:

~~~text
CELEC/CENACE (v4) ----------------------> observaciones energéticas / status v4
Distribuidoras (PDF/HTML) -> ingestors -> fuentes versionadas -> horarios normalizados
Prensa/OSINT habilitado --> ingestors -> documentos/enlaces ------> evidencias
Ciudadanos --------------> POST reports -> moderación/antispam --> evidencias
Sensores voluntarios (futuro) -------------------------------> evidencias
                                                     |
                                           correlación reproducible
                                                     |
                                          eventos + cambios + audit
                                                     |
                                  SQLite / backups / retención
                                            |             |
                                   API pública v1    scheduler / outbox
                                            |             |
                                      mapa / timeline   Web Push opt-in
~~~

- Separar la ingesta de fuentes y el API web para que el fallo de un parser no interrumpa el dashboard.
- Idempotencia, reintentos acotados con backoff, límites de origen, circuit breakers, métricas de fallos.
- Credenciales de servicios, llaves VAPID y secretos fuera del repo. Nunca incluir payloads sensibles en logs.
- Las solicitudes externas nunca se ejecutan sobre URLs suministradas por ciudadanos (prevenir SSRF); conectores usan allowlist explícita.
- Datos simulados y fixtures identificados con entorno y marcado visible, nunca mezclar con producción.

## 2. Persistencia

MVP: SQLite con WAL, transacciones, migraciones versionadas, claves foráneas, índices por tiempo, zona y estado. Evaluar driver Node 22 compatible y pruebas en contenedor; no elegir una dependencia nueva por moda. Establecer DB_DIR persistente con copias de seguridad verificables. No sobreescribir el JSON v4 hasta respaldarlo y verificar una migración reversible.

**Modelo lógico** (nombres orientativos; documentar cambios en PR):
- geo_areas: id, INEC/code si existe, nombre, padre, tipo, polygon_version/ref, bounding_box y nivel de resolución.
- sources: id, kind (authority/news/social/citizen/sensor), name, official boolean, source_url, access_policy, enabled.
- source_artifacts: id, source_id, URL canónica, fecha_publicación declarada, fetched_at UTC, sha256, media_type, stored_ref, parse_version, extraction_status, provenance.
- observations: id, source_artifact_id nullable, source_id, kind, summary textual sanitizado, occurred_at declarado nullable, observed_at, ingested_at, temporal_confidence, location_precision, raw_ref controlado, moderation_state.
- outage_events: id, type (scheduled/unplanned/unknown), status (reported/corroborated/official/ended/unknown), area_id o geometría generalizada, start_at y end_at nullable, start_basis/end_basis, last_evidence_at, confidence_explanation, created_at/updated_at.
- event_evidence: event_id, observation_id, relation (support/refute/retraction), match_reason, human_reviewed; pares únicos idempotentes.
- schedule_entries: id, issuer, area_id, start_at UTC, end_at UTC, original_zone/time_string, type, extracted_from_artifact_id, parser_confidence, review_state, effective_status (published/revised/cancelled/unverified).
- schedule_revisions: entry/group id, revision_no, predecessor/successor, artifact_id, imported_at, diff_fields, review_state. No borrar la versión anterior.
- citizen_reports: report_id, observation_id, area_id, client_declaration, server_received_at, optional started_at declared, receipt_token_hash, status/correction_chain, moderation_state. Token en claro solo al creador; retención prudente.
- subscriptions: id seudónimo, management_secret_hash, created_at, revoked_at, preferences; subscription_areas: subscription_id + area_id + alias opcional.
- push_endpoints: id, subscription_id, endpoint/keys cifrados en reposo o protegidos a nivel de volumen/servidor; last_success, failure_count, revoked_at; jamás exponer endpoint/keys en API pública.
- notification_outbox: id, subscription_id, event_key (dedupe), title, body, evidence_uri, scheduled_at, sent_at, delivery_status/error_code; TTL y límites de volumen.
- audit_actions: actor_kind, item_type/id, change_json con campos no sensibles, timestamp; versionado / correcciones reproducibles.

Evolución posterior: Postgres/PostGIS al aumentar geografía, concurrencia o análisis espacial. No migrar anticipadamente sin métricas. Los polígonos y límites geográficos deben utilizar datos con licencia comprobada.

**Tiempo/espacio:** fechas en UTC ISO y zona America/Guayaquil para interpretar entradas y presentar horarios; no eliminar offset al guardar. Distinguir source_published_at, observed_at, reported_start_at, ingested_at y resolved_at. No fingir que un reporte tardío llegó durante el corte. Geografía por área semántica y precisión; coordenada de hogar NO pública.

## 3. Interrupciones: correlación y estados

Pipeline determinista primero; LLM opcional solo para sugerir extracción/clasificación, sin conferir certeza por sí mismo.

1. Normalizar texto y origen; detectar URLs canónicas y hashes; eliminar reposts/copias como fuentes independientes.
2. Extraer candidatos de lugar/fecha/tipo de problema; conservar evidencia textual y enlace; fechas ambiguas a revisión.
3. Unir por intersección de áreas administrativas, ventanas temporales compatibles y señales semánticas; no fusionar automáticamente eventos incompatibles (sectores vecinos o distinta causa).
4. Ciudadanos y redes producen estado «reportado». Fuentes distintas corroborantes pueden dar «corroborado», sin elevar a «oficial» a menos que exista comunicado de autoridad/distribuidora con ámbito y vigencia.
5. Reposición: registrar quién confirmó y a qué sectores alcanza; no deducir end_at del silencio de reportes, un timer o una publicación general.
6. Retractaciones, correcciones y disputas: adjuntar evidencia, recalcular estado y preservar versiones/auditoría.

«No observado», «sin información», «confirmado sin corte» son estados diferentes. Ningún pixel del mapa afirma cobertura total donde no existe.

## 4. Cronogramas oficiales y cambio de PDFs

Modelo de ingesta basado en adaptadores por distribuidora; aceptar PDF, HTML y datos estructurados si están permitidos. El formato puede variar por período.
- Registrar documento descargado con URL, sha256, fetched_at y published_at original; conservar versiones y atribución.
- Extraer tablas con parsers específicos y fixtures reales con permiso de acceso; OCR solo si necesario, con score y revisión manual antes de avisos.
- Resolver nombres de barrio/sector a geo_areas con aliases versionados; cuando sean ambiguos, marcar unresolved y NO enviar alertas de ese sector.
- Comparar conjuntos por proveedor + fecha + bloque/sector + circuito + horas; idempotencia por hash y versión.
- Notificar altas/cambios confirmados; **la ausencia de una fila en un documento nuevo NO implica cancelación** sin indicación autoritativa de reemplazo/cancelación o revisión humana.
- Discriminar programación residencial, trabajos de mantenimiento y medidas de alto/medio voltaje; jamás etiquetar industrial como corte residencial.
- Cambios de horas: notificación «antes → ahora» con enlace directo al documento versionado y momento de extracción. Aviso anticipado: fecha/horario únicamente si oficialmente publicado y vigente.
- Si el fetch falla, mostrar fuente desactualizada en UI sin declarar cronograma cancelado.

## 5. API / seguridad / compatibilidad

No cambiar el contrato de GET /api/status, /api/dams, /api/weather, /api/cenace, /api/enso ni /api/forecast.
Actualmente backend.js niega /api/* remoto salvo /api/status con Origin/Referer; esto NO es autenticación. Crear autorización de rutas explícita por diseño:
- GET /api/v1/areas?q=, GET /api/v1/outages?bbox=&from=&to=&layer=, GET /api/v1/events/:id y /evidence, GET /api/v1/schedules?area_id=&from=&to=, GET /api/v1/timeline?..., GET /api/v1/health/public (todos solo campos públicos y paginación/limits).
- POST /api/v1/reports y PATCH /api/v1/reports/:id con secreto de recibo + controles anti-abuso; GET de reportes individuales solo sanitizado, sin recibos.
- POST /api/v1/subscriptions; PATCH/DELETE /api/v1/subscriptions/:id requieren secreto de gestión emitido de forma segura; endpoints de Web Push únicamente por canal autorizado, nunca públicos por enumeración.
- GET /api/v1/push/public-key (solo clave pública), endpoints de subscribe/unsubscribe validados contra la suscripción propia.
- Endpoints admin/ingest no públicos, protegidos por autenticación fuerte, acceso localhost/segredo interno y registros de auditoría; no fiarse de un header Referer ni de secreto en el navegador.

Controles: schemas de entrada y salida Fastify, límites longitud/sizes, rate limiting diferenciado, honeypot/captcha progresivo/controles anti-bot, URLs allowlist, CSP, CORS estricto, CSRF cuando aplique, XSS safe DOM, prepared statements, seguridad SSRF, permisos mínimos, reporte y revocación, export/delete de información propia.

Geo API: límites de bbox, rangos temporales, resultados paginados y agregación por densidad; no exportar lat/lon residencial. Versionado de contratos v1 y fixtures para consumidores.

## 6. Push y preferencias

- PWA (manifest, Service Worker, HTTPS) compatible con los navegadores que lo soporten; instalaciones iOS con instrucciones pertinentes.
- Flujo: elegir sectores → consentimiento granular → activar Push desde gesto del usuario → generar suscripción vinculada → prueba opcional explícita.
- Outbox y unique key por (usuario, evento, versión de horario, canal) para no enviar duplicados; retry limitado y supresión si el cronograma ya fue sustituido antes de entrega.
- No deducir que la notificación se vio o que se entregó solo porque el proveedor respondió 201.
- Preferencias predeterminadas conservadoras; quiet hours configurables salvo avisos críticos elegidos por el usuario; digest opcional.
- Baja en un clic desde interfaz y opción de borrado; invalidaciones 404/410 de Push disparan baja de endpoint.
- Una ubicación guardada como nombre de sector/circuito, no necesidad de almacenar dirección precisa.

## 7. Privacidad, legalidad y moderación

- Documentar finalidad, base jurídica aplicable, consentimiento de notificaciones, retención, acceso y eliminación conforme al marco ecuatoriano; solicitar revisión legal antes de captación masiva.
- No almacenar contenido completo de mensajes sociales si no está permitido por licencia/términos; preferir URL, resumen propio y atributos mínimos. No redistribuir datasets restringidos.
- X API solo mediante vías oficiales y cuotas verificadas; no bypass de límites ni scraping de contenido protegido. Priorización inicial: comunicados públicos y noticias/RSS.
- Filtrado automático + cuarentena + revisión humana para reportes conflictivos, ofensivos o coordinados; cola de moderación accesible solo a administradores.
- Geolocalización voluntaria; generalización por área; retención y borrado de IP / huellas antibot cortos; nunca perfilar hogares por vulnerabilidad.
- En mapa, todas las cifras de cantidad de reportes deben indicar cobertura y procedencia. Alertas falsas con fines de sabotaje deben poder retractarse rápidamente.

## 8. Operaciones y calidad

- Feature flags: BLACKOUT_MAP, CITIZEN_REPORTS, OFFICIAL_SCHEDULES, PUSH_ALERTS, OSINT_NEWS, OSINT_X, TIME_MACHINE, EXPLORER_3D (por defecto desactivadas hasta listo).
- DATA_DIR v4 preservado; nuevo DB_DIR con volumen persistente y backup diario verificado / restauración ensayada. Control de crecimiento de archivos PDF/medios y retención diferenciada.
- Métricas básicas: tiempo de última ingesta válida por origen, errores parser, lag outbox, número de correcciones y tasa de falsos positivos revisados.
- Pruebas obligatorias: unitarias de parsers / horario Ecuador / cambio UTC / PDF reemplazado; integración Fastify acceso público/privado; consentimiento y baja; idempotencia; doble evidencia; geoprivacidad; restauración de datos; ausencia de contaminación demo/live; móvil/teclado.
- No usar datos de producción privados para pruebas. En tests, clock/fetch/store/transport inyectables (patrón createApp v4).
- npm run check y npm test deben seguir pasando. Testear funcionamiento navegador real sin introducir trazas personales en screenshots.
- Rollback: flags off, restaurar app v4 y volumen sin destruir el nuevo historial; migraciones reversibles o estrategia de snapshot antes de cambio incompatible.

## 9. Decisiones diferidas / investigación pendiente

1. Inventario de distribuidoras, URLs oficiales y licencias/formatos; demostrar parsers sobre fuentes recientes y snapshots archivados, sin asumir mismo formato 2024/2026.
2. Cobertura real de polígonos por sector/circuito; mapa por cantón/parroquia hasta verificar asignaciones eléctricas.
3. Contrato de datos públicos CENACE/CELEC y permiso de redistribución histórico.
4. Demanda ciudadana: entrevistar usuarios y validar comprensión del lenguaje.
5. Mazar: documentación de batimetría, curva hipsométrica/cota-volumen útil, cambio de potencia hidráulica; no prometer porcentaje energético sin validación.
6. Evaluar coste/latencia de OSINT X frente a prensa+fuentes oficiales antes de habilitarlo.
