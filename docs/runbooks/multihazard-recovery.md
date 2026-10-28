# Multiamenaza — respaldo, restauración e incidentes en sombra

Estado: procedimiento local ensayado con datos sintéticos, no despliegue ni SLA.
No autoriza parar producción, cambiar DATA_DIR operativo, usar WAHA o publicar.
La certificación de permisos, geografía, corpus y retención sigue pendiente.

## Respaldo verificable

1. Identificar la raíz correcta y su propietario sin imprimir credenciales. No
   confundir DATA_DIR con el repositorio, un backup previo o un volumen operativo
   distinto. Reservar espacio para copia completa más margen; presupuesto del CLI
   inicial: 1 GiB y 50.000 entradas. Padres de destinos deben existir.
2. Detener los escritores en el entorno autorizado: backend que persiste histórico,
   CLI de ingesta/capas y consumidores editoriales/preferencias. **No hacerlo en
   producción sin autorización.** Confirmar procesos; un lock ausente por sí solo
   no prueba que un escritor esté detenido. No borrar locks para forzar la copia.
3. Crear snapshot en ruta nueva y disjunta; el flag declara la quiescencia que el
   operador verificó, no detiene procesos:

```sh
node scripts/backup-aegis.mjs --backup --quiesced \
  --from=/ruta/datos-laboratorio --to=/ruta/existente/snapshot-nuevo
node scripts/backup-aegis.mjs --verify --snapshot=/ruta/existente/snapshot-nuevo
```

Se copian todos los archivos regulares de DATA_DIR, no solo hazards: observations,
raw/índices/fallos/colecciones, editorial/outbox y preferencias por origen. Se
rechazan symlinks, archivos especiales, locks y temporales. Cada archivo se copia
a 0600 y directorios 0700; se sincronizan archivos y directorios. No se conservan
permisos amplios del origen ni se modifican bytes/timestamps dentro de registros.
SHA-256 por archivo, dos inventarios del origen y cotejo de copia detectan cambios
observados. Esto exige quiescencia real; no reemplaza snapshots atómicos del volumen.

Manifiesto final `aegis-backup.v1.json` y subdirectorio data son el formato completo.
Sin manifiesto, checksum correcto o conjunto exacto de archivos no hay snapshot
verificado. Ante fallo se conserva la copia parcial para inspección, sin borrarla,
sin reparar el origen ni presentar éxito. No publicar/copiar el manifiesto a logs:
puede contener nombres internos, aunque la salida del CLI solo da conteos/estado.

Lectores readOnly comprueban histórico v1, hashes/envelopes, colecciones de capas,
secuencias/checksums y namespaces de journals; no inicializan directorios ni
reparan archivos. Formatos v1 desconocidos/incompatibles fallan. Otros archivos
son copiados/verificados por bytes, no declarados semánticamente válidos.

## Restauración y rollback

```sh
node scripts/backup-aegis.mjs --restore \
  --snapshot=/ruta/existente/snapshot-nuevo --to=/ruta/existente/datos-restaurados-nuevos
```

Destino debe ser inexistente. Incluso un directorio vacío ya creado se rechaza.
No restaurar encima de DATA_DIR ni dentro del snapshot; no hay opción --force.
La restauración verifica snapshot antes y después, compara destino y ejecuta
lectores readOnly. Nunca arranca servicios, cambia variables o activa publicaciones.

Después de restore, revisar fuera de línea captura/validez/frescura al reloj actual,
no a la fecha del backup. Candidatos aprobados/queued se conservan como evidencia,
**no como permiso de envío**. Los tres flags experimentales permanecen OFF hasta
revisión explícita. Probar /ui, /api/status, hashes y ledger en laboratorio antes
de proponer un cambio de raíz. Conservar origen y snapshot para rollback; este
procedimiento no decide ni realiza el cambio de DATA_DIR de un servicio operativo.

