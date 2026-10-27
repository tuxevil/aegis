# AEGIS Multiamenaza — plan de producto y preparación técnica (27-10-2026)

**Estado:** propuesta para revisión; no es una orden de implementación. Este documento precede el prompt de desarrollo. Referencia: [replay de Guayaquil](../research/guayaquil-2026-10-26-replay.md) y [diseño WhatsApp por ciudades](whatsapp-ciudades.md).

## Actualización de investigación · 27-10-2026

Consultar **[auditoría técnica de fuentes](../research/auditoria-fuentes-alertas-2026-10-27.md)** antes de especificar interfaces de ingestión. Se confirmó el PDF oficial INAMHI N.º 83 (**emitido 25-10 a las 14:00, vigencia 25-10 16:00 al 28-10 23:00**), con mapa; la disponibilidad web exacta sigue desconocida. El enlace al boletín Pallatanga retorna un PDF de **mayo de 2025** y evidencia por qué el control de vigencia es obligatorio. Capas SNGR ArcGIS legibles en metadatos, pero no ejecutadas desde el LXC; licencias SNGR/INEC pendientes. GEOGLOWS CC BY 4.0, Open-Meteo Free **exclusivamente no comercial**. El backtest debe atender al lapso entre inicialización y publicación de pronósticos, no solo comparar fechas de modelos.

**No confundir:** fuente identificada / metadatos inspeccionados / request probado en staging / operacional validado. Solo la cuarta condición autoriza depender de ella para alertas públicas.

## 1. Misión y límite

Convertir información pública *fechada y atribuible* sobre peligros en un registro abierto, territorialmente pertinente, comprensible y distribuible de avisos preventivos. AEGIS **no** reemplaza INAMHI, SNGR/COE, ECU 911, ni emite evacuaciones propias. Diferenciar siempre: (a) aviso oficial, (b) observación medida, (c) pronóstico de modelo, (d) reporte ciudadano sin verificar, (e) evaluación independiente AEGIS. Nunca presentar (e) como (a).

**Primeros pilotos:** Guayaquil (lluvia, inundación urbana y pleamar) y Pallatanga (lluvia, movimientos en masa y vías). Conservar módulos existentes de energía, Mazar, ENSO y monitoreo local.

## 2. Inventario inicial de fuentes

La accesibilidad encontrada en navegador NO garantiza API estable, cuota gratuita, derecho de redistribución o SLA. Antes de escribir adaptador, registrar propietario, términos/licencia, autenticación, forma de acceso, frecuencia real y vigencia, ámbito, precisión, pérdidas, fecha de origen, contacto y alternativa.

| Id | Fuente primaria | Producto | Rol inicial | Latencia / restricción / verificación |
| --- | --- | --- | --- | --- |
| met.inamhi.advertencias | https://servicios.inamhi.gob.ec/alertas/ | Advertencias y nowcasting (PDF) | P0: avisos oficiales | Sitio declara que enlaces muestran versión *más reciente*: archivar bytes/metadata/hash cada revisión, no sobrescribir; validar permiso de republicación |
| met.inamhi.boletines | https://servicios.inamhi.gob.ec/boletines/ | Hidrología, clima urbano Guayaquil–Durán, Pallatanga | P0/P1: contexto | PDF, comprobar fecha/validez interna y constancia histórica |
| snrg.monitor | https://www.gestionderiesgos.gob.ec/reportes-de-monitoreo-de-amenazas-y-eventos-peligrosos-2025/ | Monitoreos oficiales 09:00/21:00; ríos/vías/eventos | P1: situación, verificación | 12 h nominales; no sirve por sí solo para nowcasting |
| snrg.sitrep | https://www.gestionderiesgos.gob.ec/informes-de-situacion-actual-por-eventos-adversos-ecuador/ | Reportes oficiales de afectaciones | P1: validación retrospectiva | Tiempo de publicación variable; no utilizar como predictor retrospectivo |
| geo.sngr.multi | https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/MULTIAMENAZAS_SGR/FeatureServer/0 | Polígonos multiamenaza | P0: contexto espacial | GeoJSON/JSON consultables; licencia de redistribución, escala, actualidad y metadatos por comprobar |
| geo.sngr.inundaciones | https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Susceptibilidad_de_Inundaciones/MapServer | Susceptibilidad a inundaciones | P0: exposición contextual | No confundir susceptibilidad estática con inundación prevista |
| geo.iige.mass | https://geoportal.geoenergia.gob.ec/?page_id=832 | WMS movimientos en masa | P1: contexto espacial | Inspeccionar resolución, cobertura, fecha y permisos |
| hyd.geoglows | https://training.geoglows.org/rfs/tutorials/data-service/ | Pronósticos fluviales e históricos por river_id | P1: crecidas | Identificar río y cuenca; sesgos/modelos/actualización, estaciones calibradas, caudal NO nivel del agua ni amenaza urbana |
| ocean.inocar | https://inocar.mil.ec/web/index.php/tabla-de-mareas | Mareas estimadas en puertos | P1: agravante contextual | Referencia vertical MLWS; no equiparar altura de marea a cota urbana o inundación |
| landslide.lhasa | https://github.com/nasa/LHASA | Susceptibilidad dinámica a deslizamientos | P2: contextual experimental | ~1 km / día, actualizaciones best effort, caídas del servidor; no usar para órdenes locales |
| hyd.glofas | https://ewds.climate.copernicus.eu/ | Pronóstico fluvial global | P2: segunda fuente | EWDS advierte que no es servicio de operación crítica/tiempo real; gestionar acceso específico si se requiere |
| wx.openmeteo | https://open-meteo.com/ | Pronóstico por coordenadas | Ya integrado en Pallatanga; P0 acompañamiento | Verificar términos, límites y variables del plan usado; previsión no es alerta oficial |

