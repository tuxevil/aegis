# AEGIS 5 — Backlog de implementación por PR

Estado: tickets propuestos para Codex, no funcionalidades entregadas. Fecha: 2026-10-21.
Estado de implementación por entrega: [matriz y gates de revisión](aegis-5-delivery.md). El texto siguiente conserva el plan base.
Fuente de alcance: docs/roadmap/aegis-5-prd.md; arquitectura: docs/architecture/aegis-5-design.md.
Orden obligatorio por dependencias; cada entrega es un PR independiente con screenshot/revisión cuando aplique y sin despliegue automático en producción.

## P0. Fundaciones y contratos [prioridad inmediata]

**PR-01: feature flags, pruebas de regresión y contratos de datos**
- Verificar status de main y documentar checklist v4 de rutas/paneles/fuentes.
- Crear flags desactivados por defecto para v5. No romper /, /ui y /api/status.
- Inyectar clock/fetch/storage y facilitar API pública v1 con una allowlist explícita, manteniendo protecciones de rutas privadas existentes.
- Especificar schemas de área, evidencia, evento, cronograma y error; fixtures públicos y mock.
**Aceptación:** npm ci + npm run check + npm test pasan; acceso existente compatible; casos de test prueban que GET de API v1 pública funciona sin headers falsos y que privados permanecen cerrados; flag OFF deja v4 intacto.

**PR-02: SQLite + migraciones + backups**
- SQLite WAL, migrations versionadas y repositorios de lectura/escritura transaccionales para sources/artifacts/observations/events/evidence/areas.
- Nueva persistencia junto al JSON v4, sin eliminación de historial; límites de crecimiento y plan de backups/restore.
- Datos demo declarados como sintéticos en repositorio; nunca añadir claves o identificadores privados.
**Aceptación:** reinicios, migración repetida, rollback/snapshot, duplicados y consultas temporales probados; test de pérdida de fuente no borra datos.

## P1. Blackout Map público de solo lectura [primera demo]

**PR-03: experiencia móvil, sectores y mapa**
- UI pública principal con búsqueda por provincia/cantón/parroquia/sector donde los datos geográficos sean confiables; modo lista usable sin cargar el mapa.
- Mapa 2D con capas de «avisos oficiales», «reportes ciudadanos», «OSINT» (cuando existan). Mostrar «datos de ejemplo» en demo claramente.
- Public API paginada para áreas, eventos y evidencias; leyenda (reportado/corroborado/oficial), fechas originales, refresco, privacidad geográfica.
- Navegación a consola técnica v4.
**Aceptación:** viewport 320 px, teclado/ARIA, rendimiento razonable en móvil básico, mapa sin pins a domicilio, lista cuando tiles falla, ausencia de datos representada como desconocida.
**Gate demo:** mostrar al menos tres escenarios con fixtures: programación, corte reportado sin confirmación y evento corregido; sin alertas reales.

## P2. Reportes ciudadanos y control de abuso

**PR-04: registrar/corregir reporte**
- Flujo sin cuenta con consentimiento y política clara, elección de zona, horas opcionales separadas de recepción, token privado de edición/baja.
- Límite por IP de retención corta, validación server-side, honeypot/captcha progresivo, duplicados, moderación/cola de revisión.
- Visualización solo agregada/generalizada por sector; impedir fuga de correo/IP/recibo/endpoint Push.
**Aceptación:** pruebas de spam, corrección, retiro, zonas ambiguas, XSS/SQLi, duplicados; un único reporte no colorea toda una zona como apagada.

**PR-05: motor de correlación y evidencia**
- Fuente, observación y evento son entidades diferentes; regla explicable de agrupación lugar+tiempo+tipo y reputación/evidencia.
- Reposts/de un mismo artículo no cuentan como fuentes independientes; retractions y cambios quedan registrados.
- Estado «corroborado» requiere orígenes independientes; «oficial» requiere documento de entidad competente para esa zona/período.
**Aceptación:** fixtures con informes contradictorios, tiempos imprecisos, barrios próximos, duplicados y evento terminado solo parcialmente; revisiones auditables.

## P3. Sector Watch / cronogramas (sin asumir racionamiento nacional)

**PR-06: fuentes oficiales y captura de cronogramas**
- Investigar y registrar al menos un proveedor oficial viable antes de codificar adaptadores.
- Descargar PDF/HTML versionado, sha256 + URL + fechas, guardar artefacto original, extraer tablas por fuente; discriminar trabajos locales, residenciales e industriales.
- Resolver sector/circuito solo con matching verificable; baja confianza => revisión, no alerta; fixtures con reemplazo silencioso y cambios de UTC/Ecuador.
**Aceptación:** consulta por zona y fecha con procedencia; si falla la fuente no se anuncia cancelación; se detecta un horario cambiado comparando dos versiones del documento.

**PR-07: suscripciones anónimas, PWA, Web Push**
- Elegir hasta N sectores con alias, consentimiento opt-in separado; habilitar permisos desde gesto humano y claves VAPID seguras.
- Notificar nueva programación, cambio y cancelación oficial documentada; URL evidencia, horas «antes/ahora», prevención de duplicados (outbox idempotente).
- Baja, edición y revocación sin cuenta mediante secreto de gestión; manejo iOS Add-to-Home-Screen; fallback web y reglas de reintento.
**Aceptación:** test subscribe/update/unsubscribe/dedupe, endpoint push inválido, horario revisado dos veces, no alertar del PDF industrial a hogares ni de resolución de zona ambigua; secreto no filtrado; opt-in desactivado por flag hasta gate de fuentes.

