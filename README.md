# AEGIS // GRID SENTINEL

> **Ampliación AEGIS Multiamenaza (planificación cerrada, desarrollo por fases):** el punto de entrada para Codex es [START_HERE_CODEX](docs/handoff/START_HERE_CODEX.md), junto con las [decisiones](docs/design/architecture-decisions.md), el [roadmap M0–M5](docs/design/implementation-roadmap.md) y el [prompt preparado](docs/handoff/CODEX_START_PROMPT.md). El dashboard documentado a continuación corresponde al Grid Sentinel ya existente. Los módulos de alertas ciudadanas aún NO están operativos y ningún mensaje WhatsApp está activado.

Un observatorio público para entender las señales de energía de Ecuador y las condiciones locales de Pallatanga, con igual protagonismo. Su objetivo es ayudar a anticiparse: explicar qué cambió, por qué importa y qué datos faltan. No anuncia horarios de cortes ni calcula probabilidades de apagón o deslave.

Avance multiamenaza en ramas de desarrollo: [auditoría M0](docs/research/source-validation-results.md),
[ingesta y archivo M1](docs/verification/multihazard-m1.md) y
[explorador M2 y gates territoriales](docs/verification/multihazard-m2.md).
La [adquisición SNGR por cantón](docs/verification/multihazard-m2-acquisition.md)
añade verificación por conteos/IDs y archivo privado de investigación; no publica capas.
[M3 en sombra](docs/verification/multihazard-m3-engine.md) añade candidatos
internos, replay y métricas con brechas explícitas; no es un predictor calibrado ni emisor.
`HAZARDS_ENABLED=false` por defecto; `HAZARDS_ENABLED=true npm start` añade
`/hazards/` y consultas GET `/api/hazards/{sources,areas,observations,bulletins,health}`.
La activación de esa vista no inicia ingesta ni publica avisos. Las capturas de
investigación permanecen privadas y la cobertura se declara limitada.
Grid Sentinel conserva `/`, `/ui` y `/api/status`.

## La consola

- **Energía nacional:** evolución de Mazar, caudal afluente y su cambio, escenario de continuidad hasta el umbral de seguridad, cascada Mazar–Molino–Sopladora, composición de la producción y curva horaria CENACE.
- **Pallatanga:** lluvia y condiciones de una estación Ambient Weather, previsión horaria para la cabecera cantonal y acceso directo a avisos oficiales y estado vial.
- **Contexto del Pacífico:** diagnóstico oficial NOAA y anomalías relativas semanales Niño 1+2 y Niño 3.4, sin confundirlas con ONI o RONI trimestral.
- **Contexto de 2024:** cómo reservas, sedimentos, respaldo e importaciones interactuaron durante la crisis.
- **Compartir:** resumen con fecha y enlace, tarjeta PNG descargable, vista móvil y efecto CRT opcional.

Cinco vistas: resumen, energía, Pallatanga, Pacífico y fuentes/log. Los paneles abren un inspector con gráfico ampliado, lecturas y contexto. La interfaz usa una consola oscura con telemetría, tablas y gráficos; los detalles y la metodología están bajo demanda.

Atajos: `1–5` cambian de vista, `R` actualiza, `D` abre el panel seleccionado, `S` exporta, `/` o `Ctrl/Cmd+K` abre comandos, `?` muestra ayuda y `F` activa concentración. `Escape` cierra diálogos o sale de concentración. Los atajos simples se suspenden al escribir en campos.

## Investigación y decisiones

La reconstrucción se apoya en [la investigación energética](docs/research/ecuador-riesgo-electrico.md) y [la investigación climática](docs/research/ecuador-clima-enso.md), fechadas el 12 de octubre de 2026. Estos documentos son antecedentes con citas; los datos del dashboard se consultan dinámicamente.

Principios del producto:

