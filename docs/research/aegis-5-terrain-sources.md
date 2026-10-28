# PR-11 — investigación de terreno e infraestructura

Consulta: 2026-10-22. Borrador para revisión; no se descargaron tiles, imágenes satelitales ni datasets grandes, ni se solicitaron cuentas o permisos. No habilita despliegue ni valida una cartografía local.

## Decisión

GO para una representación educativa 2D y un prototipo 3D explícitamente aproximado, con datos observados separados de geometría ilustrativa. NO-GO para etiquetar esa geometría como batimetría, frontera cartográfica validada, porcentaje de agua útil o energía disponible. Sin un recorte real revisado, utilizar un esquema propio sin coordenadas fingidas ni atribución a un DEM que no se incorporó.

## Inventario primario

| Recurso | Qué acredita | Uso y límites |
| --- | --- | --- |
| [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) | GLO-30/GLO-90 globales; DSM de adquisiciones 2011–2015, con posibles rellenos anteriores; vegetación y edificios incluidos; aguas aplanadas | Candidato a relieve exterior, nunca fondo del embalse. Acceso libre con licencia y atribución; el portal indica registro para su descarga. No se ha obtenido un tile. |
| [Manual Copernicus DEM, versión 5](https://dataspace.copernicus.eu/sites/default/files/media/files/2024-06/geo1988-copernicusdem-spe-002_producthandbook_i5.0.pdf) | Especificación del producto | Revisar resolución, datum vertical, máscaras y errores antes de combinar con cotas operativas. No asumir igualdad de datums. |
| [USGS SRTM](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm) | Muestreo global de aproximadamente 30 m; WGS84 horizontal, EGM96 vertical; metros | Candidato alternativo al relieve. La fecha histórica y precisión impiden presentarlo como levantamiento actual. |
| [NASA guía SRTM](https://www.earthdata.nasa.gov/s3fs-public/2025-05/SRTM_Quick_Guide.pdf?VersionId=ZDrZprebSzTuJdC57vPsRXhuXU3S1OZK) | Distribución de un segundo de arco; diferencias de versiones, rellenos y aguas aplanadas | Fijar versión y procedencia de cada píxel/relleno; no trasladar licencia de un producto a otro. |
| [Sentinel-2, Copernicus](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2) | Bandas a 10/20/60 m; productos gratuitos | Candidato a delineación visible fechada, no frontera permanente ni batimetría. Exigir escena concreta, máscara de nubes, método y revisión. |
| [Aviso de licencia Sentinel](https://cds.climate.copernicus.eu/licences/ec-sentinel), [términos del portal](https://dataspace.copernicus.eu/terms-and-conditions) | Datos Sentinel abiertos para usos legales; contenido general del portal tiene condiciones distintas | Atribuir los datos originales o modificados según el aviso vigente. No reutilizar una captura del portal como si tuviera la licencia del dataset. |

Para derivados GLO-30 debe preservarse el aviso oficial de modificación publicado por Copernicus. El texto de ese aviso supera el límite de cita de este borrador: copiarlo del documento de licencia al incorporar efectivamente el dataset y registrar versión, URL, fecha y checksum. Atribución recomendada al origen DOI: `10.5270/ESA-c5d3d65`.

## Mazar y Coca Codo

La [ficha de CELEC para Mazar](https://www.celec.gob.ec/celecsur/informacion-tecnica/central-hidroelectrica-paute-mazar/) publica 2098 m como mínima de diseño y 2153 m como máxima. No certifica una curva cota-volumen actual ni autoriza inferir energía a partir del nivel. El umbral 2115 m debe mostrarse separado como referencia de seguridad definida por AGENTS.md; esta búsqueda no recuperó un documento primario que lo revalide como límite operativo universal y vigente. No presentarlo como orden de parada ni predicción de apagón.

[CELEC describe Coca Codo Sinclair](https://www.celec.gob.ec/cocacodo/informacion-tecnica/central-hidroelectrica-coca-codo-sinclair/) como aprovechamiento a filo de agua, con caudal de diseño captado de 222 m³/s y desarenador. El [Ministerio describe además un embalse compensador](https://www.ambienteyenergia.gob.ec/central-hidroelectrica-coca-codo-sinclair/). El esquema debe mostrar captación, separación de sedimentos, conducción y restitución; no negar la existencia del compensador ni dibujarlo como lago de reserva equivalente a Mazar. El caudal de diseño no es una medición actual, caudal mínimo ni umbral de cortes. Sin fuente de sedimentos fechada, solo explicar el proceso; nunca inventar turbidez o concentración.

## Gate de implementación y publicación

- Cota observada: valor, unidad, fecha original y fuente; ausente/desactualizada explícita, sin sustituir por cero ni confundir la fecha de carga con medición.
- Esquema aproximado: leyenda persistente y marca «Representación aproximada · sin batimetría». Si el render no usa DEM real, decir «esquema ilustrativo», nunca «terreno medido».
- Fallback 2D/textual por defecto; 3D por gesto, sin WebGL o con recursos limitados conservar todos los datos y explicaciones; sin descarga de escenas o dependencias pesadas.
- No rellenar un vaso ficticio según cota ni interpolar «reserva». Diferencia de altura puede expresarse en metros, jamás como porcentaje de energía o días restantes.
- Antes de publicar geometrías reales: archivo, checksum, licencia de redistribución, adquisición, procesamiento, CRS/datums, precisión, AOI y revisión humana. Estos gates siguen pendientes.

