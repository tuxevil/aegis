# Evidencia territorial adicional — IEDG/CONALI 2026

2026-10-27. Investigación local de M2/M4, no geografía certificada ni publicación
de mapas. [Metadatos medidos](source-probes/2026-10-27-iedg-cantonal-research.json).
Datos crudos y componentes permanecen privados en /tmp, fuera de git y APIs.

## Fuentes y restricciones observadas

El [servicio INEC MGN26](https://idgn.ecuadorencifras.gob.ec/server/rest/services/mgn_26/service_mgn26/FeatureServer)
se describe con corte enero 2026. Su
[capa limite_cantonal](https://idgn.ecuadorencifras.gob.ec/server/rest/services/mgn_26/service_mgn26/FeatureServer/1)
es **esriGeometryPolyline**, EPSG:3857, no un polígono cantonal. No se descargaron
edificaciones/ingresos ni se intentó construir polígonos a partir de líneas.

El [directorio de IEDG](https://www.iedg.gob.ec/servicios/descargas/) atribuye su
Organización Territorial Cantonal al Ministerio de Gobierno 2026 y enlaza un
[RAR oficial](https://www.iedg.gob.ec/wp-content/uploads/2026/09/Organizacion-Territorial-Cantonal.rar).
GET del directorio: 23:02:50.256Z, 200, 128102 bytes. HEAD del RAR: 23:03:44.909Z,
200, application/vnd.rar, sin Content-Length. GET único de investigación:
23:04:52.862Z, **200**, **53569288 bytes**, **15117 ms**; Last-Modified
07/09/2026 15:52:16 GMT. SHA-256 completo en el JSON enlazado. Esa cabecera no
se interpreta como aprobación, vigencia o disponibilidad histórica de la capa.

Se abrió además el registro de Datos Abiertos enlazado por la institución:
`https://www.datosabiertos.gob.ec/dataset/organizacion-territorial-cantonal`.
Respondió **403** en la herramienta web y no se reintentó por API, proxy o cambio
de agente. La descarga IEDG es una publicación institucional distinta, no un
intento de eludir ese acceso. Un resultado de búsqueda de catálogo con CC BY no
basta para atribuir esa licencia a cada recurso o ignorar sus restricciones.

El [procedimiento ministerial](https://www.ministeriodegobierno.gob.ec/entrega-del-trazado-de-limites-territoriales-internos-y-organizacion-territorial-del-estado/)
distingue acceso a información y autorización de publicación. El PDF de metadatos
incluido en el RAR indica acceso sin restricción y atribución CONALI; también
incluye condiciones de autorización para publicar cartografía. No se interpreta
como una autorización nueva para AEGIS: requiere aclaración por producto/uso.
No se contactó a ninguna institución.

## Inspección real del archivo

RAR reconocido por firma, extracción selectiva en directorio nuevo 0700, archivos
0600, sin ejecutar documentos/scripts ni seguir rutas del archivo. Presupuestos:
descarga ≤64 MiB, componentes seleccionados ≤200 MiB, proceso CPU/memoria acotados.
Se leyeron DBF/PRJ/CPG/SHP/SHX y metadatos, no se importó la capa al backend.
Herramientas exclusivamente en venv temporal: libarchive-c 5.3, pyshp 2.3.1,
pyproj 3.7.2, Shapely 2.1.2/GEOS 3.13.1. No son nuevas dependencias de runtime.
PROJ network deshabilitado; no hubo descarga implícita de grids.

| Comprobación | Resultado observado |
| --- | --- |
| Tipo SHP | Polygon (5) |
| Registros DBF | 226; 225 códigos de cuatro dígitos únicos y 1 de otro formato |
| Pallatanga | DPA 0608, Chimborazo, DPA_ANIO 2026; Polygon, 60532 puntos, 1 parte |
| Guayaquil | DPA 0901, Guayas, DPA_ANIO 2026; MultiPolygon, 35532 puntos, 10 partes |
| Topología de ambos pilotos | Válida en coordenadas fuente y tras reproyección a WGS84, sin reparación |
| Puntos aproximados de modelo documentados en M2 | Cubiertos por sus polígonos fuente; no son domicilios/estaciones |
| CRS leído del PRJ | WGS 84 / UTM 17S, EPSG:32717 |
| CRS indicado por PDF | EPSG:4326, junto a descripción UTM: contradicción pendiente |

**No se deduce el número de cantones** de los 226 registros o 225 códigos numéricos.
Falta reconciliar zonas especiales, clasificación de unidades y versión nacional
contra catálogo oficial. La validez GEOS de dos geometrías no prueba topología
nacional, fronteras jurídicas, precisión de amenaza ni licencia de publicación.

El metadato registra aprobación de marzo 2026 y creación 31/03/2026; no se sustituye
por la fecha del ZIP/RAR, DPA_ANIO o captura. Se conservan hashes diferenciados del
RAR, PDF, PRJ, DBF, SHP e índices para reproducir la comprobación local. No se
distribuyen aquí geometrías, textos completos del PDF ni datos de ciudadanos.

## Efecto sobre el gate

Se dispone ahora de polígonos institucionales reales para investigación y
corroboración adicional de los dos códigos. Persisten discrepancia de metadatos
CRS, alcance de autorización de publicación y validación de catálogo/versiones.
Por ello no se cambian `geometry:null`, `boundaryVersion:null`, estado territorial
unverified ni los flags apagados. No se publica mapa ni se infiere inundación,
deslave, riesgo bajo o cobertura por barrio a partir de esta evidencia.

Las aclaraciones concretas quedan preparadas como borrador CONALI en
[solicitudes institucionales](../research/solicitudes-datos-inamhi-sngr.md), **sin enviar**.
