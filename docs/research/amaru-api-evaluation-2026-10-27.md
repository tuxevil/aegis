# Evaluación de integración: API Amaru (27-10-2026)

**Estado actualizado:** el propietario confirmó una consulta autenticada exitosa para Guayaquil. La prueba de la precisión y licencia de redistribución de sus valores sigue pendiente. La clave API privada fue entregada al asistente en conversación; **NO está ni debe estar en el repositorio, ejemplos, commits o logs**. No solicitar compartirla de nuevo por chat ni pegar en URLs.

## Por qué investigar Amaru

Amaru cubre 13 países de Sudamérica y ofrece un motor que combina Open-Meteo (clima), Google Flood (ríos), datos de radar (RainViewer), mareas y reportes ciudadanos. Su portal y aplicación ofrecen alertas por zona, mapas y análisis de Mazar, áreas que se solapan con el roadmap de AEGIS.

**Cambio de decisión estratégica propuesto:** considerar Amaru un proveedor/aliado de señales complementarias, no una fuente oficial. AEGIS/OpenAlert se especializan en fuentes originales auditables, archivo histórico, vigencia y distribución por canales ciudadanos/localidad. **No copiar** su modelo, marca, contenido de pago ni eludir límites técnicos.

Fuentes:
- https://amaruapp.com/organizaciones (plan Dev, límite y funcionalidades).
- https://amaruapp.com/api-docs.php (documentación técnica de endpoints; puede contener rutas heredadas).
- https://amaruapp.com/soporte (alcance general y limitaciones).
- https://amaruapp.com/app (producto).

## Endpoints documentados y divergencias

