# Estudio comparativo de Amaru — metodología pública y fuentes de datos
**27-10-2026 | Evidencia investigada, NO implementación.** Ver [evaluación de la API](amaru-api-evaluation-2026-10-27.md), [principios open source AEGIS](../design/open-source-collaboration.md) y [handoff Codex](../handoff/START_HERE_CODEX.md).

## Conclusión

Amaru es una referencia de producto válida que **ya hace** gran parte de la experiencia multiamenaza que pensamos para AEGIS. No vamos a reconstruirlo entero ni atribuirnos originalidad inexistente. Nos centraremos en una contribución adicional: *motor y conectores independientes, inspectables y reproducibles; publicación de fuentes originales; calidad temporal verificable; y red OpenAlert por ciudades, con revisión humana*. La documentación pública de Amaru **no** prueba la corrección de su modelo ni brinda el algoritmo completo para reproducir índice 0–100.

**Regla ética/técnica de exploración:** analizar la documentación, respuestas recibidas mediante API autorizada y comportamiento visible, respetando cuotas y términos. Crear nuestra propia implementación desde las especificaciones y licencias de los proveedores originales, **sin obtener/circunvenir código privado o funcionalidades de pago de Amaru**, sin copiar texto, mapas o marcas y sin sondear agresivamente su API. Evitar «ingeniería inversa» entendido como extracción del motor privado; utilizar comparación externa y diseño independiente documentado.

## Respuesta validada de API Amaru Dev (proporcionada por operador)

