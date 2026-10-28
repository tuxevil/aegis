# Staging aislado para preparación supervisada

Esta receta fue ejecutada solo en Docker del laboratorio de desarrollo. **No se
instaló en Proxmox, no se accedió por SSH ni se abrieron puertos del host.** No es
una beta ciudadana. Requiere autorización específica antes de ejecutarla en la
infraestructura del propietario. Home Assistant sigue siendo Container dentro de
LXC; no se usa Supervisor, HAOS o un complemento.

## Requisitos y alcance

- Docker Engine con Compose v2 y soporte de límites CPU/memoria. Construir la
  imagen requiere descargar las dependencias públicas fijadas por npm ci.
- Revisar el commit y los PR de integración. No cambiar main ni montar producción.
- El proyecto Compose se llama `aegis-supervised-staging`; reservar ese nombre
  únicamente para este staging. No reutilizar volúmenes, .env o credenciales reales.
- `deploy/staging/compose.yaml` no tiene ports, host networking, socket Docker,
  bind de producción o acceso HA/WAHA. `network_mode: none` también impide obtener
  fuentes reales. Una fuente ausente conserva estado desconocido.
- Se reusan Node/Fastify, SQLite nativo v5 y archivo Multiamenaza. No nueva DB,
  broker, servicio de monitorización o proceso de polling de proveedores.

Desde un checkout revisado, en el laboratorio autorizado:

```sh
docker compose -f deploy/staging/compose.yaml config --quiet
docker compose -f deploy/staging/compose.yaml build
docker compose -f deploy/staging/compose.yaml up -d --no-build --wait --wait-timeout 90
docker compose -f deploy/staging/compose.yaml exec -T aegis node scripts/staging-health.mjs
```

`build`/`up` se probaron localmente; no ejecutar estos comandos en el Proxmox del
propietario por interpretar este documento como permiso. En LXC, Docker/nesting,
UID mappings y capacidad cgroup requieren revisión del operador; no convertirlo
automáticamente en un LXC privilegiado ni instalar paquetes del host.

## Configuración y aislamiento

| Parámetro | Valor de esta receta | Efecto/límite |
| --- | --- | --- |
| DATA_DIR | /data | Volumen nuevo stage-data, historial y archivo privado |
| DB_DIR | /data/v5 | SQLite existente, siempre dentro de DATA_DIR para respaldo conjunto |
| DB_MAX_BYTES | 67108864 | Límite SQLite; no es cuota de todo el volumen |
| PUBLIC_API_V1 / SQLITE_STORAGE / BLACKOUT_MAP | true | Lectura v5 y base vacía aislada; no evidencia ficticia live |
| OFFICIAL_SCHEDULES / TIME_MACHINE / EXPLORER_3D | true | Interfaces de consulta; sin capturas automáticas; no modelo volumétrico validado |
| HAZARDS_ENABLED | true | Catálogo/health; no publicación de bytes o candidatos |
| CITIZEN_REPORTS / PUSH_ALERTS / ZONE_SUBSCRIPTIONS_ENABLED / ALERTS_ADMIN_ENABLED | false | Sin altas ciudadanas o sesión editorial operativa en el servicio persistente |
| PUSH_DELIVERY / ALERTS_PUBLISH_ENABLED | false | Además hay barreras incondicionales de código |
| EVENT_CORRELATION / OSINT_NEWS / OSINT_X | false | No jobs o ingestiones implícitas |
| AEGIS_STAGING_TAG | candidate por defecto | Para actualización usar etiqueta revisada y conservar ID anterior |
| CPU / RAM / PIDs | 0.5 CPU / 384 MiB / 96 | Límites de contenedor, no dimensionamiento certificado |
| NODE_OPTIONS | --max-old-space-size=192 | Heap V8 acotado; RSS incluye otras memorias |
| rootfs / /tmp | readOnly / tmpfs 96 MiB noexec,nosuid | Solo volúmenes nombrados y scratch privado son escribibles |
| usuario / capabilities | node / ALL eliminadas | No root y no-new-privileges; volúmenes nuevos reciben propietario de la imagen |
| logs | driver local, 2 MiB × 3 | Límite configurado por contenedor; no solicitud/cabeceras/secretos en logs HTTP |

