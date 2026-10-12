# Ecuador: ENSO, amenazas climáticas y monitoreo útil

Investigación realizada el 12 de octubre de 2026. Fuentes primarias consultadas directamente. Las observaciones y pronósticos citados son una fotografía de esa fecha: no representan datos vivos. Este documento distingue evidencia publicada, auditoría del código y recomendaciones propias.

## Lo que ENSO permite y lo que no permite concluir

ENSO es un fenómeno acoplado entre océano y atmósfera. Las regiones Niño son áreas oceánicas de observación, no mapas de amenaza terrestre. Niño 1+2 cubre 0–10°S, 90–80°W, el Pacífico oriental próximo a Ecuador y Perú; Niño 3.4 cubre 5°N–5°S, 170–120°W. Ambas aportan información distinta sobre distribución del calentamiento. [NOAA CPC: regiones e índices](https://www.cpc.ncep.noaa.gov/products/outreach/glossary.shtml).

El ONI resume anomalías térmicas de Niño 3.4 mediante medias de tres meses. El RONI descuenta además la anomalía media de los océanos tropicales y ajusta la variabilidad; CPC adoptó su uso operativo en febrero de 2026. No son intercambiables con una lectura semanal. [CPC: transición a RONI](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/announcement.php), [CPC: definición y serie histórica RONI](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/).

Para clasificar episodios históricos completos se requieren cinco temporadas trimestrales solapadas consecutivas por encima de +0,5 °C o debajo de −0,5 °C. El diagnóstico operativo también considera respuesta atmosférica y persistencia prevista. Por ello «cinco semanas» es incorrecto, y esperar cinco temporadas para publicar una alerta vigente también sería incorrecto. [NOAA: definiciones operativas, presentación actualizada](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/lanina/enso_evolution-status-fcsts-web.pdf).

Una mayor intensidad de ENSO puede aumentar la confianza en ciertos patrones climáticos, pero no garantiza su ocurrencia local. Un pronóstico de ENSO no proporciona por sí mismo una probabilidad de deslave en una propiedad ni de apagón nacional. [CPC: interpretación del pronóstico de intensidad](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/outlook/).

## Estado verificado al investigar

El diagnóstico CPC publicado el **8 de octubre de 2026** tiene estado **El Niño Advisory** y describe fortalecimiento del fenómeno. Proyecta condiciones fuertes a muy fuertes hasta enero–marzo de 2027, con probabilidad superior al 83 %. Son probabilidades del fenómeno oceánico-atmosférico, no porcentajes de apagones o inundación. La siguiente discusión está programada para el 12 de noviembre de 2026. [CPC: discusión ENSO del 8 de octubre](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml).

La serie que consume actualmente AEGIS, `rel_wksst9120.txt`, se identifica como **Weekly Relative SST**. Su última fila observada es 07OCT2026: Niño 1+2 = +4,4 °C, Niño 3 = +3,4 °C, Niño 3.4 = +2,4 °C y Niño 4 = +0,2 °C. Son anomalías **relativas semanales**; no deben presentarse como ONI, RONI trimestral o temperatura absoluta del mar. [Archivo primario CPC](https://www.cpc.ncep.noaa.gov/data/indices/rel_wksst9120.txt).

ERFEN reúne INOCAR, INAMHI, Gestión de Riesgos y otras instituciones para diagnosticar condiciones nacionales y sus perspectivas. El portal oficial se verificó, pero sus selectores/iframes no ofrecieron en la extracción una publicación nacional vigente inequívoca. No se atribuye aquí a ERFEN una alerta ecuatoriana actual que no se pudo comprobar. [INOCAR: ERFEN](https://www.inocar.mil.ec/web/index.php/boletines/erfen).

## La lección de 2024: riesgos simultáneos y persistencia

La OMM documenta que El Niño contribuyó en 2023 a sequías en el norte de Sudamérica y a lluvias intensas e inundaciones en costas de Ecuador y Perú. No existe contradicción entre lluvia costera y déficit en otras regiones: sus patrones de circulación, estaciones y cuencas difieren. [OMM: balance climático 2023](https://wmo.int/news/media-centre/el-nino-and-climate-change-impacts-slam-latin-america-and-caribbean-2023).

En 2024, la OMM registra influencia de El Niño durante el primer semestre y sequía amazónica extensa, con precipitación regional entre 30 % y 40 % inferior a lo normal. **Ese porcentaje corresponde al área regional descrita, no a una medición específica de las cuencas de Mazar o Coca Codo.** [OMM: balance climático 2024](https://wmo.int/es/news/media-centre/los-fenomenos-meteorologicos-y-climaticos-extremos-castigan-america-latina-y-el-caribe).

El JRC documenta caudales muy bajos en grandes cuencas durante 2023–2024; ENSO retornó a neutralidad a mediados de 2024 mientras continuaban condiciones secas y cálidas. El Atlántico tropical norte excepcionalmente cálido pudo contribuir. El calor agravó déficit de humedad y estrés vegetal. **Por eso el sistema debe seguir monitoreando sequía y caudales aunque ENSO sea neutral.** No se deduce de este informe una atribución causal cuantificada exclusiva para Ecuador. [Comisión Europea/JRC: sequía amazónica, diciembre de 2024](https://publications.jrc.ec.europa.eu/repository/handle/JRC140741).

La relación con calentamiento global también requiere precisión: un análisis de atribución de la sequía amazónica de 2023, divulgado por NOAA, encontró agravamiento del déficit de lluvia y del estrés hídrico por temperaturas mayores. Se refiere a ese evento y a escala de cuenca amazónica; no permite trasladar una cifra causal a la producción hidroeléctrica ecuatoriana de 2024. [NOAA: explicación y alcance del estudio](https://www.climate.gov/news-features/event-tracker/preliminary-analysis-says-global-warming-more-blame-el-nino-amazons).

Mientras existía estrés energético, Ecuador también registró lluvias peligrosas. SNGR contabilizó **1.423 eventos** entre 29 de enero y 24 de abril de 2024: 53,83 % inundaciones y 25,30 % deslizamientos. En Pallatanga, el 21 de abril un deslizamiento cerró Guahuín Grande–Las Rosas; el COE se reunió el 22 de abril. El mismo reporte registró socavamiento de la E-487 Cumandá–Pallatanga, cierre y personas atrapadas. El COE identificó problemas de mantenimiento y drenaje. Estas afectaciones muestran por qué el tablero debe incluir vías, exposición y avisos, además de lluvia. [SNGR: SitRep 68, pp. 1 y 7–8](https://www.gestionderiesgos.gob.ec/wp-content/uploads/2024/04/SitRep-No-68-Lluvias-29012024-al-24042024.pdf).

La estacionalidad varía por región: SNGR, basándose en INAMHI, describe inicio habitual de época lluviosa interandina desde octubre, costera desde diciembre y lluvia durante todo el año en Amazonía. Es una caracterización amplia, no promesa de recuperación de cada río. [SNGR: lluvias octubre 2024–enero 2025](https://www.gestionderiesgos.gob.ec/wp-content/uploads/2025/01/SitRep-No-16-Lluvias-01102024-al-02012025.pdf). INAMHI informó retraso de lluvias interandinas en 2024. [INAMHI: transición de octubre de 2024](https://www.inamhi.gob.ec/octubre-2024-mes-de-transicion-climatica-en-el-callejon-interandino/).

Los pronósticos INAMHI de septiembre–noviembre de 2024 diferenciaban regiones, llanura amazónica y estribaciones. Un trimestre con tendencia de recuperación no certifica recuperación actual del embalse. [INAMHI: pronóstico trimestral CWRF, septiembre 2024](https://servicios.inamhi.gob.ec/wp-content/uploads/2024/09/Boletin_CWRF_SON.pdf).

## Fuentes y productos que conviene incorporar

INAMHI publica visor hidrometeorológico, pronósticos, advertencias, monitor de sequía, GeoGlows y anuarios. Constituyen un inventario de fuentes accesibles, **no APIs ya integradas o con disponibilidad garantizada**. [Portal de servicios INAMHI](https://servicios.inamhi.gob.ec/).

SNGR publica capas ArcGIS de susceptibilidad a inundaciones y eventos. La susceptibilidad representa condiciones territoriales; no significa inundación observada hoy. Los eventos necesitan fecha, actualización y control geográfico antes de convertirse en avisos. [Capa oficial de susceptibilidad](https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Susceptibilidad_de_Inundaciones/MapServer/0), [capa oficial de eventos por lluvias](https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/EVENTOS_X_LLUVIAS/FeatureServer/0).

INAMHI mantiene una URL para boletín especial Pallatanga, pero el PDF consultado estaba fechado **1 de mayo de 2025**. No debe aparecer como pronóstico actual por el hecho de que su URL siga respondiendo. [Boletín Pallatanga 26](https://www.inamhi.gob.ec/riobamba/bolesprbp.pdf).

Recomendaciones propias para un producto útil:

| Escala | Indicadores prioritarios | Lectura pública |
| --- | --- | --- |
| Próximas horas/días, localidad | Aviso INAMHI vigente con geografía y vencimiento; lluvia actual, acumulación 24/72 h; viento, UV; estado vial oficial | Qué amenaza afecta mi zona y qué hacer |
| Días/semanas, cuencas hidroeléctricas | Caudal observado, tendencia y anomalía estacional; precipitación de cuenca; reserva Mazar y balance del sistema | Qué empeora o mejora la disponibilidad de energía |
| Semanas/meses, regiones | Monitor de sequía; pronóstico estacional por región; diagnóstico ENSO oficial, Niño 1+2 y Niño 3.4 claramente etiquetados | Para qué conviene prepararse, con incertidumbre |
| Exposición | Susceptibilidad a inundación/deslizamiento, población, infraestructura/vías afectadas | Dónde pueden causar daño las condiciones observadas |

Separar una estación privada de Pallatanga del panorama nacional: su precipitación no mide la lluvia sobre las cuencas de Paute o Coca Codo. Para compartir el sitio, una tarjeta de síntesis debería resumir **qué cambió, dónde, evidencia, hora y acción**; los números completos deben quedar accesibles en un detalle gráfico.

## Auditoría científica de `backend.js` a la fecha de lectura

Estas observaciones se apoyan en el código local leído, no en afirmaciones de fuentes externas sobre el proyecto. No se modificó código durante esta investigación.

- Líneas 335–341: comentario «cinco semanas» equivocado; clasificación desde una sola semana; etiqueta «SUPER EL NIÑO» con +1,5 °C y combinación arbitraria Niño 1+2/3.4. Usar diagnóstico oficial, o describir solo calentamiento observado cuando no se dispone de diagnóstico. No confundir intensidad con alerta nacional.
- Líneas 341–356: «La Niña — Sin riesgo local», «BAJO» y sequía probable en Mazar desde Niño 3.4 no tienen calibración geográfica o hidrológica documentada. Reemplazar por contexto climático y evaluación independiente de evidencia local/energética. Neutralidad tampoco implica seguridad.
- Líneas 41–50: `computeSSLI` acumula una memoria ponderada de lluvia diaria en RAM. No mide humedad del suelo; depende de llamadas, días faltantes y reinicios. `toDateString()` usa zona del proceso, no necesariamente el calendario del contador de estación. Un reinicio puede reducir artificialmente el indicador a lluvia de hoy. Si se conserva, denominar **índice experimental de lluvia antecedente**, mantener historial y estado insuficiente cuando falte cobertura.
- Líneas 147–149: umbrales 35/20 y 15/8 producen una supuesta «ALTA PROBABILIDAD DE DESLAVE» sin validación contra inventario de eventos, pendiente, geología o exposición. Mostrar acumulación/intensidad y señales de vigilancia, y reservar una amenaza oficial para boletín vigente. La ausencia de lluvia en la estación no descarta deslizamientos en otra ladera.
- Líneas 151–154: presión relativa menos absoluta no es cambio temporal; lluvia con radiación solar baja no demuestra presión descendente. Derivar tendencia únicamente de serie temporal de presión consistente y con cobertura suficiente. En ausencia de historia, «tendencia no disponible».
- Líneas 143–145: la conversión pulgadas a mm es correcta. El contrato documentado por Ambient denomina `hourlyrainin` **Hourly Rain Rate**; verificar además modelo/firmware de estación y contrato exacto del endpoint utilizado antes de convertirlo en acumulado de una hora. Mantener distintos intensidad, lluvia diaria y acumulado móvil 24 h. [Especificación primaria Ambient](https://github.com/ambient-weather/api-docs/wiki/Device-Data-Specs).

## Modelo de estados recomendado

Propuesta de diseño, no sistema oficial ni modelo estadístico validado:

1. **Observaciones:** magnitud, unidad, región, hora de medición, origen, historial y cobertura. Falta de dato no equivale a cero.
2. **Diagnóstico oficial:** organismo, categoría textual, emisión, vigencia y territorio. Un boletín vencido es antecedente, no alerta vigente.
3. **Evaluación AEGIS:** razones explícitas, cambios observados y cobertura. «Vigilancia por caída de reserva» o «lluvia acumulada elevada» son defendibles si el dato respalda la frase; un porcentaje de daño necesita modelo calibrado.
4. **Pronóstico:** fecha de emisión, horizonte, probabilidad y escenario. Nunca utilizar previsión de lluvia como lluvia ya ocurrida o ENSO futuro como estado confirmado.
5. **Acción:** consejos proporcionales y enlaces directos a autoridad. Un aviso local de vía cerrada puede ser más útil que diez índices atmosféricos.

La evaluación de energía necesita sus propios indicadores de reserva, caudal y oferta-demanda. ENSO añade contexto anticipatorio, pero nunca debe sustituirlos. Para evaluar desempeño, conservar snapshots y contrastar anticipaciones con 2024 y eventos posteriores; medir alertas falsas, fallas de detección y anticipación real. Sin esa validación, hablar de señales y escenarios antes que de probabilidades de apagón.
