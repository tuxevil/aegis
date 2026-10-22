# AEGIS 5 — PR-02: persistencia independiente

Fecha: 2026-10-21. Implementación local, sin merge ni deploy.
Rama: feat/aegis-5-pr-02. Base: feat/aegis-5-pr-01, PR #9, commit be6d7ee;
planificación depende de #8. Se conserva la secuencia y los PR separados.
El usuario autorizó continuar tras entregar PR-01. No se inició PR-03.

## Alcance y decisiones

- SQLite nativo Node ≥22.16, sin dependencias npm nuevas; V4 no importa SQLite con flag OFF.
- SQLITE_STORAGE=false; DB_DIR separado de observations.json, sin migrar JSON.
- WAL, claves foráneas, tablas STRICT, transacciones y statements parametrizados.
- Migración versionada/checksum y snapshot previo obligatorio en futuras actualizaciones.
- Repositorios áreas/fuentes/artefactos/observaciones/eventos/vínculos de evidencia.
- Registros inmutables, claves de deduplicación, fechas UTC y consulta temporal paginada.
- Demo/live fijado por base y validado en cada escritura; fixtures solo de test.
- Límite de tamaño con fallo atómico; snapshots verificados, siete diarios, restore en ruta nueva.
- CLI init/status/backup/verify/restore; status/backup no crean ni migran DB.
- Inyección openV5Store y cierre con Fastify; sin endpoints de datos ni ingesta nueva.
- Docker incluye módulos/scripts/SQL y DB_DIR=/data/v5 en el volumen existente.

[Guía de arquitectura y operación](../architecture/aegis-5-storage.md): interfaz,
variables, límites, scheduler sugerido, restore, rollback y supuestos de permisos.

## Pruebas ejecutadas

Base PR-01: npm ci (cero vulnerabilidades reportadas), npm run check y 41/41 tests.
Resultado PR-02: npm ci (cero vulnerabilidades), npm run check y **54/54 tests**.
Node local v24.21.0; suite completa también **54/54** en node:22.16.0-alpine.

Los trece tests nuevos cubren:

1. WAL, reapertura en proceso nuevo, migración repetida y JSON v4 idéntico.
2. Lotes atómicos, duplicados idempotentes, conflictos de contenido, FK y errores capturados sin commit parcial.
3. Tiempo del hecho vs ingesta, cruce UTC/Ecuador, null, rangos [from,to), paginación y parámetros maliciosos.
4. Fallo de ingesta/fuente no borra historia ni vínculos ni cambia fechas anteriores.
5. Backup online con WAL activo, restore independiente, rechazo de destino existente y snapshot corrupto.
6. Retención de último snapshot verificado sin eliminar archivos ajenos.
7. Fallo de migración revierte DDL/filas; snapshot previo se verifica y restaura.
8. Actualización de versión repetible, snapshot único y rechazo de esquema futuro por código anterior sin modificar archivo.
9. Checksum alterado/base ajena rechazados sin modificar archivo.
10. Aislamiento demo/live persistente, campos privados rechazados y transacciones síncronas.
11. Base llena revierte lote, conserva filas previas y permite operaciones posteriores.
12. Flag OFF no abre DB; ON usa factoría/cierre inyectables y conserva respuesta v4.
13. CLI init/status/backup/verify/restore real y status sin inicialización accidental.

`docker build -t aegis-pr02-review .` pasó. Smoke dentro de esa imagen, con servidor
HTTP real y DB_DIR de Docker: OFF no crea DB; ON abre WAL, raíz/salud responden,
se puede cerrar/reabrir y ejecutar CLI backup/verify/restore. Sin puertos públicos,
credenciales ni volumen de producción. `git diff --check` limpio.

Incidencias encontradas y resueltas:

- PR-01 omitía imports nuevos en Dockerfile: corregido y validado en su propia rama,
  commit be6d7ee, antes de iniciar PR-02.
