# Descubrimiento de ciudades y canales — nombre nacional definido

**27-10-2026 | Estado: CANALES «OpenAlert - Ecuador» Y «OpenAlert - Guayaquil» CREADOS MANUALMENTE (reportado por propietario), con enlaces públicos aportados; pregunta sobre ciudades publicada en el canal nacional.** La identidad comercial general del portal continúa diferenciada de la marca técnica AEGIS. La creación manual de este canal es una decisión del propietario; **no autoriza crear canales por WAHA, publicar alertas automatizadas, ni desplegar producción**.

## Nomenclatura

**Nombres y enlaces confirmados por el propietario:** canal nacional **[OpenAlert - Ecuador](https://whatsapp.com/channel/0029VbEqWioGk1FvdNjrxd3y)**; primer canal local **[OpenAlert - Guayaquil](https://whatsapp.com/channel/0029Vb8azrt5q08lKaGyqp1r)**, ya creado manualmente. La convención `OpenAlert - [Ciudad]` queda como guía para expansión futura. **OpenAlert - Pallatanga** continúa pendiente de decisión de apertura; no crear canales de forma masiva.

**Separación de nombres:** AEGIS es el repositorio/software; «OpenAlert - Ecuador» es el canal ciudadano nacional. No asumir que el portal, dominio, licencia o producto completo deben renombrarse a OpenAlert.

AEGIS permanece nombre del proyecto técnico, OSS, motor y repo. La identidad pública indica en su descripción: «Iniciativa ciudadana independiente, impulsada por AEGIS/tuxevil. Reúne avisos oficiales y datos abiertos con fuentes y fechas; no pertenece al Gobierno ni sustituye las indicaciones de autoridades». Revisar disponibilidad de nombres, marcas y canales antes de cualquier lanzamiento.

**No usar «Alertas Ecuador»: identifica un portal oficial de SNGR** https://alertasecuador.gob.ec/ ; evitar confusión con instituciones. La opción previa «Alerta Abierta» quedó descartada como nombre del canal nacional. **Colisiones encontradas para OpenAlert:** https://open-alert.com/about (sistema IoT/alertas), https://a2m.cloud/ (proyecto OpenAlert de datos para emergencias), y un proyecto Nostr de alertas críticas citado por Human Rights Foundation (https://pro.edgex.exchange/en-US/news/article/hrf-grants-bitcoin-projects-three-regions). El nombre no es exclusivo ni se ha comprobado su disponibilidad jurídica: verificar marcas, handle, dominio y presentación antes de adoptar marca comercial amplia.

## Descubrimiento sin canales vacíos

**Modelo híbrido aprobado solo en cuanto a la dirección de diseño general**, pendiente la aprobación de detalles de naming/umbral:

1. **Un canal nacional primero**, para información amplia y lanzamiento; difundir actualizaciones relevantes para múltiples territorios y resúmenes, no cada evento local sin contexto. Enlace al selector web «¿Qué ciudad quieres seguir?».
2. **Encuesta manual de WhatsApp** para segmentar regiones/provincias en una primera exploración. El centro de ayuda de WhatsApp confirma hasta 12 opciones y voto único/múltiple. **WAHA documenta \`sendPoll\` a canales como NO soportado**, tampoco recepción programática de votos; no prometer automatización.
3. **Pregunta abierta manual** en canal: «¿De qué ciudad o cantón quieres avisos?». WhatsApp tiene formato Questions y las respuestas se ven a los admins. No son anónimas frente a administradores; no extraer ni publicar identidades/votos. No depender de procesamiento masivo de este mecanismo.
4. **Selector web nacional por DPA**: \`/ciudades\` (ruta conceptual): provincia → cantón → parroquia opcional; búsqueda predictiva y corrección ortográfica, sin inventar geometrías. Si hay canal, enlace follow. Si no, estado transparente \`en evaluación\`, botón **«Me interesan los avisos de esta ciudad»** y opción independiente de recibir Web Push si técnicamente disponible y con consentimiento. No pedir teléfono/domicilio. Mostrar contexto y fuentes para la zona incluso si no hay canal.
5. **Medición privada agregada** de demanda por \`dpaCode\`, sin identificar al visitante. Contadores separados de visitas, selecciones de territorio, expresiones de interés, web-push habilitado y seguidores reales (si existe métrica legítima); no equiparar clic a suscriptor. Antibots, deduplicación proporcionada y minimización; no geolocalización obligatoria, no fingerprinting invasivo. Publicar solo agregados, ocultar cifras pequeñas si pudieran identificar personas.
6. **Apertura de nuevos canales** bajo revisión humana cuando exista demanda suficiente **Y** cobertura verificada de fuentes, capacidad editorial y condiciones de distribución. Un umbral de 20–50 solicitudes únicas verificables durante 30 días puede ser una hipótesis de experimento, no norma fija ni garantía de lanzamiento. Priorizar localidades con vulnerabilidad/riesgo aun con pocos usuarios si hay razones operativas.
7. El canal nacional anuncia el lanzamiento de nuevas localidades y comparte sus enlaces; los canales locales reciben únicamente información relevante y auditada. Los avisos del país entero no deberán duplicarse masivamente en todas las localidades salvo que el evento afecte realmente sus territorios.

## Hallazgos confirmados sobre WhatsApp

- Los **canales admiten encuestas**, con hasta 12 alternativas, y **preguntas abiertas** administradas manualmente. Información oficial: https://faq.whatsapp.com/223836640775084/ y https://faq.whatsapp.com/1851671722412078/.
- Los administradores **pueden ver nombres de perfiles de votantes/respondientes** según su privacidad; los seguidores no ven los votos individuales. No prometer anonimato absoluto.
- La tabla de capacidades WAHA Channels (https://waha.devlike.pro/docs/how-to/channels/) marca \`POST /api/sendPoll\` en canales **no soportado en motores listados**. Publicar encuesta desde WhatsApp directamente; registrar resultados únicamente agregados y manualmente, si se aprueba.
- WhatsApp publica insights de canal: seguidores, follows/unfollows, alcance y principales regiones, pero **no ofrece por esa vía un listado verificable de la demanda por cantón**. El selector web es fuente de señal territorial más granular.
- Las notificaciones de canales están **silenciadas por defecto**, y no equivalen a un sistema de emergencia con entrega garantizada. Web Push consentido + portal independiente siguen siendo prioritarios.
- No crear grupo masivo ni solicitar contactos telefónicos. Ninguna promesa de push/envío SMS sin infraestructura real y permisos.

## UX mínimo sugerido (sin implementarlo todavía)

Entrada a web (nombre comercial pendiente):
- «Información preventiva para tu zona»
- selector buscable «¿Qué ciudad o cantón quieres seguir?», provincia previa opcional.
- estado con fuente y vigencia: «Canal WhatsApp disponible» → enlace directo; «Todavía no existe un canal» → «Me interesa recibir avisos para esta ciudad», con confirmación honesta de que no equivale a suscripción.
- opción «Activar avisos en este dispositivo» para web push, opt-in y respetando compatibilidad.
- retorno «Se registró interés, no se ha creado un canal ni activado notificaciones» cuando corresponda.
- sección «Así usamos los datos»: se guardan solo territorio seleccionado y señal de interés agregada; explicar cómo desactivar push y que la disponibilidad de canales depende de cobertura y demanda.

Analítica mínima: \`territory_selected\`, \`interest_registered\`, \`push_opt_in\`, \`channel_follow_link_opened\` (no asegura que haya seguido), \`channel_created\`, \`subscriber_count_observed\`. Eventos con \`dpaCode\`, fecha y \`source=channel_promo|organic|site\` si se conoce; sin teléfono, geolocalización precisa ni captura de nombres de WhatsApp.

## Aceptación de planificación

**Canales iniciales y enlaces ya decididos:** consultar [directorio versionado](openalert-channels.json). Quedan pendientes la marca comercial del portal, el selector territorial y la analítica agregada que Codex podrá construir en modo sombra M2/M4. No crear canales adicionales ni automatizar publicaciones desde WAHA sin autorización.