- Fecha de consulta **2026-10-27T20:19:56.942Z** (Ecuador 15:19:56); Guayaquil **(-2.17, -79.92)**.
- HTTP 200, resultado \`sample_obtained\`, latencia reportada **974 ms**.
- \`riesgo.indice=60\`, \`riesgo.nivel="Alerta"\`.
- \`clima.temp_c=29.6\`, \`clima.lluvia_mm=0.6\` (la documentación Amaru indica **mm/h**), \`clima.intensidad="ligera"\`, \`ubicacion.elevacion_m=9\`.
- Campos observados: \`error\`, \`ubicacion\`, \`clima\`, \`riesgo\`, \`fuentes\`, \`aviso\`, \`ts\`, \`plan\`, \`solo_en_planes_de_pago\`, \`mas_info\`. El resumen no guarda valores completos de \`fuentes\`, \`ts\`, \`plan\`, \`aviso\`, por lo que no atribuir frescura ni causalidad a ellos.
- **El primer error fue probablemente falso positivo de nuestra propia sonda:** la versión anterior marcaba error con mera presencia de la clave JSON \`error\`, incluso si \`error=null\`. No se registró el valor original, de modo que **no afirmar que era definitivamente null**; la consulta posterior con corrección funcionó. Es lección para añadir pruebas de \`error:null\`.
- Aunque \`lluvia_mm=0.6\` sea lluvia ligera, \`riesgo=60\` podría estar determinado por pronóstico, lluvia previa, ríos, marea o reportes; **no se dispone de \`riesgo.factores\` en Dev**. No calificar de bug ni emitir alerta propia basándose solo en el 60.

**Seguridad:** la credencial Amaru se mantiene fuera de GitHub, URLs, ejemplos y chats posteriores. El proveedor sirve resultados desde API bajo condiciones particulares; no subir respuestas completas a corpus público sin permiso. Cuota Dev 200 llamadas/mes; 2 sitios/6 h x 30d = 240 llamadas, ya excede. Si se usan pruebas de comparación usar presupuesto explícito, caché y jamás polling público constante.

## Componentes declarados públicamente y enfoque propio

| Señal | Amaru describe | Candidato independiente AEGIS | Riesgos de licencia/calidad |
| --- | --- | --- | --- |
| Lluvia y pronóstico | Open-Meteo + MET Norway; precipitación actual y 24 h | Comparador de modelos, corrida/fecha/ventana, datos de estación cuando existan | Open-Meteo API gratis no comercial; MET API exige User-Agent, sus datos pueden tener resolución inferior a barrio |
| Radar | RainViewer, capturas cada minutos | Metadatos/visualización opcionales; NO condición de activación de alertas | API RainViewer cambió 2025–26; hoy restringe componentes y uso personal/educativo |
| Ríos | Google Flood Forecasting, estación/tendencia/distancia | Google Flood Forecasting cuando aprueben acceso o GEOGLOWS (ya investigado) | Google Flood API gratis CC BY 4.0, pero acceso por piloto/lista espera; relación estación-cuenca no solo proximidad |
| Marea/oleaje | Open-Meteo Marine y, para estuario Guayas, mareógrafo río Guayas | Conector INOCAR/mareógrafo con datum explícito, Open-Meteo Marine complementario | No equiparar nivel de marea MLWS a cota de calle; licencias por proveedor |
| Terreno | altura del lugar para modificar riesgo de lluvia | SNGR susceptibilidad, elevación/pendiente, cuencas, cartografía INEC DPA | Altitud sola no modela drenaje urbano ni deslizamientos; mapas estáticos ≠ probabilidad |
| Reportes | Comunidad: confirmaciones/desmentidos + revisión de fotos | Fase posterior, con moderación, provenance, anti-spam y privacidad | Sesgo, información sensible, reporte falso; no ejecutar autoalerta por reportes no verificados |
| Notificaciones | Solo «Alerta» o mayor; de noche solo «Peligro»; 6 h dedupe | Políticas propias editables, tests de duplicado/rectificación, zona, horarios y consentimiento | **No copiar ciegamente** ventanas/umbrales sin validación; correcciones oficiales urgentes no deben quedar silenciadas |
| Experiencia | Mapas por zona, rutas, asistente, sensores | Portal ligero + OpenAlert WhatsApp opt-in; preservar Grid Sentinel y API transparente | No usar app de terceros como fuente oficial ni copiar interfaces/material protegido |

**Fuentes primarias consultadas:**
- https://amaruapp.com/info.php — modelo general, ríos, clima, mapas, reportes; declara 236 ciudades en captura examinada.
- https://amaruapp.com/medicion.php — detalles de lluvia, ríos, mareas, reportes, aviso/dedupe.
- https://amaruapp.com/api-docs.php — límites de Dev, rutas y webhooks.
- https://support.google.com/flood-hub/answer/16364306?hl=en — Flood API en piloto, CC BY 4.0.
- https://www.rainviewer.com/api/transition-faq.html — cambios a radar.
- https://www.rainviewer.com/api.html — términos actuales.
- https://api.met.no/weatherapi/locationforecast/2.0/documentation — API global, User-Agent, falta de histórico global en API.
- https://open-meteo.com/en/terms — límite no comercial de la API gratuita.
- https://github.com/open-meteo/open-meteo — servidor público open source AGPLv3; licencia de datos CC BY 4.0 (validar compatibilidad si se usa su código).

## Tensiones que merece la pena investigar, NO acusaciones de bugs

1. La descripción general \`info.php\` dice que «ninguna sola [señal] puede disparar una alerta alta»; \`medicion.php\` dice que severidad fluvial SEVERO puede disparar alerta por sí sola y EXTREMO siempre avisa. Posible excepción operativa — conviene que un sistema reproducible precise excepciones en código y documentación.
2. \`info.php\` menciona lluvia «en ese punto exacto» mientras cita Open-Meteo/MET, fuentes normalmente de grilla. No se puede afirmar lectura de pluviómetro local sin dato de estación/ubicación/resolución; separar **observación vs estimación**.
3. Algunos snapshots públicos de Amaru muestran conteos distintos (184 vs 236 ciudades; 932 vs 1818 puntos costeros), probablemente despliegues/páginas/instantes de caché diferentes. Son **inconsistencias editoriales a verificar con capturas fechadas**, no fallos de datos demostrados.
4. Etiquetado del plan gratis: muestra índice sin \`factores\`; por tanto la afirmación general «siempre mostramos por qué» puede aplicar a la web/app completa, **no** a todas las respuestas de API. Separar calidad del producto y capacidad de plan.
5. Nivel Amaru 60 con lluvia ligera no constituye contradicción probatoria: deben contrastarse factores permitidos o hablar con proveedor, sin adivinar fórmula ni asumir error.

## Recomendaciones técnicas AEGIS

### Principio 1: comparaciones con proveedores son controles externos, no verdad-terreno
Guardar \`providerRiskIndex\` opcional en zona/tiempo con atribución si la licencia lo permite, sin reproducir su fórmula ni ajustar nuestros pesos para imitarlo. «Amaru dice 60» es un resultado modelado, no una inundación observada. Para calidad se requieren **ground truth independiente** (eventos oficiales fechados, estaciones medidas, incidentes georreferenciados confirmados, días negativos). Informar bias, calibración, misses, falsas alarmas.

### Principio 2: diseño inspirado por problemas generales y reimplementación desde datos primarios
Separar plugins \`source\` (adquiere), \`normalizer\` (contratos), \`hazard-assessor\` (reglas versionadas), \`evidence\` (razones con IDs de fuente), \`publisher\` (review/outbox). Más detalles: [open-source-collaboration.md](../design/open-source-collaboration.md).

### Principio 3: trazabilidad completa y reproducibilidad
Cada evaluación incluye \`ruleVersion\`, \`assessmentId\`, \`sourceSnapshotIds\`, \`usedAt\`, \`retrievedAt\`, \`validFrom/validTo\`, \`territoryPrecision\`, \`missingEvidence[]\`, \`decisionReasons[]\`. Los cambios de peso/regla deben venir con fixture histórico, test de cutoff, comparativa con versión previa y razonamiento. El código solo predice/asesora bajo el nivel de confianza justificado por evidencia; no inventar probabilidad poblacional con heurísticas.

### Principio 4: contribuciones sin riesgo para el público
Issues y PR permiten propuestas de fuentes y reglas; revisión de código, fixtures con licencia, chequeos offline, pruebas de regresión y changelog. Contribuyentes NO pueden modificar datos actuales oficiales, reglas activas ni publicar alertas simplemente enviando un PR. Separar staging de producción y control editorial.

### Prioridad compatible con roadmap M0–M5
- **M0:** registrar muestra Amaru y auditoría externa; reparar clasificación \`error:null\`; no consumir cuota sin razón.
- **M1:** una fuente primaria (INAMHI) reproducible + contrato de \`RawArtifact\`.
- **M2:** portal con citas/temporalidad y eventual documentación de cómo contribuir.
- **M3:** motor de evaluación versionado y benchmark reproducible (incluye días sin evento).
- **M4:** conectar OpenAlert solo en simulación y revisión manual.
- **M5:** despliegue público previa autorización, SLO, licencia y seguridad.

## Qué NO sabemos
Pesos del índice Amaru, mecanismos completos de calibración, fuente exacta de cada campo API, timestamp interno de su último run, límites exactos de redistribución API gratuita, calidad observacional en Ecuador, efectos de superficie/alcantarillado, políticas de moderación de su comunidad, disponibilidad de su backend para contribuciones. No inferir «no existe» porque no se haya localizado un repositorio. Investigar o consultar al equipo Amaru con respeto si se desea colaborar.
