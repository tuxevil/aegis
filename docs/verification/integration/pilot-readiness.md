# Preparación para piloto supervisado

28/10/2026. Resultado: **base integrada y staging offline verificables; piloto
con usuarios/datos reales y distribución NO habilitado**. No se solicita permiso
de activación implícito ni se declara cerrado el objetivo científico/legal.

| Requisito | Evidencia actual | Decisión |
| --- | --- | --- |
| Conservar Grid y módulos v5/Multiamenaza | Ancestros preservados, contratos y suite conjunta, OpenAPI idéntico | Base de revisión disponible en PR #32/#33 y rama de staging hija |
| Resolver conflictos | Siete archivos resueltos; formatos persistentes y consentimientos separados | Sin conflicto de merge oculto; no se forzó una migración |
| Staging reproducible | Compose aislado probado, límites, health, logs, perfil y runbook | Solo laboratorio; Proxmox/puertos requieren aprobación específica |
| Fallo/reinicio/recuperación | Test E2E de ambos formatos, WAL/corrupción/capacidad, parada/backup/restore/reinicio local | Recuperación local demostrada, no failover o pérdida eléctrica física |
| Colaboración sin secretos | npm ci/check/test, SourceAdapter/recibo, benchmark y CI offline | Reproducible sin sistemas privados; revisar head/CI exactos antes de merge |
| Sin notificaciones reales | Envío/worker/browser Push bloqueados; outbox DRY_RUN; WAHA inexistente | Mantener prohibición durante esta etapa |
| Datos para validación real | Referencias primarias y controles temporales; outcomes históricos null | Insuficiente para tasas/anticipación operacional; no inventar negativos |
| Cartografía y fuentes | Investigaciones de CRS/versiones/licencias abiertas | Permisos INAMHI/SNGR, CRS/catálogo y atribuciones por pieza pendientes |
| Personas y privacidad | Flags de formularios OFF, secretos mínimos, guardas/cuotas e inventario readOnly | Retención/borrado/backups/LOPDP requieren revisión competente |
| Seguridad de revisión/merge | CI con permissions contents:read, sin deploy, secrets o pull_request_target | GitHub clásico devolvió main no protegido; API de reglas activas devolvió [] |
| Revisión independiente del código | Pruebas propias y npm audit; check AI separado falló por cuota402 | No equiparar CI verde con revisión humana de seguridad/ciencia |
| Operación territorial | OpenAlert Ecuador/Guayaquil solo enlaces reportados | Sin JID/OWNER/sesión comprobados; no se accedió a cuenta pública |
| Recursos/energía/redundancia | Muestras acotadas de Docker y restricciones explícitas | Falta medición energética autorizada y revisión de continuidad fuera del laboratorio |

Los formatos de almacenamiento ya existían: observations.json, SQLite v5 y
artefactos/journals. Unificar físicamente datos y consentimientos habría supuesto
una migración no justificada. El backup de staging exige DB_DIR=/data/v5; si se
elige otro montaje, esta receta no lo cubre y debe revisarse antes de usar datos.

## Operación/seguridad que debe revisar el responsable

- Configurar/revisar protección de main y requisitos de PR/checks antes de aprobar
  integración. La consulta GitHub no encontró reglas activas; no se cambiaron
  settings. No hay pipeline de despliegue automático en los workflows inspeccionados.
- Mantener imágenes/volúmenes de producción separados. Verificar límites cgroup,
  permisos del LXC/Docker, volumen/espacio y recuperación sobre copia nueva cuando
  se autorice instalación. No convertir LXC en privilegiado para resolver un error.
- Admin editorial permanece OFF; tokens aleatorios se distribuyen fuera del repo,
  se configuran por digest y se rotan/revocan con reinicio controlado. La diferencia
  de IDs de editor/aprobador no demuestra por sí sola dos personas independientes.
- No cambiar PUSH_STORAGE_KEY sobre endpoints existentes sin migración/recuperación
  revisada: cifrado, VAPID y secretos de gestión son credenciales diferentes. No
  se leyeron/rotaron claves reales. Ninguna clave habilita el transporte bloqueado.
- Los consentimientos Sector Watch y OpenAlert son distintos. Baja lógica o
  vencimiento no borra eventos históricos/copias. Resolver plazos, supresión de
  datos y restauraciones que no reactiven consentimientos vencidos/revocados.
- Conservar límites y fallos por fuente; no eludir 403/429 ni usar excepciones TLS
  heredadas CELEC/CENACE como criterio de confianza para nuevas fuentes.

## Condiciones concretas antes de un piloto real

1. Revisión/aceptación de los PR y autorizaciones separadas para merge, instalación
   en infraestructura y cualquier exposición de servicio. Esta entrega no las concede.
2. Fuentes y permisos definidos, cartografía/CRS revisados, presupuesto de consultas
   y corpus independiente que permita medir fallos/cobertura sin hindsight.
3. Revisión humana de casos/mensajes y procedimiento de corrección; definir qué
   se observará en sombra, período y criterios de parada sin prometer predicciones.
4. Privacidad/retención, credenciales, copias externas cifradas y responsables de
   operación revisados; ensayo autorizado de recuperación de la infraestructura.
5. Mantener todo envío bloqueado. WAHA/Web Push/canales o avisos ciudadanos exigen
   nueva aprobación explícita y validación específica; no basta activar un env.

Estas son condiciones verificables que faltan, no otro roadmap de funcionalidades.
Se pueden revisar los artefactos y repetir el laboratorio sin resolverlas por
suposición. [Validación ejecutada](validation-report.md),
[matriz](integration-matrix.md), [runbook](../../runbooks/supervised-staging.md).
