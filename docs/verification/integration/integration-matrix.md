# Integración AEGIS 5 + Multiamenaza

Consulta GitHub y fetch: 28/10/2026. [Snapshot de PR y SHA](github-snapshot.json).
No se modificó main, producción o infraestructura del propietario. Esta matriz
se basa en los árboles reales y merge-tree, no en sumar títulos de PR.

## Referencias y baselines recién ejecutados

| Línea | Head inspeccionado | Base común | npm ci / check / npm test |
| --- | --- | --- | --- |
| Producción/referencia main | 0339762fb915f068bca8a001b7bd8f2d0b25abee | — | No se ejecutó producción |
| AEGIS 5, PR #21 | f77212b56c1d67c6d92c4313cc21fed9e9c7dd9c | main anterior | 193/193; 2 vulnerabilidades: fast-uri moderada y undici alta |
| Multiamenaza, PR #31 | 8d5da1a3f3f2f8a5f395254cf0483f7d50496084 | mismo main | 258/258; 0 vulnerabilidades |

Node del laboratorio: 24.21.0. Worktrees aislados y sin secretos del propietario.
Los resultados originales de los PR no se consideran baseline de esta etapa.
PR #8–#21 y #23–#31 abiertos; Multiamenaza en draft. No hay PR nuevos posteriores
al #31 en la consulta. #22 es actualización Fastify de Dependabot, separada:
no se fusiona automáticamente ni sustituye verificar el lock consolidado.

## Dependencias y capacidades

| PR GitHub / rama | Depende de | Implementación aprovechable | Tratamiento |
| --- | --- | --- | --- |
| #8 docs/aegis-5-implementation-blueprint | main | Diseño/handoff v5 | Conservar como contexto histórico |
| #9 feat/aegis-5-pr-01 | #8 | Flags y API pública v1 con schema | Conservar namespaces y flags OFF |
| #10 feat/aegis-5-pr-02 | #9 | SQLite, migraciones y snapshots | Reusar SQLite existente, nunca migrar observations.json |
| #11 feat/aegis-5-pr-03 | #10 | Mapa ciudadano y demo en memoria | Conservar demo y aislamiento synthetic/live |
| #12 feat/aegis-5-pr-04 | #11 | Reportes, recibos privados, moderación/abuso | Conservar; formularios live requieren revisión de privacidad |
| #13 feat/aegis-5-pr-05 | #12 | Correlación de evidencias y auditoría | Mantener distinta de evaluación meteorológica |
| #14 feat/aegis-5-pr-06 | #13 | Captura/versionado de cronogramas oficiales | Mantener unidades/sector/horario y revisión, sin inventar cortes |
| #15 feat/aegis-5-pr-07 | #14 | Sector Watch, preferencias privadas y transporte Push | Preservar contratos/colas; bloquear transporte real incondicionalmente en integración |
| #16 feat/aegis-5-pr-08 | #15 | RSS/Atom con permisos | Conservar; no activar captura/polling al iniciar |
| #17 feat/aegis-5-pr-09 | #16 | Decisión no-go API social | Mantener no-go, no inventar integración X |
| #18 feat/aegis-5-pr-10 | #17 | Histórico, replay y exportaciones seguras | Conservar fuente/knowledge cutoff |
| #19 feat/aegis-5-pr-11 | #18 | Explorador progresivo de infraestructura | Conservar fallback; no convertir cota en energía/volumen |
| #20 feat/aegis-5-pr-12 | #19 | No-go de modelo volumétrico | Mantener limitación |
| #21 feat/aegis-5-pr-13 | #20 | OpenAPI y Home Assistant informativo/read-only | Conservar REST sensors, sin HAOS/Supervisor ni controles |
| #23 feature/guayaquil-replay-whatsapp | main | Contratos, replay, handoff | Conservar trazabilidad temporal |
| #24 feat/multiamenaza-m0 | #23 | Sondas opt-in y diagnóstico | Sin --live automático |
| #25 feat/multiamenaza-m1 | #24 | Archivo SHA, normalizadores, source health | Mantener JSON/artefactos independientes de SQLite |
| #26 feat/multiamenaza-m2 | #25 | Explorador de fuentes/territorio | Mantener precisión y permisos pendientes |
| #27 feat/multiamenaza-m3 | #26 | Evaluador/replay/corpus | No usar impactos posteriores como features |
| #28 feat/multiamenaza-m4 | #27 | Editorial, outbox DRY_RUN, preferencias, backup | Reusar, sin transportes de red |
| #29 feat/multiamenaza-benchmark | #28 | Benchmark y comparador reproducibles | Controles sintéticos, no calibración |
| #30 feat/multiamenaza-retention-review | #29 | Inventario privado readOnly | No equivale a borrado o revisión LOPDP |
| #31 feat/multiamenaza-historical-evidence | #30 | Evidencia primaria hindsightOnly | Outcome sigue null; sin negativos inventados |

Los SHA exactos de cada eslabón están en el snapshot. El head de cada cadena ya
incluye sus ancestros; no aplicar individualmente todos los commits como si
fueran cambios independientes. Los merges existentes de contexto se preservan.

