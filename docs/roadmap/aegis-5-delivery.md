# AEGIS 5 — Entrega de desarrollo para revisión

2026-10-22. Implementación por PRs apilados; no versión publicada o autorización
para producción. Main v4 (`0339762`) intacto. Todos los flags v5 siguen OFF por
defecto. Sin despliegue, merge de PR, control físico, compra de APIs o Push real.

| Backlog | Entrega | Evidencia principal |
| --- | --- | --- |
| PR-01 | [#9](https://github.com/tuxevil/aegis/pull/9) fundaciones/flags/DTOs | verificación PR-01,41 pruebas iniciales |
| PR-02 | [#10](https://github.com/tuxevil/aegis/pull/10) SQLite paralelo/backup | migración, reinicio, lock/snapshot/restore |
| PR-03 | [#11](https://github.com/tuxevil/aegis/pull/11) lista/mapa por áreas | 3 escenarios sintéticos,320–1440 px |
| PR-04 | [#12](https://github.com/tuxevil/aegis/pull/12) reportar/corregir/retirar | consentimiento, abuso, privacidad/agregación |
| PR-05 | [#13](https://github.com/tuxevil/aegis/pull/13) correlación auditable | contradicciones, independencia, competencia, hold |
| PR-06 | [#14](https://github.com/tuxevil/aegis/pull/14) cronogramas versionados | captura/antes-después/TTL/zonas/derechos |
| PR-07 | [#15](https://github.com/tuxevil/aegis/pull/15) Sector Watch/PWA/Push | opt-in, cifrado, dedupe/revocación, fallback |
| PR-08 | [#16](https://github.com/tuxevil/aegis/pull/16) noticias RSS/Atom | robots/permisos, rumor viejo/copias/ambigüedad |
| PR-09 | [#17](https://github.com/tuxevil/aegis/pull/17) NO-GO social | precios/términos/cobertura/borrados, sin gasto |
| PR-10 | [#18](https://github.com/tuxevil/aegis/pull/18) Time Machine/export | known_at frente al tiempo del hecho, privacidad/CSV, comparación planificado |
| PR-11 | [#19](https://github.com/tuxevil/aegis/pull/19) cota 2D/prototipo 3D | observación/fecha, malla ilustrativa/fallback, sin batimetría |
| PR-12 | [#20](https://github.com/tuxevil/aegis/pull/20) NO-GO volumen real | falta curva vigente/licenciable/datum/incertidumbre |
| PR-13 | [#21](https://github.com/tuxevil/aegis/pull/21) API pública y HA | OpenAPI de GETs reales/telemetría/HA opt-in read-only |

Cada entrega tiene arquitectura/investigación cuando aplica y
`docs/verification/aegis-5-pr-NN.md` con pruebas, límites, migración/rollback y
siguiente dependencia. El backlog original sigue siendo la especificación, no se
cambió para redefinir alcance. NO-GO de PR-09 y PR-12 son alternativas explícitas del plan.

## Qué puede revisarse

- `/` y `/ui`: consola v4 conservada, fuentes y timestamps existentes.
- `/map`: buscador, lista, evidencia/correcciones y mapa 2D opcional, sin domicilios.
- `/report`: consentimiento, moderación y gestión privada sin cuenta.
- `/watch/`: cinco sectores/alias privados, gestión segura, consulta y Push por gesto.
- `/history/`: replay de revisiones por conocimiento, CSV/JSON y programación histórica
  separada cuando OFFICIAL_SCHEDULES está habilitado. Sin historia ficticia de 2024.
- `/explorer/`: cota/fechas/referencias 2115 / 2098, tabla y esquema 3D ilustrativo opcional.
- `/api/v1/openapi.json`: solo GETs públicos habilitados; catálogo completo en docs/api.

Capturas/reports locales ignorados en artifacts/: PR-03/04/07/10/11 a 320/390/768/1440 px.
Los scripts verify-*-browser.mjs son reproducibles con Playwright/Chromium externos;
fixtures claramente sintéticos, sin tokens/Push endpoints/estación en capturas.

## Gates que no son autorización de lanzamiento

Permisos/licencias y catálogo territorial real de fuentes, privacidad/moderación,
TLS/origen/keys/retención/backups y volumen/topología del piloto requieren revisión.
Los guards son de un proceso y no acreditan defensa distribuida. Aceptación Push
no demuestra entrega/lectura; no se enviaron notificaciones a proveedores reales.
Backups/restore probados, no jobs de producción instalados. DEM real/batimetría/
curva de volumen no se incorporan; la malla no es terreno medido. No X/social
operativo ni probabilidad de apagón. HA validado como YAML/template, no instancia
física. No certificación legal, lector de pantalla o teléfono físico probados.

Revisar #8 de planificación y cada dependencia en orden, sin fusionar la rama
superior directamente sobre main. Tras cada aprobación, ajustar bases/revalidar
según cambios. Luego definir piloto y gates operativos; no se pidió ni ejecutó
activación productiva. Rollback por flags OFF conserva JSON/SQLite/keys; esquema
anterior siempre con SQLite OFF o snapshot en otro DB_DIR, sin sobrescribir historia.

Verificación final de la cadena: npm ci (cero vulnerabilidades reportadas),
npm run check y **193/193** en Node 24 / Node 22.16; **193/193** también en
la imagen empaquetada sin red. OpenAPI 3.1 validado formalmente, 14 GETs.
Plantillas HA verificadas sin instancia real. Navegador para cinco vistas en
cuatro tamaños, con fallback y datos sintéticos; historial incluye comparación
separada de programación. Revisiones automáticas corregidas en sus ramas.
