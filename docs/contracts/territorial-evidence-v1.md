# Evidencia territorial v1 — anotaciones privadas offline

No es autorización de publicación ni un nuevo producto GIS. Se reutilizan
`RawArtifactStore`, su lock/archivo inmutable, verificación y backup existentes.
No hay base adicional, endpoint público, descarga, modelo de IA ni servicio.
El validador ejecutable es `hazards/territorial-evidence.js`; tests sintéticos en
`hazards/territorial-evidence.test.js`.

## Significado y confianza

`evidenceType` registra una interpretación, no convierte una anotación en hecho
oficial. Solo una conclusión verificada puede establecer cobertura en el motor.

| Tipo | Significado |
|---|---|
| `mention` | Nombre presente, incluso en leyenda, contexto o etiqueta gráfica. No demuestra inclusión. |
| `explicit_text_coverage` | Lista/afirmación inequívoca de territorios afectados, sin reducción de alcance. |
| `verified_map_coverage` | Correspondencia cartográfica revisada: leyenda, georreferenciación y límites documentados. |
| `partial_coverage` | Sectores de una provincia/región; no se extiende a todo el territorio. |
| `unknown_coverage` | Extensión/aplicabilidad no demostradas; no equivale a exclusión ni a seguridad. |

Métodos: `automatic` es extracción o inspección asistida por herramientas;
`human_annotation` es una nota de una persona; `validated_review` es revisión
explícita de una entrada previa. Estados: `unverified`, `ambiguous`, `verified`,
`rejected`. Una nota humana no puede autovalidarse. Verificar exige método de
revisión, referencia previa y un identificador pseudónimo distinto al previo.
No se afirma identidad/autoridad criptográfica: el operador local controla estos
archivos; no se aceptan mediante rutas ciudadanas. Dos alias no prueban dos
personas: la independencia real requiere revisión organizativa.

## Entrada estricta

Todas las propiedades son obligatorias; los campos indicados admiten null.
No se aceptan propiedades adicionales, flags de publicación ni código ejecutable.

- `captureId`, `sha256`, `bulletinNumber`, `parserVersion`: deben coincidir con
  una interpretación archivada de la advertencia. El origen se hereda de su
  namespace y captura; no se promueven fixtures a datos reales.
- `evidenceType`: uno de los cinco tipos anteriores.
- `location`: `page` (1–5), `region` (descripción aproximada; si son fracciones,
  declarar origen superior izquierdo). No equivale a coordenadas geográficas.
- `fragmentRef`: referencia opaca privada al fragmento/imagen. Nunca se abre,
  descarga ni interpreta como ruta desde el motor. No exige publicar el original.
- `territory`: `name`, `resolution` (`province`, `canton`, `region`, `unknown`),
  `extent` (`whole`, `partial`, `unknown`). Se comparan nombres completos
  normalizados, no substrings. Una rectificación no puede renombrar el sujeto:
  rechazar la anterior y abrir otra interpretación para otro lugar.
- `officialClassification`: clase de **esa zona** si está explícitamente
  demostrada; null cuando solo exista un rango global del boletín.
- `method`, `reviewerId`: método y alias local no personal; null para automático.
- `interpretedAt`: UTC canónico, no anterior al procesamiento de la captura ni
  posterior a la escritura. No reemplaza emisión, captura ni disponibilidad.
- `limitations`: 1–20 limitaciones no vacías; obligatorias incluso si se verifica.
- `verification`, `supersedes`: estado y UUID anterior, o null para una nota nueva.
- `cartography`: null o `{legendVerified, georeferenced, crs, boundaryVersion,
  geometryRef}`. CRS, versión y referencia admiten null si no están verificados.
  Verificar cobertura por mapa exige todos esos controles positivos. Son
  atestaciones revisadas con referencias, no validación geométrica automática.
  El operador debe comprobar procedencia/licencia/CRS de los límites antes de
  afirmarlos; no basta escribir nombres de datasets en un JSON.

La escritura añade `version:1`, UUID, secuencia y `recordedAt` real, además de
`publicationBlocked:true`, `alertsPublishEnabled:false`, `dispatchMode:DRY_RUN`.
Se conserva en `sources/.../territorial-reviews/UUID.json`, modo privado600/700,
con capacidad máxima1000 entradas, entrada16KiB y registro leído máximo20KB.
No hay borrado/overwrite; corregir/rechazar añade otra entrada bajo el mismo lock.
El límite añade como máximo unos20MB al archivo, aparte de los PDFs.

## Resolución, historial y límites

Se seleccionan entradas conocidas por `recordedAt` e `interpretedAt` al corte,
ligadas al hash, número y **linaje de captura**. No se transfieren solo por hash
entre capturas independientes. Se conserva el parser temporal original: las
anotaciones no requieren un tercer parseo ni nuevos bytes. Política del evaluador:
`territorial-evidence-1`, declarada también en resultados/procedencia del scope.

Una revisión sustituye a su antecedente solo desde su conocimiento efectivo.
Ramas incompatibles no se resuelven por última escritura: se mantiene unknown.
Varias notas no verificadas compatibles tampoco otorgan cobertura. Rechazo o
ambigüedad bloquean el fallback automático para el territorio correspondiente.
La implementación conservadora deja varios scopes verificados activos como
conflicto hasta que se consoliden explícitamente; no decide por voto/recencia.

Sin notas manuales, solo una lista explícita completa del parser
`coveredAreaNames` puede sustentar alcance provincial automático. Los campos
históricos `spatial.areaNames` o `areasMentioned` solos no bastan. Los archivos
v1 siguen legibles, pero no se conservan inferencias antiguas basadas únicamente
en menciones. Resultados históricos serializados no se migran; un cálculo nuevo
identifica su política. No se debe equiparar replay con otra versión del motor.

Cobertura provincial conserva precisión provincial al consultar un cantón. No
crea límites cantonales, una clasificación local ni probabilidad de afectación.
Sectores parciales/regiones/etiquetas no se convierten en cobertura cantonal.
TTL, vigencia, calidad y publicación se evalúan además e independientemente:
una nota nueva no rejuvenece la captura. El resultado explica revisiones usadas,
resolución, método, limitaciones y motivos de rechazo, incluso si la fuente es vieja.
Las referencias privadas completas se consultan en el archivo, no en un portal.

## Operación y contribuciones

Trabajar siempre sobre **copia privada nueva**, con el original en solo lectura,
perfil `network:none`, sin puertos y con DRY_RUN. Verificar antes y después:

```sh
node scripts/ingest-hazards.mjs --data-dir=PRIVATE_COPY --verify
node scripts/territorial-review.mjs --data-dir=PRIVATE_COPY --annotation=PRIVATE_NOTE.json
node scripts/ingest-hazards.mjs --data-dir=PRIVATE_COPY --verify
```

Obtener historial mediante `await store.territorialReviews()`; comparar los JSON
por UUID/secuencia y usar `supersedes` al rechazar/revisar. `assessArchive` carga
las notas verificadas por el lector; no habilita transporte ni publicación.
Backup/restauración: `scripts/backup-aegis.mjs`, destino siempre nuevo y fuente
quiescente. Su verificación de dominio incluye estas notas por `store.verify()`.
La ausencia del directorio significa historial vacío, compatible con archivos v1.

Pruebas sin credenciales: `node --test hazards/territorial-evidence.test.js`.
Generan sus propios PDFs y notas ficticias; no redistribuir documentos oficiales
como fixtures. Revisar siempre controles negativos, cortes históricos, linaje,
conflictos, backup/restauración y procedencia, no solo cantidad de candidatos.
