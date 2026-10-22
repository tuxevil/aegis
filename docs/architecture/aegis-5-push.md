# PR-07 — Suscripciones anónimas y Sector Watch

Implementación gradual Fastify/JS existente. `/watch/` es independiente de v4,
con búsqueda por catálogo curado y máximo cinco sectores con alias privados.
Sin GPS, cuenta, teléfono, correo o dirección. Fallback web sin Push y shell PWA
sin horarios cacheados. Ausencia de horarios sigue siendo desconocida.

## Flags y configuración

`PUSH_ALERTS=false` por defecto. Para registrar el piloto exige PUBLIC_API_V1,
SQLITE_STORAGE, BLACKOUT_MAP y OFFICIAL_SCHEDULES, sin BLACKOUT_DEMO. Exige origen
HTTPS canónico WATCH_ORIGIN, PUSH_STORAGE_KEY (32 bytes base64url) y par VAPID.
`PUSH_DELIVERY=false` es independiente: guardar preferencias no inicia envíos.
Todos los permisos, geografía y revisión de fuentes de PR-06 siguen pendientes
para operación pública. No se configuró producción ni se enviaron Push reales.

Generar claves en archivo nuevo privado, fuera del repositorio:

```bash
WATCH_ORIGIN=https://ejemplo.invalid node scripts/push.js init-keys /ruta/privada/watch.env
```

Escritura exclusiva 0600; stdout solo confirma creación. Inyectar ese archivo al
proceso por el mecanismo de secretos del operador. No rotar PUSH_STORAGE_KEY
sin plan de recifrado: la huella persistente detecta una clave incompatible y
falla cerrado. Conservar y respaldar claves separadas de DB/snapshots; perderlas
impide recuperar endpoints/alias. Rotar VAPID puede exigir nueva suscripción del
navegador; no hay rotación automática ni recuperación por datos personales.

## Consentimiento y gestión

Casillas desmarcadas: consentimiento de guardar preferencias y Push separados.
Permiso nativo solo desde clic explícito, no al abrir página. Digest conservador,
hora 08:00 Ecuador y silencio 22:00–07:00; categorías desmarcadas en UI. Se
admite modo inmediato, quiet hours configurables y categorías de programación,
cambio y cancelación. Digest debe quedar fuera del silencio. Web sin Push puede
guardar preferencias o consultar sin guardar; permiso denegado no bloquea consulta.

iOS/iPadOS requiere versión compatible con Web Push (16.4 o posterior) y agregar
la web a pantalla de inicio. Mostrar instrucciones, sin prometer disponibilidad
universal. HTTPS obligatorio; pruebas de navegador usan proveedor simulado y
certificado local, no validan un dispositivo iOS ni entrega real.

Código `id.token`, token CSPRNG 256 bits generado en cliente. Solo SHA256 en DB;
Authorization bearer para consultar/editar/baja, nunca URL, cookies o Storage.
El código vive en RAM/DOM hasta ocultarlo/salir; copia explícita. Tras recargar,
se introduce de nuevo. Sin recuperación si se pierde. Reintento tras respuesta
incierta conserva mismo request_id/token/contenido en RAM y congela edición.
Baja terminal e idempotente: elimina endpoint, alias y preferencias activas,
suprime cola y solicita unsubscribe nativo en lo posible. Edición usa revisión
optimista, reemplaza sectores y suprime trabajo pendiente. No reactiva tombstones.

Alias se descifra solo para el propietario; no entra al contenido de notificación.
Mantener nombres domésticos y secretos fuera del catálogo público de áreas.

## Rutas explícitas

| Método y ruta | Uso |
| --- | --- |
| GET /api/v1/push/public-key | Clave pública, política y estado del piloto |
| POST /api/v1/subscription-challenges | Nonce efímero y fricción antiabuso |
| POST /api/v1/subscriptions | Consentimientos, sectores y prueba nativa opcional |
| GET /api/v1/subscriptions/:id | Propietario con código privado |
| PATCH /api/v1/subscriptions/:id | Preferencias con revisión esperada y código |
| DELETE /api/v1/subscriptions/:id | Baja con código |
| POST /api/v1/subscriptions/:id/test | Prueba explícita, máximo una por hora |
| POST /api/v1/push/validate | Solo booleano de elegibilidad, prueba endpoint+keys |

Schemas cerrados, no-store, errores fijos y bodies limitados. JSON/header propio,
origen exacto/fetch metadata mitigan CSRF; no sustituyen secreto de gestión.
Validación de recepción usa las claves privadas de la suscripción nativa y IDs
opacos de outbox, sin guardar bearer de gestión en SW. El guard reutiliza cuotas,
nonce de un uso, espera mínima y suma progresiva de PR-04; RAM acotada y efímera,
sin IP en DB. Es un proceso: no defiende bots distribuidos ni coordina réplicas.