La página [Para organizaciones](https://amaruapp.com/organizaciones) indica:

\`\`\`text
GET https://amaruapp.com/api/v1/status.php?lat=-2.17&lon=-79.92&key=<API_KEY>
\`\`\`

La página [API pública](https://amaruapp.com/api-docs.php) describe el endpoint principal como \`/inundaciones/api/v1/status.php?lat=&lon=\`, pero su propio botón «Probar (Guayaquil)» enlaza a \`/api/v1/status.php?lat=-2.17&lon=-79.92\`.

**Observación obtenida realmente:** el endpoint \`/api/v1/status.php\` sin clave devolvió HTTP **401 Unauthorized** a una consulta anónima. Una prueba pública de \`/api/hotspots.php\` devolvió **403 Forbidden**. No es prueba del plan Dev activado. La terminal de investigación no pudo resolver DNS para amaruapp.com; no pudo hacerse una consulta autentificada. **No interpretar 401 como rechazo de la clave entregada**.

La sonda de AEGIS utiliza solamente el endpoint canónico \`/api/v1/status.php\`, valida JSON, rechaza redirect HTTP, protege el valor de la clave y hace exactamente una solicitud GET por ejecución.

## Planes expuestos por Amaru al 27/10/2026

| Plan | Llamadas mensuales | Datos |
| --- | --- | --- |
| **Dev** | **200** | \`ubicacion\`, \`clima\`, \`riesgo.indice\`, \`riesgo.nivel\`; widget marca Amaru; un dominio registrado |
| Medios | 25.000, USD 79/mes | factores de riesgo, fluviales y reportes; hasta 3 dominios |
| Empresa | 250.000, USD 299/mes | API completa + webhooks firmados + histórico El Niño |
| Institucional | A medida | contactar proveedor |

Con **200 llamadas/mes** no es seguro diseñar polling 24/7:
- 1 lugar / cada 4 horas = aproximadamente 180 llamadas en 30 días, consume casi toda la cuota.
- 2 lugares / cada 4 horas = 360 y excede el plan.
- Si se consulta una vez cada 24 horas en Guayaquil y Pallatanga serían ~60/mes, pero **eso no constituye vigilancia en tiempo real ni capacidad de alerta temprana**.

No se garantiza latencia contractual, histórico de respuestas, vigencia por campo, exclusividad de dominio o sublicencia solo por tener API key.

## Cómo hacer UNA consulta desde staging/LXC

Desde checkout \`feature/guayaquil-replay-whatsapp\`, Node >=22:

\`\`\`bash
npm test
# En terminal privada, sin guardar clave en shell history:
read -rsp 'Amaru API key: ' AMARU_API_KEY; echo
export AMARU_API_KEY
node scripts/probe-amaru.mjs
unset AMARU_API_KEY
\`\`\`

La sonda devuelve JSON **resumido y saneado**: HTTP status, nombres de campos, \`clima.temp_c\`, \`clima.lluvia_mm\` (si presentes), \`riesgo.indice\` y \`riesgo.nivel\`, y presencia de campos limitados. No imprime URL ni clave, y no hace reintentos. **No ejecutarla mediante CI ni en cron.** Conservar la clave como secret de servidor en cualquier integración posterior, nunca en el JS frontend.

Si devuelve \`unauthorized_401\`, revisar estado de la cuenta/clave o dominio autorizado; si \`quota_or_rate_limit_429\`, detener pruebas y revisar la cuota. No intentar cambiar el origen, eludir 403 ni hacer scraping de endpoints del mapa para obtener campos Premium.

## Resultado autenticado recibido del operador

El 27/10/2026 a las 20:19:56.942Z, la sonda desde staging devolvió HTTP 200, `sample_obtained`, 974 ms, para Guayaquil (-2.17,-79.92): índice 60/«Alerta», temperatura 29.6 °C, lluvia 0.6 mm/h e intensidad «ligera», elevación 9 m. Esto confirma conectividad y acceso al plan Dev, **no** validación de la estimación ni causa del índice.

La primera respuesta `provider_reported_error` probablemente fue un bug de nuestra sonda, porque se trataba la mera presencia de `error` como fallo aunque su valor pudiera ser nulo; el valor original no se conservó y no debe inventarse. En la nueva respuesta se observó la clave `error` junto a datos válidos.

No se reciben los factores explicativos, ríos ni reportes cercanos dentro del plan Dev. Evitar deducir qué causó el nivel 60 y no consumir cuota de 200 llamadas mensuales innecesariamente.

Ver también [metodología pública de Amaru y fuentes](amaru-methodology-open-sources-2026-10-27.md).

## Cómo modelarlo en AEGIS si resulta útil

- \`AmaruSignalAdapter\` **opcional y desactivado por defecto**, con estado de licencia, cuota mensual, reloj de consulta y caché.
- Categoría de fuente: **TERCERO / RIESGO MODELADO**, NO \`OFFICIAL\` o \`OBSERVATION\` salvo campos individuales claramente observados y atribuibles.
- Cada muestra requiere \`retrievedAt\`, coordenadas y resolución que soporta la fuente, \`providerName=Amaru\`, índice/nivel, \`providerVersion\`/timestamp solo si la API los ofrece. \`null\` si no.
- Sin factores del plan Dev, **no ofrecer explicación causal propia del índice** ni usarlo como único disparador de WhatsApp.
- Para portal, enlazar a Amaru con atribución; no redistribuir data premium ni resultados más allá de términos permitidos.
- Cache/concurrencia de cuota y \`source_health\`; fallos/429 → \`unknown\`, nunca «riesgo bajo».
- Valor estratégico: combinar **alertas verificadas INAMHI + fuente complementaria Amaru + distribución OpenAlert**. No competir replicando mapa/índice a corto plazo; evaluar cobertura/precisión/latencia y conversación institucional.


## Primera prueba autenticada desde servidor del propietario (27/10/2026)

**Resultado reportado por el operador** (JSON del script de diagnóstico, sin credenciales): `2026-10-27T20:14:52.944Z` (15:14:52 Ecuador), punto Guayaquil `lat=-2.17, lon=-79.92`, duración **1416 ms**, `result=unverified`, `errorCode=provider_reported_error`. La sonda llegó hasta interpretar una respuesta JSON HTTP 2xx con campo `error` o `erro`; **no es un fallo DNS o timeout**, y no sabemos aún el valor/causa del error. No se guardó el cuerpo de respuesta por seguridad. No declarar que la API key esté invalidada ni que la cuota se haya agotado.

**Contraste de documentación oficial Amaru:** `/organizaciones.php` indica `GET /api/v1/status.php?lat=...&lon=...&key=amaru_...`, coincidente con la URL construida por nuestra sonda. El formulario de alta indica «el widget solo cargará en este dominio»: **la restricción de un dominio del plan Dev está expresamente explicada para el widget y no puede asumirse automáticamente para peticiones API desde un LXC**. La documentación pública antigua `/api-docs.php` muestra una ruta prefijada `/inundaciones/api/v1/status.php` pero su enlace «Probar Guayaquil» dirige a `/api/v1/status.php`.

**Mejora de diagnóstico:** `scripts/probe-amaru.mjs` ahora extrae un `providerErrorCategory` y `providerErrorCode` seguro (si existe un token identificador no sensible) **sin imprimir el mensaje libre** porque podría incluir secretos. Esa repetición ya se realizó y se documentó arriba (20:19:56.942Z); no consumir otra llamada solo por confirmación. Como procedimiento futuro de diagnóstico, registrar solamente salida saneada; si continúa sin categoría clara, contactar soporte con hora/endpoint sin revelar clave por chat.

## Pendientes para Codex

- [x] Muestra autenticada reportada por el operador el 27/10 a las 20:19:56.942Z, HTTP 200/sample_obtained. No repetir por confirmación ni acceder a la clave.
- [ ] Registrar los campos reales, fecha/hora de cada lectura, respuesta si hay, indicación de plan o campos restringidos.
- [ ] Evaluar alcance y restricciones de uso y distribución del plan Dev con proveedor; el dominio registrado podría afectar widget o API, no asumir.
- [ ] Medir si los datos están disponibles para dos pilotos sin exceder presupuesto mensual.
- [ ] Preguntar al equipo Amaru por programa open source/investigación y posibles webhooks/alianza, sin enviar correo automáticamente.
- [ ] Tomar decisión de integración (integrar como auxiliar / solo enlazar / posponer), documentando evidencia. Sin activar publicaciones externas.

**Importante:** una clave válida no certifica el motor, los cálculos, la cobertura por barrio, el origen de los datos ni su permiso para publicar predicciones como alertas. Los canales OpenAlert siguen sin automatización.