## Superficies compartidas y resolución propuesta

`git merge-tree --write-tree` identifica **7 conflictos**: AGENTS.md, Dockerfile,
README.md, SECURITY.md, backend.js, package.json y package-lock.json.

| Superficie | Diferencia real / riesgo | Resolución y prueba necesaria |
| --- | --- | --- |
| backend.js | Dos registros de rutas/opciones/hooks sobre Fastify único | Combinar opciones y allowlists explícitas; probar flags OFF y ambos conjuntos ON sin ampliar acceso v4 |
| /api/status y fuentes v4 | v5 añade métricas y marca fallo CELEC; Multiamenaza añade navegación | Conservar ambas intenciones y resultados v4; comparar contratos y fallback |
| API pública | v5 /api/v1/*; Multiamenaza /api/hazards/* y /api/subscriptions/* | Conservar rutas/schemas por namespace; admin Bearer incluso local; probar query, método, origin y endpoints privados |
| Preferencias | Sector Watch por sector en SQLite; zonas por cantón en journal | No son equivalentes: no convertir consentimientos ni secretos; mantener namespaces y guías de alcance |
| Reportes / evaluación | Reportes ciudadanos moderados vs fuentes oficiales/modelos | No promover un reporte a aviso oficial ni duplicar motores en uno sin contrato |
| Persistencia | observations.json + SQLite/WAL + artefactos/journals | Tres formatos existentes, no nueva DB; directorios/backup separados y manifest conjunto para staging detenido |
| Backups | Copia de DATA_DIR no valida por sí sola SQLite; snapshot SQLite no cubre artefactos | Combinar verificaciones con proceso detenido, restaurar solo a raíz nueva; probar WAL/corrupción/rollback |
| Dependencias | v5 web-push; Multiamenaza AJV/PDF.js/proj4 y lock actualizado | Unir dependencias existentes, conservar lock corregido y regenerar sin descartar versiones seguras; npm audit/check/test |
| Node | v5 requiere >=22.16 por node:sqlite/backup | Adoptar mínimo >=22.16, probar Node22 y24, sin driver externo |
| Docker | Cada línea copia solo sus módulos | Imagen única con ambos árboles, migrations/demo/docs HA/OpenAPI requeridos; smoke offline |
| Frontend | Páginas independientes, dashboard v4 compartido | Conservar /ui, /map, /report, /watch/, /history/, /explorer/, /hazards/, /editorial/, /ciudades/ detrás de flags; navegación y accesibilidad |
| Web Push | v5 puede enviar con PUSH_DELIVERY=true | Barrera incondicional en integración; mocks sintéticos explícitos conservan pruebas de cola; no worker real ni permiso de navegador en staging |
| AGENTS/docs | Encargos antiguos PR-01/M0 contradicen prioridad actual | Registrar instrucción nueva de consolidación; mantener invariantes, no reiniciar desarrollo de features |

## Arquitectura consolidada

Una aplicación Fastify y frontend modular vanilla. Mantener HistoryStore para Grid;
SQLite v5 para incidentes/cronogramas/Watch, archivo inmutable para fuentes de
amenazas/editorial. Sus modelos representan hechos distintos; no migrarlos ni
unificarlos por semejanza de nombres. En esta etapa compartir composición,
política de seguridad, imagen, pruebas y herramientas operativas. No microservicios,
nueva base, framework UI o capturas automáticas añadidas.

Sector Watch y preferencias OpenAlert permanecen separados: inscribirse a uno no
otorga consentimiento al otro. La integración HA es lectura de API pública; no
se accede a HA del propietario. Amaru continúa opcional y fuera de ground truth.

## Cambios revisables y riesgos restantes

1. Matriz/snapshot y decisión arquitectónica, sin runtime.
2. Merge de heads fijados en rama independiente: preservar ancestros y resolver
   los siete conflictos, barrera Push y regresiones de composición. El volumen de
   código importado pertenece a PR ya existentes, no son funciones nuevas.
3. Staging aislado, smoke/medición/backup-restauración y runbook en cambio separado.
4. Informe de validación y preparación de piloto basado en ejecuciones nuevas.

No forzar migración de datos reales ni habilitar flags en producción. Rollback:
conservar imagen/commit previo y volúmenes originales; restaurar copia verificada
a nueva raíz. No arrancar un binario viejo sobre esquema SQLite migrado: usar
snapshot anterior. Riesgos abiertos: permisos de fuentes, CRS/catálogo territorial,
corpus positivo/negativo con disponibilidad temporal, retención, revisión humana y
redundancia externa. Pruebas verdes no cierran esos requisitos científicos/legales.

Faltan por ejecutar en consolidación: suite combinada y contratos, E2E de ambos
namespaces, bloqueo de env de envío, ejemplo contribuyente, export OpenAPI/HA,
contenedor sin red, reinicio/restauración y recursos. La matriz se actualizará con
resultados reales; no declara un merge ya probado.