1. **2115 m es un umbral crítico de seguridad por sedimentos.** El mínimo de diseño de 2098 m no garantiza operación segura hasta esa cota. La alerta no afirma que las unidades estén efectivamente apagadas.
2. El riesgo se puede deteriorar **antes de 2115 m**. AEGIS considera nivel, descenso y variación del caudal de entrada, con razones explícitas.
3. Días hasta 2115 = escenario de continuidad del ritmo observado, **no autonomía eléctrica ni fecha de apagón**. La altura no es una medida lineal de volumen útil o energía almacenada.
4. Producción acumulada **MWh** no equivale a potencia disponible **MW**. La generación que sigue a la demanda atendida no demuestra margen de reserva ni ausencia de racionamientos.
5. La lluvia de Pallatanga no representa la cuenca del Paute ni la del Coca. ENSO neutral o La Niña no eliminan las amenazas locales o energéticas.
6. Datos ausentes o antiguos no significan cero ni tranquilidad. Se conservan las fechas originales y se informa la cobertura.

### Reglas de vigilancia

Son heurísticas preventivas explicables, **no reglas oficiales CENACE/INAMHI ni un modelo calibrado de daños**:

| Señal                        | Criterio de esta versión                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Zona crítica Mazar           | Cota ≤ 2115 m                                                                                                                       |
| Prealerta de nivel           | 2115 < cota < 2120 m                                                                                                                |
| Atención antes del umbral    | Descenso ≥ 0,5 m/día en ventana reciente, o descenso sostenido en 48–72 h sin recuperación reciente, o escenario de cruce ≤ 14 días |
| Caudal + descenso            | Caída ≥ 20% frente a una lectura próxima a 24 h antes, junto con descenso de nivel                                                  |
| Lluvia local para vigilar    | Intensidad ≥ 8 mm/h o acumulación del día ≥ 20 mm                                                                                   |
| Previsión local para vigilar | Modelo con ≥ 20 mm en las próximas 24 h y cobertura suficiente                                                                      |

Tendencia Mazar: al menos 6 h de separación dentro de 24 h, contrastada con una ventana de 48–72 h cuando existe cobertura. Si hay recuperación reciente tras un descenso fuerte de varios días, se mantiene vigilancia y se explica el cambio. Tolerancia de ±0,05 m/día. Cota y caudal deben tener como máximo 2 h; estación, 1 h; pronóstico consultado, 3 h. La clasificación conserva siempre el alcance **evaluación parcial**: faltan caudal/sedimentos CCS, disponibilidad térmica adicional y avisos vigentes de racionamiento. No se inventan esas señales.

## Fuentes y fechas

| Fuente                       | Información                                                                      | Caché  |
| ---------------------------- | -------------------------------------------------------------------------------- | ------ |
| CELEC SUR ORDS               | Lecturas de cota, caudal y unidades; Mazar, Molino/Amaluza, Sopladora y Minas SF | 10 min |
| CENACE Información Operativa | Sección **PRODUCCIÓN EN TIEMPO REAL**; acumulado de ese día y 48 medias horas    | 10 min |
| Ambient Weather              | Una estación de Pallatanga, sin publicar su identificador                        | 5 min  |
| NOAA CPC                     | Archivo semanal relativo y boletín ENSO oficial por separado                     | 1 h    |
| Open-Meteo                   | Previsión horaria para Pallatanga, cabecera (-1.99856, -78.96629)                | 30 min |

CENACE incluye gráficos diarios, mensuales y anuales: el parser selecciona la sección semántica actual; no el gráfico con más centrales. Su fecha se obtiene de la fuente. Los puntos futuros/ausentes se conservan como null.

CELEC consulta días civiles de `America/Guayaquil` y, para nivel Mazar, caudal Mazar y nivel Amaluza, recupera también los dos días anteriores. Las últimas lecturas válidas y la historia se conservan ante fallos. Cada señal Mazar lleva su propia fecha.

NOAA: los índices semanales no producen una clasificación oficial por umbral. Si el boletín falta, la interfaz muestra diagnóstico no actualizado. El pronóstico Open-Meteo se distingue de la observación, con atribución y fecha de consulta; no es un aviso oficial.

## Ejecutar

Node ≥ 22.

```bash
npm ci
cp .env.example .env
# Configurar AMBIENT_MAC y DATA_DIR.
node --env-file=.env backend.js
```

`npm start` utiliza las variables ya inyectadas por el entorno. Sin `AMBIENT_MAC`, energía, ENSO y pronóstico siguen funcionando; el panel identifica la estación sin lectura.