## P4. OSINT útil y sostenible

**PR-08: noticias/feeds y clasificación**
- Inventario de fuentes legales y confiables: sitios oficiales, feeds noticiosos, RSS/GDELT si su uso y licencia lo permiten.
- Crawler incremental respetuoso (rate limit, cache, backoff, URLs allowlist), extracción estructurada, deduplicación, fechas de publicación vs ingesta.
- Revisión humana de artículos ambiguos. LLM local opcional, nunca fuente de verdad ni requisito de latencia del sitio.
**Aceptación:** fixtures de rumor antiguo publicado de nuevo, artículo duplicado y lugar ambiguo; ningún texto remoto ejecutado ni URL arbitraria fetcheada.

**PR-09: X y otras redes (exploración, NO requisito del MVP)**
- Investigar coste actual de API oficial, cumplimiento de términos y cobertura; documentar decisión go/no-go.
- Si viable, habilitar con credenciales/quotas/flag específicos; solo enlaces y metadatos permitidos, sin scraping de perfiles privados.
**Aceptación:** no bloquear otros PRs si X no está disponible; costes configurables y observables.

## P5. Time Machine y calidad histórica

**PR-10: consulta temporal, replay y export**
- Reproductor temporal con tiempo del hecho vs tiempo en que AEGIS lo conoció.
- Historial de revisiones; comparar períodos y horarios programados vs efectivamente reportados sin equipararlos.
- Export CSV/JSON con enlaces, naturaleza de evidencia, geografía aproximada y duraciones nulas si se desconoce fin.
- Importaciones históricas solo con artefactos verificados y permiso/licencia aplicables.
**Aceptación:** reproducir un evento de fixtures antes/después de corrección, resultado distinto en modo «conocido entonces»; sin reconstrucciones falsas de 2024.

## P6. Experiencia Mazar y Coca Codo 2D/3D

**PR-11: explorador 2D validado y prototipo 3D progresivo**
- Investigar DEM, límites de embalse, modelos de terreno e imágenes Sentinel con atribución; documentación de licencias y fechas.
- Crear visualización 2D accesible con la cota observada y umbral 2115 separado de 2098 diseño.
- Prototipo 3D con modo «representación aproximada» y fallback, sin reservar % de energía ni batimetría inventada.
- Coca Codo como ilustración de caudal y sedimentos, no lago equivalente a Mazar.
**Aceptación:** watermark/leyenda metodológica para aproximación, no interpolación lineal de reserva; pruebas de dispositivos sin WebGL, fechas de las mediciones, comparación visual móvil.

**PR-12: modelo cota-volumen (solo con validación documental)**
- Si existe curva cota-volumen/área/almacenamiento licenciable, implementarla con tests de unidades, interpolación física, incertidumbre y bibliografía.
- Si no existe, registrar NO-GO y conservar visualización exclusivamente de cota y terreno; no inventar modelo.
**Aceptación:** documentación del origen y límites, sin «porcentaje real» sin datos.

## P7. Automatización avanzada (más adelante)

**PR-13: API pública documentada / Home Assistant**
- Contratos OpenAPI de solo lectura y ejemplos HA, notificaciones basadas en fuentes.
- Sin ejecutar cambios automáticos de inversores, Proxmox ni cortes preventivos por defecto.
**Aceptación:** límites de requests, telemetría de fallos, guía de seguridad y opt-in explícito para automatización de acciones físicas.

## Matriz transversal de calidad (para cada PR)

- [ ] npm run check; npm test; nuevas pruebas de unidad/integración.
- [ ] Rutas v4, DOM y accesibilidad sin regresiones.
- [ ] Evidencia de mobile 320 px / desktop, mapa opcional, modo bajo consumo de datos.
- [ ] Estados sin datos, desactualizados, fuente falla, timezone America/Guayaquil, cambio de hora internacional.
- [ ] No direcciones/IDs de estación/credenciales/identificadores Push/IP en respuesta pública, logs ni fixtures.
- [ ] Fuente y fecha de cada afirmación pública; datos de prueba marcados; no predicciones de apagón.
- [ ] Migraciones y respaldo si hay almacenamiento nuevo; método de rollback.
- [ ] Documentar endpoints/variables de entorno, contratos, supuestos y límites.
- [ ] PR de una sola preocupación, commits claros, captura/observabilidad cuando aplique.
- [ ] Ningún deploy a producción, envío masivo de Push ni activación sin revisión.

## Hitos de producto

**M0:** repo sigue funcional, DB nueva migrable, API pública segura (PR-01, 02).
**M1:** demo de mapa con evidencias sintéticas y UI móvil, sin falsas afirmaciones (PR-03).
**M2:** ciudadanos pueden enviar reportes moderados y rectificarlos (PR-04, 05).
**M3:** al menos un cronograma oficial versionado alimenta búsqueda por sector; Push seguro en piloto (PR-06, 07).
**M4:** noticias/OSINT y replay histórico robustos (PR-08, 10).
**M5:** visualizaciones educativas de infraestructura respaldadas por fuentes (PR-11 y opcional 12).

Primer paso para Codex: **PR-01 solamente**. No intentar construir las fases de una sola vez.
