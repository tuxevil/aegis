# Ventanas compatibles para métricas de replay

Las tasas describen casos revisados de un corpus compatible; no representan
probabilidad de desastre. `forecastPositive` no basta para clasificar un acierto:
una señal conocida al corte debe cubrir también la ventana temporal evaluada.

`scoreReviewedCases` declara `signalWindowPolicy=full_evaluation_window_v1`.
Para una señal positiva exige signalValidFrom/signalValidTo canónicos UTC y
`signalValidFrom <= windowFrom < windowTo <= signalValidTo`. Las ventanas son
semiabiertas: un evento tiene que ocurrir dentro de [windowFrom,windowTo).
Los casos con cobertura parcial o desconocida se excluyen con
signal_window_not_covered, fuera de todos los denominadores, leadTime y latencia.

Razón: el control anterior solo exigía signalValidTo > windowFrom y podía contar
como TP un evento posterior a la caducidad del aviso. También podía contar FP
sobre una ventana negativa cubierta solo en parte. El ensayo reprodujo el fallo
antes de corregirlo. Ahora los revisores deben elegir una ventana homogénea
completamente cubierta; no se recortan ventanas ni se desplazan eventos de forma
automática para hacer pasar el caso.

Para negativos sin señal no se inventa una vigencia: siguen exigiéndose revisión,
procedencia, coberturaVerified/compatibilityVerified, objetivo homogéneo y fechas
completas. No tener señal o registro no prueba un no-evento. El conocimiento al
corte, revisión posterior al fin y procedencia siguen siendo requisitos separados.

Casos legados sin signalValidFrom siguen legibles como datos de entrada pero no
se puntúan como señales positivas. No se adivinan sus fechas. Los fixtures de
métricas ahora declaran expresamente esa vigencia y no son evidencia histórica.
El corpus documental real mantiene sus resultados desconocidos y tasas null.

Pruebas: señal que vence antes del evento, inicio posterior a la ventana, ausencia
de inicio, falso positivo con cobertura parcial y control de cobertura completa.
Los checks existentes de TP/FP/FN/TN, UTC/corte, procedencia y denominadores se
mantienen. Sin nuevos datos externos, cambios de umbrales, publicación o alertas.
