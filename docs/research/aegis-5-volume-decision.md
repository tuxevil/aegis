# PR-12 — decisión documental sobre cota-volumen

Fecha de revisión: 2026-10-22. **NO-GO para implementar un modelo de volumen útil o reserva energética real.** La decisión cumple la alternativa explícita del backlog; no significa que no existan levantamientos o curvas fuera del material verificado.

## Evidencia y límites de búsqueda

1. La [ficha técnica CELEC de Mazar](https://www.celec.gob.ec/celecsur/informacion-tecnica/central-hidroelectrica-paute-mazar/) permite respaldar referencias de diseño, pero no se ha obtenido de ella una tabla vigente cota–área–volumen con datum, incertidumbre y licencia de redistribución.
2. Se localizó una [tesis de UCACUE, «Estudio para la optimización de volumen de agua en los embalses de Mazar y Amaluza»](https://dspace.ucacue.edu.ec/server/api/core/bitstreams/15b8db52-9203-477b-8928-fecc5b6264f4/content), de Theilor Jhicson Suquilanda Ramon y José Ignacio Tacuri Jaramillo (autoría según portada; verificar transcripción del nombre antes de bibliografía definitiva). El índice de búsqueda y PDF recuperado inicialmente contienen una tabla 53 denominada curva de capacidad/área **estimada** de Mazar. La recuperación completa posterior agotó tiempo. No se validaron método, vigencia, datum, licencia ni autorización del operador: no importar sus cifras ni digitalizar la curva como datos reales.
3. Una [tesis histórica de EPN](https://bibdigital.epn.edu.ec/bitstream/15000/5853/1/T652.pdf) describe curvas obtenidas de cartografía con diferentes escalas. Esa pista bibliográfica no valida una batimetría vigente ni los cambios por sedimentación; no se incorporó su tabla a ningún modelo.
4. La búsqueda devolvió una referencia de CELEC titulada «Informe Anual CELEC SUR 2025» con mención de nueva batimetría y límites oficializados ante CENACE. El [URL devuelto](https://www.celec.gob.ec/celecsur/wp-content/uploads/2026/06/Informe_2025-1.pdf) respondió **404** al abrirse: se registra solo como pista no verificada, no como evidencia de una curva disponible o un límite vigente.
5. [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) es un modelo de superficie con agua aplanada. No sirve para reconstruir el volumen sumergido. Una máscara Sentinel de superficie tampoco aporta profundidad por sí sola.

La consulta incluyó CELEC, CENACE y repositorios académicos; no hubo contactos, pagos, credenciales, scraping privado ni descarga de datasets grandes. «Accesible en web» no constituye validación técnica ni permiso automático de redistribución de las tablas o anexos.

## Qué se conserva

Solo cota observada con procedencia y fecha, referencias separadas 2115 m seguridad / 2098 m diseño según invariantes del repositorio, y relieve/esquema educativo con leyenda de aproximación. No publicar volumen derivado, porcentaje real de reserva, MWh almacenados, días hasta apagón ni probabilidades. La máxima de diseño 2153 m no completa los datos faltantes para una conversión lineal.

## Requisitos para revisar el NO-GO

- Documento y archivo del operador o entidad competente, versión, fecha de levantamiento y validación técnica; originales preservados con checksum.
- Tabla licenciable cota–área–almacenamiento, CRS y datum vertical, unidades, ámbito y rango permitido; separar volumen total, muerto y útil.
- Vigencia frente a sedimentación y cambios de operación; incertidumbres y límites explícitos.
- Permiso de uso/redistribución aplicable a la tabla, no solo acceso al sitio.
- Pruebas de unidades m/Hm³/m³, monotonía, nodos, interpolación física documentada, límites sin extrapolación, valores nulos y propagación de incertidumbre. No derivar reserva eléctrica sin rendimiento, salto, restricciones y validación independiente del modelo energético.

No se crea función de volumen ficticia ni fixture que pueda confundirse con calibración real. La reapertura requiere evidencia nueva y revisión explícita; no bloquea las siguientes entregas del backlog.
