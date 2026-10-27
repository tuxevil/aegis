# PoC retrospectivo: lluvia extrema de Guayaquil, 26 de octubre de 2026

Estado: **investigación / replay offline**, 27-10-2026. No está conectado a fuentes en vivo ni envía alertas.

## Hipótesis

Un observatorio ciudadano habría podido retransmitir **un aviso preventivo válido para la ciudad** antes del episodio de precipitación extrema de la TARDE del 26. No se presume capacidad para predecir inundaciones exactas en Samanes, Alborada ni otras calles; hubo anegamientos **desde la madrugada**.

## Evidencia fechada (hora Ecuador, UTC-05)

| Disponible públicamente a más tardar | Información que se podía conocer | Fuente |
| --- | --- | --- |
| Dom 25, 18:01 | El Universo informa sobre la advertencia INAMHI 83: lluvias de moderadas a muy intensas el lunes, posibilidad de inundación y crecida | [El Universo](https://www.eluniverso.com/comunidad/ecuador/clima-en-guayaquil-manana-pronostico-de-lluvias-del-inamhi-nota/) |
| Lun 26, 07:28 | Extra informa 18 puntos de acumulación de agua hasta las 06:00, con base en Segura EP | [Extra](https://www.extra.ec/noticia/guayaquil/seguira-lloviendo-guayaquil-lunes-26-octubre-pronostico-inamhi-165985.html) |
| Lun 26, 14:19 | Primicias informa sobre lluvias fuertes alrededor de las 14:00 | [Primicias](https://www.primicias.ec/sociedad/lluvias-tormentas-clima-inamhi-26octubre-ecuador-fenomeno-elnino-135746/) |
| Medición revelada después del evento | Ciencias Naturales: 95,3 mm entre 13:00 y 15:00, 67,3 mm en la primera hora y 148,5 mm hasta las 19:00 | [Radio Ciudad, reproducción de Ecuavisa](https://www.radiociudad.gob.ec/dos-horas-de-lluvia-en-un-sector-del-norte-de-guayaquil-dejaron-casi-tanta-agua-como-tres-dias/) |

**Regla de anti-fuga temporal:** en cada corte, el replay muestra solo eventos cuyo `publishedAt` es anterior o igual. Los valores medidos después constan solo en `hindsightOnly` y jamás se inyectan en los borradores previos. La hora del artículo es **cota pública conservadora de publicación**, no prueba de que AEGIS pudiera capturarlo por API de inmediato: todavía falta medir latencia de ingestión.

## Resultado de la primera reconstrucción

- A las 17:00 del 25/10, **sin fuentes seleccionadas** anteriores al corte, este dataset no genera borradores. Esto NO significa que no existiera ningún aviso oficial previo; solo indica una laguna de este dataset.
- A las 19:00 del 25/10, el aviso n.º 83 ya estaba publicado en prensa. Habría permitido un **aviso de preparación general para Guayaquil** con 18 h y 59 min antes del inicio de la ventana de lluvia extrema de la tarde (13:00–15:00).
- A las 08:00 del 26/10, ya era público el reporte de inundaciones nocturnas, además de la advertencia. Hasta las 13:00 quedaban 5 h y 32 min, pero no se debe llamar a ese reporte «alerta anterior a las inundaciones»: ¡las inundaciones ya habían empezado!
- A las 14:00, la publicación de las 14:19 aún no podía utilizarse, aunque el temporal ya estaba en curso.

**No son resultados de backtesting predictivo:** es un ensayo de oportunidad de retransmisión, con fuentes escogidas tras el evento. No cuantifica aciertos, falsas alarmas, audiencia expuesta ni entrega efectiva de notificaciones. Tampoco identifica la hora exacta en que empezaron las inundaciones en cada barrio.

## Ejecutar

Node >=22 desde la raíz del repositorio:

```sh
node scripts/replay-guayaquil.mjs
node --test replay/engine.test.js
# También forma parte de npm test gracias a node --test
```

Admite cortes personalizados como `node scripts/replay-guayaquil.mjs 2026-10-25T19:00:00-05:00`.

Las salidas son **borradores**, nunca solicitudes de publicación. `planChannelOutbox` crea un plan con `dispatchMode=DRY_RUN` y clave idempotente por ciudad/evento. No usa credenciales, red ni ninguna sesión real de WhatsApp.

## Qué falta para afirmar utilidad real

1. Recuperar el PDF original de la advertencia INAMHI 83 con su fecha de emisión, revisiones, vigencia y cartografía histórica. No inferir la fecha exacta de emisión del inicio de vigencia.
2. Capturar feeds automáticamente en adelante y conservar versiones crudas, marcas de origen, recepción y transformación (hash, licencia y caducidad).
3. Validar el mapeo espacial del aviso regional a la ciudad; distinguir previsión de lluvia, exposición e impacto.
4. Reconstruir fuentes disponibles antes del evento (pronósticos almacenados, avisos, estaciones, nowcasting) sin incluir información posterior.
5. Comparar con eventos sin inundación y con lluvias no anticipadas para medir precisión, falsas alarmas y retrasos.
6. Someter mensajes críticos y reglas a revisión humana, con mecanismos de rectificación y seguimiento.
7. Instrumentar delivery y suscripción con consentimiento. Medir envío, errores y recepción; nunca afirmar que un ciudadano recibió un aviso por el mero hecho de publicar en un canal.

## Criterio de salida

El primer hito estará cumplido cuando se produzca **de forma reproducible y sin datos futuros** un aviso general antes del temporal, acompañando fuente, fecha, ámbito geográfico y limitaciones. La capacidad para predecir inundaciones urbanas específicas queda **expresamente fuera de alcance** hasta validar hidrología, susceptibilidad local y datos suficientes.

Para la distribución por WhatsApp, ver [diseño de canales](../design/whatsapp-ciudades.md).