Una recuperación no renueva issuedAt, retrievedAt, disponibilidad de modelo,
consentimiento o vigencia. Datos expirados permanecen expirados; no son cero o
«sin riesgo». Un volumen con corrupción o formato incompatible se conserva para
análisis y copia forense autorizada; no sobrescribirlo para lograr un test verde.

## Privacidad y retención

Los respaldos contienen archivos privados y pueden conservar preferencias anteriores
con hashes de gestión. Revocar vacía zonas activas, pero no borra el journal ni
respaldos ya tomados. Retención/depuración/LOPDP deben revisarse antes de usuarios
reales. La herramienta no cifra, no gestiona claves y no sube nada a otro servicio.
Para resiliencia harán falta copias externas cifradas, control de acceso y claves
recuperables por operadores autorizados. SHA-256 detecta corrupción; no firma ni
protege frente a un administrador que cambie bytes y manifiesto conjuntamente.

## Respuesta a incidentes

| Incidente | Acción segura en sombra | Evidencia antes de reanudar |
| --- | --- | --- |
| Fuente caída/403/429 | Respetar cooldown/Retry-After; no eludir bloqueos. Conservar captura anterior y exponer stale/unknown | Estado/tiempo real, hash previo, error sanitizado y siguiente intento permitido |
| PDF/JSON malformado o corrección | Conservar ambas versiones; no inferir cancelación por ausencia. Detener promoción editorial del candidato afectado | Capturas/interpretaciones, alcance y revisión independiente actual |
| Evidencia/geografía insuficiente | Mantener candidato privado, precisión original y publicación bloqueada | Procedencia, permisos y versión territorial validados, sin inferir barrios |
| Outbox retry/dead-letter | Inspeccionar estado/clave/contador sin secretos; no sustituir simulador por transporte real | Prueba de caducidad/dedupe y revalidación de fuente; registro de causa |
| Disco lleno/lock tras caída | Detener nuevas operaciones, conservar archivos. Verificar procesos antes de tratar un lock | Capacidad, hashes y último evento íntegro; copia nueva antes de intervenir |
| Sospecha de token editorial | Revocar/rotar configuración en entorno autorizado; limpiar sesión. No publicar credenciales o excepciones | Auditoría de transiciones y revisión de candidatos desde última confianza |
| Secreto de gestión perdido | No recuperar por IP, teléfono o prueba informal; preferencia vence a los 30 días | No se expone identidad ni se crea un canal para compensarlo |
| Canal/JID/OWNER desconocido | No consultar sesión pública ni crear/publicar para probar. Mostrar enlace reportado/estado desconocido | Aprobación específica y comprobación manual posterior, aún pendientes |
| Caída de energía/red local | No interpretar silencio como normalidad. Usar fuentes oficiales directamente | Recuperación verificada y frescura actual; ninguna garantía de entrega |

Bloqueo actual: `safeMode` impide publicaciones incondicionalmente; no hay transporte
real que habilitar por variable. Desactivar HAZARDS_ENABLED, ALERTS_ADMIN_ENABLED y
ZONE_SUBSCRIPTIONS_ENABLED retira módulos/vistas experimentales y conserva los
datos. Hacerlo en un servidor real requeriría su autorización de operación.
No se revocan follows WhatsApp ni se borran canales al dar de baja una preferencia.

## Preparación de continuidad, no infraestructura existente

Arquitectura propuesta para revisión: entorno público fuera del homelab off-grid,
segunda copia en otro dominio de fallo, laboratorio/ingesta/editorial aislados y
respaldos restaurables con acceso restringido. El nodo público no debe recibir
volúmenes privados, secretos de estación, HA/MQTT o acceso a WAHA. Un futuro export
público auditable deberá llevar fuente/versión/validez y permitir mostrar fallback
stale sin afirmar seguridad. Ese export y failover no están operativos aquí.

