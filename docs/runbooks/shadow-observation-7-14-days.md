# Observación7–14 días — ejecución offline y futura autorización real

La referencia `compose.yaml` no cambia. `compose.shadow-lab.yaml` reutiliza su
servicio/imagen, usuario, límites0.5 CPU/384MiB,96PIDs, readOnly, logs locales
2MiB×3 y red none. Cambia comando/healthcheck y usa volumen **shadow-lab-data**,
independiente de stage-data. Sin puertos, credenciales ni proveedores externos.
No ejecutar estos comandos en Proxmox sin autorización específica.

## Ensayo corto reproducible, permitido en desarrollo

```sh
npm ci
npm run check
npm test
node scripts/shadow-lab.mjs --lab --root=/tmp/aegis-shadow-ejemplo-nuevo --cycles=12
node scripts/shadow-verify.mjs --root=/tmp/aegis-shadow-ejemplo-nuevo
```

No reutilizar datos productivos. Root se crea0700 y se marca con checkpoint/origen;
un directorio existente no marcado se rechaza. Primera y segunda captura comparten
raw por SHA, luego se simulan429, desconexión, documento revisado y403. Backoff y
pausa pueden omitir ciclos: no son requests fallidos inventados. Las evaluaciones
generadas para ambos pilotos son privadas, con sourceRefs y política existentes.
El PDF con números9991/9992 se genera como SYNTHETIC TEST, sin bytes de INAMHI.
Guayaquil puede tener candidato sintético; Pallatanga permanece unknown si el
texto solo menciona Guayas. No interpretar esas salidas como eventos observados.

`--cycles` acelera **solo** reloj de scheduling. La captura/procesamiento/evaluación
usan reloj real: simulatedElapsedSeconds no demuestra disponibilidad o estabilidad
de días. Reanudar el mismo root conserva cuotas/backoff; cambiar plan/reloj requiere
un root separado y revisión, nunca borrar state.json para eludir cuotas.

## Ensayo offline prolongado, comandos preparados pero no iniciado

Inspeccionar primero la configuración (no inicia contenedor):

```sh
docker compose -p aegis-shadow-lab -f deploy/staging/compose.yaml \
  -f deploy/staging/compose.shadow-lab.yaml config --quiet
```

En un host de desarrollo autorizado para el ensayo, el siguiente comando ejecutaría
**siete días reales de fixtures offline**, no de fuentes reales:

```sh
docker compose -p aegis-shadow-lab -f deploy/staging/compose.yaml \
  -f deploy/staging/compose.shadow-lab.yaml up -d --build aegis
docker compose -p aegis-shadow-lab -f deploy/staging/compose.yaml \
  -f deploy/staging/compose.shadow-lab.yaml logs --tail=50 aegis
docker stats --no-stream
```

Para14 días, usar override revisado con command `--wall-clock --days=14`.
No mezclar --cycles y --wall-clock: CLI lo rechaza. Heartbeat/minuto, lote solo
cuando corresponde; un fetch global a la vez, máximo48/día móvil en este perfil,
intervalo30min, timeout12s,2MB/cuerpo, host5min. Es un presupuesto de laboratorio,
no una frecuencia aprobada por un proveedor. La CLI termina tras7/14 días y sale0;
no se reinicia al completar porque restart:on-failure:3 no reinicia exit0.

Suspensión: crear `/data/shadow-lab/PAUSE` desde el contenedor o volumen propio
detiene nuevas ingestas; heartbeat y métricas continúan. SIGTERM aborta proveedor
activo y cierra lock al terminar. El comando compose stop del proyecto anterior
aplica grace20s. Si un proveedor ignora abort, se retiene lock hasta que termine;
tras SIGKILL no reiniciar a ciegas ni borrar lock. No usar down -v en operación.

## Recuperación y rollback

Detener escritores. Sobre rutas de laboratorio propias, no producción:

```sh
node scripts/shadow-verify.mjs --root=/ruta/lab-detenido
node scripts/staging-snapshot.mjs --backup --from=/ruta/lab-detenido \
  --to=/ruta/respaldo-nuevo --quiesced
node scripts/staging-snapshot.mjs --verify --snapshot=/ruta/respaldo-nuevo
node scripts/staging-snapshot.mjs --restore --snapshot=/ruta/respaldo-nuevo \
  --to=/ruta/restaurada-nueva
node scripts/shadow-verify.mjs --root=/ruta/restaurada-nueva
```

El respaldo genérico verifica todos los bytes; shadow-verify añade semántica de
checkpoints/archivo anidado/evaluaciones y enumera capturas sin evaluación tras
fallo. No inventa evaluación faltante. No inicia servicios ni sobrescribe root.
En Docker montar el volumen del laboratorio, no stage-data, para estas operaciones.
Volver a imagen y snapshot compatibles juntos; no abrir estado nuevo con imagen
vieja ni eliminar cuotas para volver atrás. Preservar fallos para investigación.
Si un lock huérfano persiste: comprobar proceso/contenedor detenido, conservar
copia íntegra, revisar checkpoint/raw/evaluaciones y moverlo manualmente a evidencia
solo en copia de recuperación. El programa nunca lo roba automáticamente.

