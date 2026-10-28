# Inventario privado para revisión de retención

Incremento M4, 28/10/2026. La caducidad de una preferencia a los 30 días impide su
uso, pero no borra los eventos anteriores del journal ni los respaldos. La baja
vacía las zonas del estado actual; la cadena inmutable conserva estados previos.
Este comportamiento requiere revisión de retención antes de admitir usuarios
reales; el diagnóstico no decide plazos legales ni certifica cumplimiento LOPDP.

```sh
node scripts/review-subscription-retention.mjs
node scripts/review-subscription-retention.mjs \
  --data-dir=/ruta/archivo-local --as-of=2026-10-28T15:00:00Z
# Añadir --fixture exclusivamente para el namespace sintético.
```

Sin argumentos muestra ayuda. Exige directorio y corte UTC explícitos, ignora
DATA_DIR y abre AlertJournal en readOnly. No crea directorios, escribe informes,
borra, compacta, anonimiza, reactiva preferencias o realiza llamadas de red.
Imprime JSON privado a stdout; los errores CLI son genéricos sin rutas o datos.
No existe ruta web pública o administrativa para esta salida.

El lector verifica la cadena SHA-256, secuencia, origen y límites existentes del
journal, y valida los campos necesarios para contar estados y tiempos. Un almacén
ausente/corrupto falla; solo un journal existente y vacío produce cero. Rechaza un
corte anterior al último evento: no reconstruye un supuesto inventario histórico.
El corte también clasifica expiraciones; si se elige un corte futuro es una
proyección sobre los estados actuales, nunca evidencia de actividad futura.

La salida contiene número de eventos, primera/última fecha y secuencia leída;
cuenta estados actuales activos/expirados/revocados y entradas históricas con zonas
o interés Push. Los revocados se cuentan por separado aunque haya pasado su fecha
de vencimiento. Cuenta hashes de gestión retenidos en estados actuales sin
exportarlos. No incluye IDs, secretos, hashes, cantones individuales ni IPs.
Son conteos exactos privados: no sustituyen la demanda pública con supresión <5,
ni identifican personas únicas, seguidores WhatsApp o entregas.

El inventario es la instantánea de eventos enumerados por el lector. Escrituras
posteriores requieren repetirlo; no se proclama un bloqueo global ni un punto
transaccional entre todos los almacenes. Revisar con escritores detenidos si se
requiere conciliación de respaldo. No inspecciona respaldos, archivos ajenos al
journal o campos extra arbitrarios, ni detecta toda posible información personal.
Una cadena válida detecta corrupción accidental; no prueba autenticidad frente a
un administrador capaz de reescribir todos los hashes.

Pendiente de operador/revisión competente: finalidad y plazo de cada dato,
depuración compatible con auditoría, control de acceso, copias cifradas externas,
propagación de bajas al restaurar y procedimiento para solicitudes de derechos.
No ejecutar borrados de volúmenes o copias reales a partir de estos conteos.
DRY_RUN y flags permanecen intactos; no habilita publicación o transporte.

Pruebas: alta/cambio de estado/caducidad con servicio real en directorio temporal
sintético, bytes antes/después idénticos, ausencia de identificadores en salida,
rechazo de corrupción/corte/namespace ausente/estado inválido con hash válido,
journal vacío y CLI con argumentos erróneos/DATA_DIR ajeno.
