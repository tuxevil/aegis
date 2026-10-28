# Retractación editorial simulada

M4 requiere ensayar retractación además de cancelar una cola pendiente. El outbox
permite `kind=retraction` únicamente a un aprobador, para revisión ya retractada y
un destino que tenga una simulación anterior completada de esa misma revisión y
digest. Si nunca se simuló en ese transporte, se rechaza: no inventar difusión.
La API conserva `kind=notice` por defecto y no acepta destinos reales.

El ítem previo permanece intacto. La retractación guarda `originalKey`, versión
editorial y digest, usa la clave previa con sufijo `:retraction` y deduplica también
tras reiniciar. El sufijo distingue dos acciones sobre la misma revisión sin
cambiar claves de avisos existentes. RSS GUID y PWA tag distinguen igualmente las
acciones; siguen siendo serializadores privados, sin transporte de red.

La retractación no vuelve a afirmar actualidad de la fuente. Retira la revisión
editorial propia, no el boletín institucional ni la amenaza; por ello no exige que
la fuente continúe elegible o accesible. `evidenceCheck=null` es explícito en ese
ítem y no reemplaza la procedencia del aviso. El texto incluye el motivo auditado,
«No demuestra cancelación oficial ni fin de la amenaza» y ausencia de difusión real.

Una revisión antes aprobada puede retractarse después de vencer e incluso después
de registrar la caducidad. Una revisión que nunca se aprobó no obtiene ese permiso
por caducar. Los estados retractado/sustituido siguen terminales y los controles de
rol, razón, versión y journal se mantienen.

La simulación de retractación tiene una ventana propia de 24 horas desde enqueue;
no reutiliza la validez meteorológica del documento. Al vencer se cancela sin
simular. Mantiene el procesamiento manual, reintentos, backoff, dead-letter y las
validaciones estrictas de resultados `sent=false/providerMessageId=null`.
Esta ventana es una decisión de laboratorio y no define un protocolo de envío real.

Pruebas: API autenticada completa, UI DOM, cuatro serializadores existentes,
identidad RSS/PWA, cola original cancelada cuando corresponde, ausencia de historia,
transporte no simulado, rol indebido, reinicio/idempotencia, caducidad y corrección
editorial posterior al vencimiento. No se utilizaron candidatos reales ni WAHA.