## Ensayo real futuro: autorización y preparación pendientes

Duración candidata7 días, ampliable a14 tras revisión diaria, sin certificar precisión.
Antes de iniciar deben constar por escrito:

1. Fuentes/productos y derechos de uso/archivo, responsables y vigencia del permiso.
2. Política revisada con destinos DNS/IP/HTTPS/GET/path/query, timeout, bytes,
   frecuencia y cuota; permiso del propietario para ingesta periódica concreta.
3. Red dedicada de salida comprobada desde contenedor: bloquear destinos alternos,
   privadas/metadata, puertos/métodos no previstos, redirects y cambios DNS no revisados.
   No proxy/TLS bypass, pagos ni reglas de Proxmox creadas por estos scripts.
4. Puente de transporte real revisado hacia IngestionService (no fixture API),
   pruebas de cooldowns compartidos, disponibilidad de run y cortes reales.
   **No está conectado en esta entrega.** La CLI actual rechaza --live.
5. Presupuesto de disco y backup calculado con tamaños medidos: propuestas máximas
   INAMHI48×2MB + Open-Meteo96×0.4MB =134.4MB/día de cuerpos antes de dedup y metadatos.
   Catorce días podrían superar1.88GB. No prometer14 días con archivo256MiB sin
   medir/ajustar cadencias, retención autorizada y headroom. No elevar límites en silencio.
6. Ensayo local de recuperación con ese puente y fuentes/fallos permitidos, sin
   credenciales ciudadanas. Aplicar límites/roles y flags de publicación false/DRY_RUN.

`compose.shadow.yaml.example` y la política propuesta de #36 siguen **inactivos**.
Su preflight solo permite --check-plan, compara host/path/tamaño/timeout con registry
y no autoriza ni realiza HTTP. Un nombre de red o una variable APPROVED no son
prueba de autorización/firewall. La aceptación de términos requiere al responsable,
no una inferencia del agente. Sin cumplir gates anteriores: **NO-GO real**.

## Medición diaria y revisión humana

Conservar imagen/commit/config hash, instanteUTC de inicio/corte, reinicios y reloj.
Por día: attempts/success/failure por fuente, bytes conocidos/desconocidos,
latencias por evento, porcentaje de tiempo con fuente vigente y denominador de
muestras explícito (no confundir con uptime), pausas y429/403, capturas/revisiones,
hashes y exclusiones del evaluador, CPU/RSS/heap/I/O/red/storage y respaldos.
daily/UTC.json guarda primera/última muestra real, contador y agregados durables
por fuente (intentos/éxitos/fallos/bytes y latencias count/sum/max/histograma).
Report.json contiene estado actual. Los agregados sobreviven a la rotación de96
eventos; para percentiles exactos/traza individual se requiere exportación privada
adicional. No afirmar percentiles exactos con buckets. Si no se muestreó un
intervalo, marcarlo sin cobertura; intento reservado sin resultado es inconcluso.

Para idle/activity comparar deltas de CPU microsegundos y wall time del mismo
proceso; RSS y cgroup deben etiquetarse por alcance. Medir incremento de archivos
y contadores de escritura por ventana conocida; no extrapolar un ciclo a un día.
I/O lógico no es desgaste del SSD. Sin instrumentación eléctrica legítima,
powerWatts y energyWh permanecen null. No acceder a Home Assistant ni al inversor.

Revisar cada candidato contra sus sourceRefs y aviso oficial: vigencia, clase,
precisión territorial, nivel de fuente, regla independiente, faltantes y cambios
tras corrección. Agregar nota con `scripts/shadow-discrepancy.mjs --root=DIR
--file=NOTA.json`, conforme al contrato. Nunca transformar notas o ausencia de
reportes en ground truth. Publicación y transportes siguen bloqueados.

Informe diario: fecha/commit/config, tiempo realmente observado y huecos,
fuentes/permisos, métricas/deltas con unidades, evaluaciones revisadas y discrepancias,
incidentes operativos/recuperación, hipótesis y decisión continuar/pausar/fallido.
Informe final: denominadores, datos faltantes, límites, comparación por versión,
coste medido sin inventar energía y GO/NO-GO por separado técnico/autorización.

## Parada y ensayo fallido

Umbrales operativos **propuestos**, ajustables tras medir, no garantías: parar ante
un OOM,2 reinicios no esperados/24h, corrupción, intento fuera de política o posible
envío; pausar si RSS>320MiB durante5min, memoria de cgroup>360MiB dos muestras,
o disco>90% del presupuesto. Límite de ingesta acotado por checkpoint y stores;
no es una cuota kernel del filesystem. Revisar host si se requiere garantía dura.

PAUSE inmediato ante403/429 (además del cooldown automático), permiso dudoso,
reloj incoherente, formato/unidades/CRS cambiados o evidencia insuficiente.
No reintentar por otra URL/proxy ni sustituir unknown por seguro. Marcar ensayo
fallido si necesita resets de cuotas, pierde evidencia irrecuperable, supera
recursos repetidamente o no puede reconstruir qué usó una evaluación. Documentar
duración real y motivo; no reiniciar estadísticas para ocultarlo.
