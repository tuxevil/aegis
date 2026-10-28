# PR-12 — NO-GO de modelo cota-volumen

2026-10-22. Rama feat/aegis-5-pr-12 sobre PR-11. Decisión explícita permitida
por el backlog, sin implementar una conversión física ficticia o tabla no validada.
[Fuentes, límites y requisitos de reapertura](../research/aegis-5-volume-decision.md).

Se investigaron ficha CELEC, documentos académicos y pista de informe de batimetría.
No se obtuvo curva vigente con validación operativa, datum, incertidumbre y licencia
aplicables. Tesis con tabla estimada no se transforma en datos del operador. Pista
404 no prueba levantamiento actual ni nuevo umbral. DSM/imagen de superficie no
reconstruye fondo sumergido ni curva de almacenamiento útil.

Resultado: NO-GO para volumen real, reserva útil, MWh/autonomía o porcentaje de
energía derivado de altura. API PR-11 conserva volume_model=unavailable. Solo cota
observada/fechada, referencias separadas y esquema educativo con watermark. No hay
una función lineal o dataset inventado oculto detrás de un flag.

Aceptación alternativa de PR-12: documentación del origen y límites; NO-GO conserva
visualización solo de cota/esquema. Unidades, interpolación física e incertidumbre
se enumeran como requisitos para futura reapertura, no pruebas inventadas sobre
un modelo inexistente. Ningún parámetro/coeficiente sin respaldo se añadió.

Validación: git diff --check limpio. Solo documentación, sin runtime/deps/migración.
Se heredan resultados reales PR-11: npm ci audit0, check, 177/177 Node24/22.16,
Docker4/4 y navegador cuatro tamaños; no se presentan como nueva ejecución aquí.
No despliegue, fuentes reales adicionales, pagos/contactos o activación de flags.

Rollback documental no afecta stores. Reabrir solo con evidencia validada/licencia
revisada; siguiente PR-13 no depende de inventar el volumen y permanece read-only.

Revalidación final de la rama tras correcciones previas: npm ci audit0,
npm run check y **187/187** tests Node24. Esta ejecución nueva cierra el gate
obligatorio de esta entrega documental, sin activar volumen ni tocar producción.