No se pasan AMBIENT_MAC, HA, WAHA, claves Amaru o VAPID del propietario. Los tests
de Watch generan claves sintéticas efímeras. No moverlas a un despliegue real.
No combinar datos sintéticos y reales. Los fixtures de QA van a RAM/directorios
temporales propios, **no** al volumen persistente de staging.

Health consulta solo `/api/v1/health/public` cada 60s: verifica que la app responda,
no la salud de fuentes, exactitud o preparación del piloto. `foundation/unknown`
no significa sin riesgo. Restart on-failure está limitado a tres intentos; un
fallo persistente debe investigarse y no generar un bucle de consumo.

## Consultar, medir y probar sin publicar puertos

```sh
docker compose -f deploy/staging/compose.yaml ps
docker compose -f deploy/staging/compose.yaml exec -T aegis node scripts/staging-health.mjs
node scripts/profile-staging.mjs --run
```

El último comando necesita Node en el equipo de desarrollo, usa solo el Docker
local y rechaza DOCKER_HOST/contexto remoto explícitos. Valida proyecto, etiqueta,
red none y ausencia de port bindings; lee Docker stats, uso asignado de /data y
quality API local. No consulta HA, batería, inversor o Proxmox. Alternativa sin
Node en host: `docker stats --no-stream` sobre el contenedor de este proyecto y
`docker compose ... exec -T aegis du -sk /data`.

Las muestras distinguen RSS/límite, CPU instantánea, PIDs, bytes de red y block I/O;
`du -sk` mide bloques asignados, que pueden diferir del tamaño lógico del SQLite.
Contadores quality son por proceso y se reinician; cubren GET públicos registrados
y refrescos del agregador Grid, no todas las conexiones del host. No inferir
energía, capacidad de concurrencia o disponibilidad diaria de una muestra en reposo.
powerWatts/energyWh permanecen null hasta disponer de una medición autorizada.
Detener staging si el presupuesto energético del laboratorio lo exige.

QA visual sin puerto: `scripts/verify-integration-browser.mjs --out=NUEVO_DIRECTORIO`
con Playwright instalado aparte (`AEGIS_PLAYWRIGHT_MODULE` y opcional
`AEGIS_CHROMIUM_PATH`). Chromium se conecta mediante intercepción + app.inject,
red externa bloqueada, fixtures sintéticos y service workers bloqueados. No se
instala Playwright como dependencia de producción. Paths conservados: /ui, /map,
/report, /watch/, /history/, /explorer/, /hazards/, /editorial/, /ciudades/. Los
flags de formularios/editorial son OFF en el contenedor persistente aunque sus
pruebas aisladas puedan habilitarlos con datos ficticios.

## Backup conjunto y restauración

Parar app **y cualquier CLI escritor** antes. SIGTERM llama app.close, cierra
SQLite y guardas; plazo interno 10s, Docker permite 20s. `--quiesced` es una
afirmación del operador, no prueba global de exclusión. El respaldo compara dos
inventarios SHA-256, rechaza locks y sidecars SQLite WAL/SHM/journal. Nunca copia
solo el .sqlite de una base activa.

```sh
docker compose -f deploy/staging/compose.yaml stop aegis
docker compose -f deploy/staging/compose.yaml run --rm --no-deps -T maintenance \
  --backup --from=/data --to=/backups/UN_NOMBRE_NUEVO --quiesced
docker compose -f deploy/staging/compose.yaml run --rm --no-deps -T maintenance \
  --verify --snapshot=/backups/UN_NOMBRE_NUEVO
docker compose -f deploy/staging/compose.yaml run --rm --no-deps -T maintenance \
  --restore --snapshot=/backups/UN_NOMBRE_NUEVO --to=/restore/OTRA_RAIZ_NUEVA
docker compose -f deploy/staging/compose.yaml up -d --no-build --wait --wait-timeout 90
```

