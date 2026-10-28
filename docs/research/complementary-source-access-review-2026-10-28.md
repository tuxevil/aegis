# Revisión documental de fuentes complementarias — 28 de octubre de 2026

**M0 complementario; documentación pública, sin consulta de datos.** Consulta realizada mediante navegador de investigación el **2026-10-28**, finalizada aproximadamente a las **13:58 UTC**. Se leyeron las once páginas oficiales enlazadas abajo: devolvieron contenido legible; la herramienta no aportó códigos HTTP, latencias ni hashes de bytes, por lo que no se presentan como sondas HTTP verificadas. No se usaron claves, cuentas, formularios, endpoints de datos, imágenes radar ni solicitudes de acceso. No se modifican conectores ni activan tareas.

Esta revisión actualiza el contraste planteado en [metodología y fuentes](amaru-methodology-open-sources-2026-10-27.md), complementa los [resultados de sondas](source-validation-results.md) y distingue **licencia del dato, permiso de acceso al servicio y validación operacional**. Describe lo publicado por cada proveedor en la fecha de consulta; no acredita permisos concedidos a AEGIS ni sustituye la revisión institucional pendiente. No se midieron salud de las APIs ni cobertura efectiva de Ecuador, Guayaquil o Pallatanga.

## Resultado y decisión incremental

| Fuente | Acceso documentado | Licencia/condiciones documentadas | Decisión AEGIS en esta revisión |
| --- | --- | --- | --- |
| Google Flood Forecasting | Piloto con aprobación, proyecto Cloud y clave | Datos API CC BY 4.0; servicio sin coste anunciado | Sin acceso demostrado: mantener fuera del pipeline |
| RainViewer | API pública sin clave anunciada; documentación contradictoria | Uso personal/educativo; FAQ también menciona comunidad pequeña; no se verificó licencia abierta general | Mantener deshabilitado; no basar avisos en radar ni nowcast |
| MET Norway Locationforecast | API de pronóstico actual con identificación y caché | NLOD 2.0 y CC BY 4.0 salvo excepciones | Candidato futuro de contraste en sombra; no se implementa conector aquí |
| Open-Meteo | Free API solo no comercial y con cuotas | Datos CC BY 4.0; código servidor AGPLv3 o posterior | Conservar pruebas opt-in existentes y DRY_RUN; reevaluar acceso ante monetización |

Las decisiones son interpretación técnica conservadora de las fuentes descritas a continuación. No se añaden nuevos proveedores al registro habilitado ni se altera la política de publicación.

## Google Flood Forecasting

