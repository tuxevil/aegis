# ADR — Decisiones de producto y arquitectura de AEGIS Multiamenaza

Estado: **aprobadas como alcance de desarrollo en modo seguro** (27-10-2026). Estas decisiones no autorizan automatizar alertas públicas ni usar la línea WhatsApp de tuxevil. Archivo normativo para el desarrollo: [START_HERE_CODEX](../handoff/START_HERE_CODEX.md).

## Contexto e intención

AEGIS comenzó como **Grid Sentinel**, observatorio de energía ecuatoriana (Mazar, CENACE, ENSO, clima Pallatanga) con reglas explicables. Tras las inundaciones de Guayaquil del 26 de octubre se decidió ampliar la plataforma para **información preventiva multiamenaza en Ecuador**, con alertas comprensibles según el territorio, trazabilidad de avisos y opciones opt-in de distribución. Los pilotos serán **Guayaquil** (lluvias/inundación urbana) y **Pallatanga** (lluvia/laderas/vialidad). La base seguirá siendo open source y la información crítica esencial será gratuita.

El caso de Guayaquil: el INAMHI declaró haber emitido el boletín meteorológico N.º 83 el **25/10 a las 14:00**, con vigencia desde las 16:00; difusión periodística independiente constatada a las **18:01**; lluvia extrema de tarde 26/10 entre 13:00–15:00 (no fue el primer anegamiento; hubo acumulaciones de madrugada). **23 h** son emisión declarada→ventana de lluvia, NO latencia demostrada de entrega ciudadana. **18 h 59 min** son publicación en prensa→ventana de lluvia, no precisión por barrio. La URL oficial es mutable y no equivale a archivo histórico. Ver [auditoría](../research/auditoria-fuentes-alertas-2026-10-27.md) y [replay](../research/guayaquil-2026-10-26-replay.md).

## Decisiones cerradas

