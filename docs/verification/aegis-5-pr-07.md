# PR-07 — Sector Watch, suscripciones y PWA

Fecha: 2026-10-22. Rama feat/aegis-5-pr-07 sobre PR-06 (`0ba3e71`).
Sin merge/deploy/volúmenes reales o envíos a proveedores. Se conserva v4 y el
alcance separado del backlog. [Arquitectura/operación](../architecture/aegis-5-push.md).

## Alcance y decisiones

- /watch/ accesible: cinco sectores, alias privado, consentimiento separado,
  preferencias de categorías/digest/silencio, consulta web sin permiso Push.
- Permiso solo desde gesto explícito, fallback por denegación/ausencia y guía iOS.
- Código de gestión CSPRNG, SHA256 en DB, bearer en header, sin Storage/URL.
  Alta idempotente tras respuesta incierta, edición optimista y baja terminal.
- Migración 005, sin tocar 001–004: endpoints/keys/alias/outbox AES-256-GCM,
  clave privada persistente con huella de compatibilidad, backups heredados.
- Programación/cambios solo desde fuente fresca, vigente, zona/derechos revisados;
  industrial/ambiguo no alertan a hogares. Cancelación documental explícita local.
- Outbox idempotente, lease/reintentos acotados, quiet hours/digest, 404/410 invalidan.
  Verifica antes del envío y al recibir; versión revocada/stale => aviso genérico.
- PWA cachea solo shell /watch/, nunca API/código/horarios. No controla consola v4.
- PUSH_ALERTS y PUSH_DELIVERY siguen OFF. Worker limitado a páginas/ciclos secuenciales.
- Única dependencia directa nueva web-push 3.6.7 para ECE/VAPID; HTTPS nativo acotado.

## Verificación ejecutada

Base PR-06: 130 tests. PR-07 final: `npm ci`, `npm run check` y **157/157**
en Node v24.21.0; **157/157** también en Node 22.16 Alpine con red deshabilitada
y repositorio de solo lectura. Auditoría inicial detectó un aviso Fastify preexistente y uno
transitivo ip-address: parche compatible en lock a Fastify 5.12.7 e ip-address
10.7.4. `npm ci` final: 112 paquetes auditados, cero vulnerabilidades reportadas.
[Fastify](https://github.com/advisories/GHSA-389g-gv7q-r4x8) e
[ip-address](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5).
No actualizaciones major ni overrides, versiones de rango existentes conservadas.

27 pruebas nuevas cubren contrato/flags/CSRF/gestión, consentimiento estricto,
SSRF/keys inválidas, cifrado DB/WAL/snapshot, idempotencia, dedupe, cambios doble
revisión, cancelación explícita, industrial/ambigüedad, frescura/derechos, quiet
hours/digest, leases concurrentes, retries/404/410, edición/revocación, expiración,
migración v4→v5 y restauración, worker acotado, init-keys exclusivo 0600, fallback
web/Push denegado/gesto, respuesta incierta, SW scope/offline y validación al recibir.
No endpoint, código o alias real en pruebas; transporte simulado sin red.

El primer run completo tras añadir validación al recibir detectó que el harness SW
no suministraba job_ids ni simulaba la consulta de elegibilidad. Se actualizó el
harness y se añadió regresión de aviso obsoleto y foco sin borrar sesión privada.
Suite repetida completa aprobada; no se deshabilitaron pruebas ni validaciones.
Prettier 3.6.2 temporal formatea módulos nuevos, sin dependencia añadida al proyecto.

Chromium real sobre TLS loopback, PushManager simulado (no permisos/proveedor real):
320/390/768/1440 px sin overflow, errores JS o tráfico externo. Alta web, actualización
Push por clic, prueba explícita, consulta con código, baja, shell offline y caches
solo estáticos. Campos privados vacíos y además enmascarados antes de capturas;
Storage vacío, URLs sin código. Transferencia local del recorrido 28–56 KiB según
viewport/cache, no benchmark de campo. Artefactos ignorados por Git:
`artifacts/aegis5-pr07-{320,390,768,1440}.png` y `aegis5-pr07-browser.json`.
Captura móvil inspeccionada; no se afirma prueba física ni lector de pantalla.

Docker `aegis-pr07-review`: build exitoso. Smoke sin red del código empaquetado:
raíz, /ui, /watch, SW, API de clave pública, migración 005, outbox, aceptación
simulada, elegibilidad y baja aprobados. Sin puertos externos ni volumen real.

## Aceptación y límites

- [x] Cinco sectores/alias, consentimiento separado y permiso por gesto.
- [x] Claves VAPID fuera de Git, cifrado en reposo, código privado sin exposición.
- [x] Nueva programación/cambio/cancelación documentada con fuente y antes/ahora.
- [x] Deduplicación, subscribe/update/unsubscribe, endpoint inválido y reintentos.
- [x] Versiones revisadas dos veces, industrial y geografía ambigua no alertan hogares.
- [x] PWA, fallback web, instrucciones iOS y servicio acotado.
- [x] Migración/snapshot/restore, compatibilidad v4 y flags OFF.

Entrega real, expiración/rotación real de VAPID, dispositivo iOS y privacidad/legal
operativa siguen pendientes antes del piloto. No certificación legal o garantía
de entrega. API de proveedores limitada a allowlist Google/Mozilla/Apple; otros
navegadores usan web. Guard de un proceso, no defensa distribuida. Ventana de
aceptación/crash puede repetir intento: topic estable reduce duplicados visibles,
no se promete exactamente una entrega ni retirar mensaje ya aceptado.
Silencio/digest pueden expirar un aviso antes de enviarlo. Un 2xx del proveedor
no acredita lectura. Datos/horarios en cache del usuario necesitan nueva consulta.

Fuente EEASA sigue pendiente de permisos y catálogo territorial real; las pruebas
usan fixtures, no validan racionamientos residenciales reales. Cancelaciones
requieren texto positivo y revisión, nunca omisión de filas. TTL lógico no borra
físicamente WAL/snapshots. Claves deben respaldarse fuera de la base; no hay
recifrado automático o recuperación sin código privado.

Rollback: flags OFF y reiniciar, conservar ambos stores y claves. Código anterior
usa SQLite OFF o snapshot pre-005 en otro directorio, preservando datos nuevos.
Próximo bloque PR-08: feeds legales, clasificación y revisión de ambigüedad.

Revisión automática corregida: cuotas separadas de alta (30 intentos/h), gestión
(600/h) y validación de recepción (6000/h), manteniendo rate limit de ruta.
Predecesor de horario exige misma área revisada. Deep link consulta sector exacto
por filtro público id sin cambiar selección/preferencias privadas. Tres regresiones
nuevas; npm ci audit0, check y **160/160** tras correcciones.
