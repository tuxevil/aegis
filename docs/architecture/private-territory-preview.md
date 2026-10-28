# Proyección privada de colecciones territoriales

El archivo de investigación conserva páginas de polígonos y manifiestos completos,
pero no tenía una salida verificada/acotada para revisión visual. Este incremento
prepara ese límite de lectura, sin convertirlo en publicación de capas ni activar
un mapa público. La interfaz gráfica de revisión queda como siguiente incremento.

`TerritoryPreviewReader({store})` exige namespace layers y readOnly=true. `read`
acepta exclusivamente fuente de capa registrada, piloto, limit 1–50 y offset
entero 0–100000. No admite URLs, geometrías de entrada, reproyección ni reparación.
Selecciona la última colección del grupo fuente/piloto y verifica checksum,
artefactos por SHA, conjunto exacto de IDs, vínculo contentHash y atributos DPA.
Exige normalización declarada 32717 → 4326 mediante proj4@2.22.0.

La salida cerrada solo contiene polígonos y propiedades mínimas (ID, categoría
literal, DPA y fenómeno literal), referencia de snapshot, fuente/propietario,
fechas, origen y permisos pendientes. No exporta bytes originales, storageKey,
artifactIds ni contexto de estación/credenciales. Es STATIC_EXPOSURE, DRY_RUN,
privateReviewOnly y publicationBlocked, siempre notForPrediction. La integridad
del manifiesto no certifica topología, límites administrativos o licencia. Se
preserva snapshotAtomicity (marcador de edición sin cambios o unknown); el
checksum del archivo no se presenta como garantía de instantánea del proveedor.

Colección ausente: status unknown, snapshot null y total null. Colección completa
vacía: status partial y total 0; no significa que no exista amenaza. Páginas
limitadas no representan cobertura total. No confundir hasMore con truncamiento
de la fuente: se verificó todo el manifiesto antes de paginar la proyección.

Máximo 100000 puntos/2 MB por página (configuración solo puede reducir esos topes).
Si se exceden, se rechaza la página completa: no simplifica, recorta polígonos ni
oculta agujeros para conseguir una imagen aparentemente completa. Reducir limit
o usar inspección offline especializada; no aumentar automáticamente presupuestos.

## CLI offline

```bash
node scripts/inspect-territory.mjs
node scripts/inspect-territory.mjs --data-dir=/archivo/privado \
  --source=sngr.flood.layer --area=guayaquil --limit=20 --offset=0 \
  --out=/otra/carpeta/privada/vista-nueva.json
```

Sin argumentos no hay red ni escrituras. Con argumentos solo lee el archivo y
crea una salida nueva 0600, nunca sobrescribe. Destino fuera de DATA_DIR, cotejando
rutas reales para rechazar aliases mediante symlink. No crea carpetas de archivo
faltantes. `--fixture` selecciona únicamente origen synthetic_fixture; no mezcla
almacenes ni crea fixture como sustituto de un archivo real ausente. stdout solo
resume estado, origen y paginación: no imprime geometría.

Este archivo es material privado de revisión, no un recurso web público. La
salida no es permiso de redistribuir geodatos; mantener gates de SNGR, cartografía
y fuente original. No se añadieron endpoints ni lecturas desde rutas públicas.

## Verificación

Pruebas con archivo físico sintético: paginación/procedencia, otro piloto,
archivo ausente sin inicializar, presupuestos, datos corruptos, vínculo de
colección incorrecto pese a checksum recalculado, colección vacía, permisos,
no sobrescritura y destino dentro del archivo rechazado. Captura/archivo y
observations.json no se migran. No se solicitaron geometrías reales ni hubo HTTP.
