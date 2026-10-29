# Propuesta de una consulta manual — pendiente de aprobación

No ejecutar el comando final hasta aprobación explícita. No se requiere correo,
licencia personalizada o respuesta institucional para presentar esta propuesta.
[Fundamento público acotado](../verification/integration/inamhi-public-use-review.md)
y [parámetros de la operación](../verification/integration/inamhi-single-operation.proposed.json).
El borrador anterior es solo antecedente, no gate ni comunicación pendiente.

## Operación solicitada

Una única captura privada GET de
`https://www.inamhi.gob.ec/pronostico/advertencia.pdf`, puerto443,≤2MB y12s, sin
redirects/reintentos. Una respuesta fallida también consume el intento. Archivo,
SHA, emisión/captura/procesamiento, calidad y evaluaciones quedan en volumen privado.
No scrape de otras páginas, cron, usuarios, outbox, Push, WAHA o publicaciones.
Una copia para análisis no habilita redistribuir PDF/mapas ni consulta periódica.

Destino DNS observado en esta preparación:186.47.233.146 (IPv4), instante en JSON.
No es aprobación de ese IP; se debe confirmar al aprobar. El puente resuelve de
nuevo y solo conecta si todas las respuestas son públicas y aprobadas. Un cambio,
IPv6, dirección privada o certificado no confiable falla cerrado, sin otra ruta.
TLS/SNI/hostname permanecen originales aunque el socket se fije al IP aprobado.

## Perfil B, separado del ensayo offline

La imagen de preparación reutiliza el puente #39, no lo reemplaza. Añade solo
nftables/util-linux para un init de namespace; no instala reglas o servicios en host.
El init valida el archivo0600 como UID1000, compila/aplica OUTPUT e INPUT defaultdrop
en SU namespace y baja UID/capacidades antes del comando existente.
IP de proveedor aprobada TCP443; resolver público **1.1.1.1 UDP/TCP53**, sin DNS
alternativo, search domains o proxy. No destinos internos, metadata, IPv6 ni puertos
publicados. El puerto/método/path HTTPS se controla además en código; nft no inspecciona
el GET cifrado. No se usan excepciones TLS energéticas.

Preflight ejecutado en esta máquina con red none/propuesta no aprobada: nft instalado,
UID1000, CapEff/CapBnd0, providerRequests0. Se corrigió un EACCES del init limitado
leyendo el archivo privado como UID1000, sin añadir DAC_OVERRIDE. El intento de
--execute-manual con esa propuesta se rechazó antes de crear raíz manual o hacer DNS.
La prueba de cinco destinos por kernel de #40 también se conserva.

La imagen tiene guardia /.dockerenv y namespace diferente al invocador. No ejecutar
run.sh/nft en el host ni usar --privileged/--network=host. Las cuatro capacidades del
init son exclusivamente para preparar/bajar privilegios; el proceso AEGIS no las conserva.
El preflight offline no confirma alcance al proveedor, resolver o red real. En el
comando aprobado, si falla instalación/verificación, DNS o TLS, no hay fallback.
Se comprobó también la interpolación del IP candidato en el set del kernel,
manteniendo status not_authorized y red none. No se envió DNS/HTTP a ese destino.

## Archivo a completar solo después de aprobación

Copiar el template inamhi-manual-authorization.proposed.json a
`/root/aegis-inamhi-once/query.json`, modo0600/UID1000 para el contenedor.
Mantener sourceId/método/alcance/DRY_RUN/maxRequests1; completar status
approved_single_manual_query, ownerApprovalReference con la aprobación concreta,
expiresAt UTC≤24h e IPs públicas revisadas. dataRightsReference apunta a la revisión
pública. networkVerificationReference identifica este perfil/preflight y la política
que el init verifica/aplica antes del GET. Referencias no son permisos inventados:
requieren revisión del propietario. No se creó un archivo autorizado en esta sesión.

La reserva vitalicia es por raíz de autorización/volumen; no se debe reutilizar la
aprobación en otra raíz ni restaurar estado anterior para repetir. No retirar el
volumen/ledger después de un error. Un nuevo intento necesita decisión separada.
Se corrigió la CLI: una segunda ejecución ahora devuelve exit1, no repite éxito
anterior ni reevalúa/sobrescribe evidencia. La regresión falló antes y pasa después.

## Comando exacto propuesto, NO ejecutado

Usaría la bridge Docker **existente**, un namespace nuevo, archivo privado readonly
y volumen nuevo exclusivo; no cambia redes/firewall globales del host. La aprobación
solicitada abarca esta creación de contenedor de desarrollo, DNS y un GET, no Proxmox.
No comparte volumen ni imagen en ejecución con el ensayo de siete días.

```sh
docker run --pull=never --name aegis-inamhi-once-20261029 --init \
  --network bridge --dns 1.1.1.1 --dns-search . \
  --dns-option attempts:1 --dns-option timeout:2 \
  --cpus 0.5 --memory 384m --pids-limit 96 --user 0 \
  --cap-drop ALL --cap-add NET_ADMIN --cap-add SETUID --cap-add SETGID --cap-add SETPCAP \
  --security-opt no-new-privileges:true --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount type=bind,src=/root/aegis-inamhi-once/query.json,dst=/authorization/query.json,readonly \
  --mount type=volume,src=aegis-inamhi-once-data-20261029,dst=/data \
  -e NODE_OPTIONS=--max-old-space-size=192 -e ALERTS_PUBLISH_ENABLED=false \
  -e "AEGIS_FORBIDDEN_NETNS=$(readlink /proc/self/ns/net)" \
  sha256:5c8fbb052fd7ef7616840d023d5af46f9004a8866d638c1aa4aadb64d19c779d \
  --execute-manual
```

Se fija imageId local para que un tag movido no cambie la operación aprobada.
Si no está disponible o cambia, revisar nueva imagen antes de ejecutar. No se usa
--rm: se conserva contenedor/evidencia; una repetición con mismo nombre falla.
El ledger persistente también rechaza repetir al arrancar el mismo contenedor.

Después: revisar salida/código, manual-network-setup.json, manual-result.json y
archivo capturado privado; contrastar parser con número/fechas/ámbito del PDF, anotar
discrepancias y verificar hash. No dar por correcto un parser por HTTP200. Ante
layout/fecha incompleta marcar unknown; ante403/429 parar, no repetir ni eludirlo.
No se publica el PDF, datos, candidatos o probabilidades. GO para solicitar aprobación;
NO-GO para ejecutar mientras ownerApproval siga pendiente.

Validación de esta preparación:455/455 Node en host y contenedor sin red, seis
contratos Python, checks Node/shell de los helpers y preflight kernel positivo.
El test de repetición de CLI pasó tras reproducir exit0 incorrecto. La prueba TLS
energética usa solo servidor/CA sintéticos locales; Grid productivo no cambia.
