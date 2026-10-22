export const CONSENT_VERSION = "reports-2026-10-21";
export const REPORT_POLICY = Object.freeze({
  consent_version: CONSENT_VERSION,
  purpose: "Recibir y revisar señales ciudadanas de interrupciones por sector. Un reporte no confirma un corte ni reposición general.",
  data: "Solo sector confirmado, estado declarado, hora opcional y recepción. No pedimos nombre, dirección, correo, GPS ni texto libre.",
  publication: "Los reportes esperan revisión. Solo se muestran resúmenes por sector con al menos tres reportes aprobados en 24 horas; no prueban fuentes independientes.",
  retention: "En la base activa, datos estructurados y huella hash del recibo: hasta 30 días; retirados o rechazados: hasta 7 días. Las copias diarias conservan hasta siete versiones; respaldos anteriores a cambios pueden durar hasta su revisión y borrado manual. El retiro deja de contar de inmediato.",
  abuse: "No escribimos tu IP en archivos de reportes ni backups. El control de reportes usa huellas con clave efímera en memoria, hasta una hora más un barrido de un minuto; las capas de red y seguridad procesan la IP transitoriamente.",
  rights: "El código privado permite consultar, corregir y retirar. Sin ese código no se puede recuperar el acceso; no hay cuenta ni correo de recuperación.",
});
export function reportError(code, statusCode = 400) {
  const error = new Error(code); error.reportCode = code; error.statusCode = statusCode; return error;
}
