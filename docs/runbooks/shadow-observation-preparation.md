# Preparación de observación continua con fuentes reales — inactiva

29/10/2026. Se conserva `deploy/staging/compose.yaml` byte a byte respecto al
PR #34: red none, sin puertos, 0.5 CPU/384MiB, usuario no privilegiado, rootfs
readOnly y DRY_RUN. No se accedió a Proxmox ni se inició captura continua.
El encargo completo posterior añade scheduler, métricas, discrepancias y protocolo
7–14 días. Su [ejecución offline y gates](shadow-observation-7-14-days.md) amplían
esta propuesta; el preflight de salida real continúa bloqueado.

Artefactos separados:

- [Política propuesta](../verification/integration/shadow-egress-policy.proposed.json):
  autorización null, firewall no verificado, IP allowlist vacía, runner no preparado,
  ninguna observación iniciada.
- `deploy/staging/compose.shadow.yaml.example`: override **no automático**, red
  externa nombrada explícitamente y comando de preflight que rechaza operar.
- `scripts/shadow-egress-preflight.mjs --check-plan`: contrasta IDs/host/path/tamaño
  con SourceRegistry, sin HTTP, Docker, SQLite, escrituras o aprobación.

El preflight sin argumentos sale con código2/bloqueado. --live/--activate y otros
argumentos se rechazan; ninguna variable de entorno de aprobación habilita tráfico.
No afirma conocer la red del contenedor: un operador Docker puede adjuntar una red
antes de que arranque el proceso. No ejecutar up de este override sin autorización.
El archivo no es todavía un despliegue de observación continua: falta un runner
revisado y la verificación de restricciones reales del host.

## Separación de controles

| Capa | Restricción necesaria | Evidencia disponible / pendiente |
| --- | --- | --- |
| Docker/host | Red externa dedicada con deny-by-default; solo destinos resueltos/aprobados, TCP443 y resolver aprobado | No instalada/verificada; no se crea una red ni se cambia firewall desde esta entrega |
| DNS | Resolver definido, direcciones públicas comprobadas; negar privadas/loopback/link-local/reservadas/metadata; detener ante rotación no revisada | IPs/resolver siguen vacíos, no se adivinan direcciones de CDN |
| TLS/HTTP | Certificado verificado, HTTPS, GET, hostname/path de SourceRegistry, parámetros cerrados, sin redirects | SourceHttp/registry existentes y pruebas de inyección/302; no tráfico real nuevo |
| Cadencia | Un fetch global a la vez, leases/cooldowns persistentes existentes, presupuestos de intentos y bytes, Retry-After/403/429 | Propuesta cuantificada abajo; no hay scheduler autorizado o activo |
| Datos/evaluación | Captura/hash/versiones/tiempos, fallo distinto de ausencia, cortes de conocimiento reales, evaluaciones privadas | Módulos existentes; evidencia operacional continua aún no obtenida |
| Distribución | Ningún transporte ni alta ciudadana real, sin cuenta WAHA o Push | Barreras de código existentes y pruebas negativas; no activables por este plan |

Una red Docker bridge no constituye una allowlist de destinos. Un firewall de
IP/puerto tampoco puede verificar el método GET dentro de TLS. Ese control sigue
en la aplicación/registry; no se promete inspección HTTP por netfilter ni se añade
un proxy TLS/servicio residente. Reutilizar controles de host existentes solo tras
aprobación y pruebas de denegación desde el contenedor. Si no se pueden demostrar,
la conectividad no está preparada. Nunca usar host networking, 0.0.0.0/0, otro
proxy o DNS alternativo como fallback para superar un bloqueo.

## Destinos y frecuencia propuestos, no permisos de uso

| Perfil existente | Selección | Cadencia candidata / presupuesto máximo |
| --- | --- | --- |
| inamhi.warning.pdf | www.inamhi.gob.ec/pronostico/advertencia.pdf, sin parámetros | Cada30min como mínimo, hasta48 intentos/24h; body≤2000000bytes |
| openmeteo.singlerun.ecmwf | single-runs-api.open-meteo.com/v1/forecast, run/piloto explícitos mediante registry | Hasta48 intentos/piloto/24h,96 entre ambos; separación host≥300s, piloto≥1800s; body≤400000bytes |

Son límites de diseño sometidos a permisos, no polling aprobado por el proveedor.
Los intervalos candidatos dejan margen frente al TTL actual de una hora, pero el
presupuesto, disponibilidad de corridas, carga de parser y resolución de fuentes
deben revisarse antes de aprobarlos. Un intento fallido consume presupuesto; sin
reintentos en cascada, un intento por ciclo y backoff persistente. El plan no cambia
TTL ni interpreta una fuente stale como riesgo bajo.

INAMHI requiere aclarar consulta/archivo continuo y atribución. Open-Meteo Free
exige revisar uso no comercial/financiación y sus términos actuales. CC BY de datos
no elimina condiciones de acceso. No hay autorización institucional inferida aquí.
No se incluye Amaru, cuotas pagadas, estaciones con credenciales, HA/WAHA o descarga
periódica de capas SNGR. No se usa el ejemplo histórico fijo de run del catálogo
como si fuera un pronóstico actual. La selección de nuevas corridas necesita
evidencia de disponibilidad, sin retroceder timestamps; todavía no se automatizó.

## Comprobación offline reproducible

