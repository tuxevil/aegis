# Corridas ECMWF seleccionadas manualmente

El perfil `openmeteo.singlerun.ecmwf` conserva su muestra histórica por defecto,
pero acepta una solicitud interna `{run, area}`. No hay scheduler ni búsqueda
automática de «última corrida». `run` exige `YYYY-MM-DDTHH:00` sin sufijo,
interpretado explícitamente como UTC; HH solo 00/06/12/18. Se valida calendario,
archivo desde marzo 2024 y que la inicialización no sea futura al ejecutar ingesta.
Solo se admiten los pilotos y dos puntos aproximados fijos. No se aceptan URLs,
coordenadas, credenciales, modelo, horizonte ni parámetros arbitrarios.

La selección explícita mantiene `models=ecmwf_ifs`, precipitación horaria,
UTC y tres días. Un punto de modelo no es una estación ni cobertura del cantón.
Pallatanga reutiliza el punto aproximado de pronóstico ya configurado en sources.js;
no toma las coordenadas privadas de una estación.

La URL exacta seleccionada queda en el envelope. Reproceso reconstruye únicamente
una URL admitida y conserva inicialización, descarga y disponibilidad comprobada
originales; no usa la muestra por defecto ni una corrida nueva. El evaluador valida
esa URL y separa corridas del mismo modelo por punto. El catálogo indica ambos
pilotos; health sin filtro sigue agregado por fuente. Con filtro de piloto selecciona
solo capturas del punto correspondiente; una captura del otro piloto no renueva
su frescura. Eso no constituye cobertura meteorológica de toda la ciudad.

Disponibilidad se comprueba en la descarga real, nunca se antedata a inicialización
ni a un retraso estimado. Las reglas de frescura, revisión y DRY_RUN no cambian.
Cooldown persistido sigue siendo por fuente y los bloqueos 403/429 por host:
cambiar de corrida o ciudad no elude pausas. La licencia/uso sigue restringida;
selección manual no certifica permiso de publicación ni operación recurrente.

## Uso de investigación

En laboratorio, con directorio privado nuevo o archivo previamente verificado:

```bash
node scripts/ingest-hazards.mjs --live --research-archive \
  --source=openmeteo.singlerun.ecmwf --run=2026-10-27T12:00 \
  --area=pallatanga --data-dir=/ruta/privada/investigacion
```

Fecha del ejemplo no implica que sea la corrida más reciente. Elegir una corrida
explícita pasada; no sustituir por hora local. Ambos parámetros son obligatorios
juntos, se rechazan duplicados y no se mezclan con verify/health/reprocess.
Sin `--live` no se consulta red. Sin opciones, el CLI sigue siendo informativo.

## Evidencia y límites

`hazards/forecast-selection.test.js` prueba allowlist, calendario/ciclo, argumentos
CLI, HTTP simulado, archivo real con bytes simulados, dos pilotos simultáneos,
replay, confirmación privada, TTL y reproceso sin red nueva. Rechazos tempranos
no crean DATA_DIR. La combinación Pallatanga/2026-10-27T12:00 se consultó una vez después de este
incremento: HTTP 200, 72 tiempos, un valor faltante, archivo verificado. Evidencia
en [reporte sanitizado](../verification/source-probes/2026-10-27-pallatanga-manual-forecast.json).
Disponibilidad comprobada 2026-10-28T00:24:00.019Z, nunca al inicializar el modelo.
La evaluación no generó candidatos: no implica ausencia de riesgo. No hubo
revisión/aprobación humana ni notificación. Otras combinaciones siguen pendientes.

Referencia primaria revisada: [Open-Meteo Single Runs](https://open-meteo.com/en/docs/single-runs-api).
La documentación describe selección por inicialización; no demuestra disponibilidad
histórica en AEGIS ni derechos adicionales. Mantener el gate de validación externa.

El catálogo público enlaza la documentación oficial, no la URL de muestra de
Guayaquil bajo la selección Pallatanga. Las URLs exactas permanecen en los envelopes
privados y en la revisión editorial; no se sustituyen por documentación al auditar.

La celda reportada se conserva separada del punto solicitado y se comprueba antes
de evaluación. [Procedencia de celda](forecast-grid-provenance.md) explica el
límite técnico, registros legados y reproceso sin renovar frescura.
