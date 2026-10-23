# Home Assistant · consulta informativa opt-in

Ejemplo [sector-watch.yaml](sector-watch.yaml), no integración instalada ni verificada
en una instancia HA real. Se cotejó sintaxis/configuración con documentación oficial:
[REST](https://www.home-assistant.io/integrations/rest/),
[REST sensor](https://www.home-assistant.io/integrations/sensor.rest/) y
[triggers](https://www.home-assistant.io/docs/automation/trigger/).
No se contacta a HA, no se cambia equipo y no se despliega configuración.

Antes de copiar: revisar permisos/fuente/catálogo de AEGIS, habilitar solo los flags
de consulta pertinentes tras revisión, configurar HTTPS válido y zona HA
America/Guayaquil. Sustituir example.invalid y REPLACE_WITH_REVIEWED_SECTOR por
instancia/sector curado. No introducir dirección o código de gestión en URL. Si HA
está en otra zona, ajustar template explícitamente, no asumir que now() es Ecuador.

GET cada15min y timeout10s, sin TLS inseguro ni headers falsificados. La consulta
obtiene como máximo20 filas del día; ejemplo supervisa la primera programación
residencial/mantenimiento vigente/revisada de esa página, **no cobertura de todos
los sectores/horarios**. Para más páginas se requiere cliente separado acotado;
no multiplicar sensores sin revisar cuota, proxy y licencias.

Sensor usa id+revision de horario autorizado: stale/missing/changed, synthetic,
industrial/desconocido o review pendiente => desconocido. Fila vacía =>
sin_programacion_verificada, nunca «habrá luz». No compara MW/MWh/cota ni calcula
probabilidad. Cambios solo de fetched_at no disparan una nueva versión del sensor.

Aviso local persistent_notification por cambio de versión, doble opt-in OFF:
automation initial_state:false e input_boolean initial:false. Habilitar ambos
manualmente tras verificar instance/configuración. El arranque o regreso desde
unknown/unavailable no dispara; cambio solo de atributos tampoco. El aviso pide
consultar fecha/zona/documento, no afirma que ocurrió un corte. No hay acción de
inversor, enchufe, host, Proxmox, apagado o infraestructura física.

Esta muestra no implementa Web Push ni reutiliza secretos de suscripción. No
promete entrega/lectura/cancelación ni notifica todos los casos. PR07 tiene outbox
y consentimiento propios, permanecen OFF. Validar en entorno HA aislado antes de
cualquier uso; verificar ID real de entidad generado por HA y estado de templates.
Baja: deshabilitar automation/input_boolean y retirar REST sensor, sin tocar equipos.

OpenAPI y reglas en [API v1](../../docs/api/README.md). Si luego se desean acciones
físicas, requieren otro diseño, revisión y autorización explícita; no añadirlas
a este ejemplo por interpretar un horario, reporte ausente o umbral de Mazar.

Verificación opcional reproducible con PyYAML/Jinja2 en entorno Python aislado:
`python scripts/verify-ha-example.py`. Comprueba YAML, doble opt-in OFF y templates
para fuente vigente/stale/synthetic/industrial/pendiente/versión no coincidente.
Es una prueba de sintaxis/plantillas, no certificación de una instancia HA real.
