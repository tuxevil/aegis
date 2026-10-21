# AEGIS 5 — SQLite, migraciones y recuperación (PR-02)

## Decisión y alcance

Se usa `node:sqlite` (DatabaseSync + backup), incluido en Node ≥22.16, sin nuevas
dependencias npm ni compilación nativa externa. Referencia primaria:
[API Node 22](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html).
En Node 22 SQLite emite aviso experimental; se prueba explícitamente 22.16 Alpine
además del runtime local Node 24. V4 con flags OFF no importa el módulo SQLite.
La suite completa de desarrollo requiere ≥22.16 por sus nuevas pruebas.

La base es interna, con operaciones pequeñas síncronas y consultas paginadas.
No se añade servidor de DB, polling, jobs residentes ni HTTP de escritura.
El fallo de SQLite habilitado aborta el arranque; no sustituye datos con una base
vacía ni intenta «reparar» automáticamente. La aplicación posee/cierra el store
abierto por `openV5Store`, inyectable para tests.

| Variable | Default | Uso |
| --- | --- | --- |
| SQLITE_STORAGE | false | Crear/abrir base al iniciar Fastify, con migraciones |
| DB_DIR | .data/v5 local; /data/v5 Docker | Directorio para aegis-v5.sqlite y backups/ |
| DB_MAX_BYTES | 67108864 | Límite de páginas del archivo principal, validado al abrir |
| SQLITE_DEMO | false | Solo CLI init: base sintética separada; no modifica el modo del servidor |

Solo `true` exacto activa el flag. Reiniciar para cambiar configuración.
DATA_DIR/observations.json no se lee, migra, elimina ni escribe por SQLite.
No se requiere backup de v4 por una migración de formato: no hay tal migración;
conservar la política de backups del volumen existente. Usar rutas persistentes
absolutas en despliegues: por ejemplo DATA_DIR=/data y DB_DIR=/data/v5. Si `.env`
redefine DB_DIR a una ruta relativa, sobreescribe el default Docker y puede perder
persistencia entre reemplazos de contenedor.

## Modelo y repositorios

La migración `storage/migrations/001-foundations.sql` crea seis entidades STRICT:

- areas: área administrativa/sector, precisión, padre y referencia de polígono;
- sources: origen, clase, carácter oficial, política de acceso y habilitación;
- artifacts: origen, URL, sha256, fechas, versión de parser, procedencia y referencia de archivo;
- observations: origen/artefacto/área, clave idempotente, resumen, tiempos separados y moderación;
- events: área, tipo/estado, tiempos nullable, fundamentos y explicación;
- evidence: vínculo evento–observación, relación, razón y revisión humana.

Son entidades internas, no respuestas API directas. El DTO de evidencia PR-01
se proyectará desde observación+fuente+artefacto y relación; `event.evidence_ids`
se obtendrá por join. No se duplican arrays de relaciones en SQLite. El campo
`artifact_id` corresponde a source_artifact_id del modelo lógico. No hay tablas
de cronogramas, reportes privados, suscripciones o Push aún.

Claves foráneas y prepared statements; índices de área/tiempo, vínculos y padres.
Artefacto y observación deben compartir fuente. `official=true` requiere clase
`authority`, aunque la competencia real del emisor exige validación posterior.
No hay inferencia de estado oficial o restablecimiento. Ausencias siguen `null`.

```js
import {openStore} from './storage/sqlite-store.js';
const store = await openStore({directory: '/ruta/local/v5', synthetic: false});
try {
  const rows = store.repositories.observations.list({
    area_id: 'area-verificada', time: 'ingested_at',
    from: '2026-10-21T00:00:00-05:00', to: '2026-10-22T00:00:00-05:00',
    limit: 100, offset: 0,
  });
  // Escrituras: store.writeBatch({areas: [...], sources: [...], ...})
  // o store.transaction(repos => { repos.areas.insert(area); ... });
} finally { store.close(); }
```

Todas las escrituras requieren transacción síncrona; lotes se insertan en orden
areas/sources/artifacts/observations/events/evidence. Fallo en una fila revierte
el lote completo. Máximo 500 filas por entidad/lote; lecturas 1–500 por página,
offset máximo 100000. No usar await ni anidar transacciones.

Cada repositorio ofrece insert/get/list. Mismo ID y contenido normalizado es
idempotente; contenido distinto falla, preservando lo anterior. Claves naturales
(source_id, sha256), (source_id, dedupe_key) y (event_id, observation_id) impiden
duplicados con IDs distintos: conflicto explícito para que el ingestor resuelva,
sin sobrescritura silenciosa. No se implementa update/delete: futuras correcciones
necesitan su diseño de revisiones, no reemplazar evidencia en PR-02.

Fechas con zona explícita se normalizan a UTC con milisegundos antes de guardar;
consultas [from,to), columna temporal por allowlist. Se distinguen hecho,
observación, publicación e ingesta; fechas ausentes no se rellenan. Listado
predeterminado usa la primera columna temporal de la entidad y luego id;
seleccionar `time` explícito cuando importa su semántica. Campos extra, tipos
incorrectos, IDs no válidos y textos >2000 (URLs >2048) se rechazan.