| ID | Decisión adoptada | Razón y efecto |
| --- | --- | --- |
| ADR-01 | **AEGIS** marca paraguas; **Grid Sentinel** continúa como módulo intacto. Agregar Weather, Flood y Terrain Sentinel gradualmente. | Conserva base productiva; evita big-bang rewrite. |
| ADR-02 | **Fuentes/observaciones ≠ inferencias ≠ alertas.** Aisladas mediante contratos versionados; revisión humana en piloto. | Evita que heurísticas se conviertan en falsas alertas oficiales. |
| ADR-03 | **Territorialización administrativa** mediante códigos INEC DPA y geometrías verificadas; piloto por cantón/ciudad, refinamiento por parroquia solo si hay evidencia. | No fingir resolución por barrio. |
| ADR-04 | **INAMHI PDF + SNGR polígonos + Open-Meteo históricas** constituyen el alcance de validación técnica inicial; GEOGLOWS, INOCAR, estaciones, NASA y reportes forman siguientes olas. | Reduce riesgo e impide prometer sistemas aún sin API comprobada. |
| ADR-05 | Persistencia inicial de artefactos en filesystem durable con **hash SHA-256 + índice consultable y versiones**, sin sustituir inmediatamente el HistoryStore existente. La elección SQLite/DB se hará tras medir volumen. | Simplicidad, reproducibilidad y migración segura. |
| ADR-06 | **PostgreSQL/PostGIS** es la arquitectura objetivo solo cuando se requieran consultas geoespaciales de escala/volumen que lo justifiquen; interfaz Repository evita encerrar lógica de dominio en la base. | No meter migración/infrastructura grande en el Sprint 0. |
| ADR-07 | Backend actual **Node.js >=22, ESM, Fastify**, front existente preservado; módulos independientes y tests primero. | Compatible con repo, Coolify y staging LXC. |
| ADR-08 | **Cero notificaciones automáticas durante validación:** replay offline → captura controlada → vigilancia en sombra → beta editorial supervisada. | Da tiempo a medir fuentes e impactos; seguridad. |
| ADR-09 | **WhatsApp Channels opt-in por ciudad** desde una eventual sesión autorizada, empezando Guayaquil y Pallatanga. WAHA como adaptador opcional, no dependencia del sistema; PWA/web/RSS redundantes. | Canales no garantizan push (silenciados por defecto), riesgo de restricciones a cuenta. |
| ADR-10 | **No usar automáticamente la línea pública de tuxevil**, no crear canales ni publicar sin autorización posterior explícita y revisión de versión/motor de WAHA, permisos y políticas. | Protege cuenta pública y distingue preparación de operaciones externas. |
| ADR-11 | **Licencias por dataset/producto**, separadas de licencia MIT del código. Open-Meteo Free solo no comercial; atribución GEOGLOWS CC BY 4.0; permisos INAMHI/SNGR aún por aclarar. | No asumir dominio público ni uso comercial libre. |
| ADR-12 | **Redundancia**: Proxmox/LXC doméstico para desarrollo y sensores locales; alertas públicas requieren infraestructura externa respaldada, sin depender de electricidad/Starlink de la finca. | Resiliencia en eventos extremos. |
| ADR-13 | **Privacidad por diseño**: seguimiento voluntario por zona sin domicilio exacto, no administrar listas masivas de teléfonos, no compartir contactos ni geolocalización, cumplir LOPDP. | Menor superficie de riesgo, despliegue ciudadano viable. |
| ADR-14 | **Trazabilidad retrospectiva sin fuga temporal**: diferencia issued, effective, original observed, published, run initialized, availability verified, ingested, first seen, updated, expired. UTC canónico; representación America/Guayaquil. | Reconstruir qué era cognoscible antes de cada evento sin hindsight. |
| ADR-15 | **Candidatos a avisos**, no órdenes de emergencia. Mensajes distinguen «retransmisión de aviso oficial» de «evaluación independiente AEGIS» y estado de datos. | No hacerse pasar por autoridad ni emitir órdenes de evacuación propias. |
| ADR-16 | **No bloquear desarrollo por validación externa pendiente**: Codex hace el diagnóstico como primera fase. Sí bloquear la **publicación** de productos basados en datos sin licencia, caducidad o calidad verificada. | Permite comenzar ya con un ciclo seguro. |
| ADR-17 | **Canales creados manualmente por el propietario:** `OpenAlert - Ecuador` y `OpenAlert - Guayaquil`, documentados en el [directorio público](openalert-channels.json), distintos del nombre técnico `AEGIS`. La convención `OpenAlert - [Ciudad]` se reserva para nuevos canales sujetos a aprobación; no se ha verificado marca registrada ni permiso para publicarlos automáticamente. | Canal comprensible para ciudadanos, evitando renombrar sin necesidad la plataforma técnica. Debe revisarse colisión de marca porque existen otros productos OpenAlert. |

### Identidad pública del canal nacional · actualización del 27/10

El propietario creó manualmente **OpenAlert - Ecuador** y **OpenAlert - Guayaquil** y proporcionó los enlaces públicos de invitación. No constituye permiso de envío automatizado ni cambia el nombre AEGIS del repositorio, interfaz o producto. Para expansión adicional: `OpenAlert - [Ciudad]` bajo revisión humana. Los enlaces están en [openalert-channels.json](openalert-channels.json). Consultar [propuesta de descubrimiento y notas de colisión](channel-discovery-proposal.md).

## Qué NO está decidido y cómo manejarlo sin bloquear el comienzo

### ADR-12 · Consolidación de líneas existentes, 28/10/2026

Prioridad nueva del propietario: integrar los heads existentes antes de más
funcionalidades. Una aplicación Fastify, contratos públicos por namespace y flags
OFF; conservar HistoryStore, SQLite v5 y archivo inmutable por su distinta semántica.
No convertir consentimientos de Sector Watch a preferencias OpenAlert. Reusar
módulos y dependencias existentes; no nueva DB o microservicios. Integración en
rama independiente, con baseline por línea y regresión conjunta. El transporte
Push real heredado debe quedar bloqueado en esta etapa aunque un env antiguo
solicite activarlo. Staging aislado sin puertos publicados ni acceso al Proxmox del
propietario. [Evidencia y matriz](../verification/integration/integration-matrix.md).