- SQLITE_FULL puede hacer rollback automático; se evita ocultar su error al intentar
  rollback adicional. Un error de inserción invalida toda la transacción incluso si
  el consumidor lo captura. Pruebas de integridad tras fallo pasan.
- Una ejecución de la suite Docker coincidió con npm ci sobre node_modules compartido
  y falló por disponibilidad de módulos; se corrigió la secuencia y la suite completa
  se repitió después de terminar la instalación: 54/54 en Node 22.16.

## Aceptación y compatibilidad

- [x] SQLite WAL, migraciones versionadas y seis repositorios transaccionales.
- [x] Persistencia independiente; observations.json conservado byte por byte en test.
- [x] Límites de crecimiento y plan de backup/restore documentados.
- [x] Datos demo sintéticos identificados, sin secretos ni coordenadas domésticas.
- [x] Reinicio, migración repetida, rollback/snapshot, duplicados y consulta temporal probados.
- [x] Pérdida de fuente/ingesta no elimina datos.
- [x] Check/suite existentes v4, PR-01 y nuevos tests pasan.
- [x] Docker validado y documentación actualizada.

Sin cambios visuales: suite DOM existente pasa. No se repitieron navegador real
ni capturas mobile 320 px; no hay nueva UI para validar en este PR. No se consultaron
fuentes live ni se modificaron despliegues/volúmenes reales. La política de acceso
público/privado y respuestas v4 siguen cubiertas por sus suites.

## Limitaciones y recuperación

Node 22 marca SQLite experimental. Operaciones síncronas diseñadas para lotes
pequeños y páginas acotadas; no es una solución de gran concurrencia. El límite
de páginas no incluye WAL ni backups; lectores largos pueden hacer crecer WAL.
Los archivos de artefactos externos y su retención se implementarán con ingesta.
No se instalaron backups diarios: comando/scheduler preparados y restore ensayado.
No hay down destructivo, update/delete de evidencia, reconciliación de eventos,
moderación ni validación de competencia oficial. Son gates posteriores.

Rollback de aplicación: SQLITE_STORAGE=false y reiniciar, conservando DB_DIR y
DATA_DIR. Rollback de esquema: parar app, restaurar snapshot previo en directorio
nuevo, usar versión de código compatible y cambiar DB_DIR; nunca sobrescribir la
base activa o borrar historial JSON.

Próximo, tras revisión e integración de dependencias: PR-03, mapa/lista móvil y
API de solo lectura, fixtures explícitos y tres escenarios de demo. Ningún PR
anterior se fusionó automáticamente ni se activaron funcionalidades en producción.

Seguimiento de revisión durante PR-03:

- P1: el snapshot de migración ahora se toma con BEGIN IMMEDIATE ya adquirido y
  mantenido hasta COMMIT de migración. El backup usa otra conexión de solo lectura,
  evitando BUSY de un backup sobre la conexión con escritura activa.
- Regresión entre procesos: escritores quedan bloqueados antes y después del
  snapshot, incluyendo la antigua ventana de carrera; fallo de backup libera el
  lock y deja la base anterior utilizable.
- P2: engines.node en package.json y package-lock.json se alinean a >=22.16.
- Nueva suite: 55 tests (14 de storage). Las notas anteriores describen la primera
  entrega; este seguimiento documenta las correcciones de revisión.

## Revalidación 2026-10-22

En worktree aislado sobre `344c08c`: `npm ci` correcto (cero vulnerabilidades),
`npm run check` correcto y `npm test` **55/55** en Node v24.21.0.
Suite completa **55/55** también en `node:22.16.0-alpine`, sin red y con
el repositorio montado en solo lectura. `git diff --check` limpio.
Se corrigió la errata del README «22.16.16» a «22.16», coherente con engines.
Sin cambios de runtime, nuevas dependencias, acceso a DATA_DIR real ni despliegue.
Las limitaciones de SQLite síncrono, WAL y backups no programados siguen vigentes.
Próximo bloque: PR-03, una vez revisadas las dependencias; no incluido aquí.
