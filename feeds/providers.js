export const FEEDS = Object.freeze([
  Object.freeze({
    id: "celec-news",
    name: "CELEC · noticias institucionales",
    url: "https://www.celec.gob.ec/feed/",
    origin: "https://www.celec.gob.ec",
    rights: "review-required",
  }),
  Object.freeze({
    id: "ministry-news",
    name: "Ministerio · noticias institucionales",
    url: "https://www.ambienteyenergia.gob.ec/feed/",
    origin: "https://www.ambienteyenergia.gob.ec",
    rights: "review-required",
  }),
]);
export function feedProvider(id) {
  const value = FEEDS.find((p) => p.id === id);
  if (!value) throw Error("Proveedor fuera del registro");
  return value;
}