### ADR-13 · Staging offline y respaldo conjunto, 28/10/2026

Compose usa volúmenes nuevos de proyecto, usuario1000, límites CPU/RAM/PIDs,
rootfs readOnly, red none y ningún puerto host. Health verifica aplicación, no
riesgo ni fuentes. No se monta socket Docker o configuración del propietario.
El staging persistente mantiene formularios/admin/Push OFF; QA aislada usa solo
fixtures/roles sintéticos. No nuevo proceso de polling de proveedores.

Reusar backup de archivos y verificación SQLite existente, sin migrar formatos.
Para una copia conjunta coherente se exige detener escritores y ausencia de
WAL/SHM/journal. SQLite readonly genera sidecars: verificar una copia scratch
privada para preservar el inventario SHA del backup. Restaurar solo a raíz nueva,
sin arrancarla ni conmutar montajes automáticamente. Hashes no son firmas;
copias locales no son redundancia externa. [Receta y límites](../runbooks/supervised-staging.md).

Estos puntos son **gates de fase, no preguntas que el agente debe devolver al usuario antes de empezar**:

- Frecuencia de polling por proveedor: determinar respetando metadatos, ToS y tiempos medidos; nunca presumir intervalos del catálogo preliminar.
- Licencias concretas, archivo y retransmisión automática INAMHI/SNGR: **pendiente confirmación institucional**. Codex puede construir parser y dataset de prueba sin republicar masivamente.
- Historial original de boletines y disponibilidad web exacta del N.º 83: no inventar; primero capturar desde ahora y modelar incertidumbre.
- Identificadores/geometrías nacionales INEC DPA y capas SNGR: validar con GET y documento; no confiar en nombre del cantón en lugar de geometrías.
- WAHA: auditar motor, permisos OWNER, políticas y alternativas antes de crear canales o publicar; **no hace falta credencial WAHA para completar fases iniciales**.
- Modelo de almacenamiento final: filesystem + índice simple desde el principio; PostGIS cuando haya justificación y migración probada.
- Hosting público/SLO/financiación: documentar opciones antes de habilitar servicio público; el laboratorio se puede usar ahora.
- Definición cuantitativa de severidad y precisión: derivar de fuentes oficiales y backtests, nunca inventar probabilidades o garantías.

## Niveles de mensajes y ciclo de vida

- **OFFICIAL**: aviso emitido por autoridad y retransmitido con citas, validez y alcance originales (sujeto a permiso y revisión).
- **OBSERVATION**: lectura y tendencia; «registró», no «ocurrirá».
- **FORECAST**: salida de modelo con corrida, ventana y rango; «pronostica», no «confirmado».
- **AEGIS_ASSESSMENT**: interpretación independiente, con reglas publicadas, limitaciones y confianza en *evidencia*; revisada por humano en beta.
- **COMMUNITY_REPORT**: no verificado y no apto para desencadenar difusión sin moderación. Fuera de alcance MVP.

