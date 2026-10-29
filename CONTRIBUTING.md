# Contributing

Small, focused PRs. One source or one endpoint per change.

## Workflow

1. While consolidation PRs are open, branch from the reviewed integration head
   (`integration/aegis-staging`); after approved integration, use `main`. See the
   [integration matrix](docs/verification/integration/integration-matrix.md).
2. Use Node >=22.16. No `.env`, station identifier or private service is required
   for tests: `npm ci && npm run check && npm test`.
3. Run `npm run example:source` and `npm run benchmark:compare` offline. Optional
   local UI: `npm start`; weather without a station key remains unknown.
4. Verify the affected endpoint using injected fixtures or isolated staging:
   - `/api/weather`, `/api/dams`, `/api/cenace`, `/api/enso`, `/api/status`.
5. Run the relevant regression plus the full checks above. Never enable real Push
   or messaging; synthetic providers/keys are test-only.
6. Open a PR describing: source touched, how you verified it, and sample
   output (redact any real station MAC).

## Rules

- Never commit `.env`, real MACs, tokens, or credentials.
- Scrapers break when sources change HTML/JS: keep parsing defensive and
  return a clear error (`4xx`/`5xx` with message) instead of crashing the
  aggregator. `/api/status` uses `Promise.allSettled` — keep it that way.
- Do not weaken the localhost restriction on `/api/*` without documenting
  the reason and the replacement control in `SECURITY.md`.
- Keep `README.md` endpoint TTLs and env vars in sync with `backend.js`.


## Colaboración en AEGIS Multiamenaza

AEGIS busca una comunidad que pueda verificar, mejorar y corregir fuentes/reglas de riesgos. Antes de proponer cambios de fuentes o evaluaciones, lee:
- [Arquitectura y normas para contribuir](docs/design/open-source-collaboration.md).
- [Contratos de datos v1](docs/contracts/source-connectors-v1.md).
- [Guía para agentes/Codex](docs/handoff/START_HERE_CODEX.md).
- [Análisis comparativo de fuentes abiertas](docs/research/amaru-methodology-open-sources-2026-10-27.md).

**Principios:**
1. Separa hechos oficiales, observaciones, estimaciones/modelos y reportes comunitarios no verificados.
2. Acompaña cambios de fuente con URL, fecha de publicación/captura, licencia, ejemplo anonimizado y prueba offline reproducible. La capacidad de acceder a una API no es un permiso de republicarla.
3. No inventes fechas de disponibilidad histórica, latencias, seguridad de barrios ni probabilidades sin validación.
4. Para un ajuste de reglas de riesgo, incluye eventos positivos, negativos, errores de fuente y resultados comparativos antes/después; no uses una herramienta de terceros como verdad-terreno.
5. Antes del PR ejecuta: \`npm run check\` y \`npm test\`. Las nuevas pruebas del módulo deben funcionar sin una API key real, sin conexiones externas ni WAHA.
6. No envíes reportes con teléfonos, domicilios, fotografías personales, credenciales, coordenadas residenciales ni identificadores de proveedores. Reporta fallos de seguridad de manera privada conforme a \`SECURITY.md\`.
7. Los PRs y las issues son propuestas abiertas a revisión; **no implican publicación de alertas**. Los sistemas de avisos públicos y la cuenta WhatsApp se mantienen desactivados durante el desarrollo.

**Primeros aportes útiles:**
- Correcciones de parsing/vigencia INAMHI con fixtures legales.
- Nuevos metadatos de fuentes SNGR/cantones y sus pruebas.
- Comprobación de CRS, zona horaria, unidades, fallos y latencia.
- Tests de accesibilidad, traducción, compatibilidad móvil y consumo de recursos.
- Casos históricos documentados y períodos sin incidentes.

Si quieres proponer un proveedor, utiliza el template de issue «Propuesta de fuente» y documenta permisos, cobertura, actualización y URL. El mantenedor decidirá si entra al catálogo de investigación antes de cualquier despliegue.

## Primer adaptador, ejecutable sin claves ni datos privados

```sh
npm ci
npm run example:source
node --test hazards/source-adapter-example.test.js
```

La receta genera su propio PDF de prueba MIT en un archivo temporal que elimina
al terminar. No consulta INAMHI, Amaru u otro proveedor, no usa DATA_DIR ni publica
avisos. La licencia del fixture no cambia los permisos pendientes de la fuente real.
Consulta [la guía paso a paso](docs/contributing/source-adapter-example.md) para
las interfaces, resultado esperado y controles que debe pasar una propuesta real.

## Propuestas de reglas: comparar antes/después

Ejecuta `npm run benchmark:compare` y revisa errores por caso, cohortes y datos
faltantes, además de tasas. El [benchmark público](replay/benchmarks/README.md)
contiene controles **solo sintéticos**, con etiquetas separadas del motor. No son
incidentes o negativos históricos verificados ni prueba de probabilidad de desastre.
Conserva el baseline al proponer cambios; no reetiquetes para mejorar una cifra.
Las pruebas deben seguir funcionando sin clave ni llamadas a proveedores.

## Validación operacional sin credenciales

Consulta el [contrato operacional](docs/contracts/shadow-operation-v1.md).
`node --test hazards/shadow-runner.test.js test/shadow-lab.test.js` reproduce
cuotas/reinicio, HTTP403/429 simulado, fuente ausente, evaluaciones privadas,
backup/restore y rechazo de corrupción. Para un ensayo corto usa un directorio
nuevo: `node scripts/shadow-lab.mjs --lab --root=/tmp/aegis-mi-lab --cycles=12`.
Los PDFs son generados MIT y marcados SYNTHETIC TEST, no capturas institucionales.
No se admiten secretos, URLs arbitrarias o modo live en esa CLI. Las discrepancias
son notas privadas revisables, no etiquetas de ground truth o permisos de envío.
