# AEGIS 5 — PR-04: reportar, corregir y retirar

Fecha: 2026-10-21. Rama independiente feat/aegis-5-pr-04 sobre PR #11
(feat/aegis-5-pr-03, dca5180). Usuario autorizó continuar. Sin merge, deploy,
recepción de reportes reales ni avances en PR-05. Revisión de PR #11 aún pendiente
al inspeccionar; no se afirma aprobación de dependencias.

## Alcance

- `/report` y enlace condicionado desde `/map`, flags OFF por defecto.
- Formulario sin cuenta, consentimiento explícito/política versionada, selección
  y confirmación de sector exacto, estado declarado y hora opcional Ecuador.
- Sin texto libre, nombres, contacto, domicilio, GPS, uploads o Push.
- Recibo CSPRNG de 256 bits generado por cliente, SHA256 solo en DB, gestión por
  bearer header, nunca URL/localStorage/respuesta pública. Sin recuperación por correo.
- Reintentos de creación y corrección idempotentes; revisión optimista, original
  conservado y retiro terminal inmediato del agregado.
- Honeypot, nonce temporal ligado a IP, espera mínima, comprobación progresiva,
  límites por IP y estructuras efímeras acotadas, sin IP en DB o backups.
- Cola de moderación y approve/reject por revisión exacta en CLI local, sin admin HTTP.
- Resúmenes por sector/24 h solo con >=3 reportes aprobados; grupos menores se
  suprimen con null/desconocido, no cero cortes. Ningún incidente creado ni área
  coloreada automáticamente por estos reportes.
- Migración 002 separada de 001, snapshots/recovery existentes y podas de retención.
- Sin dependencias nuevas, cambios a fuentes/atajos v4 o observations.json.

Contrato, operación, privacidad, controles y límites:
[guía PR-04](../architecture/aegis-5-citizen-reports.md).

## Resultados de verificación

Base: npm ci, npm run check, 71/71 tests. Después: npm ci (cero vulnerabilidades
reportadas), npm run check y **91/91 tests** en Node 24.21.0.
Suite completa **91/91** también en node:22.16.0-alpine.
`git diff --check` sin errores.

**14 pruebas nuevas API/storage/abuso:** flags y origen de activación, estados
pending y fechas separadas, consentimiento estricto, sector ambiguo rechazado,
campos privados/estado inyectado rechazados, XSS/SQLi, fechas/bodies acotados,
reintentos/duplicados, honeypot/nonce/espera/IP/expiración, comprobación progresiva
+ cuotas, CSRF vs autorización por recibo, publicación suprimida, corrección con
revisión previa conservada y retorno a moderación, retiro terminal/idempotente,
reapertura/acceso tras reinicio, archivo/snapshot sin token/IP/request_id en claro,
retención + cascade, migración v1→v2 y restore v1, CLI sin hashes y memoria acotada.

**5 pruebas DOM nuevas:** consentimiento desmarcado y sector explícito, recibo solo
al creador/sin localStorage/URL, respuesta perdida después de commit con retry del
mismo payload/credenciales, corregir/retirar con confirmación, acceso por código que
limpia inputs y textos externos no ejecutables. Durante QA se corrigió el cierre
del harness para esperar requests de resumen antes de destruir el DOM; no se
ocultaron fallos de producto ni se deshabilitaron pruebas.

Una prueba adicional de integración DOM verifica el resumen ciudadano en /map,
separado de las fichas, con fecha de consulta, sin crear incidentes ni cargar pins.

Los tests de persistencia anteriores ahora parametrizan la versión actual del
ledger, manteniendo sus escenarios de esquema futuro/checksum/rollback; no se
reemplazaron por comprobaciones triviales. Se conserva toda la suite v4/PR-01–03.

## Navegador y empaquetado

Chromium real, script `scripts/verify-reports-browser.mjs`, Playwright externo a
las dependencias del proyecto. Verificados 320/390/768/1440 px:

- demo visible, consentimiento inicialmente desmarcado y área confirmada;
- búsqueda/selección con Enter, alta pending, acceso mediante código;
- corrección con revisión y retiro completo;
- cero overflow horizontal, excepciones JS no controladas o tráfico externo;
- recibo nunca en URL; inputs privados vacíos antes de capturar.

Capturas inspeccionadas y reporte en artifacts/ fuera de Git:
`aegis5-pr04-320.png`, `-390.png`, `-768.png`, `-1440.png` y
`aegis5-pr04-browser.json`. Sin recibos/IPs/estación/Push en capturas.
Sin certificación de accesibilidad ni prueba con lector de pantalla o teléfono
físico: semántica/labels/foco se comprueban por DOM y Chromium con teclado.

`docker build -t aegis-pr04-review .` exitoso. Smoke HTTP dentro de imagen Node 22:
OFF no registra /report; ON demo sirve assets/política y completa challenge,
create, owner access, correction, withdrawal y agregado suprimido. Ningún puerto
externo o volumen productivo usado. Runtime incluye reports/ y SQL 002.

## Aceptación PR-04

- [x] Flujo sin cuenta, consentimiento/política y sector concreto.
- [x] Hora declarada separada de recepción, desconocido preservado como null.
- [x] Token privado de gestión, corrección y retiro probados.
- [x] Límite IP con retención corta y sin persistir IP; controles progresivos/honeypot.
- [x] Duplicados/reintentos, moderación y cola de revisión operables localmente.
- [x] Agregación por sector con supresión de grupos pequeños, sin datos domésticos.
- [x] Pruebas spam, zonas ambiguas, XSS/SQLi, duplicados/corrección/retiro pasan.
- [x] Un reporte no genera incidente ni colorea área como apagada.
- [x] Compatibilidad v4, Docker, Node 22/24 y navegador móvil/escritorio.
- [x] Documentación, migración/snapshot/rollback y próximo paso.

## Limitaciones y requisitos antes de recepción live

El guard es de **un proceso**; cuotas/huellas reinician con proceso y no coordinan
réplicas. Captcha textual accesible es fricción básica, no defensa robusta frente
a bots adaptativos o IPs rotativas. IP compartida/proxy puede limitar usuarios
legítimos. No se habilitó trustProxy o proveedor de captcha sin conocer servicios.
La moderación es humana por CLI, no clasificación automática. Tres recibos no
prueban tres orígenes independientes y no equivalen a corroboración/oficialidad.

Live necesita catálogo de sectores curado, HTTPS/origen fijo, revisión de privacidad,
moderación, retención/backups/logs y capacidad/antibot apropiados al volumen.
No se afirma cumplimiento legal por implementar una casilla. No se instaló cron,
se modificaron logs de proxy ni se recogieron datos reales. El TTL de registros
activos no garantiza borrado físico de WAL/backups: snapshots pre-migración se
retiran manualmente tras su revisión, según se informa en la política.

Recibo no se guarda automáticamente: perder código o cerrar antes de confirmar
recepción puede perder acceso. La UI puede reintentar un envío pendiente mientras
permanece abierta. No hay API admin ni recuperación por datos personales.

Rollback: CITIZEN_REPORTS=false y reiniciar preservando DB_DIR/DATA_DIR. Código
previo a 002 debe dejar SQLITE_STORAGE=false o restaurar snapshot anterior en
otro directorio con código compatible; conservar v2 con todos los reportes nuevos.
Nunca sobrescribir ni borrar la base nueva para volver a la anterior.
Próximo tras revisión/dependencias: PR-05, correlación de eventos/evidencia;
no se empezó correlación, Push, fuentes oficiales nuevas u OSINT.
