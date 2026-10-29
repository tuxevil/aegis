# TLS heredado de Grid — investigación sin cambiar producción

Código/historia: la excepción rejectUnauthorized:false aparece ya en el commit
inicial d24e49c; no encontramos una justificación verificable en ese cambio.
SECURITY.md la atribuía a cadenas no estándar, sin prueba actual por host.
CELEC la conserva en fetchMrid y CENACE en backend. No se alteraron esas rutas.

[Diagnóstico real29/10/2026 14:13:33UTC](grid-tls-probe-2026-10-29.json), Node24.21.0:
solo handshakes TLS con verificación/SNI, sin HTTP ni datos operativos.

| Host | Puerto | Resultado |
| --- | --- | --- |
|generacioncsr.celec.gob.ec|443| TLS verificado; issuer Sectigo Limited |
|generacioncsr.celec.gob.ec|8443| TLS verificado; issuer Sectigo Limited |
|www.cenace.gob.ec|443| UNABLE_TO_VERIFY_LEAF_SIGNATURE |

Una segunda inspección TLS OpenSSL, sin HTTP ni aceptar verificación inválida,
mostró solo un certificado servidor CENACE: CN=*.cenace.gob.ec, issuer Sectigo
Public Server Authentication CA DV R36, CA=false, vencimiento observado12/11/2026.
La construcción de cadena falló por emisor ausente. Esto explica la limitación
del cliente observado; no demuestra continuidad del certificado ni del servicio.
No se descargaron CAs por enlaces AIA ni se instalaron certificados o truststores.

Alternativa recomendada: el proveedor CENACE debe servir fullchain correcto. Como
opción excepcional, un bundle público de CA específico por host requeriría obtener
y verificar su procedencia/cadena/fingerprints, pruebas con TLS/hostname habilitados
y revisión; no confiar directamente en el leaf recibido sin verificar. No usar
NODE_TLS_REJECT_UNAUTHORIZED=0 ni fallback automático inseguro.

CELEC es candidato a retirar la excepción en desarrollo: sus dos endpoints pasaron
el handshake actual. Falta comprobar una consulta de payload registrado con su
contrato, Node22/24, caché/errores y rollback antes de cambiar su comportamiento.
No se afirma que el dato llegó correctamente por haber completado TLS. CENACE no
está preparado para quitar la excepción sin reparar/comprobar la cadena.

Procedimiento seguro futuro: snapshot/versionar imagen; probar strict TLS contra
fuentes públicas permitidas en staging; confirmar parser/fechas/cache; fallo conserva
último dato con estado degradado; activar cambio solo con autorización de deploy.
Si falla, restaurar imagen/config previa por operación revisada, no habilitar un
bypass silencioso de certificados. El riesgo MITM heredado permaneceP2 documentado.

`node scripts/probe-grid-tls.mjs` no hace red. `--tls-only` repite una vez los tres
handshakes fijos; no tiene loop/URL libre ni actualiza Grid. No ejecutarlo como
polling. Esta investigación no bloquea INAMHI, cuyo transporte es independiente
y jamás importa las excepciones energéticas.

La etapa siguiente añadió una prueba real de HTTPS **local**:
`node --test test/grid-tls-proposal.test.js`. Sin CA confiable el cliente rechaza;
con CA sintética deliberadamente confiada solo en esa llamada, TLS y hostname
correctos pasan; con hostname incorrecto vuelve a rechazar. Nunca se usa
rejectUnauthorized:false, no se instala CA global ni se consulta el proveedor.
Esto prepara la comprobación de una fullchain reparada o bundle legítimo revisado;
no identifica/confía automáticamente en un emisor CENACE ni cambia Grid.