```sh
node scripts/shadow-egress-preflight.mjs --check-plan
node --test test/shadow-preparation.test.js test/operational-barriers.test.js
docker compose -f deploy/staging/compose.yaml config --quiet
AEGIS_APPROVED_SHADOW_NETWORK=aegis-shadow-NOT-CREATED docker compose \
  -f deploy/staging/compose.yaml -f deploy/staging/compose.shadow.yaml.example \
  config --format json
```

El último comando **solo renderiza** una propuesta con un nombre inexistente;
no contiene up, create o run. Se comprobó con Compose5.1.2 y tag !reset; revisar
compatibilidad de la versión del operador antes de cualquier uso futuro. Sin
nombre explícito, el render falla. Ese nombre/env no prueba aprobación o firewall.
Los tests niegan argumentos de activación aun con env que simulan aprobación.
No se ha probado un firewall real con paquetes: el JSON no sustituye esa prueba.

## Evidencia que debe producir la ejecución futura

Antes de arrancar: revisión de permisos, host/red, run seleccionado, commit/image,
volumen nuevo, presupuesto y aprobación explícita registrada. El protocolo candidato
es empezar por72h reales y extender a7d tras revisión; duración no ejecutada ni SLA.
No acelerar clocks para afirmar que el proceso lleva días. Los plazos son propuesta.

| Pregunta | Registro/medición requerida | Estado actual |
| --- | --- | --- |
| ¿Estable días sin intervención? | Inicio/fin UTC reales, uptime/restarts, salida de proceso, errores, intervención y lag | No iniciado; no hay días de evidencia |
| ¿Correcta/vigente/verificable? | URL exacta, HTTP/hash/bytes, emisión/vigencia/run, captura/proceso, parser y calidad | Diagnóstico histórico y tests; no validación continua nueva |
| ¿Fallos/cambios? | Intento y causa sanitizada, pausas, último dato válido, revisión/SHA, tiempo sin fuente utilizable | Tests negativos/recovery; falta registro operativo real |
| ¿Qué evaluaciones y razones? | assessArchive por piloto/corte con refs/reglas/faltantes/precisión; guardar solo en archivo privado | Motor en sombra; ningún candidato se publica |
| ¿Discrepancias con autoridad/impactos? | Revisión separada de avisos/observaciones/eventos y hora de disponibilidad | Etiquetas revisadas/negativos comparables faltan; tasas reales null |
| ¿Recursos reales? | Muestras CPU/RSS/PIDs/disco/red con carga y cortes; intentos/bytes de cada fetch; energía solo con medición autorizada | Muestras de laboratorio del28/10, no coste diario o vatios del servidor propietario |
| ¿Condiciones de piloto? | Resumen de permisos/cobertura/privacidad/seguridad/operación y responsables | Sigue la lista de gates, sin autorización de usuarios/envíos |

Reusar artefactos/journals/evaluador y perfil de recursos actuales, sin nueva base,
servicio de métricas o sistema de mensajería. Diferenciar evidencia real y fixtures
por namespace. No contar una evaluación sin datos como TN ni ausencia de reportes
como no-incidente; Amaru no es ground truth. Emisión y run no sustituyen primera
captura/disponibilidad. Correcciones posteriores no entran en cortes anteriores.

Criterios de parada: cuota/disco/heap próximos al límite, corrupción/lock pendiente,
restarts repetidos, cambio de formato/CRS/certificado/destino, permisos inciertos,
reloj incoherente o presupuesto de red excedido. Pausar y conservar evidencia;
salud de una fuente desconocida no significa seguridad. Mantener backup verificado
con escritores detenidos y restore a raíz nueva; no purgar, saltar locks, reparar
o conmutar producción automáticamente.

Esta preparación no responde aún a las preguntas con una observación real de días.
Permite revisar restricciones y rechazos sin habilitar conectividad, mantener el
laboratorio y decidir qué autorización/evidencia falta antes del siguiente paso.

## Validación local de esta preparación (29/10/2026)

Host: check correcto, **427/427** pruebas Node y **6/6** contratos Python.
El render del compose offline conserva network:none y ausencia de puertos; el
render del ejemplo rechaza una red no especificada. Solo se renderizó el ejemplo,
sin crear redes ni arrancar ese servicio. El preflight bloquea el modo normal y
los argumentos de activación, incluso con variables de aprobación ficticias.

Un ensayo adicional de la suite completa en paralelo, con red none, 0.5 CPU y
384 MiB, falló por memoria: cgroup memory.events registró **oom_kill=4** y
procesos de tests recibieron SIGKILL. Se detuvo el ensayo tras confirmar la causa.
Es un límite reproducido del arnés paralelo, no una demostración de fallo del
runtime ni evidencia de que el runtime soporte días de carga. No ejecutar la
suite paralela dentro del servicio de observación; usar concurrencia1 para
verificación en un contenedor de pruebas separado con ese presupuesto.

Repetición con `--test-concurrency=1`: **427/427** aprobadas en contenedor nuevo,
red none, 0.5 CPU y 384 MiB, en **367.1 segundos**. La muestra de memory.events
durante esa repetición registró oom=0/oom_kill=0; la suite terminó con exit0.
Esto verifica el arnés acotado; no sustituye un soak test del runtime con datos reales.

```sh
docker build -t aegis-shadow-preparation:dev .
docker run --rm --network none --cpus 0.5 --memory 384m \
  aegis-shadow-preparation:dev node --test --test-concurrency=1
python3 -B -m unittest discover -s tests -p test_source_envelope.py
```

El build requiere acceso al registro/npm para construir dependencias; el run de
pruebas no tiene red. No es el override de operación ni modifica staging existente.
