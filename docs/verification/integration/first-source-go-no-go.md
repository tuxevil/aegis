# Decisiones independientes — primera fuente y validación prolongada

29/10/2026. Evidencia: [ensayo real123s](offline-soak-2026-10-29.md),
[INAMHI](inamhi-first-source.md), [red efectiva de laboratorio](../../runbooks/inamhi-network-lab.md),
[TLS energético](grid-tls-investigation.md). Actualización: el ensayo de siete días
está iniciado en desarrollo; no hay resultado de siete días completados.

| Ámbito | Decisión | Motivo y siguiente decisión |
| --- | --- | --- |
|Ensayo offline7 días| INICIADO en desarrollo, autorizado | Ver seven-day-development.md; persistente y supervisable. No son siete días completados |
|Una consulta manual INAMHI| Preparada para aprobación independiente | Base pública documentada sin correo; política de namespace preparada, ownerApproval pendiente. Ningún GET real ejecutado |
|Ingesta periódica INAMHI| NO-GO | El puente actual solo permite un intento vitalicio; faltan derechos/cadencia/cuota, tamaños reales nuevos y validación de recursos/red |
|Staging Proxmox| NO-GO | Sin autorización; no SSH, instalación, puertos o firewall modificados |
|Validación predictiva| NO demostrada | Sin corpus compatible suficiente/negativos verificados; tasas y probabilidades desconocidas |
|Alertas públicas| NO-GO | Publicación false/DRY_RUN; ninguna autorización ni certificación de evaluación |

El propietario ya autorizó esta máquina de desarrollo para siete días offline.
No se requiere correo al INAMHI. La decisión pendiente es aprobar por separado
el comando de consulta única y sus destinos/DNS/archivo privado. Esa aprobación
no implica polling, redistribución, Proxmox, alertas o merge a main.

El nuevo sondeo documental histórico buscó Pallatanga octubre2026 en SNGR, ECU911
y GAD. Aparecieron índices de informes/mapas y una pista periodística sobre20/10,
no un negativo verificado ni etiqueta compatible. No se añadieron filas al corpus,
no se usaron noticias posteriores como features ni se asumió ausencia de incidentes.
La cobertura sigue desconocida. Un mapa de susceptibilidad/advertencia no confirma
que un incidente ocurrió ni que un sector estuvo seguro.

Límite de operación manual: la reserva de intento es durable en la raíz privada
del ensayo. No protege frente a un administrador que borre/copie/restaure estado
o reutilice una aprobación en otra raíz. La aprobación es para una consulta, no
para una por directorio: antes de restaurar/retomar hay que conciliar su consumo
y obtener una revisión nueva si existe incertidumbre. No automatizar esa decisión.
