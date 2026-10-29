# Revisión operacional independiente de la integración

29/10/2026. Corte revisado: `3fc1bb3a95fe52b5bc41cae9a5c689dcb0c20d3b`,
main `0339762fb915f068bca8a001b7bd8f2d0b25abee`. GitHub/fetch confirman #32
24c41e3 → #33 fb64ced → #34 3fc1bb3, abiertos y con CI funcional aprobada.
Baseline repetido: npm ci sin vulnerabilidades, check y **422/422** Node.

Se aplicó code-review con dos agentes de contexto separado, sin editar código,
comparando `git diff 0339762...3fc1bb3` y revisando además las superficies heredadas.
No equivale a una auditoría humana externa, pentest de producción o certificación.
El check AI anterior con HTTP402 no es una aprobación y no se contabiliza.
Normas: AGENTS, SECURITY, CONTRIBUTING y ADR; especificación: handoff y entregas
de integración. No se instalaron habilidades/tracker ajenos: esos documentos y los
PR constituyen la especificación disponible. Ningún proveedor/servicio privado fue
consultado durante las reproducciones; solo GitHub/documentación pública y fixtures.

## Standards

El revisor inspeccionó Fastify y excepciones de rutas explícitas, autenticación y
roles admin, guardas de reportes/Watch, desafíos/journal de zonas, HTTP de fuentes,
proyección pública, barreras Push, SQLite y staging/recuperación.

**Cero defectos confirmados en este eje.** Bearer sigue siendo obligatorio en
localhost; Origin/Referer no autorizan admin; el secreto de gestión no aparece
en URLs/Storage. Los cambios de rol/transiciones se validan en servicio y schema.
Los desafíos usados se comprueban dentro del writer lock y las cuotas son acotadas.

Una sospecha de permisos de sidecars se descartó con una prueba offline: base
sintética en directorio0755 y umask022 produjo DB/WAL/SHM0600. No se reporta como
vulnerabilidad. Se mantienen dos preocupaciones **no demostradas**: fsync del
directorio tras creación inmutable y latencia/heap del replay de journals cerca
de su cuota máxima. Requieren ensayo de filesystem/carga; no se inventa un fallo
eléctrico ni un DoS confirmado. Tampoco se afirma estabilidad durante días.

## Spec

**Un defecto confirmado P2:** `storage/sqlite-store.js`, apertura de una base
existente con modo equivocado o marca ausente. La matriz exige aislamiento
synthetic/live y el runbook impide arrancar código viejo sobre esquema nuevo.

Reproducción independiente: crear base sintética con migración1, cerrarla y abrirla
como real con el esquema actual. Se rechazaba el modo, pero después de migrar
1→6 y generar un respaldo. El snapshot mitigaba recuperación, no eliminaba el
cambio inesperado. La dirección inversa tenía el mismo orden incorrecto.

Corregido: validar la marca existente antes de pragmas/snapshot/migración y
revalidarla con BEGIN IMMEDIATE adquirido. El test negativo falló primero
(snapshot1), y tras el fix verifica ambas direcciones y marca ausente: **snapshot0,
bytes e inventario idénticos y schema1 conservado**. Las migraciones válidas siguen
pasando. El revisor volvió a leer el cambio y ejecutó 15/15 pruebas de storage.

No encontró bypass confirmado de envío real. Los gates legales/científicos,
retención y aprobación de operación permanecen abiertos; no son defectos que se
puedan cerrar marcando fixtures como evidencia real.

Resumen por eje: Standards0 confirmados (dos preocupaciones sin reproducción);
Spec1 P2, corregido y verificado de forma separada.

## Pruebas negativas adicionales y severidades

