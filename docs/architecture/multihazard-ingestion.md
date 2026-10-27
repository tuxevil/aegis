# M1 — Ingesta aislada y archivo

La ingesta es una biblioteca y CLI manual; el backend v4 no la importa ni inicia
red al arrancar. No hay scheduler ni transporte de notificaciones.

Interfaces: `SourceRegistry.get(id)`, `SourceHttp.get(id)`, adaptadores
`normalize(bytes, capture)`, `RawArtifactStore.capture(...)`,
`IngestionService.ingest(sourceId)`. Fetch, reloj y extracción PDF son inyectables.
AJV 2020 valida el contrato publicado y schemas discriminados de `details`.
PDF.js extrae texto en worker con tiempo/páginas/texto acotados; nunca ejecuta
scripts del documento ni descarga sus enlaces. No se vectoriza su mapa.

Los registros reales y sintéticos están en raíces separadas bajo
`DATA_DIR/hazards/v1/{captured_source,synthetic_fixture}`. Bytes por SHA-256 y
capturas JSON individuales inmutables forman un índice reconstruible, incluso
cuando dos capturas tienen igual hash. El sobre normalizado vive en la captura;
fallos se añaden a un journal sin sustituir la última captura válida. Un archivo
incompleto no se publica como captura; el lector verifica bytes/hash. Uso de un
solo escritor por raíz; lock exclusivo durante mutaciones. Archivos 0600,
directorios 0700. No hay API para devolver bytes o claves del almacén.

Formato v1 aditivo: no migra, lee ni escribe `observations.json`. Versiones futuras
deben usar migración explícita; formatos desconocidos se rechazan. Cuotas de bytes
y capturas rechazan nuevas escrituras al agotarse, sin eliminar historia.
Retención: política inicial `preserve`, sin purga automática; ajustar cuotas tras
medición y archivar snapshots fuera de línea antes de implementar cualquier GC.
Backup/restore: detener el CLI/escritor, copiar el árbol completo (incluye índice,
raw y errores) a destino nuevo; verificar con `store.verify()` antes de usarlo.
Rollback: dejar de ejecutar CLI y desactivar el módulo; conservar carpeta nueva.
Nunca restaurar encima de un proceso activo ni de un directorio con datos.

Fuentes de licencia pendiente requieren opt-in **local de investigación** para
archivo, separado del opt-in de red; no constituye permiso de redistribución.
El estado legal pendiente siempre permanece en el envelope y bloquea publicación.
El catálogo limita URLs GET exactas, tamaño y timeout, y no sigue redirecciones.
429 respeta Retry-After, 403 pausa; fallos repetidos abren circuito. Sin reintento
automático inmediato: cada invocación posterior respeta el cooldown. No exponer
mensajes remotos ni excepciones de red en logs.
