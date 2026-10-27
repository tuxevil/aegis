# PROMPT PARA CODEX — AEGIS Multiamenaza

Actúa como ingeniero responsable de implementar la ampliación **AEGIS Multiamenaza** en este repositorio, partiendo del software que ya funciona y de la planificación completa que dejamos documentada. **La etapa de planificación de producto quedó cerrada**; no vuelvas a empezar un brainstorming ni me hagas repetir decisiones que ya están registradas.

## Tu fuente de verdad
Repositorio: **tuxevil/aegis**. Recupera la rama remota **feature/guayaquil-replay-whatsapp** y revisa el PR **#23**. Lee primero **docs/handoff/START_HERE_CODEX.md**; después, en el orden de lectura que indica, las ADR, el roadmap, los contratos, la auditoría, el caso Guayaquil y el diseño de WhatsApp. Si la rama no está en tu checkout actual, haz fetch/checkout seguro sin sobrescribir cambios locales.

## Producto que implementaremos
AEGIS será un observatorio público, open source y gratuito en alertas esenciales para Ecuador, ampliando el actual **Grid Sentinel** (energía/Mazar/CENACE/ENSO/Pallatanga) con **Weather Sentinel**, **Flood Sentinel**, **Terrain Sentinel** y un motor transversal **AEGIS Alerts**. Pilotos: Guayaquil y Pallatanga. No reescribas ni rompas el dashboard existente.

El objetivo es convertir datos públicos con fechas, fuentes, territorio y nivel de incertidumbre en información preventiva entendible, historial auditable y, eventualmente, notificaciones voluntarias por zona y canales de WhatsApp por ciudad. Las alertas del INAMHI/SNGR se distinguirán claramente de inferencias propias de AEGIS.

**Identidad pública decidida:** el canal nacional de WhatsApp se llamará **OpenAlert - Ecuador**. AEGIS permanece como nombre técnico del proyecto. Los nombres de canales locales son propuestos, no autorizados para crear automáticamente. Consultar `docs/design/channel-discovery-proposal.md` para el selector ciudadano de cantones.

## Lo que debes ejecutar ahora
**Inicia M0**, el primer hito del archivo **docs/design/implementation-roadmap.md**. Verifica el estado del repositorio, baseline de tests, conectividad y respuestas reales de INAMHI, SNGR ArcGIS y Open-Meteo con la sonda de solo lectura y su runbook. Registra evidencia verificable, metadatos, limitaciones, permisos, timestamp y fallos en **docs/research/source-validation-results.md**. No inventes resultados si alguna fuente falla. Cuando corresponda, inicia M1: adaptadores testeados, ingesta verificable, versionado, hashes, manejo de obsolescencia y fallos parciales. Sigue M2–M4 por etapas incrementales, con pruebas y documentación por hito; no intentes implementar todo en una sola modificación masiva.

## Restricciones críticas
- **NO crear ni publicar canales de WhatsApp, NO enviar mensajes reales y NO acceder a la sesión WAHA de tuxevil** sin autorización explícita posterior. Prepara adaptadores con mocks y \`DRY_RUN\`; usar kill switch \`ALERTS_PUBLISH_ENABLED=false\`.
- **NO hacer merge a main ni desplegar a producción** sin autorización. Mantén tus cambios en ramas/PR revisables. No destruir modificaciones locales.
- **NO** emitir órdenes propias de evacuación ni afirmar que un barrio se inundará basándote en un mapa estático; no confundir alerta oficial, pronóstico, observación y evaluación experimental.
- Conservar el contexto temporal **sin información futura**: el boletín INAMHI N.º 83 declara emisión el 25/10/2026 14:00, difusión independiente constatada a las 18:01, pero desconocemos su primera disponibilidad web y hubo inundaciones antes del aguacero de la tarde del 26. Debes preservar esas diferencias.
- **NO** asumir que la lectura pública de una API autoriza redistribución comercial. Open-Meteo Free tiene limitación no comercial; permisos de INAMHI/SNGR aún pendientes. No incluir secretos, teléfonos ni rutas privadas en el código público.
- No sobrecargar servidores externos, eludir 403/429 o usar endpoints no autorizados; si aparece un bloqueo externo, documéntalo y continúa con mocks explícitos.
- Mantén el stack Node >=22, ESM/Fastify y el despliegue LXC/Coolify existente; evita arquitectura innecesariamente pesada, prueba resiliencia, preserva los módulos energéticos y el histórico ya almacenado.

## Tu forma de trabajo
Empieza leyendo los documentos, no diseñando de cero. Haz un breve inventario del estado real del repo y luego **trabaja directamente**. Ejecuta \`npm ci\`, \`npm run check\`, \`npm test\`, pruebas de contrato y sondas permitidas desde staging. Abre cambios pequeños y verificables con evidencia, pruebas positivas, negativas y de fallos; reporta commits, resultados, bloqueos y próxima fase. Las decisiones técnicas menores puedes resolverlas tú y documentarlas; los gates para avisos públicos, cuentas de WhatsApp, licencias y despliegue requieren aprobación humana.

**Primera entrega exigida:** baseline verificado + diagnóstico real de fuentes (o bloqueo demostrado) + matriz de pruebas en el repo + propuesta o implementación inicial del adaptador INAMHI sin mensajes salientes.

Puedes empezar ya. La planificación está cerrada para desarrollo; la autorización de alertas públicas es otra etapa.
