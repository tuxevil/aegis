# M3 — Motor, integración y métricas en sombra

2026-10-27, PR #27. Software implementado; **validación histórica operacional
pendiente**. Sin publicación, WAHA, despliegue ni cambios a v4. Se incorporó la
actualización documental de canales creados manualmente por el propietario; no
se resolvieron sus URLs de invitación como JIDs ni se comprobaron roles de sesión.

## Entradas y salidas

`assessArchive` verifica hashes antes de llamar `assessHazard`. Solo se usan
registros conocidos al corte UTC mediante el selector de M3. Los impactos/outcomes
no son features. Se producen candidatos draft, contexto y exclusiones, con familias
y hashes de revisión deterministas. Correcciones futuras no aparecen antes; orden
ambiguo bloquea la propuesta. No candidato nunca implica cancelación, restauración,
riesgo bajo o all_clear.

| Entrada | Representación | Alcance |
| --- | --- | --- |
| Aviso primario INAMHI conocido y no vencido | Candidato OFFICIAL, nivel fuente literal | Provincia/cantón explícito, no barrio |
| Modelo identificado y disponible | Contexto FORECAST y propuesta independiente AEGIS_ASSESSMENT | Punto aproximado |
| Estación Pallatanga reciente | Contexto OBSERVATION y propuesta independiente AEGIS_ASSESSMENT | Una estación, no cantón/cuenca |
| Susceptibilidad estática | STATIC_EXPOSURE, sin clase de aviso ni candidato dinámico | Contexto no predictivo |

