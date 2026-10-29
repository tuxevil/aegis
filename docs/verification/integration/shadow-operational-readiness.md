# Preparación operacional — GO/NO-GO (29/10/2026)

## Corte y seguridad

Se reconsultó GitHub: #32=24c41e3, #33=fb64ced, #34=3fc1bb3,
#35=3c540af y #36=fb6e1ed, todos abiertos, checks funcionales verdes al inicio.
Main=0339762 sin modificación. npm ci119 paquetes auditados,0 vulnerabilidades;
baseline repetido427/427 Node. La revisión independiente por contexto y sus fixes
están en [informe](operational-review-2026-10-29.md), no equivale a auditoría humana
externa ni usa HTTP402 como aprobación. Main sigue requiriendo protección/revisión;
no se aplicaron reglas ni se cerraron sus cinco alertas de dependencias por inferencia.

## Implementación concreta

Runner serial separado: cuotas móviles persistentes, reserva previa al callback,
403/429/backoff/timeouts, caché temporal, dedup raw, estado privado/checksum/fsync,
lock, PAUSE/señales y parada por crecimiento. CLI solo sintética; ninguna URL,
credencial o flag permite ingesta real o entrega. Backend/rutas/persistencias
anteriores y compose offline intactos; no nuevo servicio/DB/dependencia.

Observabilidad privada: CPU/RSS/heap/I/O/red/cgroup, latencia/bytes por intento,
heartbeats separados de salud de fuente, estado source unknown/stale/degraded,
anillo acotado y resúmenes diarios con reloj real. Energía siempre null. Evaluaciones
inmutables contienen trazabilidad del motor original; discrepancias con contrato,
origen y referencias, fuera de labels automáticos. Recuperación verifica archivo
anidado/checkpoints/evaluaciones además del backup existente de todos los bytes.

[Contrato](../../contracts/shadow-operation-v1.md),
[procedimiento ejecutable7–14 días](../../runbooks/shadow-observation-7-14-days.md),
[fuentes/permisos](operational-source-matrix.md),
[matriz estructurada](operational-source-matrix.json).

## Evidencia local, límites explícitos

- Baseline427 Node; las ampliaciones intermedias pasaron441 y442 Node en host y
  contenedor reconstruido network:none. La revisión añadió regresiones adicionales.
- Resultado final tras esas correcciones: **444/444 Node en host y contenedor
  reconstruido sin red**, check correcto y **6/6 contratos Python**. La suite del
  contenedor usa concurrencia2; el ciclo runtime y señales sí se probaron con el
  presupuesto0.5 CPU/384MiB. No confundir ambos tipos de medición.
- Seis contratos Python aprobados. Config render del nuevo override verifica
  red none, sin puertos, solo lectura,0.5 CPU/384MiB y volumen distinto.
- Ciclo corto en contenedor nonroot/readOnly/capsALLdrop/PIDs96 con esa CPU/RAM:
  **2.518 segundos**,6 intentos sintéticos,3 éxitos,3 fallos controlados,0 solicitudes
  externas. Tres evaluaciones archivadas; hashes compartidos para bytes idénticos.
- Muestra final del mismo ciclo: RSS74379264bytes (~70.9MiB), CPU proceso
  user1290112/system456810microsegundos, red namespace RX0/TX0,
  storage25476bytes antes de últimas escrituras de report/daily,
  caracteres escritos115238, write_bytes0 en ese instante. No equivale a escrituras
  físicas finales, consumo diario o vatios; no extrapolar a carga real.
- El fallo previo de suite paralela a384MiB y cuatro OOM permanece documentado
  en el runbook #36; no se oculta usando un promedio favorable.
- Backup/restore probado a root nuevo y rechazo de raw corrupto, modo live,
  flags/URLs de activación, checkpoint corrupto, reloj atrasado, lock paralelo,
  timeout y proveedor que ignora abort. Lista de comandos en contrato/runbook.
