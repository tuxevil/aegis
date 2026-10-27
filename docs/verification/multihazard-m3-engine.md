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
| Aviso primario INAMHI vigente | Candidato OFFICIAL, nivel fuente literal | Provincia/cantón explícito, no barrio |
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