Reglas de lluvia: umbrales experimentales ya documentados en v4 (8 mm/h,
20 mm/día o 20 mm/24 h modeladas). Forecast exige 24 posiciones horarias completas,
sin nulos/duplicados. No se convierten en niveles oficiales ni probabilidades de
inundación/deslave. No se generan instrucciones propias de evacuación.
La precipitación Open-Meteo es acumulado de la hora precedente: se suman los 24
extremos posteriores al inicio de ventana en la siguiente hora UTC completa,
sin trasladar lluvia de una hora anterior al período futuro. Véanse las
[definiciones horarias](https://open-meteo.com/en/docs#hourly-parameter-definition).

Las propuestas conservan fuente/hash/captura, tiempos, vigencia, alcance, regla,
razones, limitaciones, recomendaciones referenciadas y confianza **en evidencia**
partial. Severidad editorial watch no sustituye sourceRiskLevel. Siempre:
`publicationBlocked=true`, `alertsPublishEnabled=false`, `dispatchMode=DRY_RUN`.

`GridWeatherBridge` importa un JSON local del panorama v4; no consulta la estación.
Conserva solo fecha medida, intensidad, acumulado y estado de recuperación. No
persiste MAC, GPS, IP, historial, campos extra ni mensajes de error. Normaliza UTC
y preserva texto temporal válido. La fecha del panorama/archivo no retrocede la
captura de AEGIS. Fixtures y fuentes reales tienen almacenes separados; una
disponibilidad simulada solo es admisible en modo sintético y no se marca verificada.

```sh
node scripts/import-grid-weather.mjs --status-json=/ruta/panorama-local.json \
  --data-dir=/ruta/archivo-investigacion
node scripts/assess-hazards.mjs --data-dir=/ruta/archivo-investigacion \
  --area=pallatanga --as-of=2026-10-27T20:00:00Z
```

Sin argumentos, no hay red ni escrituras. Evaluación privada, sin rutas públicas.
Rollback: dejar de ejecutar CLI, conservar archivos; no hay scheduler ni migración
de observations.json. Restaurar backups únicamente a raíz nueva y verificarlos.

## Pruebas con capturas reales

Se verificó el archivo INAMHI de M1 en `/tmp/aegis-m1-research-20261027`, sin GET
nuevo. A las `2026-10-27T19:59:03.861Z`, generó un candidato bloqueado del boletín
83, alcance provincia Guayas. El registro legacy incompleto quedó excluido y se
usó la interpretación posterior fechada. **No** demuestra que AEGIS avisara el 25
ni que anticipara la tormenta. No se publicó ni se redistribuyó el PDF.

Se revisaron [Single Runs](https://open-meteo.com/en/docs/single-runs-api) y los
[parámetros Forecast](https://open-meteo.com/en/docs): inicialización no equivale
a disponibilidad, y el modelo puede seleccionarse explícitamente. A las 20:01Z,
`models=ecmwf_ifs` devolvió HTTP 200, 72 horas, mm. Cambiar solo el modelo a un
control inválido devolvió 400. [Evidencia sanitizada](source-probes/2026-10-27-model-selection.json).

El perfil `openmeteo.singlerun.ecmwf` usa `modelIdentityBasis=explicit_request`:
el JSON no repite la identidad; no se inventa un eco. Un eco contradictorio se
rechaza. Se conserva el perfil legado sin selección para auditoría. El archivo
local del modelo se verifica por hash con el CLI; una captura actual de corrida
antigua nunca prueba disponibilidad histórica. Licencia comercial, validación
local y uso operacional siguen como gates independientes.

## Corpus y métricas

`replay/multihazard-corpus.v1.json` representa Guayaquil/Pallatanga, 21–27/10.
Las brechas son unknown con outcome=null. Hay referencias fechadas del 25–26 de
Guayaquil y captura de investigación del 27; no se inventaron días sin incidentes
ni archivo primario histórico. Se reutilizan las citas del caso existente.

```sh
node scripts/replay-hazards.mjs
node scripts/replay-hazards.mjs 2026-10-25T22:00:00Z 2026-10-25T23:30:00Z
```

Modo documental separado de capturas: las noticias son referencias secundarias,
no avisos primarios OFFICIAL. La intensidad retrospectiva nunca entra a features.
Los 1139 minutos son publicación periodística→ventana de lluvia de tarde, no
entrega real, anticipación de todas las inundaciones o precisión por barrio.

`scoreReviewedCases` exige target homogéneo, revisión/procedencia, cobertura,
compatibilidad y ventanas verificadas. Señales anteriores al corte; outcomes
revisados después del período. Los fixtures prueban TP/FP/FN/TN. FAR=FP/(TP+FP),
FPR=FP/(FP+TN), missRate=FN/(TP+FN), con denominadores explícitos; denominador
vacío da null. La latencia solo se calcula contra publicación independientemente
fechada, sin afirmar hora de primera subida web.

El reporte documental actual tiene FAR/missRate/sourceDetectionLag desconocidos.
No hay corpus negativo validado ni modelo operacional calibrado. Los números de
fixtures se identifican como sintéticos y no se transfieren a estadísticas reales.

## Gate de cierre y verificación

Implementados motor, integración, clases, replay, reporte de brechas y métricas.
Faltan corpus real compatible positivo/negativo, permisos y geografía validados
para certificar rendimiento/operación. No se declaran cumplidos por tests verdes.
M4 editorial, suscripciones y outbox simulada es el siguiente trabajo autorizado;
M5 conserva aprobación operativa expresa separada.

Pruebas de correcciones/futuro, source/kind/URL, scope, privacidad del puente,
nulos/frescura/umbrales, 24 horas completas, modelo/availability, contexto estático,
métricas y separación de orígenes. Los tests de v4 y replay original se conservan.

Verificación local del incremento: `npm ci` (0 vulnerabilidades), `npm run check`,
`npm test` (**115/115**), contratos con `python3` (**6/6**), ambos replays y
`git diff --check` correctos. Imagen Docker construida; **60/60** pruebas de
hazards con `--network none`. El alias `python` no existe en este laboratorio;
se ejecutó con `python3` sin cambiar el workflow de Ubuntu.


## Revisión de vigencia futura

Un aviso primario ya conocido puede entrar a revisión preventiva antes de validFrom;
no se espera al inicio del período para proponerlo internamente. La regla versionada
`official-warning-known-unexpired` exige emisión/ventana completas y fin posterior
al corte. Preserva las fechas originales, no anticipa la captura y no confirma un
incidente. La identidad permanece estable al pasar de vigencia futura a efectiva;
un aviso vencido o aún no conocido queda excluido. La regla oficial tiene versión
`official-warning-known-1`, independiente de los umbrales experimentales de lluvia.

Vista previa recibe corte explícito del procesador y distingue futuro/vencido;
ningún texto equipara vigencia con daños. Cambio de política puede invalidar
candidatos internos anteriores para nueva revisión; no reescribe bytes ni versiones
fuente. La cancelación de outbox usa motivo general evidence_no_longer_eligible,
pues una pérdida de elegibilidad no demuestra que el proveedor cambió el documento.
Regresiones y suite completa: **175/175** Node, **120/120** Docker sin red,
**6/6** Python, check/replays/diff-check correctos. Sin publicación o nuevos GET.

## Corrección de frescura de captura

El TTL declarado por fuente se aplica ahora además de la vigencia documental.
Las evaluaciones anteriores de un PDF a más de una hora desde su descarga no
prueban frescura bajo esta regla; conservan valor documental/histórico únicamente.
La recaptura real y su comparación están registradas en
[source-probes/2026-10-27-inamhi-evidence-lifecycle.json](source-probes/2026-10-27-inamhi-evidence-lifecycle.json).
No se antedata disponibilidad ni se simula retrospectivamente una descarga.

## Corridas manuales de los dos pilotos

El perfil ECMWF admite selección UTC/piloto acotada, sin URLs ni coordenadas del
operador. Reproceso y evaluación conservan URL/ámbito/disponibilidad, evitando
confundir dos puntos en una corrida. No hay polling automático ni consultas reales
nuevas en esta validación. Ver [diseño y uso](../architecture/manual-forecast-runs.md).
La validación externa de nuevas combinaciones y derechos sigue pendiente.

Validación de este incremento: npm ci sin vulnerabilidades, check, **194/194**
Node, **139/139** en imagen local con dependencias nativas/código actual y red
bloqueada, **6/6** Python, ambos replays y diff-check correctos. No se reconstruyó
la imagen contra Docker Hub en este ensayo. CI de 90d25a3 pasó en Node 22/24 y
contenedor (run 40608037142); el nuevo commit requiere su propia CI.

## Validación real Pallatanga y aislamiento de frescura

Un único GET de investigación para ECMWF/Pallatanga, corrida 27/10 12 UTC,
respondió 200 en 1115 ms. Archivo privado verificado: 1 captura/1 artefacto,
1993 bytes, 72 tiempos y 1 valor faltante. Disponibilidad comprobada realmente
28/10 00:24:00.019Z (27 local), no al inicializar. Evaluación unknown/0 candidatos,
no «sin riesgo». [Metadatos](source-probes/2026-10-27-pallatanga-manual-forecast.json);
no se publican bytes ni se aprueban candidatos reales. Términos consultados:
https://open-meteo.com/en/terms ; no se infieren permisos de operación/publicación.

Se reprodujo con tres pruebas fallidas la mezcla de puntos en health: una captura
reciente de Pallatanga renovaba el estado filtrado de Guayaquil y solo se verificaba
el artefacto más reciente global. Corregido: selección y verificación por punto,
unknown si falta el punto o URL registrada, sin recorrer cada corrida histórica.
La salud sigue siendo de disponibilidad/captura, nunca de seguridad del territorio.

Verificación acumulada: check, **197/197** Node, **142/142** con código actual
y dependencias nativas de imagen local sin red, **6/6** Python, ambos replays
y diff-check correctos; dependencias sin cambios desde npm ci (0 vulnerabilidades).
CI de a713092: success Node 22/24 y contenedor, run 40608435679.

## Coordenadas del proveedor conservadas y verificadas

El pronóstico ya diferencia punto solicitado y celda devuelta; missing/null no se
rellena con cero ni con coordenadas solicitadas. Nuevos campos discriminados,
parser versionado y comprobación de coherencia en evaluación. Metadatos ausentes
o contradictorios impiden proponer pronóstico; el límite técnico no certifica
pertenencia cantonal ni riesgo. Legado legible, sin migración destructiva.
Ver [diseño y límites](../architecture/forecast-grid-provenance.md).

Reproceso privado real sin red: dos registros/un artefacto, SHA y captura original
preservados, horarios originales de descarga/disponibilidad intactos. No renueva
TTL, no hubo aprobación ni notificación. Evidencia sanitizada en source-probes.

Verificación 28/10: npm ci 0 vulnerabilidades, check, **208/208** Node y **6/6**
Python, replays/diff-check correctos. Imagen local anterior no disponible; se
reconstruyó Docker correctamente y pasan **153/153** sin red. /ui 200 con flags
OFF y directorio experimental oculto; CLI sin opciones no ingiere ni publica.
CI anterior 7de9836 success Node 22/24 + contenedor, run 40609316312.

## Compatibilidad temporal de métricas

Se reprodujo un TP incorrecto cuando la señal vencía antes del evento: el control
solo comprobaba vigencia mayor al inicio de ventana. Corregido para exigir toda
la ventana homogénea, con signalValidFrom explícito. Cobertura parcial/desconocida
se excluye de clasificación/denominadores/leadTime/latencia, sin inventar negativos.
La política se declara en la salida. [Definición](../architecture/replay-metric-windows.md).
Sin casos reales nuevos: las tasas históricas siguen desconocidas.

Verificación del incremento: npm ci 0 vulnerabilidades, check, **209/209** Node,
**154/154** con código hazards actual montado en imagen local/dependencias nativas
y red bloqueada, **6/6** Python, ambos replays y diff-check. CI de 743607f terminó
success en Node 22/24 y contenedor: run 40683853168. Nuevo head requiere su CI.

## Runner comparativo público

`npm run benchmark:hazards` y `npm run benchmark:compare` funcionan sin red/claves,
con 13 controles propios MIT, etiquetas separadas y baseline congelado. Informan
fallos, omisiones, faltantes, cohortes y deltas comunes sin modificar shadowPolicy.
[Protocolo](../architecture/hazard-benchmark.md). Resultados sintéticos no son
rendimiento histórico ni sustituyen el corpus real, que sigue con brechas.

Verificación: npm ci 0 vulnerabilidades, check, **252/252** Node, **197/197**
en contenedor reconstruido sin red, **6/6** Python y ambos replays. El CLI de
comparación produjo JSON idéntico en host/contenedor: 13 casos, 8 evaluados,
5 con fuente no utilizable y 0 cambios frente al baseline inicial. IDs de snapshot
opacos y prueba explícita evitan filtrar los nombres de controles/etiquetas al
motor. Política/método activo sin cambios; dataset sintético, sin API o claves.
