# Fuentes y permisos operacionales — 29/10/2026

La [matriz estructurada](operational-source-matrix.json) registra nueve perfiles,
URL oficial, clase, permisos, cobertura/resolución, periodicidad, timestamps,
cuotas, degradación y verificación. **Ninguna fuente queda activada para el nuevo
observador.** No se cambia la operación existente de Grid. Esta revisión leyó
documentación pública mediante web, sin APIs de datos, claves, cuentas o polling.
Las latencias empíricas nuevas quedan null; las sondas históricas están en
[M0](../../research/source-validation-results.md), no prueban disponibilidad hoy.

| Fuente | Decisión para observación nueva | Bloqueo principal |
| --- | --- | --- |
| INAMHI | Desactivada | Permisos concretos de archivo continuo/reutilización y cadencia; no inferirlos de acceso público |
| SNGR | Desactivada, contexto estático | Licencia por capa/actualización; susceptibilidad no es pronóstico ni incidente |
| Open-Meteo/ECMWF | Condicional, aún desactivada | Acceso Free no comercial, financiación, corrida disponible verificada, aprobación/red |
| CELEC/CENACE | Preservar Grid; sin puente nuevo | Permisos/cuotas y riesgo heredado de TLS sin verificación |
| GEOGLOWS | Complementaria desactivada | Producto/API/licencia y tramos representativos aún por verificar |
| Google Flood | Desactivada | Acceso API solo para participantes aprobados; sin acceso aprobado aquí |
| MET Norway | Desactivada | Revisión/aceptación humana de términos, identificación/cache, pertinencia del producto |
| INOCAR | Desactivada | Permisos, datum/puerto/tiempos; tabla predicha no equivale a sensor |

La [comunicación INAMHI](https://www.inamhi.gob.ec/info-liberada/) de acceso público
y el [geoportal SNGR](https://www.gestionderiesgos.gob.ec/informacion-de-gestion-de-riesgos-en-linea/)
no se interpretan como una licencia universal de automatización/redistribución.
[Open-Meteo](https://open-meteo.com/en/terms) separa condiciones de acceso Free
no comercial y atribución de datos; no se adquirió plan ni se resolvió financiación.
[Single Runs](https://open-meteo.com/en/docs/single-runs-api) exige run explícito:
la hora de inicialización no demuestra primera disponibilidad.

[Google](https://support.google.com/flood-hub/answer/16364306?hl=en) limita el acceso
API a participantes aprobados; no se solicitaron credenciales. Los
[términos MET](https://api.met.no/doc/TermsOfService) requieren identificación y
cache; su [FAQ](https://docs.api.met.no/doc/FAQ.html) advierte que la aceptación
humana no se delega a IA. No se aceptaron condiciones ni se eludieron403.
[INOCAR](https://www.inocar.mil.ec/mareas/form_mareas.php) ofrece selección de puerto
y fecha, sin que eso resuelva permisos, datum o representatividad.

## Riesgo heredado de transporte energético

SECURITY.md y código documentan `rejectUnauthorized:false` en CELEC/CENACE.
**P2 residual: posible MITM**, no una explotación demostrada ni una regresión nueva.
No se verificó hoy la causa/estado de certificados ni se alteró Grid para forzar
una corrección sin comprobar continuidad. El observador nuevo no importa ese
loader ni hereda la excepción. Un futuro puente debe verificar TLS y probar
fuentes/fallos con autorización; no habilitarlo usando la excepción heredada.

## Ampliación histórica, sin fabricar métricas

Se añadió [suplemento documental](../../../replay/historical-supplement-2026-10-29.json)
para18–19/10, distinto del caso26/10. La
[nota primaria municipal del20/10](https://guayaquil.gob.ec/coe-cantonal-respuesta-lluvias-prevencion-fenomeno-el-nino/)
describe respuesta a impactos de noche18/madrugada19; su primera disponibilidad
web no está verificada. Solo se enlaza, con rol hindsight_only y outcome=null.
No se copian datos personales ni se convierte todo el cantón en etiqueta positiva.

También se leyó una
[retrospectiva ESPOL](https://www.fimcm.espol.edu.ec/es/noticias/analisis-meteorologico-y-oceanografico-el-impacto-de-las-inusuales-precipitaciones-de)
que describe el19/10 y mediciones heterogéneas. No se importan cifras como series
primarias: faltan registros originales, ventanas y disponibilidad verificables.
La página LOTAIP de Bomberos Pallatanga no pudo abrirse (herramienta devolvió500);
no prueba indisponibilidad general ni ausencia de incidentes. Búsquedas oficiales
no aportaron un negativo verificable para Pallatanga. Sus filas siguen unknown.
Ninguna retrospectiva entra en features/cortes previos o denominadores de precisión.
