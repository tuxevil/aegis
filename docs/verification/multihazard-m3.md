# M3 — Avance de selección temporal en sombra

Estado: **M3 con gate histórico pendiente**. Rama `feat/multiamenaza-m3` sobre M2.
Este documento conserva el fundamento temporal inicial. La [entrega de motor,
integración y métricas](multihazard-m3-engine.md) amplía su implementación.
La adquisición de capas sigue con gates externos; eso no autoriza publicarlas ni
bloquea el desarrollo offline autorizado del motor en sombra.

`selectKnownCaptures` es una función pura sin fetch, escritura ni mensajes. Debe
recibir registros del almacén ya verificados por hash. Selecciona exclusivamente
lo que AEGIS podía conocer en un corte UTC: `max(retrievedAt, processedAt)`.
Emisión, inicio de vigencia y corrida de modelo no sustituyen esos timestamps.
Una interpretación corregida no puede aparecer antes de su procesamiento real.

Los pronósticos necesitan corrida, disponibilidad verificada coherente y modelo
identificado. Una descarga actual de una corrida antigua no prueba que AEGIS la
conociera entonces. Campos ausentes no se convierten en márgenes de disponibilidad
estimados ni en cero. La capa estática permanece `contextOnly`; nunca es un aviso
dinámico. La expiración exacta deja el registro auditable, con active=false. La
vigencia incompleta deja active=null, no una afirmación de seguridad.

Se separan explícitamente orígenes reales/sintéticos. Un registro legacy sin fecha
de procesamiento no se fecha automáticamente: se excluye de la selección estricta.
Si sus bytes existentes se reprocesan ahora, la nueva interpretación puede conocerse
desde su procesamiento explícito, sin inventar el momento de la interpretación
original. Duplicados de identidad, hashes incoherentes y referencias ambiguas se
rechazan. La función devuelve referencias/timestamps, no payloads crudos o claves
de almacenamiento. Todos los resultados llevan publicación bloqueada y DRY_RUN.

Pruebas cubren emisión anterior con captura tardía, correcciones posteriores,
forecast inicializado antes pero disponible después, modelo/fechas faltantes,
vigencia, legado/reproceso, aislamiento de fixtures, contexto estático y límites.
El replay existente de Guayaquil se conserva sin modificar su interfaz.
Validación local del incremento: `npm run check`, **99/99 pruebas Node**,
**6/6 contratos Python** y replay correctos. Durante el desarrollo una prueba
rechazó correctamente un fixture que usaba `dataStatus=partial`; se corrigió a
`unknown`, como exige el contrato sintético. No se relajó la validación para hacerlo pasar.

**Gate restante de M3:** validar el corpus positivo/negativo real y sus métricas.
El motor, integración, clases y métricas están implementados en el incremento
enlazado; las brechas históricas se conservan explícitas. No hay corpus negativo
validado ni probabilidades operacionales calibradas.
M4 (editorial/suscripciones/outbox en simulación) y M5 autorizado aparte siguen
pendientes del objetivo general.