**Indicador de aptitud por fuente:** probada programáticamente / acceso navegador solamente / bloqueada / licencia desconocida. No afirmar aptitud operativa hasta completar pruebas automatizadas y autorización.

## 3. Producto: alcance mínimo

- **Portal abierto**: mapa con capas oficiales, lista de avisos, historial de versiones, actualización/fuente/vigencia; búsqueda por ciudad/cantón/parroquia; vista accesible de bajo ancho de banda.
- **Territorialización**: geometrías administrativas versionadas (códigos DPA), intersección entre alcance del boletín y territorio. No inventar precisión por barrio; si solo hay boletín provincial, mensaje señala amplitud provincial.
- **Captura auditable**: guardar fuente original, hash SHA-256, fetch timestamp, issued/published/effective/expires separados, revisión, parser_version, proveniencia, URL y licencia.
- **Evaluación**: por amenaza y ámbito; severidad, confianza en **evidencia** separada de probabilidad de evento; detectar caducidad, revocación, actualización, incertidumbre, datos incompletos.
- **Publicación**: interfaz humana para revisar; outbox idempotente con expiración/pausa por ciudad; vistas web y canales opt-in. No emisiones automáticas críticas en fase inicial.
- **Métricas**: time-to-detect source, ingest lag, classify lag, time-to-approve, time-to-publish, delivery status when available, false/late warnings and no-alert cases.

## 4. Modelo conceptual de eventos

`Source`, `RawArtifact`, `SourceRevision`, `Observation`, `ForecastRun`, `HazardEvent`, `Assessment`, `AdministrativeArea`, `Alert`, `AlertRevision`, `DistributionTarget`, `OutboxMessage`, `DeliveryAttempt`, `AuditEntry`.

Toda alerta debería exponer `id`, `revision`, `sourceIds`, `phenomenon`, `authorityType`, `geometry`, `areaPrecision`, `issuedAt`, `observedAt`, `ingestedAt`, `effectiveAt`, `expiresAt`, `language`, `confidenceInEvidence`, `uncertainties`, `recommendations`, `status` (draft/pending/approved/published/updated/expired/retracted), `supersedes`, `editor` y `channels`.

No deducir fenómeno causal de una imagen aislada ni convertir nivel de susceptibilidad estática en probabilidad puntual.

## 5. Reglas editoriales iniciales

**Clase O — avisos oficiales:** retransmitir con atribución inequívoca y sin modificar contenido decisivo; incluir fecha, alcance, enlace y si está vigente.

**Clase M — medición/pronóstico:** «modelo prevé», «estación registró», «mareógrafo prevé», según corresponda; con fecha y cobertura. No equivale a instrucción oficial.

**Clase A — evaluación AEGIS:** explicación independiente y limitaciones; en piloto necesita revisión humana antes de notificar, sin órdenes de evacuación propias.

**Clase C — reportes ciudadanos:** cuarentena/moderación antes de ser visibles o afectar la evaluación; prevención de brigading, spam, ubicaciones sensibles y contenido personal.

Política de publicación: fallo de fuente / geometría dudosa / documento nuevo sin validación / boletín vencido => **no emitir nueva alerta** y declarar cobertura degradada. Admitir mensajes de actualización y retractación, claves idempotentes por (evento, región, canal, revisión), no sobrealertar; los cooldown no deben bloquear rectificaciones urgentes.