Estado del aviso candidato: \`draft → pending_review → approved → published → updated/expired/retracted\`; transiciones auditadas con usuario/editor y motivo, sin salto directo \`draft → published\` en piloto. Rectificación y retractación envían aviso correctivo si ya hubo publicación.

Severidad editorial AEGIS inicialmente: \`info\`, \`watch\`, \`prepare\`, \`unknown\` (no son niveles INAMHI). La fuente conserva \`sourceRiskLevel\` original. **Nunca** generar \`all_clear\` por ausencia de datos. Para riesgo severo con instrucciones oficiales de evacuación, retransmitir instrucciones con referencia a la autoridad y canal de emergencia, no reescribirlas como orden propia.

## Criterios de diseño de distribución

- Ciudad registrada con \`dpaCode\`, nombre oficial, provincia, geometría y versión de límites, \`coverageStatus\`. Un aviso regional se asocia por intersección **con cobertura declarada**, no se etiqueta predicción específica de ciudad o barrio si la fuente no lo soporta.
- Destinos opt-in: portal, RSS/Atom, PWA web push y canal WhatsApp si posteriormente autorizado. Canales creados solo bajo demanda después de control de calidad, no automáticamente en todas las ciudades.
- Entidad \`deliveryTarget\` y outbox, clave \`alertId:revision:cityId:channelId\`, estado \`draft|queued|sent|failed|cancelled\`, caducidad, dedupe, retries limitados, auditoría y kill switch. En piloto \`DRY_RUN\`.
- WhatsApp Channels **no garantiza notificación al usuario**; no atribuir al canal entrega individual ni visibilidad.
- Un canal ciudadano no debe reproducir cada actualización rutinaria de estaciones: políticas de relevancia, límite de ruido y revisiones.

## Seguridad y continuidad

Ningún módulo experimental debe degradar Grid Sentinel, exponer secretos, ejecutar URLs arbitrarias, leer contenido con scripts no confiables ni sobrecargar fuentes. API pública: rate limiting y cache; informes internos: datos mínimos; ingestión: hosts en allowlist, límites de tamaño, timeouts, hash, versionado. El alojamiento público no debe tener acceso directo a HA, MQTT, WAHA o redes privadas.

## Criterio de éxito de la preparación

La planificación queda **cerrada para comenzar Codex** cuando existe handoff + backlog + contratos y tests, aunque falten datos reales. La certificación del servicio de avisos **sigue condicionada** a sondas, permisos, validación geográfica, revisión editorial y pruebas de daños/no-eventos. No confundir esas dos autorizaciones.

## Decisión operacional — 29/10/2026: separar laboratorio y salida futura

Conservar el compose offline de #34 sin cambios. La salida real se describe en
un override de ejemplo y una política inactiva, nunca mediante una variable
que convierta el laboratorio en operación conectada. El preflight no autoriza
ni implementa captura continua. No añadir servicios o bases para esta preparación.

Una allowlist HTTP en la aplicación y un firewall IP son controles distintos:
TLS impide filtrar métodos con reglas IP. La red, DNS, direcciones y límites
requieren verificación del host y autorización posterior; un nombre de red no
prueba aislamiento. Mantener el proceso bloqueado hasta disponer de esas pruebas,
permisos de fuentes y runner revisado. No crear infraestructura desde esta fase.
Véase [runbook y límites](../runbooks/shadow-observation-preparation.md).

## Decisión operacional — runner separado y evidencia de reloj real

Reutilizar archivo/evaluador y backup existentes, sin modificar backend/rutas ni
añadir servicios/DB. Un lote serial con presupuesto reservado antes del callback
es suficiente: estado JSON atómico privado, lock que no se roba, backoff/cuotas
persistentes, pausa por archivo y señales. El scheduler carece de import de
publicación y su CLI solo conecta proveedores sintéticos. El puente real queda
bloqueado hasta permisos/red/revisión propios, no se autoriza con un flag de CI.

Separar tiempo simulado de planificación y tiempo real de captura/procesamiento;
mantener energía desconocida, discrepancias fuera de etiquetas y retrospectivas
fuera de features. Un anillo acotado conserva métricas recientes, snapshots diarios
dan seguimiento7–14 días, el archivo original conserva trazabilidad. Al llenarse
la capacidad se detiene ingesta; no borrar evidencia automáticamente para continuar.


## Decisión operacional — interpretación INAMHI versionada, 30/10/2026

Corregir fechas mediante una gramática temporal acotada con calendario/zona
verificados; no inferir meses previos ni años actuales para salvar documentos.
Guardar texto de vigencia y reglas de inferencia junto al parser versionado.
Reprocesar por append sobre el mismo hash, conservando captura/interpretación
original y disponibilidad efectiva de la corrección. La revisión de contenido
no cambia si el PDF es idéntico. Una mención provincial no es cobertura:
separar listas explícitas sin calificadores de mapas/prosa y mantener alcance
unknown cuando no esté demostrado. No reinterpretar registros antiguos in situ.
[Contrato, evidencia y límites](../verification/integration/inamhi-parser-reprocessing.md).
