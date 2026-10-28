# Validación de la plataforma consolidada

28/10/2026. [Matriz/heads originales](integration-matrix.md),
[evidencia estructurada de ejecuciones](validation-evidence.json) y
[runbook reproducible](../../runbooks/supervised-staging.md).
Entorno de desarrollo Docker local; no producción ni Proxmox del propietario.

## Integración ejecutada

El merge 55eb011 conserva los dos ancestros: AEGIS 5 f77212b y Multiamenaza
8d5da1a. Los siete conflictos se resolvieron combinando imports/opciones/registro
de rutas, documentación, Docker y dependencias. Se mantienen HistoryStore,
SQLite v5 y archivos/journals privados; no se migró una observación, consentimiento
o credencial entre modelos. No se descartaron mapas, reportes, cronogramas,
Sector Watch web, histórico, explorador o ejemplo HA para integrar amenazas.

La CI encontró tres regresiones tras añadir enlaces v5 al HTML Grid. fb64ced los
retira y conserva el contrato HTML frente a esos flags; suite nuevamente verde
en Node22/24 y contenedor: [run 40755877110](https://github.com/tuxevil/aegis/actions/runs/40755877110).
La QA visual posterior encontró los enlaces Multiamenaza comprimiendo el rail
móvil: se movieron a una navegación propia dentro del workspace, solo con sus
flags activos. Se verifica también que el rail no tenga contenido recortado.

El check separado de revisión AI de GitHub falló por cuota mensual agotada
(HTTP402), no por un resultado de análisis del código. No se solicitaron ampliaciones
de cuota ni se modificaron pagos/settings para eludirlo. Ese check **no acredita una
revisión independiente de seguridad**; la CI funcional se reporta por separado.

## Pruebas recién ejecutadas

| Comprobación | Resultado / alcance |
| --- | --- |
| Baseline AEGIS 5 | npm ci/check y 193/193 Node; dos vulnerabilidades previas |
| Baseline Multiamenaza | npm ci/check y 258/258 Node; cero vulnerabilidades |
| Plataforma conjunta | 422/422 Node en host24.21.0 y contenedor22.23.4 sin red, usuario1000 |
| Contrato source-envelope | 6/6 Python, sin red |
| Dependencias combinadas | npm ci/audit cero vulnerabilidades; fast-uri3.1.9/4.2.3, undici7.30.1 |
| Contratos v4/v1/amenazas | Suites heredadas completas y composición con ambos conjuntos habilitados; API privada/admin rechazada sin autoridad |
| OpenAPI v5 | Exportación actual idéntica al archivo anterior, 14 GET públicos; no expone mutaciones/gestión |
| SourceAdapter de contribución | CLI host/contenedor sin red, recibos idénticos; fixture MIT, sin claves o DATA_DIR real |
| Home Assistant | YAML/Jinja con PyYAML/Jinja2 en venv: vigente/stale/synthetic/industrial/pendiente/versión; no instancia HA |
| Chromium | Ocho vistas ×320/1280: 16 capturas, cero page errors y overflow; tráfico externo y service workers bloqueados; sin listener |
| Staging Compose real de laboratorio | Usuario node, red none, cero puertos host, health/rutas correctas, reinicio y backup/restauración |

Los números de host/contenedor corresponden a suites completas; el E2E conjunto
de respaldo se amplió además con revisión editorial y procesamiento idempotente
de outbox restaurada, y pasó su prueba focalizada. La CI del PR de staging debe
volver a ejecutar las aserciones del head definitivo, no heredar un check anterior.
Los screenshots de QA son artefactos privados temporales de laboratorio; el recibo
de geometrías de viewport está en la evidencia, no contiene datos ciudadanos.

### Flujo reproducible de extremo a extremo

```sh
npm ci
npm run check
npm test
node --test staging-backup.test.js
python3 -B -m unittest discover -s tests -p 'test_source_envelope.py'
npm run example:source
npm run benchmark:compare
node scripts/replay-hazards.mjs
node scripts/export-openapi.mjs /tmp/openapi-review.json
```

El E2E usa directorio temporal propio: Grid sintético → archivo de estación →
evaluación interna → editor y aprobador de prueba distintos → cola RSS simulada;
añade SQLite v5 con catálogo/fichas sintéticas; cierra escritores → backup conjunto
→ verificación hash/SQLite → restauración nueva → consulta SQLite/Grid/archivo
→ proceso/dedupe de outbox. sent=false y publishedAt=null se conservan. Son roles
de test, **no** revisión humana/institucional real. No hay fetch externo o mensaje.

Se cubren corrupción de bytes/SQLite, WAL activo, destino existente, cuotas,
reinicio, fechas/validez/correcciones, sources missing/stale, fallos HTTP, dedupe,
autenticación, abuso y ventanas temporales. No se afirma haber ensayado un fallo
eléctrico físico, disco del Proxmox o una recuperación externa cifrada.

## Evaluación honesta del motor

El benchmark mantiene 13 controles sintéticos separados de sus etiquetas: ocho
evaluables y cinco sin fuente utilizable, divididos entre modelo/punto Guayaquil
y estación Pallatanga. Sin cambios por caso respecto al baseline; el comparador
detecta el lock nuevo y no lo oculta. Las tasas de esos controles prueban el
scorer/comparación, **no** precisión predictiva. No se alteraron reglas/umbrales
para mejorar cifras; operationalProbability continúa null.

El corpus documental 21–27 conserva 14 outcomes null. Hay referencias primarias
retrospectivas de impactos en Guayaquil 24–26 y otras piezas con tiempos ambiguos;
no son negativos ni features conocidos antes del evento. Capturar hoy un run
antiguo o leer la emisión de un PDF mutable no demuestra disponibilidad histórica.
FAR/missRate, anticipación operativa y detección real del corpus siguen desconocidas.
[Evidencia y límites](../../research/historical-corpus-evidence-review-2026-10-28.md).

Para puntuar casos reales se exigen objetivo/ventana/territorio compatibles,
capturas/versiones conocidas al corte, etiqueta revisada y vigilancia comparable
para negativos. Ventana incompleta o ausencia de reportes se excluye, no se
convierte en TN. Lead time se calcula solo con evento y primera señal verificables;
sourceDetectionLag exige publicación independiente y no prueba primera subida web.

La cobertura efectiva tampoco queda validada por habilitar la interfaz: provincia
INAMHI no es barrio; modelo aproximado no es pluviómetro; estación no es cantón;
susceptibilidad estática no es pronóstico dinámico. La cartografía conserva sus
gates de CRS, licencia y versión. En apagones, programación no confirma ocurrencia
ni reposición; Mazar/cota/MW no se convierten en probabilidad o energía útil.

## Recursos y recuperación observados

Compose impone 0.5 CPU, 384MiB RAM, heap192MiB, PIDs96 y logs2MiB×3; imagen medida
123983807 bytes. Muestras Docker: 63.77–72.85MiB RSS y ocho procesos/hilos; CPU
instantánea0.00–0.03%, red0B/0B. No son máximos bajo carga ni dimensionamiento de
piloto. SQLite vacío inicial:450560 bytes lógicos; bloques asignados difieren.

Una prueba de 30 GET locales secuenciales, sin refrescar fuentes, observó
p50≈2.29ms, p95≈77.21ms y máximo≈709.22ms. Es latencia dentro del contenedor de
desarrollo con su límite CPU, compartiendo host con otras pruebas; no es medición
de red ciudadana o concurrencia. Quality
API reportó cero intentos de fuentes en esas muestras. Vatios/Wh siguen null:
no se consultaron inversor, batería, HA o Proxmox y no se infieren de CPU.

Se paró/reinició el staging conservando su volumen. El backup local real incluyó
su SQLite vacío (un archivo), validó seis migraciones y se restauró a raíz nueva
sin arrancarla automáticamente. Después se comprobó esa copia con una imagen
anterior de desarrollo, usuario1000, sin listener y allowMigrations=false: health200,
esquema6, sin conmutar el volumen activo. No es rollback de producción ni prueba
de esquemas futuros. La prueba con fixtures cubre además Grid/archivo/editorial/outbox.
Se reprodujo que verifySnapshot readonly crea WAL/SHM; el wrapper consolidado
verifica una copia scratch para no alterar el inventario del respaldo. Backup con
WAL activo falla sin checkpoint/borrado; corrupción no se repara ni se oculta.

## Lo que esta entrega no demuestra

No certifica permisos de fuentes, exactitud del riesgo, negativos reales,
LOPDP/retención, entrega/lectura, disponibilidad pública, HA instalado, infraestructura
redundante o impacto energético. Las pruebas y el staging permiten revisar esos
requisitos después, con autorizaciones/evidencia. [Decisión de piloto](pilot-readiness.md).
