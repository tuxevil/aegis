# Identidad de evidencia y frescura — corrección del ciclo editorial

La edición propuesta se identifica por su contenido revisable completo: hechos,
regla/política, calidad/parser, limitaciones, ámbito, vigencia y referencias de
versión (fuente/URL/SHA/emisión). evaluatedAt y datos de transporte de una referencia
(captureId, knownAt, retrievedAt, processedAt) no crean otra edición por sí solos.
Estos campos se conservan en el candidato original y en su digest auditado; no se
borran ni se sustituyen en la historia editorial.

El verificador valida primero que cada referencia original corresponda exactamente
a un registro archivado y fuera conocida al corte original. Después compara la
edición con la propuesta elegible al corte actual. Una recaptura con el mismo SHA
puede confirmar la misma edición; una alteración de hechos, incertidumbre, política
o parser requiere revisión nueva. La confirmación reciente se registra por separado
en outbox y vista previa, sin presentarla como una descarga realizada al procesar.

TTL de captura se evalúa al corte, además de vigencia documental y frescura de la
medición. Sin recaptura elegible, no se aprueba ni se simula la edición aunque su
validez documental continúe. No se infiere cancelación, restauración o riesgo bajo.
Cambiar la función de identidad puede invalidar candidatos privados anteriores;
no se migra ni reescribe el journal ni se publica nada automáticamente.

Un fallo conocido posterior a la captura bloquea confirmación hasta una captura
exitosa nueva. 403/429 se aplican al host con su Retry-After; que termine la pausa
no demuestra recuperación. Fallos posteriores al corte no contaminan replay.
En una URL oficial mutable, la última descarga conocida gobierna la confirmación;
reprocesar bytes antiguos no reemplaza esa descarga ni renueva TTL. Perder
eligibilidad no retracta el evento ni demuestra cancelación oficial.

Lectores de evaluación/admin abren el archivo en readOnly. Las fechas de fallos
requieren UTC y calendario válido. La interfaz expone calidad/parser y política.
