# Recuperación integral en laboratorio — diseño acotado

La herramienta offline conserva el árbol DATA_DIR completo, incluido observations,
fuentes/capas y journals editoriales/preferencias. No sustituye HistoryStore ni
migra formatos. Snapshots nuevos privados: `data/` + manifiesto v1 con tamaño y
SHA-256 por archivo, directorios y checksum del manifiesto. Solo rutas relativas
validadas, archivos regulares, presupuestos de entradas/bytes; no symlinks ni locks
o temporales de escritores. Destino inexistente y disjunto del origen.

Backup requiere afirmación explícita de quiescencia: el operador debe detener
escritores antes. Dos inventarios por hashes y comparación de la copia detectan
cambios observados; no son un snapshot atómico del filesystem frente a un escritor
malicioso/activo. Si falla, el origen no cambia y el destino incompleto se conserva
para inspección; sin manifiesto final no es backup válido.

Verificación recorre todos los bytes y los formatos v1 conocidos usando lectores
sin escrituras. Restore solo a raíz nueva, nunca encima de datos; verifica otra vez
origen y destino. No cambia variables, permisos de terceros, servicios o despliegue.
Un manifiesto detecta corrupción, no autentica a un administrador que lo reescriba.
Backup privado no equivale a copia cifrada, externa, redundante o recuperación
ante desastre: esos componentes necesitan entorno/operador y ensayo separado.

CLI seguro sin argumentos: no lee datos ni crea directorios. Con argumentos,
solo operaciones locales explícitas; salida de conteos/estado, sin rutas de
archivos internos, credenciales o contenido. Rollback conserva ambas raíces,
flags apagados y no restaura automáticamente notificaciones.