Antes de beta: medir frescura y fallos por fuente, antigüedad del último procesamiento,
outbox pendiente/vencida/dead-letter, capacidad y edad/verificación de backups;
ensayar pérdida de red/energía, restauración y rectificación con operador. RPO/RTO,
SLO, hosting secundario, responsables y canales de incidencia quedan **por medir y
asignar**, sin inventar disponibilidades. No provisionar recursos ni pagar servicios
por este documento. WAHA/Meta, permisos, revisión legal y activación M5 mantienen
la aprobación expresa separada del desarrollo M0–M4.

## Evidencia del ensayo actual

`backup.test.js` usa exclusivamente fixtures de estación/capas, histórico sintético,
revisión de dos roles, outbox queued y preferencia con secreto aleatorio. Recupera
todos los árboles a raíz nueva, conserva hashes/estados y solo procesa la simulación
mediante llamada explícita. Prueba corrupción, archivos extra, checksum/traversal,
locks/symlinks/cuotas, cambio concurrente, lectura sin reparación y origen intacto.
Nueve pruebas dirigidas correctas; no se respaldó/restauró producción ni se midió
RPO/RTO del Proxmox/LXC real.

Prueba adicional con archivo real de investigación de M1 (sin tráfico proveedor):
`2026-10-27T22:58:52.594Z`, backup/verify/restore correctos, **4 archivos**,
**595113 bytes**, **2 capturas y 1 artefacto** INAMHI. Se comprobó ausencia de CLI de
ingesta activo y locks; copia/restauración privadas en raíces nuevas de /tmp.
No contenía histórico, capas o journals: su cobertura completa procede del ensayo
sintético, no se extrapola de este archivo pequeño. No hay servicios arrancados,
redistribución de bytes, modificación del archivo original ni volumen de producción.
El verificador rechaza también series de histórico null/array/no-array aunque el
constructor legacy por sí solo pudiera aceptarlas; no cambia su formato o contenido.

### Cuotas de preferencias y revocación

La versión actual reserva capacidad lógica para bajas antes de aceptar altas o
cambios. Preservar configuración de cuotas al recuperar; no reducirlas por debajo
de eventos/bytes existentes más las bajas pendientes de preferencias activas.
Las reservas se recalculan desde el estado, no son archivos/eventos adicionales.
Un journal antiguo ya lleno necesita dimensionamiento autorizado; esta versión no
inventa capacidad ni borra historia. Bajas que aún caben se procesan aunque la
reserva restante sea insuficiente. Disco realmente lleno o fallo de I/O puede
seguir impidiendo cualquier escritura: mantener el servicio en sombra y atender
la capacidad antes de proponer operación. Una repetición de baja ya registrada no
requiere otro evento y sigue devolviendo su estado.

### Elegibilidad tras restaurar

Restaurar bytes no renueva retrievedAt ni TTL. Antes de revisión/simulación,
verificar archivo y vigencia de captura, última edición de URL y fallos conocidos.
Una captura exitosa posterior a fallo/Retry-After debe constar realmente.
No reactivar automáticamente elementos cancelados del outbox ni reescribir
candidatos aprobados: toda confirmación queda separada de su procedencia original.

### Exclusión de ingesta manual detenida

IngestionService usa ingestion-SHA256(host).lock dentro de su raíz. Su presencia
produce source_busy; no hay caducidad o recuperación automática. Primero verificar
el estado real de los trabajos/procesos de ingesta conocidos y detener nuevas
invocaciones. Un archivo, su edad o un PID aislado no bastan para dar un proceso
por vivo o terminado; contrastar el manejador del trabajo, proceso y registros.

Solo después de confirmar quiescencia y la raíz concreta, revisar integridad con
lector readOnly y retirar exclusivamente el lock abandonado identificado. No borrar
capturas, fallos o writer.lock como atajo; no usar limpieza por glob/antigüedad.
Un nuevo GET sigue sujeto a cooldown/Retry-After persistidos, límites y opt-in.
Retirar el lock no demuestra recuperación del proveedor, no renueva retrievedAt/
availabilityVerifiedAt y no reactiva simulaciones canceladas. Backup se niega mientras este
lock exista, aunque se haya indicado quiesced=true.
