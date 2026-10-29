# Contrato operacional v1 — laboratorio y futura observación

Implementación: `hazards/shadow-runner.js`, `operational-metrics.js`,
`discrepancies.js`; ejecutables `scripts/shadow-lab.mjs` y
`scripts/shadow-discrepancy.mjs`. Sin dependencias nuevas, rutas HTTP, base nueva
o imports de distribución. El backend y sus tres persistencias no cambian.

## Scheduler

`ShadowRunner({root, plan, poll, now, measure}).open()` adquiere un lock exclusivo.
`tick()` ejecuta un lote serial, nunca solapado. `requestStop()` aborta el proveedor
activo y evita el siguiente; `close()` solo libera el lock cuando termina el lote.
Un proveedor debe respetar AbortSignal y limitar cuerpo/tiempo como SourceHttp.
Si ignora abort, se retiene lock y no se abandona una escritura en segundo plano;
el operador detiene el contenedor tras su grace period. Un lock tras SIGKILL
requiere comprobar escritores detenidos e integridad antes de recuperación manual.
No hay robo automático de locks ni reset automático de cuotas.

Plan version1: mode=`synthetic_fixture`, alertsPublishEnabled=false,
dispatchMode=DRY_RUN obligatorios; 1–8 proveedores registrados, key única,
intervalMs, dailyBudget (ventana móvil24h), timeoutMs, maxResponseBytes, ttlMs;
hostIntervalMs, maxDiskBytes y maxEvents globales. `poll(provider,{signal})`
devuelve status=`ok|unknown`, responseBytes conocidos, HTTP status si procede,
retryAfterMs normalizado y artifactSha256 para éxito. Nunca recibe URL libre.
Excepciones quedan en códigos cerrados; no se registran mensajes/URLs/secrets.

Se reserva intento y siguiente turno **antes** del callback. Fallos consumen cuota;
tras reinicio no se repite un intento perdido. 403/429 pausan el host y respetan
Retry-After mayor; sin dato utilizable, pausa conservadora24h. Backoff exponencial
acotado24h, sin bucle de retry. SourceHttp ya interpreta Retry-After fecha/segundos;
un futuro puente real debe transmitir el cooldown persistido, sin reinterpretarlo.
No se acorta Retry-After mayor de7 días; ante overflow temporal se retiene la pausa
hasta revisión. HTTP no2xx prevalece sobre status=ok y403/429 pausan antes de validar body.
La cuota de bytes máxima es dailyBudget × maxResponseBytes por proveedor;
bytes observados incompletos se marcan desconocidos, nunca se afirman cero.

State privado/checksum, escrituras atómicas + fsync de archivo y directorio,
formato/fingerprint estables. Cambiar plan no resetea cuotas: se rechaza el arranque.
Un directorio no marcado, permisos abiertos, corrupción o reloj atrasado fallan
cerrados. Root operador debe ser una ruta privada confiable, sin ancestros symlink.
No protege frente a un administrador malicioso del host ni equivale a firma.

Crear `ROOT/PAUSE` suspende todo polling en el siguiente límite de callback.
SIGTERM/SIGINT abortan el actual. Borrar PAUSE reanuda solo si no hay razón de
parada persistente; storage_budget requiere intervención/revisión. No purgar
evidencia para continuar automáticamente. Escaneo de disco por lote acotado10000
entradas; margen para checkpoint/captura y límites internos del archivo/evaluación.

## Evidencia, caché y métricas

CLI usa solo PDF sintético MIT generado en el repo. Reutiliza importFixture,
RawArtifactStore (1000 capturas,32MiB raw), dedup por SHA y assessArchive para
Guayaquil/Pallatanga. PDF identifica explícitamente SYNTHETIC TEST; sus fechas
generadas no son datos de INAMHI. Cada fetch simulado nuevo crea captura temporal;
raw idéntico se comparte. Antes del siguiente turno no se invoca al proveedor.

Evaluaciones privadas inmutables (máximo1000,1MB cada una, además del presupuesto
global) registran origen, captura/hash/revisión, emisión/captura/procesamiento,
disponibilidad conocida y los resultados existentes completos: política/regla,
referencias, alcance, exclusiones, limitaciones y nivel oficial separado.
Nunca modifican centro editorial/outbox ni crean avisos públicos.

`report.json` y daily/UTC.json son checkpoints acotados. Eventos recientes:96;
historia diaria:first/last, contador de muestras y agregados por fuente, máximo16 días.
Los agregados reservan intentos antes del callback y conservan éxitos/fallos,
bytes conocidos/desconocidos y conteo/suma/máximo/histograma de latencias incluso
cuando rota el anillo. La fecha es UTC real de inicio del intento; un intento sin
resultado tras crash queda como tal, no como éxito/fallo supuesto. Los originales
del archivo conservan trazabilidad; el anillo no es un journal exhaustivo.
CPU en microsegundos, RSS/heap en bytes, /proc/self/io, cgroup v2 y red del namespace;
medir deltas solo en el mismo proceso/namespace. RSS no equivale a toda la RAM del
contenedor. En host, el cgroup/red pueden incluir otros procesos: no atribuirlos
a AEGIS. Bytes lógicos escritos no equivalen a escrituras físicas del SSD.
PowerWatts/energyWh siempre null sin instrumentación autorizada.

El reloj acelerado solo prueba planificación: timestamps de captura/evaluación
usan reloj real. Nunca transforma segundos locales en evidencia de días estables.
Modo wall-clock permite un ensayo **offline sintético**7–14 días; no habilita APIs.
Cambiar entre relojes exige otro directorio, no normaliza tiempos anteriores.

## Discrepancias

Contrato de nota: kind (ocho categorías exportadas), recordOrigin, areaId,
sourceId registrado, evaluationRef, artifactHashes, officialReferences HTTPS,
decisionAt/reviewedAt UTC, reviewer pseudónimo y note≤2000 caracteres.
Referencias no se descargan. Datos reales/documentales requieren procedencia.
Entradas inmutables bajo discrepancies/ORIGIN, máximo1000 por origen y lock propio.
Correcciones añaden otra nota con evaluationRef=ID previo, no reescriben historia.
No admitir datos personales o secretos. No son ground truth ni alimentan métricas
automáticamente; no existe campo outcome o autorización de publicación.

Contribuciones: tests sin credenciales ni red; comparar presupuesto/reintentos,
reinicios, fallos, hashes y exclusiones. `--live`, URLs, aprobaciones por argumentos
y flags de publicación se rechazan. La CLI no tiene camino de ingesta real.
Conectar un transporte real requiere otra revisión y aprobación explícita, permisos
y red de salida verificadas. Este límite es un NO-GO real, no una fase completada.
