# PR-10 — Time Machine y exportación pública

TIME_MACHINE=false por defecto. Requiere PUBLIC_API_V1, BLACKOUT_MAP y SQLite o
demo en memoria. No cambia inicio/console v4 ni crea historia. Ruta /history/ y
GET /api/v1/timeline explícitos. Sin dependencias ni migración adicional: reutiliza
snapshots inmutables del motor PR-05 y las puertas públicas/privacidad vigentes.

## Dos ejes y revisión

from/to delimita intervalo del hecho, UTC con offset obligatorio, [from,to), máximo
90 días. known_at es el instante hasta el que AEGIS conocía revisiones, no la hora
del corte. Por evento elige última revisión con recorded_at <= known_at. Nunca
usa una corrección posterior como si se hubiera conocido antes. Si no había revisión,
no hay fila; no reconstruye 2024 o eventos importados sin historial auditable.

Filas de hora desconocida se incluyen explícitamente sin afirmar ocurrencia dentro
del rango: una ausencia de hora no se transforma en hora de ingesta. Evento con
hora/fin conserva sus bases (observed/reported/official/unknown). Inicio conocido
sin fin respaldado sigue con duración null; programación nunca se contabiliza como
duración efectiva. No convertir fin programado en reposición. La naturaleza type
separa programación de interrupción reportada; el usuario puede comparar períodos
cambiando rango y conservando exportaciones fechadas. No hay estadísticas nacionales
ni conciliación automática programación/observación de circuitos no verificados.

La UI permite avanzar/retroceder una hora en el corte de conocimiento y consultar.
Todo en Ecuador, sin interpretar el datetime-local con zona del navegador. Las fechas
ISO de API siempre incluyen zona. Preserva fecha de publicación y de ingesta por
fuente. No polling, cache API, permisos GPS/Push ni Storage con consultas privadas.

## Privacidad prevalece sobre replay

Cada consulta pasa primero por publicación actual: fuente pública habilitada,
observación aprobada, vínculo revisado y permiso de feed vigente. Las evidencias
retiradas/privadas no reaparecen con un known_at antiguo. Safety hold vigente
suprime afirmaciones también históricas. Si faltan soportes activos necesarios
para reproducir el snapshot, fila se degrada a unknown con fechas nulas y redacted.
Esto puede hacer un replay parcial; se informa y no se promete restaurar datos
que por privacidad o licencia ya no pueden exponerse. Auditoría privada no sale.

Se proyectan solo campos públicos de evento, revisión, recorded_at, duration_seconds
nullable y hasta 100 referencias de evidencia con fuente/URL/publicación/ingesta/
relación. No input_json, reviewer reason, origin_key, hashes, IP, recibos o endpoints.
Texto se representa con textContent, no HTML. CSV neutraliza prefijos de fórmula
(=,+,-,@ incluso tras espacios), escapa comillas y mantiene null como celda vacía.

## Contrato y paginación

```text
GET /api/v1/timeline?area_id=ID&from=ISO&to=ISO[&known_at=ISO&limit=20&offset=0&format=json|csv]
```

Área exacta, no descendientes inferidos. limit 1–50, offset 0–10000, máximo 90 días.
known_at no puede ser futuro respecto al reloj servidor; omitirlo consulta lo que
se conoce ahora. Query cerrada, GET público sin Origin falso, otros métodos no
exentos de política v4, rate limit60/min. No-store, schemas cerrados y errores fijos.
CSV descarga nombre fijo; JSON {data,meta} incluye corte/rango, generación, modalidad,
coverage unknown y next_offset. La UI exporta **esta página**, no promete todas las
filas. Página sobre candidatos; filtros de privacidad pueden reducirla incluso a
cero con next_offset todavía disponible. Iterar hasta null, no inferir fin por data[].
Paginación eventual ante cambio de permisos, no snapshot de permisos entre requests.

Por consulta examina máximo 50 eventos y 500 evidencias/evento (límite PR-05), sin
escanear todo el historial. No importación histórica automática, schedules históricos
sin ledger de motor o cuerpos RSS/HTML descargables. Los cronogramas reales PR-06
siguen su API y revisión propias; no se convierten automáticamente en eventos de
replay. El demo de mapa sin revisiones puede dar timeline vacío de manera honesta.

## Verificación y rollback

Fixtures sintéticos crean observación inicial y retractación en dos instantes;
misma fecha del hecho y distinto corte de conocimiento produce estados diferentes.
Cobertura de ocultación de fuente/hold, rangos/fecha inválida, CSV seguro, API y DOM.
Navegador reproducible: scripts/verify-history-browser.mjs con Playwright externo,
320/390/768/1440, selección por teclado y replay de reported→unknown sin red externa.

TIME_MACHINE=false y reiniciar oculta UI/API, conserva ambos stores y revisiones.
Sin migración de esquema en PR-10; nunca restaurar sobre base activa o inventar
registro histórico para llenar una pantalla. Próximo PR-11: explorador ilustrativo
2D/3D progresivo con fuentes/límites geográficos/documentales.

Corrección de revisión: rango se aplica después de redacción; fechas ocultas se
comparan como desconocidas, evitando un oráculo por consultas estrechas. CSV añade
evidence_json con procedencia/relaciones/fechas, bases y known_at/from/to.
