# Solicitudes institucionales de datos — AEGIS

**Estado:** borradores preparados, **no enviados**, 27-10-2026.  
**Objetivo:** obtener contratos de acceso, permisos de reutilización e históricos verificables **antes de implementar alertas públicas**.

## 1. INAMHI

**Destinatario confirmado en sitio institucional:** datos@inamhi.gob.ec  
**Asunto:** Consulta técnica sobre acceso a advertencias, histórico y reutilización de datos para observatorio ciudadano abierto

Estimado equipo del INAMHI:

Estamos investigando AEGIS, un proyecto ecuatoriano de software abierto orientado a facilitar que ciudadanos consulten advertencias meteorológicas y reciban avisos preventivos voluntarios relacionados con su ubicación. Nuestro enfoque es **retransmitir fielmente las fuentes oficiales**, atribuirlas, conservar su vigencia y ofrecer enlaces al documento original; no reemplazar las competencias del INAMHI ni emitir órdenes de evacuación.

Durante el análisis del episodio de lluvias del 26 de octubre de 2026 encontramos el Boletín Meteorológico N.º 83, cuya emisión consta a las 14:00 del 25 de octubre y vigencia desde las 16:00 del mismo día. Quisiéramos consultar:

1. ¿Existe una vía documentada y estable de acceso programático a advertencias meteorológicas e hidrológicas, nowcasting y boletines (CAP, API JSON, RSS/Atom, GeoJSON u otro formato), con timestamps, alcance territorial, revisiones y vencimiento?
2. ¿Es posible acceder al **archivo histórico** de esos avisos con su fecha de emisión y versiones previas? Nos interesan el Boletín N.º 83 y los nowcastings del 25–27 de octubre de 2026, para estudiar qué información podía conocerse antes de la tormenta.
3. ¿El visor hidrometeorológico cuenta con API/descarga institucional para observaciones de estaciones, incluyendo identificador geográfico, calidad de lectura, hora de medición, intervalo de actualización e histórico?
4. ¿Cuáles son las condiciones y forma de atribución para **archivar documentos originales** y retransmitir gratuitamente su contenido, de forma automática o semiautomática, en una plataforma web y canales voluntarios de WhatsApp?
5. ¿Existe un contacto técnico para coordinar validación de la integración o informar inconsistencias entre las fechas del documento y el último archivo enlazado?

Nuestro propósito inicial es exclusivamente de prueba y evaluación. No publicaremos alertas automáticas hasta validar fuentes, cobertura territorial, vigencia y procedimientos de corrección.

Agradeceríamos orientación, documentación técnica y, de ser necesario, el procedimiento formal para solicitar acceso o autorización. Muchas gracias por su labor de vigilancia meteorológica.

Atentamente,  
Equipo AEGIS / tuxevil  
Repositorio: https://github.com/tuxevil/aegis

## 2. Secretaría Nacional de Gestión de Riesgos

**Destinatario:** por confirmar en fuente institucional (no inventar un correo).  
**Asunto:** Consulta técnica sobre capas geográficas de amenazas y reportes de monitoreo para proyecto AEGIS

Estimado equipo técnico de la Secretaría Nacional de Gestión de Riesgos:

Estamos planificando AEGIS, un observatorio ciudadano abierto que busca visualizar información oficial de amenazas y difundir avisos preventivos con atribución inequívoca, fecha de vigencia y delimitación territorial. No se pretende sustituir las comunicaciones oficiales ni producir órdenes propias de evacuación.

Hemos identificado los servicios ArcGIS REST:
- https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Susceptibilidad_de_Inundaciones/MapServer
- https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/MULTIAMENAZAS_SGR/FeatureServer/0

Y la colección pública de reportes de monitoreo de amenazas y eventos peligrosos.

Agradeceríamos información sobre:
1. Licencias, atribución y permisos de consulta automatizada, almacenamiento de versiones y visualización pública no onerosa.
2. Metadatos completos: metodología, fecha de revisión, resolución/escala y alcance geográfico de cada capa; definición técnica de categorías de susceptibilidad.
3. Disponibilidad de límites administrativos (códigos DPA oficiales) y cartografía consistente para intersecciones cantón/parroquia.
4. Si existe un servicio estructurado o feed para reportes de incidentes, avisos, vías afectadas y actualizaciones/correcciones, con fechas y versiones históricas.
5. Un mecanismo de coordinación técnica para evitar interpretaciones inadecuadas de la susceptibilidad estática como si fuera una predicción de daños.

Nos interesa empezar con pruebas retrospectivas en Guayaquil y Pallatanga, con todas las notificaciones públicas deshabilitadas mientras evaluamos fiabilidad.

Agradecemos cualquier documentación o indicación para solicitar formalmente los datos.

Atentamente,  
Equipo AEGIS / tuxevil  
Repositorio: https://github.com/tuxevil/aegis

## Registro posterior a eventual envío

Por cada contacto conservar:
`institution`, `recipient`, `requestedAt`, `responseAt`, `responseSummary`, `authorizationScope`, `attributionRequirements`, `restrictions`, `technicalContact`, `proofReference`, `decision`.

No asumir autorización por silencio. Los mensajes se entregarán con datos de contacto verificados; no pedir ni enviar contraseñas, sesiones WAHA, ubicación residencial o datos personales de suscriptores.
