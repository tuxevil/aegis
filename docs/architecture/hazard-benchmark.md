# Benchmark offline separado del método

Implementación: hazards/benchmark.js, scripts/benchmark-hazards.mjs y
replay/benchmarks. [Uso, datos y limitaciones](../../replay/benchmarks/README.md).

El runner compara implementaciones, no ajusta el motor a sus etiquetas. El kernel
assessHazard y shadowPolicy permanecen intactos. Solo recibe una copia de los
snapshots y el corte/territorio/origen; el scorer accede a outcome y ventanas
posteriormente. Versiona el protocolo, la política real del resultado y el hash
del código de evaluación/dependencias, sin hora de ejecución o UUID volátiles.

Se rechazan origen real, campos extra de snapshots/casos y envelopes fuera de
contrato. Los controles tienen entradas normalizadas propias, sin artefactos de
proveedor; no sustituyen las pruebas de adquisición/parsing con bytes sintéticos.
Salidas del evaluador con otra geografía o publicación habilitada fallan cerradas.

La falta de candidato solo es not_triggered si hay un contexto completo para el
objetivo. Faltantes, antigüedad, fallo o falta de conocimiento al corte son unknown.
Para negativos de estación se exigen ambos valores de la regla completos: un null
no equivale a cero. El scorer comprueba que la evidencia cubra la ventana etiquetada;
no se agranda una ventana ni se reetiqueta el caso para hacer pasar el método.

Comparación: los reportes deben compartir corpus y hashes. Se recalculan ambas
puntuaciones con etiquetas/scorer comunes, sin confiar en agregados externos. Se
muestran cohortes completas y comunes, cambios de clasificación y deltas solo en
la intersección evaluable. Falta de cohorte/denominador es null. Cambios de código,
dependencias o comportamiento sin versión quedan visibles para revisión humana.

La API JS permite inyección de función únicamente para pruebas controladas y exige
identidad de implementación explícita; el CLI no importa código externo. No hay
endpoint público, registro automático, transporte o acceso a servicios. Los datos
JSON y el baseline se revisan en Git, no se aceptan como autorización de emisión.

Este artefacto cubre reproducibilidad de controles positivos/negativos y fallos.
La validación histórica con incidentes/no-incidentes reales, licencias, precisión
territorial y eficacia operacional sigue abierta. Amaru no es ground truth.
