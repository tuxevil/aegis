# INAMHI: corrección temporal y reprocesamiento offline — 30/10/2026

Informe sanitizado. No contiene el PDF oficial, imágenes, texto completo, índices,
identificadores privados, evaluaciones completas ni autorizaciones reutilizables.
Base: PR #42, HEAD `53e9b79`, abierto y CI Node22/24/container aprobada al iniciar.
La autorización de consulta única ya fue consumida: **cero nuevas consultas**.

## Diagnóstico comprobado

Se verificaron tamaño y SHA-256 de los bytes archivados antes de extraer texto
con PDF.js. El parser anterior reconoce número/emisión/nivel, pero deja ambos
extremos de vigencia nulos. La vista renderizada offline coincide con el texto
extraído para esas fechas: no hubo discrepancia visual temporal ni necesidad de OCR.
PDF.js entrega fragmentos de glifos; `joinPdfItems` ya conserva sus espacios/EOL
correctamente y no requiere cambios. La maquetación incluye mapa, columnas,
leyendas y prosa regional: concatenar sus menciones no demuestra cobertura.

Dos regresiones se ejecutaron **antes** de corregir el código y fallaron:

- La regex antigua exige día inicial sin mes; rechaza un mes inicial explícito.
- Construye ambos extremos con mes/año finales: para un inicio día29 y final
  día1 de noviembre produce incorrectamente un inicio29 de noviembre. No debe
  resolver la incoherencia inventando octubre. Diciembre/enero también requiere
  interpretar cada extremo independientemente.

La reproducción mínima es `node --test hazards/inamhi-dates.test.js`; las primeras
dos pruebas documentan esos errores. El registro rojo original permanece privado.
Los fixtures públicos son texto/PDF **sintéticos**, generados por el proyecto.

## Contrato de interpretación

`hazards/inamhi-dates.js` separa detección del bloque, extremos y calendario.
Parser nuevo: `inamhi-pdf-1.1.0`. No contiene reglas por número de boletín.

- Hora antes del día o día antes de la hora; separadores H/h/:, minutos de dos
  dígitos, espacios/EOL y fragmentos numéricos dentro de tokens delimitados.
- Solo repara espacios internos de nombres conocidos de meses; no concatena
  palabras/números arbitrarios ni hace OCR. Mantiene texto original de vigencia
  en `details.temporalExtraction`, con estado, zona, base PDF.js y reglas aplicadas.
- Calendario moderno2000–2099, zona `America/Guayaquil`; conversión UTC-05
  comprobada con `Intl` y validación inversa de cada componente. Fechas imposibles,
  horas inválidas, ventana vacía/invertida o varias vigencias quedan desconocidas.
- Un mes omitido solo puede compartir el mes explícito del otro extremo. Nunca
  retrocede al mes anterior para salvar el rango. Ambos meses ausentes: desconocido.
- Un año omitido comparte el explícito. Solo diciembre→enero explícitos permiten
  inferir el año contiguo. Sin ningún año explícito no se usa reloj/emisión como
  sustituto. Toda inferencia exige ventana positiva de como máximo31 días;
  rangos mayores con campos omitidos permanecen desconocidos. Esta es una
  gramática acotada de boletines, no un intérprete universal de lenguaje natural.
- `coveredAreaNames` distingue una lista provincial explícita y completa bajo
  `ZONAS AFECTADAS:` de `areasMentioned`. Prosa, zonas parciales, calificadores,
  continuaciones no reconocidas y mapas no generan cobertura. La lista nunca
  produce resolución cantonal/barrial. Campos nuevos opcionales: archivos v1
  anteriores siguen siendo legibles, sin reescribirlos ni certificar su geografía.

## Resultado real y comparación

Reprocesamiento efectivo: **2026-10-30T00:22:17.877Z**, solo en contenedor
`network:none`, sin puertos, con0.5CPU/384MiB, filesystem de lectura, capacidades
eliminadas y almacenamiento privado. La fuente original se montó **solo lectura**.
Se trabajó en una copia privada nueva; el volumen de la descarga sigue intacto.

| Elemento | Original | Nueva interpretación |
|---|---|---|
| Boletín |84|84|
| Emisión UTC |2026-10-28T20:00:00.000Z|sin cambio|
| Inicio UTC |desconocido|2026-10-29T18:00:00.000Z|
| Final UTC |desconocido|2026-11-02T04:00:00.000Z|
| Nivel **oficial INAMHI** |MEDIO–MUY ALTO|sin cambio|
| Calidad al capturar |unknown|partial|
| Guayaquil |unknown|unknown; territorio no demostrado|
| Pallatanga |unknown|unknown; territorio no demostrado|
| Candidatos |0|0|

