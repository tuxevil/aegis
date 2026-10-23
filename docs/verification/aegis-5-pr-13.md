# PR-13 — API pública documentada y Home Assistant

2026-10-22. Rama feat/aegis-5-pr-13 sobre PR-12 (`d3bf830`), con correcciones
previas incorporadas por rama sin fusionar ningún PR a main. Main permanece
0339762. No deploy, credenciales reales, acciones físicas o envíos Push reales.

## Resultado

OpenAPI 3.1 generado desde schemas de GETs públicos registrados, solo funciones
habilitadas. Catálogo completo reproducible de 14 GETs con flags locales, sin
endpoints propietarios/admin/mutantes ni keys generadas. Export usa DB sintética
RAM y nunca consulta fuentes o transportes. Nueva health/quality agrega errores
4xx/5xx/429 y loads de fuente sin IP/rutas privadas/tokens/cuerpos. Contrato de
health/public PR-01 intacto. Query area_id obligatoria del resumen ya existente
queda declarada también en schema para documentar correctamente la validación.

[API y semántica](../api/README.md), [OpenAPI](../api/openapi.json),
[HA read-only](../../examples/home-assistant/README.md). YAML consulta HTTPS GET
cada 15 min, exige versión vigente/revisada/no industrial/no sintética/fuente fresca.
Aviso persistent_notification con automation e input_boolean inicialmente OFF;
no inversores, Proxmox, enchufes, apagados o sistemas reales bajo ningún flag.

## Evidencia

npm ci con cero vulnerabilidades reportadas, check y suite completa **193/193** Node 24 y **193/193** Node 22.16
Alpine sin red, repositorio solo lectura. Seis tests nuevos de OpenAPI/rutas
privadas/flags/reproducibilidad, telemetría de validación/429/5xx y fallos de loader
sin datos privados. Regresión dirigida adicional de contrato/resumen:18/18.
Schema OpenAPI validado formalmente con openapi-spec-validator instalado solo en
/tmp, sin dependencia de app. PyYAML/Jinja2 temporales verifican YAML y casos
vigente/stale/synthetic/vacío/industrial/pendiente/revisión distinta, sin HA real.

Primera prueba de export asumía orden de tipos nullable; se corrigió la aserción
para verificar inclusión de null, sin cambiar contrato. No se ocultó fallo de
producto. `git diff --check` limpio. Sin dependencia nueva ni migración en PR-13.
Una dependencia directa nueva en la evolución posterior a PR-06: web-push 3.6.7;
los parches compatibles de seguridad Fastify/ip-address están en PR-07/lock.

## Revisiones previas comprobadas

- PR-07: cuotas separadas, antes/ahora de misma área y deep link que conserva sesión.
- PR-08: permisos vigentes afectan afirmación de eventos mixtos y digest por URL.
- PR-09/12: checks ejecutados realmente en sus ramas, no solo resultados heredados.
- PR-10: privacidad antes de filtrar fechas, CSV con evidencia completa y comparación
  histórica de programación bajo mismo corte sin calcular duración efectiva.
- PR-11: fallo refresh CELEC preserva lectura/fecha y se muestra failed; metadata
  interna no cambia JSON v4. Enlace mapa condicionado a su flag.

## Límites y recuperación

Contadores reinician con proceso y no sustituyen logs privados/monitorización del
host. Loader success no certifica todas las lecturas; ver frescura por dato. No HA
físico, API social/curva real, permiso de fuente o cartografía operativa validados
por compilar docs. Flag OFF conserva producto v4. PUBLIC_API_V1=false oculta también
metadata; no borrar stores o claves. Revertir PR-13 no cambia esquema ni historial.
Siguiente paso: revisión humana de la cadena y gates operativos, sin merge/deploy
automáticos. [Matriz de entregas](../roadmap/aegis-5-delivery.md).

Cierre final tras regresión de recuperación: check, **193/193** Node 24,
**193/193** Node 22.16 sin red y **193/193** contra imagen aegis-final-review
(solo tests/fixtures/catálogo montados, producto empaquetado). Cinco recorridos
de navegador a 320/390/768/1440 px repetidos; historial repetido después del
último fix, sin overflow, errores JS o solicitudes externas. Artefactos en
artifacts/, sin datos privados. Main confirmado local/remoto en 0339762.

Corrección de revisión de PR21: lecturas fallback con marcas de fallo ya no
registran éxito. Dos regresiones explícitas de CELEC con lectura retenida/recuperación
y clima con retrievalFailed. npm ci (audit0), check, **193/193** Node24,
**193/193** Node22.16 y **193/193** contra imagen sin red, tras el fix.
