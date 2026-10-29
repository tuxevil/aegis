# Red efectiva: laboratorio aislado y propuesta pendiente

No ejecutar nft en el host. No usar --network=host, --privileged o Docker socket.
Esta prueba usa solo un namespace Docker nuevo con **network none**, sin rutas
externas, puertos publicados, redes Docker nuevas o cambios al firewall del host.
Los alias192.0.2.10/11 y169.254.169.254 están asignados a loopback **dentro** de ese
namespace; no se consulta metadata real ni un proveedor.

```sh
docker build -t aegis-egress-fixture:dev deploy/staging/egress-lab
docker run --rm --init --network none --cpus 0.5 --memory 384m --pids-limit 96 \
  --user 0 --cap-drop ALL --cap-add NET_ADMIN --cap-add SETUID \
  --cap-add SETGID --cap-add SETPCAP --security-opt no-new-privileges:true \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --sysctl net.ipv4.ip_unprivileged_port_start=0 \
  -e "AEGIS_FORBIDDEN_NETNS=$(readlink /proc/self/ns/net)" aegis-egress-fixture:dev
```

El init de prueba requiere root/NET_ADMIN para instalar reglas en SU namespace
y capacidades para bajar privilegios. Las sondas y servidor fixture corren UID1000
con capacidades efectivas/bounding eliminadas. Esto no concede NET_ADMIN al AEGIS
operacional ni sustituye su perfil cap_dropALL. El script exige /.dockerenv y un
namespace distinto al del invocador; sin esa guardia se niega a cargar reglas.
No se usa --privileged ni se montan rutas del host para modificar configuración.

## Resultado ejecutado

[Evidencia exportada](../verification/integration/egress-namespace-proof-2026-10-29.json).
Antes de las reglas, los cinco destinos/puertos fixture respondían: se descarta
que los bloqueos posteriores sean solo falta de ruta/servidor.

| Prueba después de política OUTPUT/drop | Resultado |
| --- | --- |
|192.0.2.10 TCP443| Permitido |
|192.0.2.11 TCP443| Bloqueado |
|169.254.169.254 TCP443| Bloqueado |
|192.0.2.10 TCP80| Bloqueado |
|127.0.0.1 TCP443| Bloqueado |

Contador kernel drop:4 paquetes/240bytes en esa ejecución. La sonda comprueba
UID1000 y CapEff=0; fallo de una denegación da exit1. El contenedor se elimina al
terminar y desaparecen alias/reglas. La imagen solo contiene utilidades de desarrollo,
no se añade a producción ni se crea un servicio residente.

## Qué garantiza y qué falta

Esto prueba filtrado L3/L4 real por kernel, no solo allowlist JavaScript. La prueba
usa HTTP local sobre puerto443: **no** demuestra TLS o GET autorizado en INAMHI.
TLS/SNI/certificados/DNS pin/URL/GET se prueban separadamente en el puente con mocks
y servidor HTTPS local. Un firewall IP/puerto no inspecciona métodos o paths dentro
de TLS. No se añade proxy TLS para aparentar esa garantía.

El template `deploy/staging/inamhi-egress.nft.proposed` tiene sets vacíos: niega todo,
no está aplicado. Su sintaxis pasó nft --check dentro de otro namespace sin red.
Para una futura ejecución con salida, el operador debe revisarlo/instalarlo en un
namespace **nuevo y dedicado**, antes de procesos no confiables. DNS solo a resolver
aprobado (UDP/TCP53), IPv4 pública aprobada TCP443, ingress establecido y resto drop.
No permite IPv6; no hot-apply sobre conexiones heredadas. El nodo app debe quedar
sin capacidades; cualquier instalación/host policy es trabajo de infraestructura
que requiere autorización, no acción automática de estos scripts.

Faltan en el entorno real: resolver aprobado, respuestas/IPs actuales, routing,
filtrado forward/entrada, denegación demostrada hacia servicios Proxmox/host, y
prueba TLS contra proveedor. Una bridge con Internet irrestricto no es alternativa.
La única resolución DNS observada fue186.47.233.146 el29/10/2026 14:13:33UTC;
es una observación temporal pública, **no** se añadió a ningún set/autorización.
Cambios DNS fuera de lista paran el puente. No se consultaron IPs privadas del host.

La conectividad INAMHI real sigue **NO-GO**. No usar la evidencia de fixtures como
networkVerificationReference de un despliegue no probado.
