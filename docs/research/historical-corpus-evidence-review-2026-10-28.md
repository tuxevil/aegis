# Revisión de evidencia primaria para el corpus histórico — 28/10/2026

**M3, investigación de solo lectura.** Ventana buscada: 21–27/10/2026, Guayaquil
y Pallatanga. Consulta mediante herramienta web el 28/10/2026, con comprobación
del reloj a las 14:07:19 UTC. Es fecha de consulta, no captura histórica del
evento. No se consultaron APIs de datos, cuentas, credenciales, formularios o
sesiones de redes sociales; no se contactó a instituciones. Solo se guardan
referencias y paráfrasis breves, sin PDFs, imágenes o datos personales.

Se inspeccionaron el [corpus actual](../../replay/multihazard-corpus.v1.json) y la
[reconstrucción documental](guayaquil-2026-10-26-replay.md). Esta revisión aporta
evidencia primaria adicional de impactos; no convierte retrospectivas en entradas
disponibles antes de la tormenta ni asigna resultados positivos/negativos al motor.

## Hallazgos primarios y tiempos separados

### SNGR, SitRep nacional 59

[PDF oficial, 12 páginas](https://www.gestionderiesgos.gob.ec/wp-content/uploads/2026/10/SitRep-No-59-Lluvias-29082026-al-27102026-15h00.pdf).
La página 1 declara publicación **27/10/2026 21:05** y corte **27/10/2026 15:00**.
No se imprime un huso inequívoco en el fragmento temporal leído: conservar estos
valores literales, sin convertirlos automáticamente a UTC. La página 9 relata
acumulación de agua en varios sectores de Tarqui, Guayaquil, asociada al
**24/10/2026**. Esa prosa aporta evidencia institucional de impacto en otra fecha
de la ventana buscada; no prueba un negativo para otros lugares o días. No se
preservó aquí la primera disponibilidad web del PDF ni sus revisiones.
En páginas 11–12, la prosa de Zona 8 refiere lluvias/tormentas del **25 y 26/10**
y acumulación de agua en calles/avenidas de varias parroquias de Guayaquil,
con seguimiento institucional; ese pasaje no delimita noche/madrugada.

**Uso admisible propuesto:** referencia retrospectiva de impacto, separada de
features/pronósticos. No basta por sí sola para puntuar un aviso por punto de
modelo, estación, barrio o una ventana horaria que el texto no delimita.

### SNGR Guayas, SitRep provincial 10

[PDF oficial, 7 páginas](https://www.gestionderiesgos.gob.ec/wp-content/uploads/2026/10/Informe-de-Situacion-Lluvias-El-Nino-No_10_27_10_2026_15h50-1.pdf).
La página 1 imprime publicación **27/10/2026 3:37**, mientras su período termina
**27/10/2026 15:50**; otras referencias internas usan 10:00. No se corrige el
posible formato de reloj o revisión por intuición. La prosa de páginas 6–7 refiere
acumulación de agua en Guayaquil durante la noche del **25/10** y madrugada del
**26/10/2026**, y seguimiento institucional. No se extraen cifras de tablas ni
contactos del documento.

**Uso admisible propuesto:** corroboración retrospectiva de impactos; disponibilidad
para replay temporal aún no verificada. Aclarar la incoherencia temporal antes
de asignar una fecha UTC de publicación o utilizarlo como prueba de anticipación.

### Índice SNGR que enlaza los informes

El [índice de lluvias y El Niño](https://www.gestionderiesgos.gob.ec/sitrep-eventos-de-lluvias-por-alerta-roja/)
enlaza informes nacionales para las fechas 21–27/10/2026 y Guayas para 22, 23 y
27/10. Para el nacional 59 su etiqueta anuncia **16h00**, distinta del corte
15:00 del PDF. La etiqueta del índice no reemplaza ni demuestra publicación
histórica del archivo. Se siguieron solo tres enlaces PDF: nacional 59, nacional
49 y provincial Guayas 10; no se descargó la colección completa.

### Alcaldía de Guayaquil, respuesta del 27/10

La [nota municipal de retiro de lodo y escombros](https://guayaquil.gob.ec/obreros-maquinaria-pesada-retiro-escombros/)
está fechada **27/10/2026**, sin hora visible. Describe efectos de lluvias de las
últimas horas y trabajos en Los Ceibos, Vía a la Costa y avenida del Bombero, en
Bellavista; menciona deslaves y escorrentías. El enlace descubierto con slug
`obreros-maquinaria-pesada-retiro-lodo-escombros` redirigió al citado.

**Uso admisible propuesto:** referencia primaria de respuesta/impacto con fecha
de publicación diaria y hora de evento no delimitada. No asignar el comienzo
exacto al 26/10 o reconstruir una alerta anterior a partir de «últimas horas».

### Alcaldía, noticia del 22/10: fecha de publicación no es fecha del evento

La [nota del Concejo Municipal](https://guayaquil.gob.ec/concejo-municipal-cambios-urbanisticos-prevencion-lluvias/)
lleva fecha **22/10/2026**, pero su pasaje de ayuda a Tenguel alude a lluvias del
domingo y lunes. No documenta por eso un nuevo incidente del 22/10. La parroquia
rural tampoco equivale al punto urbano del modelo Guayaquil. Sirve para advertir
contra etiquetar impactos por la fecha del artículo y contra mezclar geografía.

## Búsquedas realizadas y resultado de cobertura

Las consultas se hicieron mediante buscador, no sondeos de endpoints de datos.
Se usaron expresiones `site:` inicialmente y después filtros de dominios oficiales.
Los resultados fuera del dominio/tema no se tomaron como evidencia primaria.

| Consulta o familia concreta | Filtro/dominio | Resultado útil de esta revisión |
| --- | --- | --- |
| `"26 de octubre de 2026" lluvia` | guayaquil.gob.ec | Sin nueva pieza específica suficiente en ese resultado |
| `"octubre" "2026" "Pallatanga"` | gestionderiesgos.gob.ec | Resultados históricos fuera de ventana y mapa de advertencia |
| `"octubre" "2026" lluvia` | seguraep.gob.ec | Sin pieza primaria adicional seleccionable |
| `Guayaquil lluvias octubre 2026` | Guayaquil, Segura EP, ECU 911 | Noticias municipales e índice SNGR, seguidos arriba |
| `Pallatanga octubre 2026 lluvias deslizamientos` | SNGR, GAD Pallatanga, Chimborazo, ECU 911 | PDOT y documentos de otros períodos; no etiqueta diaria |
| `"26" "octubre" "2026" lluvias` | Guayaquil y Segura EP | Sin nueva etiqueta independiente |
| `"27" "octubre" "2026" Guayaquil` | SNGR | Índice de SitRep, PDFs nacional/provincial |
| `"Pallatanga" "octubre" "2026" lluvias` | SNGR, GAD Pallatanga, Chimborazo, ECU 911 | Resultados de prevención, turismo, obras y documentos antiguos |
| `"Guayaquil" "26 de octubre" "2026" lluvia` | Guayaquil, Segura EP, ECU 911 | Resultados con topónimos/fechas ajenas; excluidos |
| `"Pallatanga"` y fechas `21/10/2026` a `27/10/2026` | SNGR y ECU 911 | No se verificó un registro de incidente o no-incidente para puntuar |

**Pallatanga permanece sin etiqueta verificable para esta ventana.** La ausencia
de resultados adecuados en estas búsquedas no demuestra ausencia de incidentes.
Un listado acumulado, alojamiento temporal, alerta o una obra vial tampoco
demuestra un evento diario ni la ausencia del fenómeno evaluado.

## Límites observados de lectura y permisos

- Las páginas municipales, índice y dos PDFs anteriores devolvieron texto legible
  a la herramienta. No se midieron HTTP, latencia, SHA ni bytes; no se presentan
  como capturas archivadas del ingestor.
- La lectura textual de los PDFs fue obtenida en esta tarea de investigación.
  La comprobación independiente del agente integrador al abrir el nacional 59
  devolvió `Internal Error`/inaccesible; no es una respuesta HTTP 403 ni invalida
  por sí sola la lectura previa. No se afirma reproducibilidad universal de acceso.
- El enlace del nacional 49 (21/10, 15h00) falló con timeout de la herramienta.
  No se deduce inexistencia del informe ni se incorporan sus supuestos datos.
- El [mapa SNGR de movimientos de masa](https://www.gestionderiesgos.gob.ec/mapa-de-monitoreo-de-movimientos-de-masa-estatus-advertencia/)
  devolvió un documento muy largo; las búsquedas internas posteriores fallaron
  por timeout. No se afirma una extracción completa ni validación de rutas de
  Pallatanga a partir de esa lectura parcial.
- Se solicitaron screenshots de páginas de ambos PDFs. La herramienta devolvió
  referencias sin imagen inspeccionable o timeout; no se atribuye verificación
  visual a esos intentos. Los hallazgos anteriores se limitan a prosa y rótulos
  temporales legibles, no cifras/columnas de tablas o interpretación cartográfica.
- No hubo 403/429 informado en estas lecturas. No se eludieron controles. Los
  resultados del buscador con directorios, teléfonos o contactos se descartaron
  sin guardarlos ni seguirlos.
- No se verificó licencia abierta específica de redistribución de estas piezas.
  Se enlazan y resumen brevemente; acceso público no concede autorización de
  archivo/retransmisión masiva. No se añadieron bytes de proveedor al repositorio.

## Decisión para M3

Conservar estas piezas como referencias retrospectivas independientes con URLs,
páginas y tiempos literales; nunca adelantar su conocimiento a la fecha del
incidente. No cambiar outcomes ni afirmar FAR/missRate reales hasta revisar el
objetivo, precisión territorial, período cubierto y correspondencia de cada caso.
Siguen faltando negativos con vigilancia comparable, trazabilidad histórica de
entradas y permisos por pieza. No se usa el índice Amaru como verdad-terreno.
Ninguna conclusión activa avisos, transporte, WhatsApp, producción o merge.