- Prueba breve wall-clock de arranque/heartbeat/SIGTERM, no ensayo de7 días:
  contenedor actualizado, init, red none, readOnly,0.5 CPU/384MiB, sin puertos;
  heartbeat aprobado y apagado limpio exit0, sin OOM, tras7.877 segundos.
  Un intento sintético/una captura/una evaluación, verificación posterior correcta,
  sin lock huérfano. Muestra docker stats0.00%CPU,33.6MiB/384MiB,12PIDs; no promedio
  de días ni energía. Se retiró únicamente ese contenedor de prueba; evidencia retenida.

Fuentes reales: documentación pública leída, sin nuevos probes de APIs, sin
consulta Amaru ni acceso a sistemas privados. Corpus ampliado mediante referencia
institucional18–19/10, exclusivamente hindsight_only; no un nuevo input de replay
o un label positivo/negativo. Pallatanga sin negativo verificado, precisión/errores/
anticipación reales siguen desconocidos con denominador elegible0.

## Standards

Revisión de contexto separado del diff respecto a #36, sin editar ni usar red:
dos hallazgos iniciales, peorP2. La validación de cuerpo podía omitir pausa403/429;
y un callback que decía ok con HTTP403 se contaba como éxito(P3). Corregidos con
orden de pausa anterior al body y al abort, rechazo HTTPno2xx y regresiones que
incluyen429 tardío tras timeout. Revalidación independiente16/16 específica,
cero confirmados pendientes en este eje; no implica ausencia de vulnerabilidades.

## Spec

Tres P2 iniciales: Retry-After de8 días reducido a24h, HTTP500 contradictorio
contado como éxito y métricas diarias insuficientes al rotar eventos. Corregidos:
pausa larga persistente, HTTPerror prevalece y agregados durables diarios por fuente
con latencias/budget/bytes. OtroP3 de exportación al cruzar medianoche se reprodujo
y corrigió actualizando agregados previos sin inventar muestras. Revalidación
independiente16/16 específica, sin nuevos defectos confirmados.

Resumen por eje: Standards2 corregidos(peorP2),0 pendientes; Spec3P2+1P3
corregidos,0 pendientes. Algunos casos HTTP se solapan entre ejes; no se suman
como vulnerabilidades distintas. Revisión asistida por agentes, no aprobación humana
externa ni sustituto del ensayo operacional autorizado.

## Decisión por ámbito

| Ámbito | Decisión | Evidencia o bloqueo |
| --- | --- | --- |
| Desarrollo/reproducción offline | GO limitado | CLI/fixtures/tests y recuperación; no certifica runtime de días |
| Ensayo offline wall-clock7–14 días en desarrollo | Preparado, no ejecutado | Config/comandos; duración y recursos aún por observar |
| Ingesta periódica real | **NO-GO** | Permisos/cadencias pendientes, red/DNS/host no comprobados, puente real sin conectar/revisar |
| Proxmox | **NO-GO** | Sin autorización de instalación/ejecución; ningún acceso realizado |
| Precisión predictiva | **NO demostrada** | Faltan cobertura temporal y negativos compatibles; no tasas/probabilidades inventadas |
| Usuarios/publicación/transportes | **NO-GO** | DRY_RUN obligatorio, sin autorización y gates científicos/operativos abiertos |

La revisión heredada señala fsync de directorio del archivo inmutable original y
carga de journals cerca de cuota como preocupaciones aún no reproducidas; estos
checkpoints nuevos sí sincronizan directorio. El transporte energético heredado
sin verificación TLS sigue siendo riesgo residualP2, sin importarlo al observador.
Se necesita revisión humana/operativa proporcional antes de servicio público;
no se afirma cumplimiento LOPDP ni ausencia de vulnerabilidades desconocidas.

Antes de una autorización real, cerrar las condiciones enumeradas en el runbook:
permisos/productos, cadencias/cuotas/tamaños medidos, firewall/DNS probado,
puente real con tests de fallos, backup/restore con ese perfil y responsables de
revisión diaria/suspensión. La aprobación de un PR no satisface estos puntos.
