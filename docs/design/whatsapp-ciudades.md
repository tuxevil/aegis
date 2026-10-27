# AEGIS: canales de WhatsApp por ciudad — diseño y precauciones

Estado: **diseño de implementación**, 27-10-2026. El propietario confirmó el canal nacional **«OpenAlert - Ecuador»**, publicó una pregunta a seguidores sobre sus ciudades y decidió crear manualmente el primer canal local **«OpenAlert - Guayaquil»**. Aún **no** se confirmó que el nuevo canal Guayaquil haya sido creado. No hay mensajes de alerta publicados automáticamente por AEGIS.

## Decisión de producto

**Canal nacional:** `OpenAlert - Ecuador` (creado manualmente según propietario). **Primer canal local definido para apertura manual:** `OpenAlert - Guayaquil` (priorizado por tormenta del 26/10/2026 y red de contactos inicial). **Otros locales, convención propuesta:** `OpenAlert - Pallatanga`, etc. Canal nacional recoge interés mediante una pregunta nativa publicada y futuro selector web de ciudades; no abrir cientos de canales vacíos. Un canal local solo cuando exista demanda y capacidad editorial. El mensaje de cada canal incluirá **solo riesgos relevantes para su ámbito**, no boletines nacionales indiferenciados. AEGIS permanece como observatorio abierto e **independiente**, sin presentarse como autoridad pública.

**Importante:** al seguir un canal, las notificaciones están **silenciadas por defecto**. El onboarding mostrará una instrucción explícita para tocar la campana. WhatsApp no sustituye PWA, web ni canales oficiales de emergencias.

Guayaquil y Pallatanga serán los primeros pilotos técnicos propuestos; no implica abrir ambos canales inmediatamente. El catálogo admitirá todas las ciudades con identificador territorial estable; canales nuevos se provisionarán **bajo demanda y tras verificación humana**, no se crearán decenas o cientos automáticamente.

La estrategia de encuestas y selector por cantón, así como la distinción AEGIS (software) / OpenAlert (nombre de canal), están en [descubrimiento de ciudades](channel-discovery-proposal.md). El nombre OpenAlert se usa ya en otros proyectos tecnológicos; revisar disponibilidad jurídica si se decide registrarlo como marca comercial.

## Viabilidad WAHA

WAHA documenta:
- `GET /api/{session}/channels?role=OWNER`: canales propios.
- `POST /api/{session}/channels`: crear canal (compatible con los motores NOWEB/GOWS/WPP; no confirmado con WEBJS).
- `POST /api/sendText`: publicar en `chatId` terminado en `@newsletter`, con permisos OWNER/ADMIN.

