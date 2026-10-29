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

- Baseline427 Node, luego441 Node en host y contenedor reconstruido network:none;
  ampliación posterior de recuperación/corpus se verifica antes del push.
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

Fuentes reales: documentación pública leída, sin nuevos probes de APIs, sin
consulta Amaru ni acceso a sistemas privados. Corpus ampliado mediante referencia
institucional18–19/10, exclusivamente hindsight_only; no un nuevo input de replay
o un label positivo/negativo. Pallatanga sin negativo verificado, precisión/errores/
anticipación reales siguen desconocidos con denominador elegible0.

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