| Variable      | Valor predeterminado | Uso                                             |
| ------------- | -------------------- | ----------------------------------------------- |
| `PORT`        | 3010                 | Puerto HTTP                                     |
| `AMBIENT_MAC` | Sin configurar       | Identificador privado de la estación local      |
| `DATA_DIR`    | `.data`              | Historial persistente de observaciones públicas |

### Persistencia y despliegue

El historial se escribe de forma atómica en `DATA_DIR/observations.json`. Conserva hasta 14 días y 10.000 muestras por señal. La versión del archivo se valida antes de abrirlo; un formato incompatible detiene el arranque sin borrar datos.

Para **sobrevivir a redeploys** en Coolify/Nixpacks, montar un volumen persistente (por ejemplo `/data`) y definir `DATA_DIR=/data`. Un directorio dentro del contenedor sin volumen solo sobrevive a reinicios del mismo contenedor. Respaldar el archivo antes de migrar o reemplazar el almacenamiento. No incluye MAC, tokens ni credenciales.

Docker:

```bash
docker build -t aegis-grid .
docker run --env-file .env -p 3010:3010 -v aegis-history:/data aegis-grid
```

El Dockerfile incluye todos los módulos, assets y Chart.js local. El frontend no necesita compilación; las tipografías externas tienen alternativas de sistema si no cargan.

## Arquitectura

```text
Fuentes públicas ── sources.js ── caché y consultas concurrentes ── backend.js
                       │                                      │
                 history.js                              assessment.js
              lecturas persistentes                señales + razones + cobertura
                                                              │
                                                       GET /api/status
                                                              │
                                             frontend.html + public/app.js
                                             gráficos, contexto, compartir
```

- `sources.js`: obtención y normalización, fechas de origen y conversión de unidades.
- `celec.js`: consulta por MRID, historia y recuperación de lecturas.
- `mazar.js`: nivel y tendencia; proyección condicionada al descenso.
- `history.js`: almacenamiento atómico con retención y versión.
- `assessment.js`: estados explicables separados para energía y clima local.
- `backend.js`: aplicación Fastify exportable, endpoints, caché y assets.
- `public/app.js`, `public/style.css`, `frontend.html`: interfaz, gráficos y tarjeta para compartir.

API: `/api/status` agrega `/api/dams`, `/api/weather`, `/api/cenace`, `/api/enso` y `/api/forecast`. `/` y `/ui` sirven el mismo dashboard. Las consultas concurrentes comparten solicitudes en curso; el fallo de una fuente no interrumpe las demás.

## Verificación

```bash
npm run check
npm test
```

Las pruebas incluyen período correcto CENACE, fechas ausentes, arrays Plotly, índices NOAA, caudal en la evaluación, datos antiguos, persistencia tras reinicio, fallos parciales y política de acceso. La interfaz se verifica adicionalmente en navegador con datos reales y escenarios de fuentes ausentes, móvil, navegación entre vistas, inspector, comandos, atajos y compartir.

## Seguridad

La MAC entra por variable de entorno y no se devuelve al cliente. Los errores de fuentes se muestran sin URLs privadas. Datos externos se presentan como texto; no se evalúa JavaScript de las páginas de origen.

`/api/*` conserva acceso localhost, y `/api/status` permite el dashboard del mismo host por Origin/Referer. Esta política es una barrera de exploración, **no autenticación**: no deben exponerse secretos tras ella. Consultas CELEC/CENACE mantienen la compatibilidad TLS del proyecto para sus cadenas no estándar. Ver [SECURITY.md](SECURITY.md).

## Próximos datos necesarios

Para mejorar la anticipación nacional: caudales y sedimentos CCS verificables, generación/disponibilidad por unidad, curva cota–volumen útil, combustible y respaldo térmico, importaciones programadas y avisos oficiales de déficit. Para amenazas territoriales: avisos INAMHI con geografía y vencimiento, observaciones de cuenca y estado vial con fecha. Ninguna de esas integraciones se presenta como ya disponible.

La calibración futura debe contrastar las señales con series históricas y eventos: anticipación, falsas alertas y episodios no detectados. AEGIS comunica lo observado y escenarios condicionados mientras esa validación no exista.
