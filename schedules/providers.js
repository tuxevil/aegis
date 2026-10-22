// Registered after primary-source investigation; not a user-supplied URL registry.
export const EEASA = Object.freeze({
  id: "eeasa-maintenance",
  source_id: "eeasa-maintenance",
  issuer: "EEASA",
  url: "https://www.eeasa.com.ec/trabajos-programadas/",
  zone: "America/Guayaquil",
  parser_version: "eeasa-html-1",
  media_type: "text/html",
  max_bytes: 256 * 1024,
  access_policy: "review-required", // Public accessibility does not establish reuse permission.
});
export function provider(id) {
  if (id !== EEASA.id) throw new Error("Proveedor no registrado");
  return EEASA;
}
