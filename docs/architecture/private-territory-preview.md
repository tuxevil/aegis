# Proyección privada de colecciones territoriales

El archivo de investigación conserva páginas de polígonos y manifiestos completos,
pero no tenía una salida verificada/acotada para revisión visual. Este incremento
provee ese límite de lectura y una vista gráfica autenticada, sin convertirlo en
publicación de capas ni activar un mapa público.

`TerritoryPreviewReader({store})` exige namespace layers y readOnly=true. `read`
acepta exclusivamente fuente de capa registrada, piloto, limit 1–50 y offset
entero 0–100000. No admite URLs, geometrías de entrada, reproyección ni reparación.
Selecciona la última colección del grupo fuente/piloto, o una snapshotId explícita
de ese mismo grupo para paginar, y verifica checksum,
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
y fuente original. Las rutas públicas de hazards siguen sin geometrías.

## Verificación

Pruebas con archivo físico sintético: paginación/procedencia, otro piloto,
archivo ausente sin inicializar, presupuestos, datos corruptos, vínculo de
colección incorrecto pese a checksum recalculado, colección vacía, permisos,
no sobrescritura y destino dentro del archivo rechazado. Captura/archivo y
observations.json no se migran. No se solicitaron geometrías reales ni hubo HTTP.

## Vista de revisión autenticada

Con ALERTS_ADMIN_ENABLED y credenciales editoriales válidas, /editorial/territory/
consulta GET /api/admin/alerts/territory con sourceId de las dos capas registradas,
area piloto y paginación. Usa el archivo layers/readOnly del DATA_DIR por defecto;
no inicializa archivos ausentes ni sustituye capturas reales por fixtures. Una
inyección de servicio de laboratorio debe coincidir en origen con sourceStore.

El endpoint exige Bearer también en localhost, valida campos cerrados, limita
solicitudes y responde no-store. Los errores no devuelven geometrías parciales ni
rutas privadas. HTML/JS/CSS son una carcasa sin datos: la geometría requiere sesión.
Con el flag OFF no se registran vista ni endpoint. No cambia ningún GET público.

La vista es un esquema local SVG de la página, sin mapas/tiles externos, límites
administrativos inferidos, medición de distancias o colores de peligro. Conserva
huecos/multipartes, muestra categoría literal, DPA, propietario, fecha, referencias
y estado de topología/estabilidad/permiso. El resaltado representa selección,
no severidad. Lista accesible equivalente y atributos por objeto. La selección
de otro piloto o un fallo limpia el mapa anterior; colección desconocida no es
cero susceptibilidad. El token solo vive en memoria; logout/401 y respuestas tardías
no conservan ni repueblan geometría privada. CSP self, texto seguro y SVG creado
solo con coordenadas numéricas verificadas, sin HTML/SVG fuente interpretado.

Pruebas HTTP con archivo sintético verificado y Bearer; parámetros extra, corrupción,
archivo ausente, cache y CSP. JSDOM cubre huecos, selección, texto no confiable,
paginación, geometría inválida y revocación/respuesta tardía. Chromium 320/1280
probó esquema, selección, referencia expandida, fallback por piloto, teclado y
logout, sin overflow/page errors ni red externa. Artefactos solo sintéticos y
privados. Esto no certifica cartografía real ni autoriza publicar capas SNGR.

## Paginación fijada a colección

El navegador conserva snapshotId entre páginas, incluyendo volver a la anterior.
Una captura posterior no reemplaza la versión bajo revisión. Cambiar fuente/piloto
o pulsar Consultar archivo privado reinicia offset y selecciona explícitamente la
colección más reciente; logout elimina también esa referencia. Una respuesta de
otra capa, territorio o colección fijada se descarta y limpia el esquema.

El endpoint acepta snapshotId UUID canónica opcional, ligada a fuente/piloto/origen;
un ID ajeno o desconocido devuelve 404, sin fallback a otra colección. El lector
verifica exactamente la colección elegida, no la última de manera incidental.
El CLI offline admite --snapshot=UUID para reproducir esa misma revisión; mantiene
los controles de salida privada/exclusiva y no modifica el archivo de origen.

Probado con dos colecciones físicas sintéticas: la página 2 de la primera sigue
con su manifiesto original al entrar la segunda. CLI, API y DOM cubren selección
explícita, ID inválido/inexistente y consulta nueva, sin descargar datos reales.
