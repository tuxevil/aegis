# AEGIS 5.0 — Product requirements (PRD)

Estado: propuesta aprobada como dirección de producto; **ninguna función v5 se declara implementada**.
Fecha: 2026-10-21. Base: AEGIS v4 (rama main), commit 0339762.
Objetivo: convertir AEGIS en un observatorio público de interrupciones eléctricas en Ecuador, comprensible para ciudadanos y auditable por técnicos y periodistas, preservando el actual observatorio energético e hidrometeorológico.

## 1. Problema y propuesta de valor

Una persona afectada por un corte necesita saber: ¿es un problema de mi sector?, ¿es programado o imprevisto?, ¿qué fuente respalda la información?, ¿se conoce la hora de reposición?, ¿ha cambiado un cronograma?, ¿qué ocurrió antes? No debería tener que buscar su sector repetidamente en decenas de páginas de PDF.

Promesa de producto: «Descubre dónde se reportan cortes de luz en Ecuador, qué información está confirmada y cuándo cambia la situación de tu sector».

AEGIS NO es operador eléctrico, no controla la red, no garantiza que la luz vuelva a cierta hora y no inventa probabilidades de apagón.

## 2. Experiencias

### A. Blackout Map (núcleo del producto)
- Entrada móvil: buscador de sector/localidad; mapa de Ecuador con reportes agregados y eventos identificados; leyenda de procedencia y certeza.
- El usuario elige sector por búsqueda de localidad y confirmación manual. Geolocalización precisa solo opcional; no asumir que GPS identifica circuito eléctrico.
- Capas independientes: avisos oficiales; reportes ciudadanos; señales de prensa/OSINT; sensores voluntarios (posterior).
- Filtros: fecha, tipo de fuente, estado (programado, reportado, corroborado, confirmado, restablecido, desconocido).
- Cada incidente: lugar y precisión geográfica, primera/última evidencia, inicio/fin observado o estimado, confirmación y enlace(s) a fuente(s).
- Sin reportes != suministro normal. No pintar una provincia/cantón entero como apagado por reportes aislados.

### B. Reportar un corte
- Flujo sin cuenta: buscar/confirmar localidad o sector; marcar «Sin luz», «Regresó» o «Corregir reporte»; fecha/hora declarada opcional; captcha/antibot ligero cuando corresponda.
- Mostrar recibo/código privado para corregir o retirar el reporte y ofrecer protección contra abuso.
- Evitar direcciones exactas visibles, nombres o teléfonos en el mapa. El sector publicado debe ser agregado/generalizado.
- El reporte no equivale a un corte oficial ni sirve por sí solo para afirmar duración de todos los domicilios.
- No revelar IPs ni identificadores de navegador en endpoints públicos.

### C. Sector Watch — suscripción y avisos
- Guardar uno o varios sectores bajo seudónimo / suscripción anónima con control seguro de baja. Cuenta y ubicación GPS no obligatorias.
- Notificaciones web opt-in: cronograma oficial nuevo/cambiado/cancelado, nueva evidencia oficial de un corte y aviso oportuno de cambio en el sector.
- Preferencias por categoría y frecuencia; recordatorio previo solo si el documento ofrece una hora futura válida. Sin notificaciones alarmistas ni duplicadas.
- Si no hay cronograma general residencial: mostrar «No hay una programación oficial verificada para este sector»; NO «No habrá cortes».
- Fallos de Push: mantener consulta web y estado de entrega cuando el proveedor responda; no prometer entrega garantizada.
- En iOS documentar requisito de agregar la PWA a la pantalla de inicio (según soporte de versión/navegador); HTTPS + Service Worker.

### D. Time Machine
- Filtro temporal / replay de incidentes y evidencia. Dos ejes separados: «lo que ocurrió» (tiempo del evento) vs. «lo que AEGIS sabía entonces» (tiempo de ingesta/publicación).
- Los incidentes históricos permiten comparar periodos y duración únicamente donde existan límites de inicio/fin sustentados.
- Diferenciar «corte programado», «corte reportado», «corte confirmado», «reposición oficialmente anunciada», «reposición reportada».
- Importación 2024 por fuente verificable, con fecha de publicación y cobertura; nunca fabricar duración exacta a partir de una nota de prensa.

### E. Infrastructure Explorer (fase posterior)
- Mazar: terreno real, marcadores de cotas 2153/2115/2098 (según metodología v4), cota observada con fecha, timelapse por observaciones históricas.
- Cota no es volumen ni porcentaje de energía; jamás interpolar «reserva útil %» linealmente en la barra. Para volumen: curva cota-volumen validada / batimetría y licencias.
- Las imágenes Sentinel y los modelos DEM deben atribuirse, incluir sus fechas e incertidumbre; fondo sumergido no reconstruible automáticamente con DEM terrestre.
- Coca Codo Sinclair: visualización explicativa de captación, caudal, sedimentos y generación; nunca representarlo como gran reserva estacional equivalente a Mazar.
- Opcional 3D progresivo: mapa y gráficos 2D deben seguir funcionando en teléfonos modestos.

