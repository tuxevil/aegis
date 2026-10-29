# INAMHI: primera fuente preparada, no activada — 29/10/2026

## Hechos documentales y límites

Se consultaron páginas públicas, no se descargó ahora el PDF ni se realizó una
consulta de datos INAMHI. El [portal de alertas](https://servicios.inamhi.gob.ec/alertas/)
enlaza advertencia nacional, nowcasting y avisos territoriales; anuncia que sus
enlaces muestran la versión más reciente. El [catálogo de boletines](https://servicios.inamhi.gob.ec/boletines/)
incluye hidrología, Guayaquil–Durán y Pallatanga, entre otros. Son productos distintos;
un enlace público de Pallatanga no demuestra actualidad del documento.

Para este piloto se conserva **solo** la URL registrada
`https://www.inamhi.gob.ec/pronostico/advertencia.pdf` (GET/443). No se añaden
crawlers ni se siguen enlaces descubiertos automáticamente. El
[índice público](https://www.inamhi.gob.ec/pronostico/) muestra tamaños/Last-Modified,
pero buscador y vista abierta devolvieron metadatos distintos: no certifican emisión,
primera disponibilidad o una revisión. No se descargaron ejecutables/directorios.
Las páginas antiguas muestran enlaces ajenos en su pie; no se siguieron ni ejecutaron.

La [nota institucional del1/4/2025](https://www.inamhi.gob.ec/info-liberada/)
comunica eliminación de cobros y acceso público a información hidrometeorológica.
No especifica en lo leído licencia concreta, cadencia de requests, SLA, límites de
archivo versionado o condiciones de redistribución automatizada. **No equivale a
permiso confirmado para recopilación/publicación continuas.** Contacto de datos
confirmado en esa página: datos@inamhi.gob.ec. No se enviaron comunicaciones.

| Tema | Confirmado | Pendiente |
| --- | --- | --- |
| Consulta | URL pública registrada y enlaces oficiales | Autorización/cadencia para automatización |
| Archivo/reutilización | Comunicación general de acceso | Alcance específico de conservar/versionar/republicar |
| Atribución | Autoridad original debe conservarse | Fórmula y licencia institucional requerida |
| Periodicidad | Publicación/revisión variable según advertencia | Calendario, feed, cuota o SLA oficiales |
| Fechas | Parser preserva emisión y vigencia del texto cuando existen | Emisión no prueba primera subida; metadatos HTTP no la sustituyen |
| Revisiones | URL mutable; archivo AEGIS versiona SHA y captura | Histórico original/version ID/cancelación estructurados |
| Formato | Pipeline PDF/magic/media/normalización probado | Muestras reales nuevas y cambios de layout no certificados |

## Puente y garantías comprobadas sin proveedor real

`inamhi-transport.js`: URL exacta, GET, HTTPS, TLS verificado y SNI original,
sin agente reutilizable, resolución fresca seguida de pin al IP aprobado en el
socket. Toda respuesta DNS debe ser IPv4 pública de la lista explícita; rechaza
privadas/link-local/metadata/reservadas/mappedIPv6 y cambios no aprobados. No fallback
IPv6: no soportado en este piloto, falla cerrado. Filtro conservador según
[registro IANA](https://www.iana.org/assignments/iana-ipv4-special-registry/).
Sin redirecciones, cookies, autenticación, proxy ni excepción TLS energética.

Timeout12s/cuerpo≤2,000,000bytes; cancelación incluye DNS/HTTP; SourceHttp procesa
403/429 y Retry-After (segundos/fecha), conservando pausas persistidas incluso
valores enormes representables. IngestionService mantiene lease/archivo/SHA,
timestamps, calidad y permisos pendientes. Los permisos no se cambian a verified.

`createManualInamhiRunner` conecta el callback a ShadowRunner con origen
captured_source y **un intento de por vida**, reservado en disco+fsync antes de
HTTP. Tras fallo, reinicio o nueva fecha no concede otro intento. Namespace/root
nuevo y privado, marcador propio; no se mezcla con fixtures o Grid. El runner
sintético rechaza este callback. No existe modo periódico real en este puente.

`inamhi-manual.mjs` no hace nada por defecto. Ejecutar requiere acción deliberada,
archivo privado con referencias owner/datos/red, IPs y expiración≤24h. El template
[propuesto](inamhi-manual-authorization.proposed.json) es inválido para ejecutar:
status not_authorized, referencias null e IPs vacías. Una referencia escrita no
prueba identidad, derechos o firewall: debe revisarla el propietario; la herramienta
solo verifica estructura/expiración y presupuesto. No se creó una aprobación real.

Pruebas: callbacks/streams simulados, DNS privado/rebinding, URL/puerto alternos,
403/429/302 sin follow, HTML/PDF inválido, cuerpo grande, aborto DNS, presupuesto
durable y origen. Servidor HTTPS real **local** con certificado sintético no confiable:
rechazo antes de HTTP. No se contactó al proveedor para estas pruebas.

## Standards

La revisión de contexto separado reprodujo un P3 de métricas: los fallos se
reportaban como0bytes aunque hubiera datos leídos. Corregido propagando el conteo
observado de SourceHttp incluso tras error de parser; cuerpos no leídos quedan
null y aumentan unknownByteAttempts. Revalidación específica puente/runner19/19;
sin bypass reproducido de DNS/TLS/intento único o publicación. No es aprobación
humana externa ni certificación del proveedor.

## Spec

El mismo defecto fue reproducido en este eje como P2 por incumplir el registro
honesto de tráfico. Un cuerpo de2,000,001bytes ahora cuenta ese valor y falla por
body_too_large; un cuerpo no leído permanece desconocido. Revalidación específica
8/8 del puente. Las revisiones usan mocks/HTTPS local, no consultas INAMHI.
Resumen por eje: Standards1P3 corregido; Spec1P2 corregido. No sumar el mismo
defecto como dos distintos ni interpretar esos resultados como autorización real.

Validación final:454/454 pruebas Node en host y contenedor reconstruido network:none,
seis contratos Python y check correcto. La CLI con propuesta no autorizada, aun
copiada a archivo0600, rechazó la ejecución antes de crear la raíz de datos.

## Frecuencia/disco propuestos, no autorizados

Primero una única consulta privada,≤2MB, sin retry automático. Evidencia histórica
M0 del27/10:590825bytes de un PDF; no es tamaño actual ni máximo demostrado.
Con ese único tamaño,48 capturas/día×14 días serían397034400bytes antes de dedup,
metadatos/evaluaciones. Con techo2MB serían1.344GB. No dimensionar a256MiB suponiendo
que siempre llega el mismo archivo. Para un futuro piloto considerar30min/48día,
presupuesto explícito de volumen, cache/versiones y parada con margen; medir primero
cuerpo, parser, RSS y crecimiento. Esa cadencia no está aprobada ni se activó.

## Propuesta de primera consulta manual

**Criterio vigente: GO para solicitar aprobación de una consulta privada**, no para
ejecutarla. La [revisión pública acotada](inamhi-public-use-review.md) sustituye
la exigencia institucional anterior. No se prepara/envía correo ni se espera una carta.
1. Usar la base pública documentada para este GET/copia privada, sin elevarla a
   licencia universal de automatización/redistribución o a respaldo institucional.
2. Autorización explícita del propietario para **una** consulta y captura privada.
3. Lista IP/DNS/TLS y control efectivo de red verificados en el entorno elegido;
   aprobación aparte si requiere Proxmox. DNS observado hoy no autoriza ninguna IP.
4. Directorio nuevo privado, snapshot/espacio, revisión del template y expiración.

Solo entonces preparar un archivo0600 revisado y el comando:
`node scripts/inamhi-manual.mjs --execute-manual --authorization-file=ARCHIVO
--root=RAIZ_NUEVA`. No se ejecutó. Guardaría resultado/evaluaciones privadas y
rechazaría un segundo intento. No autoriza ingesta periódica, usuarios o publicación.
El borrador histórico queda solo como antecedente opcional, fuera de los criterios
de avance. El procedimiento exacto de red/ejecución está en la propuesta manual vigente.
