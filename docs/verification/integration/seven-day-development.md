# Ensayo de siete días en desarrollo — iniciado, no completado

Autorizado expresamente por el propietario en esta máquina de desarrollo.
Se verificaron #38=eb3d90c, #39=fc41710 y #40=da7db65 con CI verde.
Evidencia estructurada: [inicio e aislamiento](seven-day-development-start.json).

## Identidad y estado comprobado

- Contenedor: `aegis-seven-day-20261029-aegis-1`, ID
  `d9d88193bbdee0218b1d65eba96b0a79798e9d90e1492b5ae2bc2e789a15a457`.
- Commit ejecutado: `da7db65a40ab7a5cd04be1c2dc526c096996e7e4`, imagen
  `aegis-supervised-staging:soak-da7db65-20261029`; imageId registrado en JSON.
- Inicio original: **2026-10-29T23:22:04.474Z**.
- Deadline original: **2026-11-05T23:22:04.474Z**, persiste en run.json.
- Volumen exclusivo: `aegis-seven-day-20261029_shadow-lab-data`; raíz `/data/shadow-lab`.
- CPU0.5, RAM384MiB, heap192MiB,96PIDs, usuario1000:1000, rootfs readOnly,
  cap_dropALL/no-new-privileges, red none, sin puertos ni credenciales reales.
- Estado inicial healthy, primera captura/artefacto/evaluación sintéticos correctos,
  sin OOM. Directorio0700 y checkpoint0600, propiedad1000:1000.
- Límites de archivo128MiB globales del runner,32MiB raw y1000 capturas/evaluaciones;
  anillo96 eventos,16 diarios, logs Docker local2MiB×3. No ingesta de134MB/día.

Se repitió primero el ensayo corto de tiempo real con imagen recién construida:
**124.051s**, reinicio, pausa, deadline,9 capturas/evaluaciones,2 raw y backup/restore
verificados, exit0 y sin OOM. Es preparación, no siete días observados.

En el volumen real se hizo un control inicial de recuperación: parada limpia,
exportación, snapshot verificado, restore a raíz nueva y verificación semántica.
Se reanudó **el mismo contenedor/volumen**. Deadline, intentos y cooldowns idénticos.
Interrupción conocida2.660s, dos segmentos en run.json; no se cuenta como uptime.
El clon restaurado solo se verificó, no se ejecutó otro observador.

Primer punto de recursos: RSS76685312bytes, cgroup37879808bytes,12PIDs,
CPU proceso user760935/system240714microsegundos, RX/TX0 y storage7620bytes antes
de últimas escrituras. No son picos, promedios diarios ni tendencia de memoria.
powerWatts y energyWh permanecen null. Source/report/daily conservan métricas por
proceso y por contenedor, sin atribuir cargas del host al servicio.

## Persistencia y límites del entorno

Docker29.4 activo mediante systemd, socket local y ejecución detached. Había
aproximadamente4GiB disponibles de8GiB y59GiB libres; no se tocaron otras apps,
límites del host o Proxmox. El proceso no depende del terminal ni de Codex.
Esto no garantiza que el proveedor conserve la máquina durante siete días.
LiveRestore está deshabilitado; restart:on-failure:3 no garantiza reanudación tras
reinicio del daemon/host. Si sucede, inspeccionar y usar docker start sobre el mismo
contenedor, conservando deadline y gaps. No se cambió el daemon ni se instaló watchdog.
No hay seguimiento automático de Codex ni promesa de entrega futura por el agente.

## Supervisión sin reiniciar

```sh
docker inspect -f '{{.State.Status}} {{.State.Health.Status}} {{.State.OOMKilled}}' aegis-seven-day-20261029-aegis-1
docker stats --no-stream aegis-seven-day-20261029-aegis-1
docker logs --tail=30 aegis-seven-day-20261029-aegis-1
docker exec aegis-seven-day-20261029-aegis-1 node scripts/shadow-lab-health.mjs --root=/data/shadow-lab
docker exec aegis-seven-day-20261029-aegis-1 node -e 'const fs=require("fs");for(const f of ["run","report"])console.log(JSON.stringify({file:f,value:JSON.parse(fs.readFileSync("/data/shadow-lab/"+f+".json")).value}))'
```

Heartbeat/minuto; fuentes cada30min como máximo48/día móvil, backoff y pausas
sintéticas. No esperar que cada tick haga una captura. Report/daily guardan CPU,
RSS/cgroup, I/O/red/PIDs/disco, intentos/bytes/latencias y fuente unknown/stale;
ninguna ausencia demuestra seguridad. Restar contadores solo dentro del mismo
actualStartedAt y declarar huecos sin muestras. run.json registra segmentos/deadline.

## Pausa y parada

No ejecutar controles simultáneos. Registrar la acción en bitácora privada y
confirmar report.paused/heartbeat en el siguiente minuto:

```sh
docker exec aegis-seven-day-20261029-aegis-1 node -e 'const fs=require("fs");fs.writeFileSync("/data/shadow-lab/PAUSE", "", {mode:0o600});fs.appendFileSync("/data/shadow-lab/operator-events.jsonl",JSON.stringify({at:new Date().toISOString(),action:"pause_requested"})+"\n",{mode:0o600})'
docker exec aegis-seven-day-20261029-aegis-1 node -e 'const fs=require("fs");fs.rmSync("/data/shadow-lab/PAUSE",{force:true});fs.appendFileSync("/data/shadow-lab/operator-events.jsonl",JSON.stringify({at:new Date().toISOString(),action:"resume_requested"})+"\n",{mode:0o600})'
docker stop --timeout 20 aegis-seven-day-20261029-aegis-1
```

El journal registra solicitudes, no inventa el instante de aplicación del tick.
Guardas automáticas: disco/capturas/checkpoints; OOM del cgroup limitado; memoria
cgroup crítica dos muestras; RSS>320MiB durante5min; dos interrupciones no esperadas
en24h. No se elevan límites ni se purga evidencia. Las escrituras/errores inesperados
se conservan para revisión; no resetear cuotas o run.json para volver a empezar.

## Respaldo, exportación y verificación final

Con escritores detenidos y rutas nuevas de laboratorio:

```sh
docker cp aegis-seven-day-20261029-aegis-1:/data/shadow-lab /tmp/aegis-seven-export-NUEVO
node scripts/shadow-verify.mjs --root=/tmp/aegis-seven-export-NUEVO
node scripts/staging-snapshot.mjs --backup --from=/tmp/aegis-seven-export-NUEVO --to=/tmp/aegis-seven-snapshot-NUEVO --quiesced
node scripts/staging-snapshot.mjs --verify --snapshot=/tmp/aegis-seven-snapshot-NUEVO
node scripts/staging-snapshot.mjs --restore --snapshot=/tmp/aegis-seven-snapshot-NUEVO --to=/tmp/aegis-seven-restored-NUEVO
node scripts/shadow-verify.mjs --root=/tmp/aegis-seven-restored-NUEVO
```

Si era una parada intermedia, `docker start aegis-seven-day-20261029-aegis-1`
reanuda el mismo ensayo; verificar deadline antes de continuar. Tras deadline,
no reiniciar: comprobar exit0/reason deadline, analizar muestras/gaps, integridad,
errores, memoria/CPU/I/O y crecimiento. El reloj calendario no certifica uptime.
No usar down -v, no borrar el volumen y no iniciar otro runner sobre sus datos.
