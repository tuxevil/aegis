# PR-11 — Explorador de cota e infraestructura

EXPLORER_3D=false, requiere PUBLIC_API_V1. /explorer/ empieza en 2D/texto; el
esquema opcional se importa solo tras gesto humano. Sin dependencia, WebGL, tiles,
DEM, imágenes o datos geográficos nuevos. [Investigación/licencias](../research/aegis-5-terrain-sources.md).
No se atribuye un esquema propio a datos de terreno que no se han incorporado.

## Observación y referencias

GET /api/v1/infrastructure proyecta únicamente cota Mazar, fecha original,
frescura y hasta 200 puntos de 72 horas del HistoryStore v4. Reutiliza loader/caché
CELEC existentes; no duplica fuentes, timers o persistencia. Origen de observación:
https://generacioncsr.celec.gob.ec/. La política TLS heredada de esa fuente de v4
mantiene su limitación, documentada en SECURITY.md; no se presenta como validación
nueva de certificado o licencia. No MAC, IDs privados, error remoto o dato climático
local entran en esta proyección. Datos nulos/desactualizados/fallo de actualización
se muestran explícitamente; nunca sustituir por cero o rejuvenecer observación.

Eje en metros, no escala de reserva. 2115 referencia de seguridad de AEGIS separada
2098 mínimo de diseño y 2153 máximo de diseño, con ficha técnica CELEC enlazada.
2115 permanece invariante del repo y requiere revalidación documental operativa;
no orden de parada ni instante/probabilidad de apagón. Ni altura, ni diferencia de
metros, ni posición en eje se convierten en porcentaje de volumen, MWh o autonomía.
Lectura histórica cambia solo marcador/dato/fecha; no reconstruye un vaso sumergido.

## Ilustración progresiva

Malla matemática propia con proyección isométrica, Canvas2D y controles de teclado.
Marca persistente «Esquema ilustrativo · sin batimetría» dentro/fuera del canvas.
No DEM real, frontera de embalse, llenado ficticio por nivel ni coordenadas de un
punto doméstico. 26 líneas de 13 puntos; sin animación, loop residente, textura,
WebGL o descarga externa. Giro solo por input; cerrar devuelve foco al botón.
Canvas no disponible/import bloqueado => tabla/2D/texto siguen utilizables.

Copernicus/SRTM/Sentinel solo investigados, no descargados/importados: DSM con aguas
aplanadas no provee batimetría; datum y licencia deben validarse antes de geometría
real. La entrega es piloto educativo aproximado. Cualquier terreno geográfico real
requiere AOI/fecha/checksum/CRS-datum/licencia/atribución/método/incertidumbre revisados.

Coca Codo: flujo conceptual captación→desarenado→conducción/compensación→generación/
restitución; central a filo de agua con compensador, no lago estacional como Mazar.
Sin concentración de sedimentos o caudal actual si no hay fuente fechada; no usar
caudal de diseño como medición, mínimo o alerta. Se enlaza la ficha técnica CELEC.

## API, calidad y rollback

GET explícito y schema cerrado sin query, rate limit60/min, no-store; otros métodos
mantienen política v4. UI CSP self y sin Storage/permisos. Estado current hasta dos
horas de fecha original, stale si supera o es futuro incompatible; missing sin valor
fechado; failed si falla actualización con lectura previa. generated_at es consulta,
no fecha de medición. Observation array conserva timestamps originales.

EXPLORER_3D=false + reinicio oculta UI/API sin borrar historial JSON/SQLite. Sin
migración adicional. Próximo PR-12 decide modelo cota-volumen solo con curva validada;
si no, NO-GO y mantener volume_model unavailable sin inventar reserva útil.