### F. Integraciones (posterior)
- API pública de solo lectura; webhooks/MQTT o integración Home Assistant opcional.
- Las heurísticas AEGIS pueden recomendar preparación, pero no ejecutar apagados automáticos ni alterar inversores por defecto. Acciones físicas solo con autorización y reglas explícitas del usuario.

## 3. Tipos y lenguaje de información

Cada elemento visible debe identificar su tipo:
- **Observación de fuente**: lo que un ciudadano, sensor, medio o entidad dijo/vio; conserva autor institucional/canal, link, fecha de origen y fecha de consulta.
- **Aviso oficial**: programación, actualización, cancelación o aviso de incidente; identificar distribuidora, período, ámbito, vigencia, URL/versionado.
- **Evento inferido**: agrupación auditable de observaciones potencialmente relacionadas; siempre explicitar calidad/precisión territorial y estado de corroboración.
- **Escenario**: cálculo condicionado, nunca predicción de apagón o promesa de reposición.
- **Desmentido/corrección**: se añade como evidencia; nunca borrar silenciosamente la afirmación anterior.

No usar «Confirmado» solo por muchas publicaciones. La corroboración múltiple debe distinguir fuentes independientes y duplicadas; confirmación oficial solo si la autoridad competente la publica.

## 4. Recorridos mínimos

**Visitante nuevo, 15 segundos:** abrir sitio → buscar «Pallatanga» → ver reportes/avisos con fecha y fuente → entender que «sin datos» no significa «sin cortes».

**Reportero ciudadano, 30 segundos:** «Reportar corte» → elegir sector → enviar → recibir comprobante y vía de rectificación → mapa agrega la señal sin exponer dirección.

**Suscriptor:** elegir «Casa» y «Trabajo» → activar notificaciones si el navegador permite → recibir aviso solo cuando una programación oficial para la zona cambie → ver fuente y diferencias (anterior/actual).

**Investigador:** seleccionar octubre de 2024 → ver cortes programados separados de observados → descargar tabla de incidentes/evidencias con fuentes y fechas, sin datos personales.

## 5. Diseño UX y accesibilidad

- Pantalla de inicio pública ciudadana: buscador/ubicación, mapa, lista de novedades, botón «Reportar corte», «Avisos de mi sector». No iniciar con caudales ni MW.
- Mantener console v4 como vista «Observatorio / Técnico» o ruta de compatibilidad; no perder los paneles de energía y Pallatanga.
- Modo bajo ancho de banda: lista + mapa opcional; actualización incremental; último estado cacheado y claramente etiquetado como antiguo.
- Leyenda accesible sin depender solo del color. Lector de pantalla, teclado, responsive 320 px y teléfonos de gama baja.
- Nada de heatmaps que aparenten «áreas sin electricidad» sin una cobertura muestral suficiente. Etiquetar «Concentración de reportes».
- No mostrar «En vivo» si la última lectura está desactualizada; enseñar hora de medición y consulta separadamente.

## 6. No objetivos de MVP

- Cobertura exhaustiva de todas las empresas y alimentadores eléctricos.
- Estimar con exactitud tiempos de reposición cuando no existan comunicados oficiales.
- Acceso irrestricto a X/Facebook/TikTok ni scraping que infrinja términos; no asumir APIs de pago.
- Predicción estadística de apagones, reserva eléctrica nacional, índice DEFCON o alertas oficiales inventadas.
- Eficiencia de turbinas o volumen útil en 3D sin parámetros o documentación técnica validada.
- App nativa, sistema de cuentas complejo, Big Data, microservicios y LLM en cada request.

## 7. Métricas para decidir evolución

Instrumentar únicamente datos agregados y mínimos, respetando consentimiento:
- Visitas que logran seleccionar sector; tiempo de búsqueda; errores de sector ambiguo.
- Proporción de eventos con enlaces de fuente y precisión geográfica declarada.
- Frescura de datos oficiales y tasa de parsers fallidos.
- Tasa de reportes abusivos/duplicados y tiempo de moderación.
- Suscripciones activas/opt-out, notificaciones duplicadas y errores de entrega (no medir «leída» si el navegador no lo proporciona).
- En validación con usuarios: comprensión correcta de «reportado» vs. «confirmado» vs. «programado».
- Calidad temporal: porcentaje de incidentes con duración realmente respaldada frente a indeterminada.

## 8. Lanzamiento

Habilitar bajo feature flags, con piloto limitado y datos de prueba marcados, sin enviar avisos masivos hasta completar revisión de fuentes, privacidad, reportes y calidad.
Progresión: mapa read-only y fixtures → reportes moderados → fuentes oficiales → suscripciones y comparación de PDFs → OSINT con fuentes habilitadas → Time Machine → Explorer 3D.
Mantener AEGIS v4 accesible y estable durante toda la transición.

Ver también:
- docs/architecture/aegis-5-design.md
- docs/roadmap/aegis-5-backlog.md
- docs/roadmap/aegis-5-codex.md
