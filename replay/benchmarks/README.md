# Controles públicos sintéticos de AEGIS

**No son datos meteorológicos observados, incidentes históricos ni negativos reales
verificados. No validan precisión operacional ni probabilidades de desastre.**
Todos los valores y etiquetas son controles artificiales propios, MIT. No se
consultaron proveedores ni se copiaron respuestas de pago o material restringido.

```sh
npm ci
npm run benchmark:hazards
npm run benchmark:compare
```

Para JSON sin cabecera npm:

```sh
node scripts/benchmark-hazards.mjs
node scripts/benchmark-hazards.mjs --baseline=replay/benchmarks/rain-watch-controls.baseline.v1.json
```

No hay claves, red, DATA_DIR, archivos fuente privados, escrituras, aprobación,
outbox ni activación de reglas. El CLI solo acepta una ruta opcional de informe
baseline JSON, acotado a 2 MB; no carga código, pesos o módulos desde ese archivo.
Los informes se imprimen en stdout. Para conservar uno, elegir un archivo nuevo;
no sobrescribir el baseline versionado para esconder diferencias.

## Archivos e independencia

- synthetic-inputs.v1.json: 13 escenarios de snapshots normalizados con origen
  synthetic_fixture. Fechas de escenario, coordenadas de modelo aproximadas y
  representaciones de estación sin MAC/GPS privados. Los hashes de snapshot
  identifican JSON sintético, no bytes obtenidos del proveedor. No ejercita parser
  raw; esa parte está en example:source y sus pruebas contractuales.
- synthetic-labels.v1.json: etiquetas futuras artificiales y ventanas de evaluación,
  separadas de las entradas. Los IDs descriptivos de caso no entran al motor;
  los snapshots usan IDs opacos, sin revelar el resultado esperado. Una etiqueta
  nula sigue siendo desconocida. El runner
  solo pasa records/area/asOf/recordOrigin al motor, nunca outcome/eventAt/review.
- rain-watch-controls.baseline.v1.json: salida congelada de referencia para el
  método experimental inicial. No es un modelo anterior inventado ni un informe
  de campo. Mantenerlo al proponer otro método; revisar el cambio por caso.

Se ejercitan Guayaquil/punto de modelo y Pallatanga/estación como dos objetivos
separados, sin mezclar sus ventanas/unidades. Para cada uno hay controles de
acierto, falso aviso, omisión y negativo. Dos escenarios tienen entradas iguales
y etiquetas opuestas intencionadamente: prueban independencia y contabilidad de
errores, no son un conjunto de entrenamiento ni una muestra representativa.

Hay cinco casos de fuente no utilizable: slot faltante, ambos valores de estación
nulos, lectura antigua, fallo upstream y procesamiento posterior al corte. Tres
conservan una etiqueta positiva artificial. Se reportan como eventos sin evidencia
utilizable; no se pierden silenciosamente al excluirlos de tasas condicionadas.
Las fechas y fixtureForecastAvailabilityAt son de escenario; availabilityVerifiedAt
real sigue null. Los perfiles reales solo dan forma al contrato: no se atribuyen
estos valores a sus proveedores ni se conceden derechos sobre sus datos. MIT se
aplica a los controles propios. El corpus documental 21–27 y sus etiquetas reales
desconocidas no se mezclan aquí.

## Qué mide

Por objetivo/territorio: TP/FP/FN/TN, falsos avisos y omisiones con numerador y
denominador, casos evaluados/excluidos, desconocidos de fuente/etiqueta, eventos
sin evidencia y lead time. Los intervalos de lead time son sintéticos, no latencia
de entrega; sourceDetectionLag sigue null sin publicación independiente comprobada.
El negativo not_triggered significa que no se activó esta regla, nunca «riesgo bajo».

Para las ocho etiquetas utilizables del control inicial hay un TP, FP, FN y TN en
cada grupo. Las tasas 0.5 solo verifican ese cálculo artificial. No ofrecen una
estimación poblacional o intervalo estadístico válido para Ecuador.

## Comparar propuestas

El CLI calcula la salida actual del código revisado y vuelve a puntuar las
predicciones del baseline con las mismas etiquetas y scorer actual. Ignora sus
totales guardados. Exige el mismo corpus/hash de entradas/etiquetas, versión de
protocolo, IDs/objetivo/territorio/precisión/corte y modo sintético/DRY_RUN.

La comparación muestra cambios por caso y del tamaño de la cohorte. Las deltas
se calculan solo sobre casos evaluables en ambas versiones, con listas explícitas
de esos IDs. Sin cohorte común o denominador, devuelve null, no cero. Revisar
además eventos sin evidencia y cobertura: excluir casos difíciles no constituye
mejora. Señales deben cubrir toda la ventana de etiqueta conforme al scorer.

El informe conserva versión de regla, hashes de implementación, dependencias,
inputs y labels. Declara el hash del scorer usado en común y si cambió. Los hashes
son trazabilidad del checkout, no firma ni certificación del autor de un baseline.
Se marca comportamiento distinto sin cambio de versión de política para revisión;
no se activa ni se modifica la política de producción a partir del benchmark.

Si cambia el corpus, ejecutar ambas versiones sobre ese mismo corpus versionado;
no comparar tasas de muestras incompatibles. Una propuesta real incluye evidencia
independiente, derechos por pieza, revisión de etiquetas y errores por región.
Ninguna métrica sintética reemplaza esos gates o autoriza M5.
