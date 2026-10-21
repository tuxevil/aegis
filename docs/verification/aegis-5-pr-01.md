# AEGIS 5 — PR-01

Fecha: 2026-10-21. Solo fundaciones, sin deploy ni merge.

## Base y alcance

Main verificado en `0339762` (v4.0.0), workspace limpio antes de empezar.
La planificación existe en PR #8, rama `docs/aegis-5-implementation-blueprint`
(`f6c43eb`), aún abierta. Por indicación del handoff, la rama independiente
`feat/aegis-5-pr-01` parte de esa base. PR apilado sobre planificación para no
repetir sus documentos en el diff; cambiar base a main/rebase al integrar #8.

Cambios: `feature-flags.js`, `api/schemas.js`, `api/public-v1.js`, integración
mínima en backend, pruebas/fixtures, check de sintaxis y documentación.
No cambia frontend, dependencias, versión de release ni formato de historial.
Contrato/rutas/variables/limitaciones: [API v1](../architecture/aegis-5-public-v1.md).

## Resultados reales

- Antes de cambios: `npm run check` y `npm test`: 35/35 pasan.
- `npm ci`: exitoso, 95 paquetes auditados, cero vulnerabilidades reportadas.
- Después: `npm run check` exitoso; `npm test`: 41/41 pasan.
- Durante desarrollo una prueba nueva detectó serialización null→cadena vacía;
  se corrigió declarando tipos nullable explícitos. La regresión queda cubierta.
- `git diff --check`: sin errores.

Las pruebas nuevas verifican flags fail-closed, respuestas/assets v4 equivalentes
ON/OFF, salud GET remota sin headers simulados, rutas/métodos privados cerrados
incluso con Origin/Referer del host, errores sanitizados, 60 requests/minuto,
fixtures válidos, rechazo de campos privados/fechas inválidas/URL no HTTPS y
serialización sin campos extra ni pérdida de null.
Las dependencias clock/fetch/store se inyectan; no se consulta producción ni
se escriben observaciones en DATA_DIR durante las pruebas nuevas.

## Checklist v4

| Superficie | Evidencia en esta entrega |
| --- | --- |
| `/`, `/ui`, assets locales | 200 y mismos bytes ON/OFF |
| `/api/status`, dams/weather/cenace/enso/forecast | mismos bytes ON/OFF con fuentes ausentes deterministas |
| Dashboard mismo host y localhost | regresiones de política y fuentes existentes pasan |
| Acceso remoto privado | 403 sin headers y con headers del mismo host |
| Cinco vistas, inspector, comandos, atajos, foco y texto remoto seguro | suite DOM existente pasa; archivos UI sin cambios |
| CELEC, CENACE, Ambient, NOAA, Open-Meteo | suite existente con mocks/parsers/fallos parciales; sin validación live nueva |
| Fechas, caché, fallos y persistencia v4 | suite existente pasa; no migración |
| Mobile 320 px/navegador real | no reejecutado en PR-01; no cambios visuales. Evidencia previa en aegis-v4.md, no evidencia nueva |

## Aceptación PR-01

- [x] Base y pruebas iniciales verificadas; checklist de v4 documentado.
- [x] Flags v5 OFF por defecto; v4 intacto con flags OFF.
- [x] Clock/fetch/storage inyectables conservados; API v1 aislada con allowlist GET explícita.
- [x] Schemas área/evidencia/evento/cronograma/error y fixtures públicos sintéticos.
- [x] GET público sin falsificar headers y privados cerrados probados.
- [x] npm ci, npm run check, npm test pasan.
- [x] Decisiones, limitaciones y rollback documentados.

## Limitaciones y siguiente paso

La salud es el único endpoint v1 implementado: no declara disponibilidad de
fuentes ni cobertura territorial. Contratos de forma no validan corroboración,
competencia de un emisor, licencias, seguridad del contenido de texto o relaciones
entre entidades. Eso requiere reglas y revisión de fuentes en entregas posteriores.
Los flags futuros no activan funcionalidades aún inexistentes.

No SQLite, mapa, formularios, cronogramas reales, Push, OSINT, replay o 3D.
Revisión requerida de esta entrega y dependencia #8 antes de integrar.
Próximo: PR-02, SQLite/migraciones/backups junto al JSON v4; conservar historial y
probar restauración/idempotencia/rollback. No se inició PR-02.
Rollback de PR-01: flags OFF y reinicio, o restaurar app v4 preservando DATA_DIR.
