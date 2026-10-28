# Procedencia espacial de la celda de pronóstico

C04 exige conservar gridLatitude/gridLongitude, además del punto solicitado.
Open-Meteo documenta que las coordenadas de respuesta son el centro de la celda
usada y pueden diferir del punto solicitado: [JSON Return Object](https://open-meteo.com/en/docs#json_return_object).
No corresponden a una estación ni a la dirección de un ciudadano.

El parser `multihazard-forecast-1.1.0` conserva requestedLatitude/Longitude,
gridLatitude/Longitude y gridLocationStatus. No copia el punto solicitado para
rellenar una respuesta ausente. Coordenadas faltantes quedan null/unknown;
pares incompletos, tipos incorrectos o valores fuera de rango quedan invalid.
Se conserva el payload privado, sin sustituir sus valores por ceros.

Como guardia técnica del único perfil ECMWF permitido se admite una discrepancia
máxima de 0.25 grados por eje. Es un límite de detección de respuestas gruesamente
incoherentes, generoso respecto a la malla nominal publicada de 9 km; no es una
tolerancia cartográfica validada, resolución del riesgo, pertenencia al cantón ni
umbral científico. Excederlo marca mismatch/invalid y requiere investigación;
no se aumenta automáticamente ni se prueba con él cobertura de una ciudad.
Una coincidencia aproximada conserva el blocker model_grid_not_canton_coverage.

El evaluador reconstruye esa comprobación desde URL registrada y coordenadas,
y exige consistencia con los metadatos archivados. Incluye ambos puntos en facts
de contexto/candidato, visibles para revisión humana y en identidad de edición.
No basta con que un campo del envelope diga approximate. Un registro legado sin
celda sigue legible/verificable, pero no produce propuestas nuevas de pronóstico
hasta reprocesar sus bytes con procedencia suficiente. Cambio de parser requiere
revisión nueva; no se actualiza una aprobación existente silenciosamente.

## Reproceso real sin red

El archivo de Pallatanga capturado 28/10 00:24:00.019Z se reprocesó localmente:
2 registros/1 artefacto, SHA idéntico y captura original sin cambios. Punto
solicitado (-1.99856,-78.96629), celda devuelta (-2.0738137,-79.02789), estado
approximate/partial. Los bytes no se redistribuyen y no se afirma que la celda
esté dentro del cantón. RetrievedAt y availabilityVerifiedAt originales permanecen;
procesar a 11:54:49Z no renueva TTL ni disponibilidad histórica.
[Reporte sanitizado](../verification/source-probes/2026-10-28-pallatanga-grid-reprocess.json).
Cero solicitudes de red, aprobaciones o notificaciones.

Pruebas: celda desplazada válida, ausencia/null, incompletos, strings/rangos,
respuesta muy alejada, solicitud inválida, metadatos incoherentes y registros
legados. Los fixtures sintéticos ahora declaran explícitamente su celda.
