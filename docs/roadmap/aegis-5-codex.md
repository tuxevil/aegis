# Codex handoff — AEGIS 5.0

> Prioridad vigente del propietario, 28/10/2026: consolidar AEGIS 5 y Multiamenaza,
> no reiniciar PR-01 ni añadir funcionalidades. Leer primero el
> [handoff maestro actualizado](../handoff/START_HERE_CODEX.md),
> [matriz](../verification/integration/integration-matrix.md) y
> [runbook de staging](../runbooks/supervised-staging.md). El encargo histórico
> siguiente conserva contexto; ningún texto habilita Push, producción o Proxmox.

Fecha: 2026-10-21. Esta guía es ejecutable por un agente de desarrollo en clon local. NO significa que AEGIS 5 ya esté implementado.

## Contexto obligatorio

El repositorio tuxevil/aegis contiene AEGIS v4, un observatorio energético/climático funcional, con módulos: backend.js, sources.js, celec.js, mazar.js, assessment.js, history.js, frontend.html, public/app.js y public/style.css; Node >=22 + Fastify 5 + Chart.js, pruebas node:test. No reemplazar el proyecto por un starter/template.

Leer, en este orden:
1. AGENTS.md
2. CONTEXT.md y README.md
3. docs/roadmap/aegis-5-prd.md (producto)
4. docs/architecture/aegis-5-design.md (arquitectura y seguridad)
5. docs/roadmap/aegis-5-backlog.md (PRs y gates)
6. SECURITY.md y tests actuales.

## Encargo del agente

Implementar la evolución hacia Blackout Map / Reportes ciudadanos / Sector Watch / OSINT / Time Machine / Mazar Explorer **por etapas**. La prioridad es una herramienta útil, accesible, honesta y liviana para personas en Ecuador; conservar toda la funcionalidad v4.

NO empieces construyendo el 3D, haciendo predicciones de apagones o añadiendo una plataforma de microservicios.

## Primer bloque de trabajo (ejecutar ahora)

1. Confirmar rama base, git status, árbol de archivos y estado de pruebas. Prohibido sobrescribir cambios locales ajenos.
2. Definir el contrato público de datos y el enrutamiento seguro para la futura API v1, con schemas explícitos y fixtures sintéticos claramente etiquetados.
3. Añadir feature flags OFF por defecto (sin alterar rutas de producción), y refactor mínimo si hace falta para poder registrar módulos nuevos aislados.
4. Crear tests de regresión que distingan /api/status de /api/v1 public y los endpoints privados actuales; los headers Origin/Referer jamás se consideran autenticación.
5. Escribir notas del resultado, pruebas ejecutadas y pendientes. Abrir PR pequeño «feat: aegis 5 foundation and safe public API contracts».
6. No avanzar al trabajo de reportes/Push hasta verificar gates del PR-01; después seguir backlog en orden con PRs separados.

Si la rama de planificación todavía no se fusionó, basar trabajo sobre ella temporalmente sin modificar main; rebase antes de abrir PR. No fusionar ni desplegar automáticamente.

## Decisiones de ingeniería

- Preferir Node/Fastify/Javascript existentes y dependencias mínimas justificadas. Reusar inyección de fetch/store/clock en tests.
- Separar ámbito público/privado, UTC+America/Guayaquil, derechos/licencias de fuentes, tiempos del hecho vs de publicación/ingesta.
- Arquitectura SQL migrable: observación != incidente != programación. No transformar rumor en verdad por número de reposts.
- Sector identificado mediante geografía administrativamente verificable; no confundir coordenadas GPS con circuito eléctrico. Ocultar ubicación doméstica exacta.
- Ingestores por distribuidora desacoplados; PDFs con hash/versionado, revisión de OCR, comparación de versión con estado desconocido si fuente falla.
- Web Push estrictamente opt-in, baja verificable, sin números de teléfono ni cuenta obligatorios. No habilitar envío masivo en desarrollo.
- Documentar costos y términos antes de usar APIs comerciales (X, mapas). No asumir acceso ni cuota gratuita.
- 3D solo si progresivo y accesible; sin batimetría ni curva volumen no publicar porcentaje de energía/volumen deducido linealmente.
- No generar tarjetas, snapshots, noticias ficticias o observaciones de prueba que parezcan producción.
- Mantener ejecución eficiente en CPU/almacenamiento y equipo personal; no depender de GPU/LLM residente para servir usuarios.

## Reglas de seguridad/fiabilidad y no negociables

- Nunca desplegar a aegis.tuxevil.com por iniciativa propia, ni agregar secretos reales al repo, ni borrar el historial observations.json.
- No afirmar que 2115 m = momento del apagón o que 2098 m es zona de operación garantizada; no confundir MWh/MW ni caudal/cota/volumen.
- No inferir fecha de retorno, cobertura territorial o duración sin evidencia temporal/geográfica.
- En interfaces y API mostrar antigüedad, origen, certeza, limitaciones e incertidumbre.
- Notificaciones generadas solo a partir de eventos/horarios autorizados y verificables, no inferencia de publicaciones sueltas.
- Revisar toda decisión de privacidad / almacenamiento persistente antes de activar formularios públicos.
- Tests verifican cambios, fuentes ausentes, fechas faltantes, replicaciones, fallos de origin, deduplicación y permisología de rutas.

## Informe de salida de cada PR

- Alcance concreto y archivos modificados.
- Diseño/rutas/DB/variables y migración.
- Comandos y resultados reales de tests; evidencia visual o reproducción local.
- Riesgos, limitaciones, flags activables, si se requiere revisión/manual.
- Checklist de aceptación del backlog, items NO implementados.
- URL del PR y próximo bloque recomendado.

## Prompt breve para copiar al agente

«Trabaja en tuxevil/aegis. Lee AGENTS.md, CONTEXT.md, README.md y las tres especificaciones de docs/roadmap + docs/architecture. Implementa AEGIS 5 por PRs pequeños, empezando únicamente con PR-01 (feature flags, contrato seguro de API pública v1 y regresión de v4). Conserva arquitectura actual y datos, no despliegues producción ni infieras cortes reales. Crea tests y documentación, verifica npm run check y npm test, abre PR de revisión y resume pendientes y riesgos. Continúa con siguientes hitos del backlog solo una vez superados sus gates; no mezcles 3D, OSINT, Web Push y mapa en un único PR.»