## Fuentes, outbox y entrega

Solo revisión vigente aprobada, correspondencia exacta, derechos revisados,
presencia y fuente fresca. Industrial/desconocido/ambiguo no genera aviso al hogar.
Cambio incluye antes/ahora, zona y URL oficial. Cancelación requiere motivo
explícito positivo del documento y confirmación local exacta; fila ausente o fetch
fallido jamás cancela. Motivo de cancelación aún no confirmado queda no verificado.

Migración 005 añade suscripciones/áreas/outbox/dedupe/cancelaciones auditables;
001–004 intactas. AES-256-GCM con IV aleatorio/AAD cifra endpoint, browser keys,
alias y payload. HMAC del endpoint permite unicidad privada; no se expone en API.
Request replay y clave por suscripción/evento/revisión evitan crear avisos dobles.
Nunca se reconstruye automáticamente trabajo aceptado o con intento incierto.

PUSH_DELIVERY=true inicia un ciclo secuencial cada 60 s: hasta 100 suscripciones
por página y diez envíos por ciclo; sin ciclos solapados. CLI también disponible:

```bash
PUSH_ALERTS=true npm run push -- enqueue
PUSH_ALERTS=true PUSH_DELIVERY=true npm run push -- dispatch
npm run push -- status
PUSH_ALERTS=true npm run push -- prune
PUSH_ALERTS=true npm run push -- cancel < reviewed-cancellation.json
```

CLI usa DB existente sin migrar. Cancelación exige revision_id, quote
igual al motivo documental y review_reason; revisar contrato en método local.
Pruebas explícitas obedecen silencio/digest y expiran en 24 h. Límite 10.000
suscripciones activas y 10.000 trabajos pendientes; cuota DB heredada 64 MiB.
Revalidar antes de claim y al recibir protege cambios/revocaciones intermedios.
Al recibir sin validación disponible, aviso genérico sin horas/afirmación de corte.
Un clic enfoca la ventana existente sin recargar y perder sesión privada en RAM.

Lease 30 s; máximo tres intentos para red/429/5xx, backoff y Retry-After acotado.
404/410 elimina endpoint y consentimiento Push. TTL máximo 300 s y fin de horario;
como máximo tres avisos por digest y contenido acotado. Tag estable por entrada
reduce reemplazos/duplicados visuales. Caída después de aceptación puede repetir
un intento: no se promete exactamente una entrega ni retiro de mensaje ya aceptado.
Respuesta 2xx significa provider_accepted, nunca leído/entregado al dispositivo.

Una dependencia directa nueva: web-push 3.6.7 fijada para VAPID y cifrado ECE,
sin implementar el protocolo criptográfico. HTTPS nativo para transporte acotado:
Google/Mozilla/Apple por host/path cerrado, TLS estándar, no redirects/proxy/cookies,
DNS público, timeout 10 s y respuesta 4 KiB. Otros vendors quedan en fallback web.
No se prueban proveedores reales ni su disponibilidad mediante mocks.

## PWA, retención y rollback

SW scope /watch/; solo cachea HTML/JS/CSS/manifest/iconos locales. API, alias,
códigos y horarios nunca entran al cache. Offline muestra shell y fuente no
disponible, no horarios anteriores como actuales. No controla / ni /ui. CSP local.
Con flag OFF, respuesta 404 del shell permite al SW retirar su cache/registro.

Expiración lógica a 180 días; revocados se podan después de siete días y trabajos
terminales/dedupe tras siete días según fecha. Worker poda solo si está habilitado;
CLI permite mantenimiento con recepción controlada. SQLite WAL/backups pueden
conservar ciphertext/hash previos; TTL no garantiza borrado físico. Operador debe
retirar copias según política, mantener permisos y excluir cuerpos/Authorization
/endpoints de logs de proxy. No se certificó cumplimiento legal ni captación masiva.

Backup previo a migración y restore en directorio nuevo siguen PR-02. Rollback:
PUSH_ALERTS=false y PUSH_DELIVERY=false, reiniciar sin borrar DB_DIR/DATA_DIR.
Código anterior: SQLite OFF o snapshot pre-005 en otro DB_DIR, conservar base v5
con datos posteriores. No sobrescribir historial ni claves. Próximo PR-08: feeds
legales y clasificación; no implementados como parte de PR-07.

Revisión: alta conserva cuota30/h, gestión600/h y recepción6000/h en guards
separados; límites por ruta siguen. /areas admite id exacto para contexto de aviso.
Enlace de Push consulta el sector sin modificar preferencias; volver a mis sectores
quita ese contexto. Antes/ahora exige predecesor de la misma área revisada.
