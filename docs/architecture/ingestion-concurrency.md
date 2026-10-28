# Ingesta manual: exclusión entre procesos

El control anterior leía cooldown antes de HTTP y SourceHttp solo coordinaba su
propia instancia. Dos CLI sobre el mismo archivo podían consultar simultáneamente
el mismo proveedor, antes de que cualquiera registrara captura o fallo.

IngestionService adquiere ahora `ingestion-SHA256(host).lock` con creación exclusiva
y permisos 0600 en su raíz de archivo. Cubre lectura de pausas, petición, normalización
y persistencia de captura/fallo. Otro proceso/instancia del mismo archivo y host
recibe unknown/source_busy sin HTTP ni crear un fallo ficticio de proveedor.
Otros hosts pueden consultar de manera independiente; el writer lock existente
sigue protegiendo las escrituras. No se mantiene writer.lock durante la red.

La exclusión se libera en finally, también al salir por cooldown, error HTTP o
límite de capacidad. Antes de HTTP se comprueba capacidad del índice de capturas
y de fallos; si cualquiera está lleno devuelve store_capacity_exceeded sin consultar.
El límite de bytes sigue verificándose al archivar, pues el tamaño nuevo no se
conoce antes de descargar. No borra registros para conseguir capacidad.
Un store readOnly rechaza ingesta antes de inicializar archivos o consultar red.

No hay renovación, borrado por antigüedad ni apropiación automática de una exclusión
existente. Si un proceso muere, el archivo puede quedar y requiere investigación
del operador; un lock no prueba por sí solo que el proceso siga vivo o haya muerto.
Backup rechaza esta exclusión como writer no quiescente, aunque el operador haya
indicado quiesced=true. Ver [recuperación](../runbooks/multihazard-recovery.md).

Alcance: procesos que usan esta raíz de IngestionService. No coordina archivos
DATA_DIR distintos, el namespace de adquisición completa de capas (con su propia
exclusión), sondas independientes ni toda la cuota de una IP/proveedor. No sustituye
ToS, intervalos aprobados, Retry-After o presupuestos. No habilita polling/scheduler.

Pruebas sin proveedores: dos instancias y un proceso Node separado mantienen HTTP
simulado en vuelo mientras el competidor recibe source_busy; dos perfiles de
Open-Meteo comparten host, otro proveedor puede completar su consulta; liberación
tras éxito/fallo, cooldown posterior, exclusión preexistente intacta, readOnly sin
crear raíz, archivo lleno sin descarga y backup rechazado mientras está ocupado.
No hubo HTTP real, cambios de datos históricos ni nuevas publicaciones.
