# Primer adaptador: receta verificable sin red

Requiere Node >=22 y las dependencias bloqueadas del repositorio. No necesita
cuenta, clave, DATA_DIR, WAHA, geodatos restringidos o conexión con proveedores.
Los bytes PDF son generados por AEGIS y licenciados MIT; no proceden de INAMHI.

```bash
npm ci
npm run example:source
node --test hazards/source-adapter-example.test.js
```

Para JSON puro: `node scripts/example-source-adapter.mjs --run` (npm añade su
cabecera habitual). Sin argumentos solo
muestra ayuda, sin red ni escrituras. No admite --live, URLs, archivos de entrada,
credenciales ni rutas de archivo. La ejecución crea una raíz temporal privada,
usa exclusivamente synthetic_fixture y la elimina aun si falla. Ignora DATA_DIR;
no se añade nada al archivo real ni al histórico Grid Sentinel.

## Qué comprobar

El resumen debe coincidir con
[el recibo versionado](../contracts/examples/source-adapter.receipt.v1.json).
Los tests comparan el recibo completo y dos ejecuciones independientes:

- recordOrigin synthetic_fixture, providerBytes false, networkRequests 0.
- Tres registros y un artefacto SHA: importación, recaptura idéntica y reproceso.
  Una sola revisión de contenido; UUIDs y reloj de procesamiento no entran al recibo.
- DataStatus unknown y blocker synthetic_fixture_never_publish. No es una lectura
  de proveedor ni un aviso oficial; no hay outbox, aprobación o transporte.
- Fechas de octubre 2026 pertenecen al escenario de prueba: no demuestran captura
  o disponibilidad histórica. El envelope sintético conserva retrievedAt/raw.sha256
  null; rawFixtureSha256 identifica únicamente nuestros bytes generados.
- sourceLicenseStatus pending pertenece al perfil real INAMHI. FixtureLicense MIT
  pertenece al ejemplo; una no concede derechos sobre la otra.

Un cambio de resultado exige explicar el contrato y revisar el recibo/versiones,
no regenerarlo a ciegas para hacer pasar CI. No ajustar reglas para imitar otro
proveedor ni cambiar permisos del perfil real para quitar un blocker.

## Interfaces mostradas

| Responsabilidad | Implementación del ejemplo | Límite |
| --- | --- | --- |
| SourceAdapter | ExampleWarningSource: id, supports, license, sourceTermsUrl, fetch y health | Solo fixture Guayaquil; rechaza otros territorios y filtros no soportados. AbortSignal se respeta antes de generar. Health unknown, nunca salud real del proveedor. |
| Normalizer | ExampleInamhiAdapter.normalize, derivado del parser existente | Añade parserVersion y advertencia declarada. No modifica origen, licencias ni publicación. |
| Contrato/persistencia | IngestionService.importFixture, validateEnvelope y RawArtifactStore | El host vuelve a calcular SHA, valida envelope/detalles y separa el namespace sintético. |
| Verificación | Reproceso y lector readOnly | No renueva disponibilidad real ni expone un archivo público. |

El ejemplo es una receta de contribución, no un registro automático de plugins.
No permite cargar código de una issue, JSON público o URL. Para una fuente nueva,
se revisan catálogo/allowlist y módulo ESM mediante PR. Las pruebas de ejemplo
rechazan un normalizador con campos no declarados antes de persistir bytes.

## De la receta a una propuesta de fuente real

1. Abrir propuesta con URL primaria, territorio/precisión, unidad, términos,
   fechas de publicación/disponibilidad/captura y fixture legal compartible.
   No adjuntar claves, contactos, domicilios o coordenadas residenciales.
2. Separar transporte acotado (SourceRegistry/SourceHttp y guardias de ingesta)
   del normalizador puro. No sustituirlos por fetch arbitrario dentro del parser.
   GET, allowlist, bytes/timeout, cooldown/Retry-After y exclusión entre procesos
   permanecen en el límite de transporte. Nuevos permisos no se autoverifican.
3. Usar envelope v1 y validación discriminada. Conservar null, origen,
   geografía/CRS y versiones. No marcar observación como pronóstico u oficial.
4. Probar caso válido, faltantes, vencimiento/reloj, corrupción, error HTTP/JSON,
   unidades, hash/revisión e integridad tras reiniciar, sin proveedores en CI.
   Un cambio de reglas además necesita benchmark independiente positivo/negativo;
   esta receta no certifica la eficacia de un modelo.
5. Ejecutar check/tests y documentar limitaciones, fuentes/derechos y regresiones.
   Proponer PR no autoriza merge, publicación ni operación M5.

El resto de pruebas de transporte está en [ingestion.test.js](../../hazards/ingestion.test.js)
y [ingestion-concurrency.test.js](../../hazards/ingestion-concurrency.test.js);
los contratos están en [source-connectors-v1.md](../contracts/source-connectors-v1.md).
No se requiere una API de pago ni reproducir una fórmula privada para contribuir.