Referencias: [WAHA Channels](https://waha.devlike.pro/docs/how-to/channels/), [WhatsApp Channels - Help Center](https://faq.whatsapp.com/549900560675125/?helpref=hc_fnav&locale=es_la), [notificaciones de canales](https://faq.whatsapp.com/6074154625973804/).

**Riesgo de plataforma:** las implementaciones WAHA/WhatsApp Web no equivalen a una API oficial de publicación en canales. Las políticas de WhatsApp restringen automatización no autorizada y pueden derivar en suspensión de cuentas. No poner en riesgo la línea pública de tuxevil sin evaluar el tipo de cuenta, límites, permisos, alcance y alternativa de publicación manual. Referencia: [uso responsable de WhatsApp](https://faq.whatsapp.com/361005896189245/).

## Arquitectura futura

```text
ingesta (INAMHI/SNGR/...) -> registro con issuedAt/publishedAt/ingestedAt
  -> matching geoespacial ciudad/ámbito (con evidencia)
  -> evaluación + revisión editorial + historial de versiones
  -> outbox persistente / idempotente
  -> adaptadores: portal | PWA web push | WhatsApp canales | otros
```

El programa de replay está deliberadamente desconectado de esa infraestructura real. Una futura implementación deberá impedir, por defecto, cualquier mensaje saliente: `ALERTS_PUBLISH_ENABLED=false`, lista de canales verificados, aprobaciones por nivel y estado de salud de las fuentes.

## Registro de ciudades y canales

Campos mínimos sugeridos para futura persistencia: `city_id` (código INEC/DPA + localidad), `name`, `province`, `boundary_version`, `channel_id` (ID WhatsApp @newsletter), `invite_url`, `session_alias`, `owner_verified_at`, `status` (proposed / verified / paused), `editor_policy`.

Nunca asignar una alerta regional a **todos** los municipios sin revisar geometría, vigencia y nivel de incertidumbre. Una ciudad con datos insuficientes debe mostrar «cobertura limitada», no «riesgo bajo».

## Modelo de mensaje

```text
OPENALERT - GUAYAQUIL
PREVENCIÓN · LLUVIAS INTENSAS

INAMHI advierte lluvias fuertes con posibles inundaciones
en áreas susceptibles de Guayaquil para el 26 de octubre.

Emitido/publicado: 25-10-2026, 18:01 (hora Ecuador)
Fuente: INAMHI #83, difundida por El Universo
Alcance: ciudad; no predice calles concretas.
Más detalles / actualizaciones: [URL de alerta AEGIS]

Observatorio independiente. Sigue las instrucciones oficiales.
```

Los campos deben reflejar **fechas reales del tipo correcto**: si 18:01 corresponde a un artículo, el rótulo es «difundido en prensa», NO «emitido por INAMHI». Los avisos propios deben diferenciarse visual y textualmente de una retransmisión de un aviso oficial.

## Política editorial y seguridad

- Consentimiento: seguir el canal es opt-in. No agregar a ciudadanos a grupos ni enviar mensajes privados masivos desde una sesión personal.
- Publicar solo avisos con fuente, URL, vigencia, ubicación, incertidumbre y recomendaciones proporcionadas. Prohibido inventar evacuaciones, órdenes o cierres de vías.
- Para difusión en el piloto: revisión humana previa. Alertas de evacuación y órdenes oficiales se enlazan/retransmiten literalmente, jamás se inventan.
- Clave idempotente `event_id:city_id:channel_id:revision`. Dedupe, cooldown por ciudad, retractación y actualización. Caducidad obligatoria.
- Fallo de fuente, pérdida de contexto geográfico, hora futura, channel no verificado o fallo WAHA => **no publicar** y registrar error. Una alerta sin datos actualizados nunca se presenta como tranquilidad.
- Logs sin números telefónicos, ubicación residencial precisa ni credenciales. Las URLs a fuentes se validan y archivan.
- No asumir entrega: un canal seguido no garantiza notificación push. Monitorizar alcance sólo cuando la plataforma proporcione métricas legítimas.
- Separar línea pública de tuxevil de servicios personales; si cambia el riesgo/escala, utilizar infraestructura/cuenta dedicada y políticas compatibles con WhatsApp.

## Plan operativo por etapas

1. Replay offline Guayaquil del 26/10 y test temporal.
2. Inspección de versión WAHA/motor/cuenta, `GET ...?role=OWNER` en entorno controlado; creación MANUAL de un canal Guayaquil, con nombre que no suplante instituciones.
3. Comprobar publicación privada de una actualización de **prueba**, no alarmante, solo con autorización explícita, y examinar limitaciones.
4. Portal de alta de ciudades con enlace a canal, aviso de activar campana y enlace PWA.
5. Ingesta de fuentes históricas y actuales, matching geoespacial, validación con expertos, auditoría, aprobación y despacho controlado.
6. Escalar a nuevas ciudades gradualmente según demanda y cobertura.

**Criterios de aceptación para publicar automáticamente:** integridad de fuente, trazabilidad por versión, alertas de expiración, medición de falsos positivos/negativos, revisión institucional/legal, pruebas de entrega, posibilidad de deshabilitar inmediatamente cada canal, y rutas redundantes independientes de WhatsApp.
