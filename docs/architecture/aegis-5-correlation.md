# PR-05 — Correlación reproducible y evidencia

Motor local y determinista sobre SQLite existente; cero dependencias nuevas,
peticiones de red, timers, LLM o procesos residentes. `EVENT_CORRELATION=false`
por defecto autoriza **solo las mutaciones de la CLI** al activarse; no registra
rutas HTTP ni inicia ingestión. El adaptador interno `store.correlation` se llama
explícitamente desde código de confianza, igual que los repositorios internos.
`SQLITE_STORAGE`, mapa y reportes mantienen sus gates anteriores.

## Entidades, reglas y decisiones

`storage/correlation-rules.js` separa cálculo puro de transacciones en
`storage/correlation.js`. Versión fija `correlation-1`; cambios futuros de reglas
requieren otra versión y recálculo explícito, conservando los snapshots previos.
No se revisan automáticamente eventos importados ni se reescribe JSON v4.

- Cada fuente, artefacto, observación, vínculo y evento conserva identidad propia.
  Solo observaciones aprobadas de fuentes públicas habilitadas y del mismo modo
  demo/live pueden entrar. Un operador revisa semántica, privacidad y procedencia.
- Matching automático: **área exacta + tipo + categoría `observations.kind`** y
  tiempo exacto a ±60 minutos de un ancla fija. `kind` debe identificar el problema
  y separar causas conocidas incompatibles; no hay clasificación NLP implícita.
  No se mezclan sectores vecinos ni se propaga un corte de sector al cantón.
  El ancla no se desplaza con cada reporte: evita encadenamientos indefinidos.
- Dos candidatos compatibles producen un evento separado con motivo de revisión.
  Fechas aproximadas/desconocidas o sin hora no usan ingesta/publicación como hora
  del hecho, ni se fusionan automáticamente. Quedan reportadas con inicio nulo.
  Asociaciones explícitas de cortes también respetan zona, tipo y ventana; una
  corrección explícita puede rectificar su tiempo y conserva el ancla histórica.
- Los orígenes son **instituciones/editoriales/operadores revisados**, nunca
  recibos, IPs, personas u hogares. `origin_key` identifica propiedad o procedencia
  común; `origin_reviewed` es una decisión local auditada, no un parámetro público.
  Fuentes sin esa revisión permanecen reportadas, sin aportar independencia.
- Componentes conexos por fuente, origen, URL canónica/original, SHA256 de documento
  o resumen idéntico normalizado deduplican transitivamente. Se preservan aliases
  de retractaciones para no multiplicar orígenes por retirarlas. La URL elimina
  fragmento, tracking conocido y barra final, ordena parámetros y conserva IDs
  significativos. No se descarga ni se sigue una URL. Copias parafraseadas necesitan
  atribución humana al origen original; no se promete detectar plagio semántico.
- Corroboración requiere ≥2 componentes con origen revisado, tiempo exacto y
  documento `parsed` (sensores revisados pueden aportar observación directa).
  Revisar origen/documento es un criterio conservador de fiabilidad; no se inventa
  una puntuación estadística ni una probabilidad calibrada.
- Oficial requiere fuente `authority` oficial, documento `parsed` y revisión
  explícita de competencia territorial y período `[from,to)`. Un área administrativa
  ancestral puede acreditar competencia para su descendiente, hasta tres niveles.
  La vigencia debe incluir el intervalo de evidencia exacta del evento; una etiqueta
  de autoridad, un enlace o un documento ajeno a la zona/período no bastan.
  La CLI no verifica automáticamente que una institución sea realmente competente:
  esa atestación exige documentación y revisión del operador antes de live.
- Refutaciones activas producen `unknown`. Una reposición parcial también expresa
  duda sin cerrar todo el evento. Reposición completa exige zona exacta, hora
  posterior a la última evidencia de corte, ausencia de refutación y documento
  competente o ≥2 orígenes independientes de reposición. Todos los inicios activos
  deben tener hora exacta. Una única reposición no oficial, silencio o reloj no
  asignan `end_at`. Para dos reposiciones, se usa la hora de la segunda evidencia
  independiente; no se fabrica el instante físico exacto de regreso a cada hogar.
- Nuevas observaciones con `replaces` corrigen/retractan al predecesor activo.
  Nunca se modifica ni borra el original. Una zona errónea se retracta y se abre
  otro evento en la zona correcta. Un `replaces` ya sustituido no puede retirarse
  otra vez por un camino distinto; reintentos idénticos son idempotentes.

`last_evidence_at` conserva ingesta; inicio/fin conservan la hora declarada u
observada y su base. Una revisión adicional no rejuvenece la evidencia original.
La explicación pública cuenta evidencia, orígenes y dudas, e identifica la regla.