La página de acceso exige incorporación al piloto, aprobación, identificación del proyecto Google Cloud, habilitación de API y clave. Advierte que la espera puede durar meses. Anuncia servicio gratuito y datos bajo CC BY 4.0: esa licencia **no elimina el gate de acceso**. No consta aprobación para AEGIS y no se solicitó. [Google — Access & Set-up](https://support.google.com/flood-hub/answer/16364306?hl=en).

La FAQ indica 200 solicitudes/minuto; separa estaciones verificadas de otras con evaluación insuficiente o no posible. Su cobertura multinacional no demuestra disponibilidad/calidad para una cuenca o estación de los pilotos. Describe pronósticos en tiempo real y remite históricos a otros datasets: no prueba disponibilidad retrospectiva del pronóstico de octubre de 2026. También advierte cambios incompatibles durante el piloto y menciona una extensión «hasta junio» sin año inequívoco en ese texto; no inferimos fin del piloto. [Google — API FAQ](https://support.google.com/flood-hub/answer/16364606?hl=en&ref_topic=16364911).

**Pendiente:** acceso aprobado y términos concretos aplicables, identificadores/cobertura por cuenca, calidad local y evidencia temporal de respuestas autorizadas. No se inspeccionó documentación restringida ni se atribuye un caudal o probabilidad a Guayaquil/Pallatanga.

## RainViewer: contradicciones verificadas

La página de transición sitúa desde enero de 2026 la retirada de nowcast, infrarrojo satelital y colores salvo Universal Blue; establece zoom máximo 7 y 100 solicitudes/IP/minuto. Conserva radar pasado de dos horas con intervalos de diez minutos para uso personal y educativo. [RainViewer — API Transition Summary](https://www.rainviewer.com/api/transition-faq.html).

Sin embargo, `api.html` anuncia comunidad pequeña además de uso personal/educativo, mientras otra frase restringe a estos dos últimos usos. Su FAQ aún menciona nowcast, variantes de colores y ausencia de límites duros publicados, contradiciendo la transición. Anuncia acceso sin registro/clave, exige atribución visible con enlace y no ofrece SLA. **No resolver la contradicción suponiendo la condición más permisiva.** [RainViewer — API Documentation](https://www.rainviewer.com/api.html).

La documentación específica Weather Maps describe únicamente `radar.past`, dos horas/intervalos de diez minutos y zoom 7. Precisa que `frame.time` representa generación del mosaico, no necesariamente instante de observación de todos sus radares. La máscara de cobertura se actualiza con poca frecuencia. Estos metadatos no equivalen a un pluviómetro ni a precisión barrial. [RainViewer — Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html).

Los términos generales se refieren al sitio/app y excluyen garantías de exactitud, continuidad y cobertura en toda ubicación; no demuestran permiso específico de archivo/redistribución masiva por AEGIS. [RainViewer — Terms and Conditions](https://www.rainviewer.com/terms.html).

**Pendiente:** aclarar condiciones para observatorio público/avisos, derechos por proveedor, límites vigentes y cobertura útil de Ecuador. No se contactó al proveedor, no se probaron endpoints ni se promete nowcast o histórico. No se asigna CC BY a RainViewer.

## MET Norway Locationforecast

Locationforecast documenta pronóstico mundial por coordenadas para nueve días, con más variables en región nórdica. Exige User-Agent identificable; su API sirve pronósticos actuales. El archivo histórico que enlaza solo redistribuye modelos nórdicos/árticos por restricciones de licencia y remite datos globales a ECMWF. Por ello no acredita recuperación retrospectiva para Ecuador. La altitud opcional corrige temperatura y no convierte el modelo en sensor local. [MET Norway — Locationforecast](https://api.met.no/weatherapi/locationforecast/2.0/documentation).

La política declara datos/productos bajo NLOD 2.0 y CC BY 4.0 **salvo especificación contraria**, con atribución a MET Norway. No debe extenderse automáticamente esa licencia a cualquier histórico global o ilustración. [MET Norway — Licensing and Data Policy](https://api.met.no/doc/License).

Sus términos exigen identificación real de aplicación/contacto, HTTPS, caché y respeto de `Expires`/`Last-Modified`, consultas condicionales, tráfico distribuido y coordenadas truncadas a máximo cuatro decimales. Más de 20 solicitudes/segundo por aplicación requiere acuerdo especial; eso no justifica polling innecesario por debajo del límite. No ofrecen SLA y prevén bloqueo/429; no evadirlos. El proxy backend evita exponer IP y coordenadas del visitante al proveedor. [MET Norway — Terms of Service](https://api.met.no/doc/TermsOfService).

**Pendiente:** diseñar identificación pública legítima sin credenciales/contactos personales, confirmar variables/modelo/resolución útiles para Ecuador, captura de disponibilidad y estrategia de caché antes de una sonda opt-in. No se consultó Locationforecast ni se incorpora su salida al benchmark histórico.

## Open-Meteo: dato abierto y servicio condicionado

Los términos de Free API limitan el acceso a uso no comercial: menos de 10.000 llamadas/día, 5.000/hora y 600/minuto; su tabla añade 300.000/mes. Permiten donaciones voluntarias, pero consideran comerciales las apps/web con publicidad o suscripciones y la promoción comercial. Aplican límites por IP/aplicación y no garantizan exactitud ni continuidad. Esto no autoriza una infraestructura monetizada por ser gratuito el aviso ciudadano. [Open-Meteo — Terms & Privacy](https://open-meteo.com/en/terms).

La licencia de **datos** anunciada es CC BY 4.0: atribución, enlace a licencia e indicación de cambios, sin sugerir respaldo. Pide enlace junto a los lugares donde se muestran sus datos. La misma página distingue el **código servidor**, AGPLv3 o posterior, de los datos y enlaza licencias de proveedores originales. Consultar la API no equivale a incorporar ese código al repositorio MIT. [Open-Meteo — Licence](https://open-meteo.com/en/licence).

**Pendiente:** mantener atribución y trazabilidad del modelo concreto, presupuesto de consultas y revisión del modo de financiación antes de operación pública. La revisión documental no ejecutó consultas adicionales ni demuestra publicación histórica de un run. Continúan vigentes los límites de la [captura y pruebas registradas](source-validation-results.md).

## Alcance de aceptación

Queda documentada la revisión pública complementaria exigida por M0 y una discrepancia concreta de RainViewer. Permanecen sin certificar acceso/contratos específicos, calidad local, datos históricos positivos/negativos y permisos de operación/publicación. Una página legible o una licencia de datos no acredita todos esos gates. No hay cambio de umbrales, alertas oficiales, mapas públicos, notificaciones, WAHA, producción ni merge; todo mecanismo de notificación permanece en **DRY_RUN**.
