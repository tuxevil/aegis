# Runbook · verificación de fuentes desde staging (sin alertas)
Fecha: 2026-10-27. Este runbook se refiere al [contrato de conectores v1](../contracts/source-connectors-v1.md). **No ejecuta ni valida integración real desde esta sesión**.

## Requisitos
- Host/LXC **staging**, Node.js >=22, DNS, NTP y salida HTTPS controlada. No utilizar secretos ni sesiones WAHA.
- Repo en rama `feature/guayaquil-replay-whatsapp` o commit que incluya `scripts/probe-aegis-sources.mjs`.
- Prueba en modo voluntario: el script **no hace ninguna solicitud** sin `--live`. No hay cron ni scheduler. Son **6 GET**, en serie, dirigidos a URLs predefinidas; no contiene POST, contactos de ciudadanos ni alertas.

## Ejecución

```bash
cd /ruta/a/aegis
node --check scripts/probe-aegis-sources.mjs
node --test scripts/probe-aegis-sources.test.mjs
node scripts/probe-aegis-sources.mjs
# Para prueba externa una sola vez, aprobada por el operador:
node scripts/probe-aegis-sources.mjs --live --out=/tmp/aegis-sources-20261027.json
jq '{producedAt, results: [.results[] | {sourceId,status,errorCode,inspection,elapsedMs}]}' /tmp/aegis-sources-20261027.json
```

El parámetro `--out` usa escritura exclusiva, no reemplaza un informe anterior. El reporte conserva `sha256`, byteLength, HTTP content type, ETag/Last-Modified y estructura simplificada, **sin guardar ni redistribuir los bytes de proveedor**. Un PDF con firma `%PDF-` no equivale a parseo y vigencia confirmados. La sonda únicamente verifica metadatos/capacidad de consulta, una muestra mínima y un pronóstico histórico de prueba.

Actualización M0: el informe conserva HTTP, `Date`, `Retry-After`, hash y tamaño
también cuando la inspección del cuerpo falla; registra solo el código numérico
de error ArcGIS, nunca sus mensajes/detalles. Un 403/429 pausa el resto de sondas
al mismo host (`provider_paused`), sin reintentos; los otros proveedores continúan.
Errores de transporte desconocidos se reducen a `network_or_read_error`, sin URLs
o mensajes potencialmente sensibles. Los resultados de desarrollo del 27/10 y
sus límites están en [source-validation-results](../research/source-validation-results.md).

## Qué mide cada sonda

| ID | Endpoint | Condición para `reachable` |
| --- | --- | --- |
| `inamhi.warning.pdf` | PDF boletín INAMHI | HTTP 2xx, tamaño acotado, firma PDF |
| `sngr.multihazard.metadata` | ArcGIS FeatureServer 0 | JSON con `geometryType` y `fields[]` |
| `sngr.multihazard.single` | ArcGIS `/query`, 1 entidad sin geometría | JSON `features[]`, sin error |
| `sngr.flood.metadata` | ArcGIS MapServer 0 | JSON con `geometryType` y `fields[]` |
| `sngr.flood.single` | ArcGIS `/query`, 1 entidad sin geometría | JSON `features[]`, sin error |
| `openmeteo.singlerun.test` | Single Runs 25/10 00UTC, punto de prueba Guayaquil | `hourly.time[]` y `hourly.precipitation[]` alineados |

`reachable` solo comprueba formato estructural, **no** validez legal, espacial, temporal, precisión de riesgos, ni disponibilidad histórica real para habitantes. Incluso una respuesta `reachable` no da permiso para avisos.

Corrección M2: inundaciones usa `objectIds=1` sin `resultRecordCount`, dado que
la consulta con límite devolvía error JSON 400 en un servicio sin paginación.
La variante devolvió una entidad real en el [ensayo acotado del 27/10](../verification/source-probes/2026-10-27-flood-object-id.json).
Es una muestra por ID, no una descarga completa ni cobertura de los pilotos.

## Fallos y decisiones

- `not_pdf_magic`: la ruta ya no sirve un PDF, bloqueo y revisión del operador.
- `invalid_json` / `provider_json_error`: HTML/error de ArcGIS con HTTP 200, bloquear y registrar proveedor.
- `redirect_not_followed_3xx`: validar a mano cambio de URL y de dominio antes de actualizar allowlist.
- `body_too_large_* `: no aumentar límites automáticamente; revisar necesidad y modalidad.
- `rate_limited_429`: detener pruebas y solicitar cuota/permiso, no ampliar concurrencia.
- `http_403`: investigar autorización, no eludir bloqueo.
- `missing_forecast_arrays`: revisar parámetros/modelo y contrato.
- `unverified` genérico: registrar HTTP/DNS/timeout sin interpretar que una fuente o el país estén seguros.
- `modelIdentityKnown:false`: no usar forecast para replay hasta obtener el identificador del modelo de una forma verificable.

## Registro del resultado de campo

Adjuntar en registro interno de investigación: commit exacto de sonda, zona horaria del host, `report.producedAt`, informe sanitizado, dominio/red de staging (sin IP privada pública ni secretos), resultado por fuente y causa de fallo. Mantener capturas originales en almacén autorizado (futuro diseño) y NO en el repo público hasta licencia/permiso.

Checklist de avance:
- [ ] Resultados reales desde LXC con timestamps sincronizados
- [ ] N.º de boletín y vigencia extraídos del PDF; hash y cambios temporales capturados
- [ ] 1 entidad real por servicio geográfico y paginación/IDs verificados sin truncamiento
- [ ] Transformación EPSG:32717 a 4326 verificada geográficamente
- [ ] Archivo de forecast run y hora real o estimación declarada de disponibilidad
- [ ] Confirmación de permisos de uso y atribución
- [ ] Paquete de pruebas con 1 incidente, 1 no incidente y casos de falta de datos
- [ ] Dictamen documentado para permitir ingestión recurrente
- [ ] Únicamente después: propuesta de implementación Codex y motor de alertas en sombra

## Políticas de operación
No ejecutar frecuentemente esta sonda como cron; no publicar informes crudos innecesariamente. No usar WAHA ni crear canales. La prueba experimental desde esta sesión no tuvo salida DNS al proveedor; el resultado real debe generarse en staging. El estado de la rama permanece en draft.