Sustituir los nombres en mayúsculas por nombres nuevos; destinos existentes se
rechazan. Maintenance monta DATA_DIR readOnly, backups y recovery en otros dos
volúmenes nombrados. El servicio app no monta backups/recovery. Restaurar no
arranca servicios ni sustituye stage-data; conserva la raíz original para revisión.

La verificación añade quick_check/foreign_key_check y checksums de migraciones
SQLite a los lectores de Grid/artefactos/capas/journals existentes. SQLite incluso
en lectura puede generar WAL/SHM; se verifica una copia scratch 0700/0600 y se
elimina después, sin alterar el inventario del backup. SHA-256 detecta cambios,
**no firma autenticidad** frente a un administrador que reescriba datos/manifiesto.

Si falla la verificación, no usar ese snapshot ni borrar la evidencia. Si quedan
WAL/SHM tras una terminación abrupta, no borrarlos ni marcar quiesced por intuición:
conservar el conjunto y recuperar SQLite en una copia privada antes de reintentar.
La herramienta no repara corrupción. Las pruebas reproducen el rechazo de WAL
activo, estado SQLite inválido, bytes cambiados y destino existente.

Se probó además el arranque sobre la raíz restaurada con una **imagen anterior
de desarrollo**, sin listener y con allowMigrations=false. Para repetir esa
comprobación, conservar la etiqueta anterior revisada, sustituir los nombres y
usar solo la copia de staging:

```sh
AEGIS_STAGING_TAG=ETIQUETA_ANTERIOR_REVISADA docker compose -f deploy/staging/compose.yaml \
  run --rm --no-deps -T --entrypoint node maintenance --input-type=module - <<'JS'
import {createApp} from './backend.js';
import {openStore} from './storage/sqlite-store.js';
process.env.DATA_DIR='/restore/OTRA_RAIZ_NUEVA';
process.env.DB_DIR=process.env.DATA_DIR+'/v5';
const app=await createApp({mac:null,
  fetchUrl:async()=>{throw Error('offline recovery');},
  flags:{PUBLIC_API_V1:true,SQLITE_STORAGE:true,BLACKOUT_MAP:true},
  openV5Store:()=>openStore({directory:process.env.DB_DIR,allowMigrations:false})});
try {if((await app.inject('/api/v1/health/public')).statusCode!==200)throw Error('recovery failed');}
finally {await app.close();}
JS
```

Esto comprueba compatibilidad de código/esquema sin sustituir el volumen activo.
No demuestra downgrade de cualquier versión futura: un esquema desconocido debe
fallar. No convierte la comprobación en un arranque de producción autorizado.

Backups contienen datos privados potenciales y no están cifrados por esta receta.
Volúmenes distintos en el mismo host no son redundancia externa. Retención,
borrado seguro, cifrado externo, acceso y propagación de bajas al restaurar
requieren revisión; no se afirma cumplimiento LOPDP. No hay purga automática.

## Actualización y rollback

1. Registrar commit/etiqueta e image ID actual; construir la candidata antes de
   parar. Usar AEGIS_STAGING_TAG diferente y conservar la imagen anterior.
2. Parar escritores, crear/verificar backup conjunto con la imagen compatible.
3. Cambiar únicamente la imagen del staging aislado, arrancar y probar health,
   rutas y versiones. No modificar producción ni reutilizar sus volúmenes.
4. Ante fallo: parar candidata; conservar datos y logs limitados. Restaurar el
   backup a raíz/volumen **nuevo**, verificarlo y revisar el montaje antes de usar
   la imagen anterior. No arrancar código viejo sobre un esquema migrado nuevo.
   La receta no cambia automáticamente el volumen de la app.
5. `docker compose ... down` retira contenedor/red, **conserva volúmenes**. No usar
   down -v como rollback ni sobrescribir observations.json, DB o journals.

Verificación ejecutada y límites: [validación](../verification/integration/validation-report.md)
y [preparación para piloto](../verification/integration/pilot-readiness.md).