| Prioridad | Hallazgo/control | Evidencia y estado |
| --- | --- | --- |
| P2 | Modo SQLite rechazado después de migrar | Corregido; test red/green y revisión separada descritos arriba |
| P3, consistencia UI | Un public-key DTO falsificado con delivery_enabled=true anunciaba disponibilidad pese al bloqueo | No activaba Push; ahora muestra siempre la prohibición DRY_RUN de esta etapa |
| Sin bypass reproducido | Constructor/transporte/worker con config nula, arrays, prototipo y valores truthy | Espías HTTPS/fetch y cola: cero llamadas/claims; worker no se programa |
| Sin bypass reproducido | 64 combinaciones de flags adicionales con Push solicitado | Rechazo antes de abrir SQLite; configuración heredada no habilita envío |
| Sin bypass reproducido | URL/host/área extra y redirect a metadata privada | SourceHttp niega parámetros y fuente desconocidos antes del fetch; GET/manual, 302 rechazado sin seguir destino |
| Sin bypass reproducido | DTO que anuncia envío y click programático con consentimiento | UI no llama PushManager.subscribe; preferencias web conservadas |

No se considera seguro todo el programa por no haber encontrado otro defecto.
Las pruebas heredadas cubren SQLi/XSS, traversal/backup, autenticación, roles,
cuotas, caducidad, corrección/retractación y tres persistencias. Las nuevas pruebas
intentan invalidar barreras específicas y usan directorios/claves ficticios.
Los modelos de amenaza no cubren ejecución arbitraria por un administrador del
host ni una dependencia maliciosa con acceso al proceso. Hashes no son firmas.

## Protección de main: propuesta, no aplicada

Consultas de solo lectura: protección clásica devolvió 404 `Branch not protected`;
reglas activas devolvieron `[]`. Se observó GitHub Actions app15368 en los checks
del head, sin adivinar el ID. Propuesta revisable:
[main-ruleset.proposed.json](main-ruleset.proposed.json).

Restringe main a PR con una aprobación independiente, revisión invalidada tras
nuevo push y aprobación posterior al último push; conversaciones resueltas,
prohibición de borrar/force-push, checks estrictos regression(22), regression(24),
container-smoke vinculados a la app observada. No se exige historial lineal porque
las ramas actuales preservan ancestros de merge. No se exige un check AI sin
disponibilidad/cuota demostrada. No se añadieron bypass de administradores/apps.

El propietario debe confirmar un revisor disponible (un autor no se autoaprueba),
plan/permisos, nombres de checks y excepciones antes de activar. El JSON declara
la configuración **propuesta**; no se envió a GitHub ni se validó creando reglas.
No hay cambios de permisos, protección o merge.

La semántica se contrastó con [reglas disponibles de GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
y [REST de rulesets](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset).
El endpoint de reglas activas incluye reglas de niveles superiores; el estado
observado no acredita políticas no activas o futuras.

## Reproducción y límites operacionales

```sh
npm ci
npm run check
npm test
node --test test/storage.test.js test/operational-barriers.test.js test/watch-ui.test.js
```

No se activó conectividad, no se arrancó un observador continuo y no se obtuvieron
pruebas nuevas de estabilidad durante días. El laboratorio network:none sigue
siendo la referencia. La salida controlada debe tener autorización separada,
restricciones reales fuera de la app, revisión de fuentes y un protocolo de
observación antes de cualquier tráfico continuo. No hay Web Push/WAHA o avisos.

Resultado local tras correcciones: **426/426** Node en host y contenedor
reconstruido sin red, **6/6** contratos Python, npm ci sin vulnerabilidades y
check correcto. No se cambió deploy/staging/compose.yaml respecto al PR #34.

### Dependencias de main frente a la integración

Durante el push GitHub informó cinco alertas abiertas en la rama por defecto.
Se verificaron por API de solo lectura: #53 Fastify (low) y #54–#57 fast-uri
(dos medium y dos low). El lock de main contiene Fastify5.12.5 y una copia
anidada de fast-uri4.2.1; las versiones corregidas indicadas son5.12.6 y4.2.3.
Son hallazgos del árbol de main; no se trasladan sin comprobar a esta rama.

La integración ya contiene Fastify5.12.7, fast-uri4.2.3 y copias3.1.9 fuera del
rango afectado por esas alertas. Un npm audit nuevo devolvió total0. No se afirma
ausencia de vulnerabilidades desconocidas ni se cierran alertas de main por ello.
No se modificó main/producción: su actualización sigue requiriendo revisión y
autorización de merge. Las alertas no prueban explotación ni exposición efectiva.
