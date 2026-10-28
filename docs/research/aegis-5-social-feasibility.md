# PR-09 — X y otras redes: decisión de viabilidad

Fecha de consulta: 2026-10-22. Estado: exploración documental; sin credenciales, compra de créditos, consultas a APIs de datos, scraping ni contactos. Alcance: PR-09 del backlog; no requiere un adaptador para completar el MVP.

## Decisión

**NO-GO operativo para X y otras redes en esta entrega.** La API oficial de X existe y su coste puede estimarse, pero no se han acreditado acceso autorizado, presupuesto, condiciones aplicables al caso de AEGIS ni cobertura útil de Ecuador/Pallatanga. Esta decisión no bloquea noticias/feeds, replay ni otros PR. No equivale a afirmar que X sea técnicamente inaccesible o que no haya publicaciones pertinentes.

No añadir dependencias, credenciales de muestra, scraping alternativo, polling ni activación de flags sociales. La capacidad queda documental y desactivada. Antes de un piloto habrá que pasar los gates indicados al final.

## X: coste y límites publicados

La documentación oficial describe créditos prepagados, pago por uso, sin suscripción ni mínimo; se factura por recurso leído. Publica USD 0,005 por Post y USD 0,010 por usuario; el límite del plan es 3 millones de lecturas de Posts por ciclo mensual. La consola permite seguimiento de gasto y límites. Los precios pueden cambiar. No se verificó una cuenta ni se consumieron créditos. [Precios oficiales](https://docs.x.com/x-api/getting-started/pricing).

Estimación ilustrativa calculada por AEGIS, sin impuestos, expansión de usuarios ni revalidaciones: 1.000 Posts únicos facturables/día × 30 días × USD 0,005 = **USD 150/mes**. No es presupuesto aprobado ni factura prevista. Deben verificarse deduplicación y cargos reales en la consola antes de cualquier piloto.

Recent Search cubre siete días; Full-Archive llega a 2006 y requiere acceso de pago por uso o Enterprise. Se admiten consultas por palabras, idioma y autor. Esto no demuestra cobertura exhaustiva ni geolocalización a sector. [Búsqueda oficial](https://docs.x.com/x-api/posts/search/introduction).

Recent Search publica 450 solicitudes/15 min por aplicación, 300 por usuario, máximo 100 resultados y consulta de 512 caracteres. Full-Archive publica 1 solicitud/segundo y 300/15 min por aplicación, máximo 500 resultados. Los encabezados `x-rate-limit-*` permiten gestionar cuota; 429 requiere esperar la ventana. El límite de solicitudes es distinto del gasto por recursos. [Límites oficiales](https://docs.x.com/x-api/fundamentals/rate-limits).

Los campos por defecto de una consulta de Post incluyen texto, ID e historial de edición; fechas y otros campos se solicitan expresamente. Pedir datos mínimos no concede por sí mismo permiso para redistribuirlos. [Campos oficiales](https://docs.x.com/x-api/fundamentals/fields).

## Cumplimiento y cobertura

La política exige respetar cuentas protegidas/bloqueadas, privacidad y cambios/borrados del contenido guardado. Las modificaciones deben atenderse cuanto antes, o dentro de 24 h tras solicitud de X o del titular según corresponda. La geografía no puede separarse del Post para construir seguimiento individual. Estos requisitos impiden asumir un archivo social inmutable dentro del historial de AEGIS. [Política oficial](https://docs.x.com/developer-terms/policy).

El acuerdo exige uso aprobado, restringe redistribución y remite a requisitos de presentación. El texto contractual aún menciona modalidades de suscripción mientras la página de precios anuncia pago por uso: se debe verificar qué aceptación y condiciones corresponden a la cuenta, sin inferir una licencia a partir del precio. [Acuerdo oficial, actualizado 2026-04-27](https://docs.x.com/developer-terms/agreement).

Las reglas restringen inferencias sensibles y asociación de identidades con hogares/dispositivos. AEGIS no debe enlazar autores sociales con recibos ciudadanos o suscripciones Push, ni inferir ubicación residencial. [Usos restringidos](https://docs.x.com/developer-terms/restricted-use-cases).

**Inferencia de diseño:** un Post sería una pista OSINT con procedencia y revisión, nunca aviso oficial, evidencia independiente por cada repost, ni disparador directo de Push. Una búsqueda sin resultados no prueba continuidad eléctrica. Ningún ensayo de cobertura se realizó, por lo que no se informa precisión, recall, latencia ni presencia de proveedores oficiales.

## Otras redes

Mastodon documenta lectura de cronologías y publicaciones públicas; algunas instancias deshabilitan el acceso público y los IDs son locales a cada instancia. No hay una cronología universal garantizada. La existencia del endpoint no acredita permiso de reutilización del contenido ni cobertura local: habría que elegir instancia y cuentas, revisar sus términos, rate limits y borrados antes de un piloto. **NO-GO operativo mientras esos puntos no estén documentados.** [Documentación oficial de datos públicos](https://docs.joinmastodon.org/client/public/).

Bluesky: los enlaces documentales consultados para búsqueda y rate limits redirigieron a nuevos sitios sin contenido verificable mediante esta herramienta; no se establecen precios, cobertura ni autorización. Queda pendiente de verificación documental específica, sin conexión ni adaptador. No se sustituyen estas lagunas por proveedores terceros o scraping.

## Gates de reapertura y observabilidad propuesta

Estas son condiciones futuras, no configuración ya implementada:

1. Responsable de acceso y presupuesto autorizado; verificar precios, cuotas y términos actuales en consola. Sin esta información, presupuesto permitido **USD 0** y cero solicitudes.
2. Allowlist de proveedores/cuentas públicas pertinentes y una evaluación acotada de cobertura con ejemplos verificados, zonas ambiguas y fechas originales/ingesta; no perfiles privados ni DMs.
3. Flag social y flag por proveedor apagados por defecto; credenciales fuera de Git, presupuesto diario/mensual y máximo de recursos/páginas por ejecución; detenerse al agotarse cualquiera, ante 401/403 o ausencia de precio vigente. No recarga automática por defecto.
4. Contadores privados agregados de solicitudes, recursos facturables estimados, gasto estimado/acumulado, presupuesto restante, 429, errores y última captura válida. No publicar tokens, consultas sensibles, IDs individuales ni afirmar que una estimación equivale a factura. Comparar periódicamente con la consola oficial.
5. Tests con transporte simulado: presupuesto cero no llama a red; reserva de presupuesto antes de pedir una página; paginación acotada; 429/backoff; deduplicación/reposts; borrados y ediciones; texto remoto inerte; enlaces permitidos; zonas ambiguas a revisión. Publicar únicamente enlaces/metadatos autorizados tras revisión de requisitos de presentación y privacidad.
6. Retención y supresión compatibles con X también en exportaciones, copias y replay; la auditoría puede registrar que hubo retirada sin conservar texto que deba borrarse. Sin resolverlo, mantener NO-GO.

## Resultado y próximo paso

Investigación completada con fuentes primarias públicas; ninguna prueba de integración real, compra, despliegue o activación. PR-09 puede entregarse como decisión documental NO-GO y continuar con PR-10. Reabrir un piloto social como cambio separado únicamente con evidencia de los gates anteriores.
