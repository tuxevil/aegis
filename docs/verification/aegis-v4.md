# Verificación de AEGIS v4

Fecha: 12 de octubre de 2026. Cambios locales en `fix/celec-ecuador-date`; este informe no acredita publicación ni despliegue de producción.

## Investigación previa

- [Dependencia energética y crisis de 2024](../research/ecuador-riesgo-electrico.md).
- [ENSO, amenazas climáticas y contexto local](../research/ecuador-clima-enso.md).

Los antecedentes sustentan la distinción entre 2115 m de seguridad y 2098 m de diseño, el papel de la cascada, sedimentos y respaldo, y la separación de observaciones, pronóstico y diagnóstico oficial.

## Automatización

`npm run check` y `npm test`: 35 pruebas aprobadas. Cobertura de calendario CELEC, período correcto CENACE frente a tablas de otros días/meses, datos ausentes/futuros, arrays tipados, diagnóstico oficial separado de índices NOAA, evaluación con caudal, contraste de tendencias recientes y largas, persistencia tras reinicio, formatos incompatibles sin pérdida de archivo, fallos parciales con reintento, protección de identificadores y DOM sin ejecución de texto externo.

`npm audit --audit-level=high`: cero vulnerabilidades tras actualizar Fastify a 5.12.5 y source-map-js a 1.2.2 dentro de sus versiones compatibles. Dependencias no usadas Axios/Express retiradas.

## Navegador y datos reales

Chromium headless con datos reales consultados de CELEC, CENACE, NOAA, Ambient Weather y Open-Meteo. La MAC se inyectó al proceso local; no se incluyó en archivos públicos, API, imágenes ni este informe.

- Gráficos de cota, lluvia, mezcla energética, generación y ENSO disponibles.
- Las cinco vistas a 320, 390, 768 y 1440 px sin desbordamiento horizontal.
- Legibilidad al 100%: cuerpo de 16 px, etiquetas de 14 px como mínimo y ejes de gráficos de 13 px; los paneles y rejillas se adaptan al contenido ampliado.
- Consola oscura con cinco vistas; controles 24/72 h y lluvia medida/prevista.
- Atajos, búsqueda de comandos y retorno del foco al ejecutarlos; inspector con gráfico ampliado y lecturas reales.
- Navegación mueve los mismos paneles sin duplicar gráficos. Los campos de texto y los atajos del navegador conservan su comportamiento.
- Modo de concentración y efecto CRT opcional.
- Contención del panel de lluvia comprobada por límites de sus hijos visibles en resumen y Pallatanga, modos medida/prevista, a 320, 390, 768, 1024, 1280 y 1440 px. La altura crece con el contenido y la fecha completa ocupa varias líneas cuando hace falta.
- Dialog de compartir, cierre con Escape y descarga PNG comprobados.
- Respuesta posterior sin fuentes limpia cifras anteriores y vuelve a información insuficiente.
- Ningún error JavaScript de página en la sesión de verificación.

Capturas de revisión en `artifacts/` (fuera de Git): desktop, móvil y tarjeta compartible. Son fotografías de la consulta, no indicadores vivos. `public/social.png` es una vista social genérica del producto, sin mediciones actuales.

## Empaquetado

Imagen `aegis-grid:review` construida con Node 22 Alpine y `npm ci --omit=dev`. Incluye todos los módulos y assets locales. Se comprobaron la raíz, JavaScript, Chart.js y PNG social, y un panorama API con el Referer del dashboard (necesario desde el puente Docker, que no se considera localhost).

La persistencia está implementada y probada. Para conservar historia al reemplazar contenedores, producción debe montar un volumen en DATA_DIR. No se realizó una migración ni cambio de infraestructura de producción.

## Alcance de la anticipación

Las reglas preventivas son experimentales y se muestran en la metodología. No equivalen a un modelo calibrado de probabilidad. El caudal/sedimentos CCS, respaldo disponible, avisos oficiales de racionamiento y estado vial en vivo siguen siendo datos faltantes explícitos. Las curvas actuales no se usan para fabricar margen de reserva o confirmar ausencia de cortes.
