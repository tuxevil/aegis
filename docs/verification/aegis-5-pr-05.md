# PR-05 — Resultado y aceptación

Rama `feat/aegis-5-pr-05`, base apilada `feat/aegis-5-pr-04` (PR #12).
Revisión previa: PR-04 abierto, sin comentarios inline pendientes al empezar.
No merge, deploy, volúmenes reales, fuentes remotas ni datos personales.

## Alcance y decisiones

Motor determinista con cálculo puro + adaptador SQLite transaccional, CLI local
con flag OFF y migración 003. Reusa entidades, schemas públicos y publicación
existentes. Sin dependencias nuevas ni cambios de UI o dashboard v4.

Reglas y operación completas: [correlación](../architecture/aegis-5-correlation.md).
Zona exacta/tipo/categoría semántica/ancla fija evitan fusiones amplias; tiempo
ambiguo no se transforma en hora conocida. Deduplicación transitiva y origen
institucional revisado evitan corroborar por reposts. Oficialidad exige documento
parseado, competencia y vigencia revisadas. Contradicciones/reposiciones parciales
producen duda sin cierre. Correcciones/retractaciones preservan originales y cada
estado anterior; un hold local persistente permite suspender incluso a capacidad.

Los recibos ciudadanos conservan agregación y privacidad PR-04: no se convierten
en evidencia pública individual ni se cuentan como fuentes independientes.
Los estados elevados live importados sin auditoría se proyectan `unknown` sin
alterar el registro histórico. La demo explícitamente sintética conserva ejemplos.

## Verificación ejecutada

- Baseline: `npm ci` (audit 0), `npm run check`, `npm test`: **91/91**.
- Final Node **24.21.0**: `npm run check`, `npm test`: **108/108**.
- Node mínimo **22.16.0-alpine**, repo montado read-only: check y **108/108**.
  Advertencia experimental de node:sqlite esperada, sin fallos.
- **17 pruebas nuevas** en `test/correlation.test.js`; fixtures sintéticos en
  `test/fixtures/correlation-cases.json`. El test de migración anterior ahora
  compara con MIGRATIONS.length en vez de asumir que v2 es siempre la última.
- Docker `aegis-pr05-review`: build y smoke HTTP de v4/mapa/reportes OFF/ON,
  consentimiento, recibo, corrección/retiro y resumen suprimido aprobados.
  Smoke adicional del código empaquetado: migración 003, correlación y retractación
  vistas por la API pública, con auditoría preservada.
- `git diff --check`: aprobado. No capturas nuevas: no cambia HTML/CSS/JS del
  navegador; DOM/regresión de consola, mapa y reportes siguen en la suite completa.

## Criterios del backlog

- [x] Fuente/artefacto/observación/evento diferentes; explicación de regla y certeza.
- [x] Agrupación explícita zona+tiempo+tipo/categoría, fiabilidad revisada.
- [x] Reposts, hashes, texto copiado, propietarios/orígenes comunes y transitividad.
- [x] Corroborado solo con ≥2 orígenes documentados revisados independientes.
- [x] Oficial solo con documento competente para zona y período de evidencia.
- [x] Fixtures contradictorios, imprecisos, vecinos, duplicados y reposición parcial.
- [x] Retractaciones y correcciones con entradas/versiones inmutables e idempotencia.
- [x] API GET refleja cambios; no nuevas escrituras HTTP ni filtración de auditoría.
- [x] Capacidad 500, rechazo atómico del siguiente, hold a capacidad sin reactivación.
- [x] Migración v2→v3, copia previa, backup actual, restauración y rollback en nuevo directorio.
- [x] Compatibilidad v4/privacidad reportes, flags OFF, Node 22/24 y Docker.

## Límites y próximo paso

Origen y competencia son atestaciones del operador, no verificación automática de
una institución. No hay reputación estadística ni resolución semántica de copias
parafraseadas. Ventana de una hora y matching por área exacta son conservadores,
no calibrados con interrupciones reales. Fechas ambiguas/candidatos múltiples no
se fusionan; corregir zona requiere retractar y abrir otro caso. No hay cobertura
verificada de circuitos ni permiso para inferir todo un cantón desde un sector.

500 entradas por evento incluyen correcciones; el siguiente vínculo se rechaza
sin pérdida. Se puede suspender la afirmación con hold aun saturada, preservando
su auditoría. Revisiones consumen la cuota DB_MAX_BYTES; no hay purga silenciosa.
CLI muestra primeras 50 filas; paginación completa está disponible en el módulo.
Hold no tiene liberación en esta versión. No hay ingestión automática ni puente
de reportes privados a incidentes; no se activó captación masiva o envío de avisos.
Cambios futuros de política de fuente deben ir acompañados de recálculo auditado.

Rollback: flags OFF; preservar DB v3 y DATA_DIR. Para ejecutar código anterior,
SQLite OFF o snapshot pre-003 en **otro** DB_DIR, nunca borrar el historial nuevo.
Desactivar EVENT_CORRELATION impide CLI mutante, no oculta eventos existentes:
BLACKOUT_MAP=false suspende esa publicación. No se tocó producción.

Próximo, tras revisar esta cadena de PRs: **PR-06**, investigar proveedor oficial
viable/licencia/formatos y añadir captura versionada de cronogramas con fixtures
y asignación verificable de zona. No se implementó PR-06 en esta entrega.

## Corrección de revisión posterior

La revisión de PR #13 detectó que una sustitución después retirada/rechazada o de
fuente deshabilitada seguía suprimiendo al predecesor. El cálculo ahora aplica
`replaces` solo desde entradas publicables, conservando la cadena completa en la
auditoría. Regresión para los tres casos: suite de correlación 18/18 aprobada.