La única inferencia temporal aplicada al documento fue compartir el año final
con el inicio. Los dos meses están explícitos. Se mantienen bloqueos de mapa,
cobertura territorial y derechos de publicación. El nivel oficial no es una
estimación propia de daño, probabilidad ni predicción de inundación.

El archivo original y primera interpretación permanecen byte a byte iguales.
La nueva entrada tiene `operation=reprocess`, referencia a la captura original,
mismo hash/fecha de captura, parser nuevo y `processedAt` efectivo. Hay **dos
interpretaciones y un artefacto único**. `sequence` pasa1→2; `revision` de contenido
permanece1 porque los bytes no cambiaron. No se inventa una nueva versión del PDF.
No se copia la duración HTTP al reprocesamiento: `transport=null`.

La selección al corte histórico excluye la nueva entrada como todavía no conocida;
los resultados históricos y `manual-result.json` originales se conservan. Comparar
ambas interpretaciones al nuevo corte mantiene ambos pilotos desconocidos.

Respaldo antes/después, verificación de manifiesto y restauración en raíz nueva
satisfactorios: dos entradas/un artefacto, registros idénticos y evaluaciones
reproducidas exactamente. Una comprobación posterior con el código final volvió
a normalizar los mismos bytes y obtuvo exactamente el envelope archivado, sin
crear otra revisión. El reprocesador verifica todo el archivo antes de escribir.

Una primera preparación falló al cargar el worker PDF.js antes de crear la copia
procesable. Se conservó el log privado. Montar solo el código `hazards/` sobre la
imagen, conservando sus dependencias nativas, permitió completar el proceso.
No se ignoró un fallo de integridad ni se alteró la evidencia para superarlo.

## Duración HTTP

El índice original contiene el **entero `elapsedMs:3164`**. `SourceHttp` resta
relojes en milisegundos desde antes del fetch hasta la lectura completa del cuerpo.
Presentación inequívoca: **`3164 ms (3.164 s)`**; no3.164milisegundos.
La medición incluye el transporte/pasos de fetch, no PDF.js/archivo/evaluación.
El scheduler registró5017ms para la operación ampliada; es una magnitud distinta.
Se prueba la diferencia3164ms con reloj/transporte simulados. El índice y el informe
privado histórico no se reescribieron para cambiar puntuación.

## Reproducibilidad sin credenciales

```sh
npm ci
npm run check
node --test hazards/inamhi-dates.test.js hazards/inamhi-reprocessing.test.js
npm test -- --test-concurrency=2
python3 -m unittest discover -s tests -p test_source_envelope.py
```

Para un operador autorizado, el mecanismo existente es
`node scripts/ingest-hazards.mjs --data-dir=PRIVATE_COPY --reprocess=CAPTURE_ID`,
sin `--live`, dentro del perfil offline. Verificar primero y usar raíces nuevas
para snapshots/restauración con `scripts/backup-aegis.mjs`. Nunca introducir
rutas privadas/PDF en Git ni reutilizar la aprobación HTTP para otra descarga.
Los tests generan sus propios PDFs y prueban integridad, respaldo/restauración,
fallo por corrupción, corte temporal y cero candidatos para simples menciones.

## GO/NO-GO

- **GO:** fechas del primer documento verificadas en bytes reales; nueva
  interpretación privada y regresiones reproducibles, original conservado.
- **GO limitado:** parser para la gramática documentada; no equivale a cobertura
  de todos los formatos INAMHI. Se requieren más documentos verificables,
  variantes de maquetación y revisiones humanas; OCR no está certificado.
- **NO-GO territorial:** sin cobertura provincial/cantonal validada del boletín
  real; ambos pilotos desconocidos y sin candidatos. No significa ausencia de riesgo.
- **NO-GO:** precisión predictiva, ingesta periódica, nueva consulta, redistribución
  del PDF y avisos públicos. Ninguna activación deriva de corregir fechas.
- Ensayo de siete días: no se detuvo, reinició ni actualizó; conserva imagen,
  inicio y deadline anteriores. No se afirma que siete días estén completos.

Validación local final: `npm ci --ignore-scripts` (0 vulnerabilidades),
`npm run check`, **485 pruebas Node** (concurrencia2), **30 regresiones nuevas**
incluidas y **seis contratos Python** satisfactorios. CI del nuevo PR valida
además Node22/24, replay, benchmark y contenedor. Consultar sus checks asociados
al HEAD antes de integrar; este informe no sustituye esa comprobación.
