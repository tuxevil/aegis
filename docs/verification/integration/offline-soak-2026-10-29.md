# Ensayo offline de duración real — 29/10/2026

HEAD inicial verificado: #37 ebd7604, #36 fb6e1ed, #35 3c540af,
#34 3fc1bb3, #33 fb64ced, #32 24c41e3; CI funcional verde y baseline444 Node.

## Defectos corregidos para operación prolongada

El plazo antes se calculaba desde cada arranque y la secuencia sintética volvía
a cero. Ahora run.json conserva inicio/deadline, segmentos e interrupciones;
la secuencia usa intentos reservados persistentes. Un reinicio no concede siete
días nuevos. La ampliación explícita7→14 mantiene el inicio original y se registra.
Heartbeat perdido no demuestra instante de caída: se conserva el último conocido
sin inventar fin. Dos interrupciones no esperadas/24h detienen el siguiente arranque.

Guardas automáticas adicionales: OOM del cgroup limitado, dos muestras de memoria
≥min(360MiB,94% del límite), RSS>320MiB sostenido5min. No atribuir memoria/OOM de
un cgroup de host grande o tests al runtime. CPU sigue limitada por Docker0.5;
los presupuestos de disco/checkpoints/stores se mantienen. Logs Docker2MiB×3.

## Experimento ejecutado

`node scripts/verify-offline-soak.mjs --image=aegis-offline-soak:dev`.
Solo Docker de desarrollo, nonroot, red none, readOnly, cap_dropALL, no puertos,
0.5CPU/384MiB,96PIDs y heap192MiB. No se accedió a Proxmox.

Resultado exportado: [mediciones](offline-soak-2026-10-29.json).
Duración de orquestación **123.346s**, deadline runtime120s desde el inicio inicial.
Dos segmentos reales: primero termina por señal, segundo por deadline original.
Reinicio alrededor de30s, PAUSE alrededor de60s, reanudación alrededor de75s.
En muestras62.234/66.293/70.351s los intentos permanecieron6: no polling en pausa.
Healthcheck correcto; exit0, OOMKilled=false, sin contenedor de prueba persistente.

Siete capturas/evaluaciones, dos raw por dedup, sin capturas sin evaluación.
Backup de todos los bytes y restore a nueva raíz pasaron verificación semántica.
El último reporte muestreado tenía11 intentos,6 éxitos y5 fallos. Un timeout del
perfil corto pudo conservar captura/evaluación completadas: no se cuenta como
éxito por ello, ni se borran los artefactos. Cadencia5s/timeout1s son **solo fixture**,
no propuestas para INAMHI. Cada evaluación conserva tiempos de reloj real.

31 muestras: RSS49,582,080–74,428,416bytes; memoria cgroup16,949,248–38,993,920bytes.
Disco muestreado11,835→58,294bytes (antes de escrituras finales/exportación).
Red namespace RX/TX0. CPU, I/O, PIDs y latencias están en JSON por muestra y origen;
CPU de procesos reiniciados no se resta como si fuera uno solo. write_bytes=0 en
una muestra no significa cero escritura física del SSD. Energía/vatios=null.

La suite paralela que sufrió OOM en384MiB era un arnés de desarrollo distinto.
Este resultado demuestra este ensayo corto, no suficiencia para PDFs reales,
concurrencia no ensayada, cortes de energía o siete días sin intervención.

## Siete días sin sesión Codex: preparado, no iniciado

Reutilizar el [runbook](../../runbooks/shadow-observation-7-14-days.md) y
`compose.shadow-lab.yaml`: Docker detached, volumen propio, healthcheck y reinicios
acotados; el deadline ahora es persistente. No ejecutar en Proxmox sin permiso.
Con el mismo volumen, ampliar explícitamente command a --days=14 añade extensión
registrada; no reinicia la observación ni demuestra cobertura de los huecos.
Run.json indica segmentos y fin, state/report conservan cuotas/heartbeat y diarios.
PAUSE suspende, compose stop termina limpiamente, snapshot exporta todo con hashes;
shadow-verify valida antes y después de restore. No borrar locks/cuotas a ciegas.
Tras fin por deadline no reiniciar automáticamente el ensayo ni declarar estabilidad
solo porque transcurrió tiempo calendario: revisar gaps, muestras y condiciones.

Perfil corto reproducible: `--lab --root=RAIZ_NUEVA --wall-clock --short-fixture
--seconds=120`. Es mutuamente excluyente con --days y no consulta proveedores.
El script de prueba lo ejecuta, reinicia/pausa, verifica y retira solo su contenedor.

GO limitado para ensayo offline prolongado en host autorizado, no ejecutado aquí.
NO-GO fuentes periódicas/Proxmox/precisión/alertas. El informe INAMHI separado
debe resolver permisos y el transporte/red antes de pedir autorización de consulta.