## Privacidad y publicación

Los reportes con recibo de PR-04 **continúan privados**, moderados y agregados por
sector/24 h con umbral de tres. Este motor rechaza fuentes ciudadanas e IDs ligados
al registro de recibos: no convierte recibos en fuentes independientes ni publica
observaciones individuales. Corrección/retiro/retención siguen afectando sus
agregados inmediatamente. No se añadió un puente automático de agregados a eventos:
un agregado no demuestra independencia, inicio ni reposición de todo un sector.

El lector público conserva contratos GET y evidencia original/retractación.
En live, estados históricos `corroborated`, `official` o `ended` sin revisión del
motor se proyectan como `unknown`, sin límites temporales sustentados; el original
permanece intacto en DB. Los ejemplos de demo explícitamente sintéticos conservan
sus escenarios. No se confiere oficialidad por importar una fila manual. La
atestación y los motivos detallados son locales; no hay API pública de escritura,
recibos, nombres domésticos ni endpoint admin. Datos de fuente continúan pasando
por revisión de privacidad y schemas públicos existentes.

## Operación local

Inicializar/migrar explícitamente una DB_DIR de prueba con `npm run storage -- init`
antes de operar. La CLI no crea ni migra bases. `SQLITE_DEMO=true` solo para una
base sintética separada, nunca una live. Ejemplo de **atestación local**, requiere
que la observación ya exista y haya pasado revisión:

```json
{
  "observation_id": "reviewed-observation-id",
  "type": "unplanned",
  "signal": "outage",
  "origin_key": "reviewed-publisher",
  "origin_reviewed": true,
  "review_reason": "Procedencia, privacidad, zona y categoría revisadas"
}
```

```bash
EVENT_CORRELATION=true npm run correlation -- submit < reviewed-claim.json
npm run correlation -- history EVENT_ID
npm run correlation -- evidence EVENT_ID
EVENT_CORRELATION=true npm run correlation -- recalculate EVENT_ID
EVENT_CORRELATION=true npm run correlation -- hold EVENT_ID
```

Campos opcionales cerrados: `event_id` (obligatorio para reposición/refutación sin
predecesor), `canonical_url` del artículo original, `replaces` y
`competence:{area_id,from,to}`. Señales: `outage/restored/refute/retraction`.
Tipos: `scheduled/unplanned/unknown`. Atender programación real exige además
el trabajo de fuentes y cronogramas PR-06; aquí no se ingiere ninguno.

`history` devuelve primeras 50 revisiones y `evidence` primeras 50 decisiones.
La interfaz interna admite páginas `limit<=100,offset<=100000` para auditorías
completas; la CLI breve no oculta esta limitación. `hold` suspende la afirmación
como `unknown` con inicio/fin nulos y revisión auditable, incluso al llegar al
límite. Es persistente: ni recálculos ni nueva evidencia la reactivan. Esta
versión no tiene liberación de la suspensión; la evidencia corregida puede formar
un nuevo caso, conservando el anterior suspendido. Decisiones originales conservan
JSON normalizado, razón, fecha, procedencia y ámbito; snapshots guardan estado,
contadores, grupos y predecesores retirados. No se duplican documentos ni resúmenes
en cada revisión. Triggers impiden UPDATE/DELETE de entradas y revisiones.
La protección no pretende resistir a un administrador capaz de alterar el esquema.

## Recursos, migración y rollback

Migración **003** agrega casos/anclas, entradas y revisiones con FKs/índices.
001/002 permanecen idénticas. Copia pre-migración bajo bloqueo de escritor, WAL,
transacción atómica, cuota SQLite y backups verificados son los de PR-02.
Todas las operaciones fallidas revierten vínculo, decisión, evento y revisión.
CLI: stdin ≤16 KiB. Consultas de candidatos limitadas a dos; cálculo por evento
hasta **500 observaciones**, sin escanear todo el historial. Al alcanzar el límite
no se admiten más entradas, incluidas correcciones/retractaciones: es un límite
operativo del piloto: usar `hold` para suspender rápidamente la afirmación aun
al saturarse, y revisar la evidencia antes de abrir otro caso; nunca se trunca
historial silenciosamente. No habilitar captación masiva con este límite. Las
revisiones crecen y comparten la cuota global DB_MAX_BYTES; no se purgan auditorías.

Rollback: EVENT_CORRELATION=false detiene CLI mutante; no revierte eventos ya
publicados. Para suspender la publicación, BLACKOUT_MAP=false y reiniciar. Mantener
la base v3 y snapshots; para código v2 usar SQLite OFF o restaurar el snapshot
pre-003 en **otro directorio**, nunca sobreescribir la base nueva. DATA_DIR JSON
no se mueve. No se activa cron ni se cambia infraestructura de producción.