## 6. Infraestructura y límites operativos

- Retener Fastify/Node actual para capa web. Separar ingestión, evaluación, revisión y notificación con contratos estables; evitar reescritura temprana de energía.
- PostgreSQL/PostGIS solo cuando se necesiten geometrias/intersecciones persistentes y consultas territoriales; evaluarlo contra SQLite/GeoJSON al definir carga real.
- Worker y cola durable para tareas/reintentos; no almacenar secretos WAHA ni ubicación precisa en logs.
- Servir front público en infraestructura redundante fuera del hogar off-grid; Proxmox de tuxevil como laboratorio y staging, no único punto de fallo.
- Transporte WAHA aislado, principio de mínimo privilegio, sesión configurada via secretos y canal OWNER validado. Flag global `publish_enabled=false` por defecto; jamás usar chat privado como destino por accidente.
- Canales WhatsApp por ciudad son *opt-in* y se encuentran silenciados por defecto. Complementar con Web Push (según compatibilidad y consentimiento), archivo público RSS/Atom, y posibilidad de enlaces compartibles; revisar WhatsApp/WAHA términos antes de poner cuenta principal en riesgo.
- Privacidad: seguimiento por zona o cantón sin dirección exacta; si se permiten puntos precisos, consentimiento/base legal, minimización, retención y controles conforme LOPDP.
- SLO definidos tras pruebas de proveedor; no prometer «tiempo real» cuando la fuente es PDF o reporte 12 h.

## 7. Fases y gates de decisión

| Fase | Entregable | Gate |
| --- | --- | --- |
| A — descubrimiento de datos | Matriz fuente/licencia, ejemplos históricos versionados y ensayos de descarga, cobertura Guayaquil/Pallatanga | Al menos una fuente oficial con publicación/validez fiable y archivo reproducible |
| B — backtesting offline | Corpus de múltiples días con y sin incidentes, cronología por documento, métricas anti-hindsight | Ninguna fuga temporal; falsos positivos/omisiones visibles |
| C — observación en sombra | Capturar fuentes y generar evaluaciones sin notificar durante un período controlado | Calidad, frescura y revisión editorial suficientes |
| D — beta pública controlada | Portal de Guayaquil y Pallatanga + suscripción por canal manual, mensajes revisados | Simulacros, publicación/corrección/expiración probadas; opt-in claro |
| E — expansión | Nuevas ciudades por demanda, hidrología/landslides, automatización gradual donde validada | Seguridad operativa y evidencia histórica por fenómeno |

## 8. Decisiones abiertas antes del prompt Codex

1. Marca: ¿AEGIS como observatorio multiamenaza y subproyecto Grid Sentinel, o Grid Sentinel queda sección de AEGIS? Propuesta: AEGIS paraguas, Grid Sentinel energía.
2. Grano territorial: ciudad/cantón como canal WhatsApp, parroquia para filtros web. La señal oficial puede tener granularidad provincia/región; mostrar precisión real.
3. Primeros canales: Guayaquil y Pallatanga; habilitar otros solo cuando cobertura y revisión soporten notificaciones pertinentes.
4. ¿Publicación automática? Propuesta: NO en beta, salvo republicaciones textuales de fuentes oficiales con validación formal futura.
5. Cuenta de WhatsApp: evaluar riesgo de automatización y posible cuenta dedicada; no usar sesión pública sin revisión.
6. Forma de datos: mantener una fuente de verdad con revisión y versiones en vez de textos efímeros sin auditoría.
7. Modelo económico: datos esenciales y avisos ciudadanos gratis; servicios opcionales separados, nunca ocultar alertas críticas detrás de un pago.

## 9. Definition of Ready para desarrollo

- Inventario validado por URL *y* por prueba técnica con un ejemplo real, fecha del documento y licencia documentada.
- Catálogo de amenazas y niveles de certeza; textos modelo revisados.
- Propuesta de esquema con contratos y casos de error.
- Corpus retrospectivo verificable incluyendo 26/10 y días negativos; pruebas reproducibles.
- Modelo de revisión, aprobación, rectificación y auditoría.
- Política WhatsApp, consentimiento y canal redundante acordados.
- Diagrama de despliegue, almacenamiento y recuperación; decisión de no romper AEGIS actual.

Mientras estas condiciones no se cumplan, no desplegar automatización de avisos que la población pudiera interpretar como instrucción oficial de emergencia.