## Migraciones

`schema_migrations` registra versión, sha256 del SQL y applied_at del clock
inyectable; application_id y user_version identifican AEGIS y versión completa.
Se inspeccionan antes de cambiar pragmas. Base ajena, checksum cambiado o versión
futura => error, sin sobrescribir el archivo. Reabrir versión actual no repite DDL.
Las migraciones aplican en una transacción IMMEDIATE. Errores FULL/IOERR pueden
revertir automáticamente: se conserva el error original aunque no quede una
transacción que deshacer.

Antes de actualizar una base persistente existente se crea automáticamente un
snapshot pre-migration verificado. Si falla el backup no se migra. La primera
creación no requiere snapshot. Nunca editar una migración aplicada: agregar otra
versión. No se ejecuta down destructivo. Rollback de esquema mediante snapshot
previo y DB_DIR nuevo; el restore se hace con la versión de código que reconoce
ese esquema. Un checksum no conocido requiere recuperar el código correspondiente.

## Recursos y aislamiento

WAL, foreign_keys ON, synchronous FULL, busy_timeout 3000 ms, checkpoint automático
cada 256 páginas y journal_size_limit 4 MiB. DB_MAX_BYTES limita páginas (64 MiB
por defecto), no borra filas para liberar espacio. Al llenarse, falla la escritura
atómicamente; la historia anterior se conserva. No reducir por debajo del tamaño
actual: se rechaza abrir. Reservar disco para WAL, snapshots y temporales.

El límite de journal es un objetivo después de checkpoint, no una cuota dura:
lectores largos pueden mantener WAL mayor. Vigilar disco/WAL fuera del servicio;
no mantener transacciones abiertas entre requests. Los snapshots también ocupan
espacio; siete diarios pueden requerir ~448 MiB más temporales, sin contar
snapshots previos a migración. No hay PDFs/blobs almacenados por este PR:
`stored_ref` es solo referencia, su retención vendrá con ingesta de artefactos.

Directorios nuevos 0700 y archivos DB/snapshot 0600; directorios preexistentes
conservan permisos: revisarlos al preparar volúmenes. No hay secretos/IPs/recibos
ni ubicación doméstica en los campos admitidos. Los textos/URLs permitidos aún
requieren revisión y sanitización de dominio antes de publicar; un schema no
detecta datos personales escritos dentro de un resumen.

La marca synthetic se fija en settings al inicializar. La base live rechaza
filas demo y viceversa, también tras reiniciar. Usar DB_DIR distinto para demo;
el servidor siempre abre live, salvo factoría explícita inyectada en tests.
Fixtures públicos de `test/fixtures/storage-v1.json` son sintéticos, no se importan
automáticamente ni se mezclan con la operación normal.

## Comandos de operación local

```bash
DB_DIR=/ruta/local/v5 npm run storage -- init
DB_DIR=/ruta/local/v5 npm run storage -- status
DB_DIR=/ruta/local/v5 npm run storage -- backup
npm run storage -- verify /ruta/al/snapshot.sqlite
npm run storage -- restore /ruta/al/snapshot.sqlite /ruta/nueva-v5
```

`init` permite crear/migrar. `status` y `backup` requieren base existente y abren
solo lectura: nunca inicializan ni migran. `backup` usa SQLite online backup,
incluye páginas WAL comprometidas y verifica quick_check, foreign_key_check y
ledger de migraciones antes de publicar un archivo nuevo por enlace atómico.
No copiar únicamente aegis-v5.sqlite mientras WAL está activo. API de store
backup bloquea escrituras/cierre en esa conexión hasta terminar; otras conexiones
usan las garantías de snapshot de SQLite. El CLI puede respaldar con app abierta.

Backup CLI conserva siete `daily-*` válidos por nombre, solo después de crear y
verificar uno nuevo; no borra archivos ajenos ni snapshots pre-migration. Estos
últimos se retiran manualmente tras validar actualización y plazo de recuperación.
Copiar backups verificados fuera del host/volumen conforme política operativa.

Programación diaria sugerida para un entorno futuro, ajustar rutas absolutas:

```cron
15 3 * * * cd /opt/aegis && DB_DIR=/data/v5 /usr/bin/node scripts/storage.js backup
```

No se instaló cron, volumen ni servicio en este trabajo. El horario depende de la
zona del host. Monitorizar exit code no cero y probar restore periódicamente.

Restore solo acepta destino **inexistente**, con padre existente. Verifica origen,
restaura, valida integridad y deja una base independiente; jamás pisa la activa.
Procedimiento: backup actual, parar app, restaurar en nuevo directorio, verificar,
cambiar DB_DIR, iniciar con versión compatible y validar; conservar directorio
anterior para volver atrás. No borrar ni mover observations.json. Para rollback
de aplicación a v4 basta SQLITE_STORAGE=false y reiniciar preservando ambos stores.
