# M0 — Validación ejecutada de fuentes

Fecha: 2026-10-27. Entorno: workspace de desarrollo `/root/aegis`, Node
v24.21.0; no es producción ni un LXC de AEGIS verificado. Rama de trabajo
`feat/multiamenaza-m0`, base `e5416ca77e9805a2e7b718258dcc6596aae572ea`
de `origin/feature/guayaquil-replay-whatsapp` (contexto PR #23).
Árbol limpio al comenzar; `main` y producción sin cambios.

## Resultado y alcance

M0 ejecutado: baseline, seis GET predefinidos, evidencia sanitizada y pruebas
negativas. **Ningún conector está certificado para avisos.** La consulta de
inundaciones queda `BLOCKED_EXTERNAL` para esta forma de consulta; las demás
fuentes siguen en validación, con bloqueos legales/temporales/geográficos.
No se ejecutó un servicio, cron, WAHA, publicación, ni migración de DATA_DIR.
La sonda declara `alertsPublishEnabled:false` y `dispatchMode:DRY_RUN`;
no existe todavía un despachador multiamenaza que pueda activarse por entorno.

Se conservan dos informes de metadatos, sin bytes de proveedores:

- [Sonda original](../verification/source-probes/2026-10-27-initial.json),
  terminada a las 18:37:52.550Z: script sin modificaciones.
- [Sonda con diagnóstico ampliado](../verification/source-probes/2026-10-27-detailed.json),
  terminada a las 18:38:41.822Z: conserva HTTP/código numérico incluso si falla
  la inspección. Fue una segunda ejecución manual para recuperar evidencia que
  el script original descartaba, sin reintentos automáticos. No constituye una
  frecuencia aprobada de polling ni prueba de estabilidad. No hubo 403/429.

El reloj local indicó 18:37:42Z al inicio. DNS/TLS funcionaron al completar los
GET, pero no se auditó configuración DNS ni sincronización NTP del host.
Las fechas HTTP SNGR/Open-Meteo de la segunda sonda son próximas al reloj local;
INAMHI devuelve `Date=18:34:35 GMT`, unos cuatro minutos anterior a la consulta.
Puede ser caché o reloj remoto: no se diagnostica NTP a partir de esa cabecera.
`Last-Modified` no demuestra emisión ni primera disponibilidad pública.

## Matriz de resultados reales

Tiempos/bytes corresponden al segundo informe. `reachable` describe únicamente
acceso y estructura, nunca vigencia, licencia ni aptitud operacional.

| Sonda | Resultado | Evidencia | Brecha |
| --- | --- | --- | --- |
| INAMHI PDF | HTTP 200, PDF, 785 ms | 590825 bytes, firma `%PDF-`, SHA-256 `8342ad850be3a3144f0e185857e60e0f58f711acfe186c9d436b30603207f429`; mismo hash en ambas sondas | Sin extractor automatizado ni archivo crudo durable; permiso pendiente |
| SNGR MULTIAMENAZAS metadatos | HTTP 200, 277 ms | 11847 bytes; polígonos; máximo 2000; paginación true; campos DPA/amenaza | CRS, geometría, metodología, actualización y licencia no certificados |
| SNGR MULTIAMENAZAS muestra | HTTP 200, 74 ms | 850 bytes; una entidad, sin geometría; `exceededTransferLimit=true` | Muestra deliberadamente parcial; no representa capa completa ni cobertura piloto |
| SNGR inundaciones metadatos | HTTP 200, 78 ms | 13313 bytes; polígonos; máximo 2000; paginación false | No se verificó descarga completa por IDs/particiones |
| SNGR inundaciones muestra | HTTP 200 con error JSON, 81 ms | 76 bytes; código proveedor 400; `provider_json_error` | Consulta predefinida no devuelve entidad; no asumir causa sin inspección específica |
| Open-Meteo Single Runs | HTTP 200, 920 ms | 1993 bytes; 72 pares horarios, unidad mm, modelo ausente | Modelo y disponibilidad histórica sin verificar; no habilitado para replay estricto |

URLs y parámetros reproducibles: catálogo `probes` en
[script](../../scripts/probe-aegis-sources.mjs) y
[contratos C01–C04](../contracts/source-connectors-v1.md).
SNGR se consultó con `returnGeometry=false`, `resultRecordCount=1` y los campos
explícitos del contrato. Open-Meteo: punto aproximado Guayaquil (-2.19,-79.88),
`run=2026-10-25T00:00`, `hourly=precipitation`, `forecast_days=3`, `timezone=UTC`,
sin selección explícita de modelo. No se descargaron capas completas.
El hash de Open-Meteo cambió entre consultas: sin bytes comparables archivados
no se puede atribuir el cambio a precipitación, tiempos de generación u otro
campo. No se interpreta como revisión meteorológica confirmada.

### Inspección documental independiente

Se leyó el [PDF original INAMHI](https://www.inamhi.gob.ec/pronostico/advertencia.pdf)
con herramienta web durante esta ejecución: una página, boletín 83, emisión
25/10/2026 14:00 Ecuador, vigencia 25/10 16:00–28/10 23:00, amenaza medio–muy
alto, lluvias/tormentas/viento. Equivalentes UTC: emisión 25/10 19:00Z, inicio
25/10 21:00Z y fin 29/10 04:00Z. Guayas figura entre zonas regionales/provinciales.
Esta lectura no es un parseo de los bytes exactos de la sonda ni prueba de
disponibilidad histórica; no se han digitalizado mapas ni validado barrios.

## Permisos y restricciones

- Se revisaron los [términos actuales de Open-Meteo](https://open-meteo.com/en/terms):
  acceso gratuito no comercial, datos con atribución CC BY 4.0 y cuotas
  explícitas. Las dos consultas manuales de investigación no habilitan una
  integración comercial; anuncios/suscripciones requieren reevaluar acceso.
- La [comunicación INAMHI de acceso público](https://www.inamhi.gob.ec/info-liberada/)
  habla de eliminar cobros y facilitar acceso. No se tomó como permiso
  específico de archivo/retransmisión automática del boletín. La página leída
  también contiene enlaces ajenos al tema: no seguirlos ni inferir integridad
  del sitio por su dominio. No se ejecutó contenido remoto.
- SNGR: licencias de reutilización/archivo y política de polling siguen
  pendientes; se limitaron consultas al diagnóstico previsto. No se enviaron
  solicitudes institucionales ni se publicaron documentos o geometrías.
- Una respuesta pública 200 no resuelve estos permisos. No eludir 403/429;
  la sonda ahora pausa las consultas restantes al mismo host ante ambos.

## Baseline y problemas encontrados

Antes de editar, `npm ci` terminó correctamente (94 paquetes),
`npm run check` pasó y `npm test` pasó **50/50**. Los workflows se reprodujeron
localmente: sintaxis de replay/script, seis tests replay y ejecución del CLI;
contratos Python **6/6**. No se lanzó GitHub Actions ni se afirma CI remota verde.
`python` no existe en el host (salida 127); se usó `python3`, con jsonschema ya
disponible, sin instalar herramientas globales.

`npm audit` devuelve cuatro paquetes vulnerables preexistentes: fast-uri
(moderada), Fastify (baja), ip-address (moderada), undici (alta); informa fixes
disponibles. No se aplicó `npm audit fix` ni se cambió el lockfile en esta entrega
de diagnóstico. Es deuda de seguridad que debe resolverse antes de operación.
Se conserva además la excepción TLS heredada CELEC/CENACE documentada en SECURITY;
las sondas nuevas usan TLS verificado y no cambian esa política de v4.

La rama PR #23 contiene v4 + PoC, no las implementaciones locales acumuladas de
PR-01 a PR-13 que estaban en el checkout inicial. No se mezclaron esos historiales.
Se preservaron rutas `/`, `/ui`, `/api/status`, fuentes y almacenamiento existentes.
No hubo cambios visuales; pruebas DOM/teclado existentes pasan, sin afirmar una
inspección manual de navegador móvil en esta entrega.

## Cambios y primer incremento M1

La sonda conserva metadatos y hash también en payload inválido, sanitiza errores
de transporte, registra `Retry-After`, pausa host ante 403/429 y rechaza lluvia
negativa o serie temporal desordenada. Nuevos mocks cubren esas condiciones,
404, redirección rechazada, timeout y ausencia de identidad de modelo.

Inicio M1: `hazards/warning-validity.js` inspecciona exclusivamente fechas UTC
ya extraídas, sin HTTP ni publicación. Prueba fin de vigencia, documento viejo,
ventana invertida, fecha inexistente y reloj incoherente. Una ventana futura
puede ser válida pero no efectiva todavía; calidad temporal no certifica licencia
ni contenido. Es fundamento del adaptador, no un conector terminado.

Después de cambios: `npm run check` y **60/60** tests Node; contratos Python
**6/6**; replay CLI y controles de sintaxis pasan. Reproducción:

```sh
npm ci
npm run check
npm test
python3 -m unittest discover -s tests -p 'test_source_envelope.py' -v
node --check scripts/probe-aegis-sources.mjs
node --check hazards/warning-validity.js
node --check replay/engine.js
node --check scripts/replay-guayaquil.mjs
node scripts/replay-guayaquil.mjs
```

### Siguiente incremento M1 y gates pendientes

Mantener interfaces pequeñas: `InamhiPdfAdapter` recibe fetch/clock/extractor y
repositorio inyectados; `RawArtifactStore` escribe bajo subdirectorio nuevo de
DATA_DIR, hash inmutable más índice de capturas, conservando HistoryStore.
Primero corpus PDF sintético positivo/negativo, extracción de número/fechas/texto
y mapa pendiente de revisión; luego archivo controlado cuando el permiso esté
resuelto. Probar captura repetida/corrección, fallo que conserva última versión,
schema discriminado, persistencia y rollback sin tocar observations.json.

**M1 no está completado:** faltan archivo durable, parser PDF y adaptadores.
M2–M4 no están implementados. Falta repetir validación desde el LXC objetivo con
reloj verificado, resolver consulta SNGR, modelo explícito, permisos, CRS y corpus
incidente/no incidente. Esos gates no autorizan publicaciones por omisión.
