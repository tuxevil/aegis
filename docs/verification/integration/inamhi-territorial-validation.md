# Boletín INAMHI84 — validación territorial offline, 30/10/2026

Informe público **sanitizado**, sin PDF, imágenes, texto completo ni notas privadas.
Base comprobada: PR #43 abierto, `cd32b9a`, CI Node22/24/contenedor aprobada;
#42 conserva `53e9b79` y dependencia #41. No se fusiona a main.

## Evidencia examinada y conclusión

Se verificó nuevamente el SHA-256 de la captura existente. Solo se procesaron
esos mismos bytes, sin GET. Inspección local de la única página mediante PDF.js,
render completo y ampliación del mapa dentro de contenedor sin red, sin puertos,
CPU0.5/RAM384MiB y original montado solo lectura. Sin API externa de visión.

El documento combina mapa nacional, tabla regional de precipitación/clases,
leyenda de achurado, descripción y una sección de zonas afectadas. No todas las
menciones son cobertura: hay sectores occidentales/interiores y estribaciones,
sin límites precisos que permitan extenderlos a provincias/cantones completos.

**Guayas** aparece explícitamente en la sección de zonas afectadas del Litoral;
es una evidencia más específica que una mención incidental. Sin embargo, no se
certificó extensión de toda la provincia, inclusión cantonal ni clase local.
**Chimborazo aparece como etiqueta gráfica del mapa, aunque PDF.js no lo incluye
en el texto extraído.** Esta diferencia impide concluir ausencia del documento a
partir de búsqueda textual. No se encontraron etiquetas cantonales de los pilotos
que permitan una correspondencia geográfica validada.

El mapa usa colores de clases junto a una tabla y un achurado de saturación con
significado distinto. Su reconocimiento visual no certifica ubicación/clase para
un cantón. No se verificaron CRS, escala, geometría georreferenciada ni versión
oficial de límites administrativos; las áreas de pilotos en `areas.js` tampoco
poseen polígonos validados. No se extrajeron polígonos, no se cruzaron límites no
verificados ni se asignaron clases por coordenadas/píxeles aproximados. El rango
global **MEDIO–MUY ALTO** pertenece al boletín; no es una clase cantonal ni
probabilidad propia de AEGIS.

## Implementación y reproducción privada

[Contrato v1](../../contracts/territorial-evidence-v1.md): cinco tipos de evidencia,
método/estado separados, referencia a bytes/interpretación, página/fragmento,
extensión, clasificación local nullable, limitaciones, revisión y conocimiento.
Notas JSON inmutables, bajo el lock/verificación del archivo existente; CLI
mínimo offline, sin DB, dependencia nueva, rutas públicas ni interfaz GIS.

Se registraron **seis entradas privadas**: cuatro observaciones iniciales, una
revisión trazable de la nota de Pallatanga tras ampliar el mapa y una mención
gráfica de Chimborazo. Todas son automáticas/no verificadas o ambiguas: **no se
inventó un revisor humano ni una aprobación cartográfica**. La revisión gráfica
conserva la nota anterior y sus evaluaciones. Una persona deberá revisar documento,
leyenda, correspondencia territorial y condiciones de geometrías para validar.

Las dos interpretaciones temporales siguen iguales, mismo PDF/hash y captura;
no hubo tercer reprocesamiento temporal. Las notas se asociaron a la interpretación
`inamhi-pdf-1.1.0`, con sus propias fechas efectivas. Cortes anteriores a las notas
y a su revisión gráfica producen exactamente las mismas evaluaciones dentro de
`territorial-evidence-1`. Esto no afirma igualdad binaria entre versiones distintas
del motor: los resultados serializados de #43 se conservan sin migrarlos. Respaldos
antes/después y restauraciones en raíces nuevas conservaron registros/notas y
reprodujeron evaluaciones; el volumen de la descarga quedó intacto.

La primera comprobación privada esperaba un rechazo territorial antes del TTL,
pero la captura ya superaba su TTL existente de **una hora**. Se conservó el fallo
de aserción y las notas; no se reescribieron ni duplicaron para ocultarlo. El motor
mantiene el rechazo por antigüedad y ahora adjunta también la explicación territorial.
No se cambió TTL, vigencia ni umbral para obtener un resultado favorable.

## Comparación de pilotos

| Elemento | Guayaquil anterior → nuevo | Pallatanga anterior → nuevo |
|---|---|---|
| Estado |unknown → unknown|unknown → unknown|
| Fuente |mismo PDF/interpretación temporal|mismo PDF/interpretación temporal|
| Evidencia nueva |Guayas en sección afectada; extensión no certificada|Chimborazo como etiqueta gráfica, no texto PDF.js; cantón no localizado|
| Precisión demostrada para el piloto |desconocida|desconocida|
| Clase oficial local |no demostrada|no demostrada|
| Rango oficial global |MEDIO–MUY ALTO, sin cambio|MEDIO–MUY ALTO, sin cambio|
| Bloqueos al corte actual |captura vieja + revisión territorial no verificada|captura vieja + revisión territorial no verificada|
| Candidatos |0 → 0|0 → 0|

La clasificación temporal del envelope sigue partial, calculada al capturar;
la frescura operacional se calcula al corte actual y ahora es stale. No se afirma
que el boletín esté expirado solo porque la captura superó el TTL. Ausencia de
cobertura demostrada nunca equivale a ausencia de riesgo.

## Pruebas y criterios GO/NO-GO

Fixtures sintéticos: leyenda/contexto, lista explícita, calificadores, nombres
parecidos, ausencia, mapa sin leyenda/georreferenciación, notas no verificadas,
revisiones contradictorias, rechazo, cortes históricos, linaje, metadatos
incompletos, integridad/restore, TTL y CLI fail-closed. La regresión temporal de
#43 distingue rechazo por territorio de rechazo por edad efectiva de captura;
no se debilitó una barrera para mantener un test dependiente del reloj.

| Actividad | Decisión |
|---|---|
| Identificación textual/gráfica |GO acotado: procedencia y límites registrados, no fiabilidad universal|
| Interpretación cartográfica aplicable |NO-GO: falta validación independiente de leyenda/correspondencia/georreferencia|
| Cobertura provincial completa del boletín real |NO-GO: no certificada; preservar descripciones parciales|
| Cobertura cantonal de ambos pilotos |NO-GO: no demostrada|
| Candidatos internos con este documento |NO-GO al corte actual; cero, sin rejuvenecer la captura|
| Validación predictiva |NO-GO: software íntegro no demuestra precisión de anticipación|
| Publicación/redistribución/ingesta periódica |NO-GO; autorización GET consumida, sin activaciones|

No se alteró el ensayo siete días, main, Proxmox, firewall ni producción.
`ALERTS_PUBLISH_ENABLED=false`, DRY_RUN y bloqueo de publicación se conservan.

Validación local ejecutada: `npm ci --ignore-scripts` (0 vulnerabilidades),
`npm run check`, **501 pruebas Node** (concurrencia2), **16 regresiones nuevas**,
**seis contratos Python** y comparación del benchmark sintético satisfactorios.
Los indicadores sintéticos no demuestran precisión predictiva. CI del PR añade
Node22/24 y ejecución del contenedor; comprobar sus resultados sobre el HEAD.
