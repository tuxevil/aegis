# PR-08 — Resultado y aceptación

2026-10-22. Rama feat/aegis-5-pr-08 sobre PR-07 (#15). Sin merge/deploy ni
capturas reales desde el recolector. Investigación primaria mediante skill research
con agente de fondo: [fuentes y permisos](../research/aegis-5-feeds-sources.md).

RSS2/Atom acotado, registro HTTPS fijo CELEC/Ministerio, robots y cooldown persistente,
validadores/cache condicionales, metadatos y clasificación conservadora. Permiso
local auditado y vigente + revisión exacta de zona/resumen/rights por ítem. No
crawler de artículos/medios, JavaScript remoto, dependencia nueva, evento automático,
Push o LLM. Migración 006 preserva originales semánticos y decisiones; no XML bruto
porque derechos de archivo siguen pendientes. [Operación](../architecture/aegis-5-feeds.md).

Base 157 tests. `npm ci` audit 0, `npm run check`, Node24 **166/166**.
Nueve pruebas nuevas: RSS/Atom/DTD/tamaño, fechas originales, rumor republicado,
copias/idempotencia, ubicación ambigua pendiente, revisión sin oficialidad ni evento,
robots/permisos/cooldown/304/validadores/límites, revocación/expiración sin pérdida,
migración 005→006 y restauración del snapshot en nuevo directorio. Suite v4/DOM y
privacidad anteriores pasa. `git diff --check` limpio. UI sin cambios, no nuevas
capturas visuales; evidencia de PR-03/04/07 no se presenta como nueva en PR-08.

Aceptación: inventario primario y gates documentados; crawler incremental limitado
manual, sin URL arbitraria; revisión humana de ambigüedad; fixtures de rumor antiguo,
duplicados y lugar ambiguo; contenido remoto nunca ejecutado; publicación permission-gated.
No permiso real concedido ni sondeo productivo habilitado. OSINT_NEWS sigue OFF.

Límites: clasificación léxica sugiere, no valida semántica/cobertura/ocurrencia.
Revisión de PII/origen/competencia humana. Robots conservador puede bloquear reglas
Allow legítimas; no bypass. No scheduler: operador debe decidir frecuencia autorizada.
Sin garantía de cobertura/archivo permanente/licencia de redistribución. Cambios de
permiso requieren recálculo auditado PR-05 para casos mixtos. Hash de feed no promete
original descargable: solo metadatos, sin artículos/XML/imágenes. Recibos privados
no entran al pipeline. Observación aprobada no se convierte automáticamente en evento.

Rollback OSINT_NEWS=false detiene mutaciones CLI; conserva ambos stores. Revocar
permiso oculta su evidencia sin borrarla. Código previo usa SQLite OFF o snapshot
pre-006 en nuevo DB_DIR, conservar base con datos posteriores. Próximo PR-09:
exploración social y decisión go/no-go, sin bloquear PR-10.

Comprobación final: **166/166** también en Node 22.16 Alpine sin red, repo read-only.
Docker aegis-pr08-review construido; **9/9** pruebas de feeds usando el código
empaquetado y solo fixtures montados, sin red. Sin cambios visuales.

Revisión corregida: identidad de artefacto incluye URL+revisión, preservando
dos copias sin fecha con enlaces distintos. Correlación/proyección pública evalúan
permiso vigente: un evento mixto pierde corroboración cuando vence su feed, sin
reescribir auditoría. Dos regresiones nuevas. npm ci audit0/check y **168/168**.
