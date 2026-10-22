const CACHE = "aegis-watch-v1";
const SHELL = [
  "/watch/",
  "/watch/app.js",
  "/watch/style.css",
  "/watch/manifest.webmanifest",
  "/watch/icon-192.png",
  "/watch/icon-512.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("aegis-watch-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !SHELL.includes(url.pathname)
  )
    return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response.status === 404 && url.pathname === "/watch/") {
          await caches.delete(CACHE);
          await self.registration.unregister();
        }
        return response;
      } catch {
        const cached = await caches.match(url.pathname);
        return (
          cached ||
          new Response(
            "Sin conexión. Vuelve a consultar antes de confiar en un horario.",
            {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            },
          )
        );
      }
    })(),
  );
});
function destination(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (
      url.origin === self.location.origin &&
      url.pathname === "/watch/" &&
      !url.hash &&
      [...url.searchParams.keys()].every((k) => k === "area_id")
    )
      return url.href;
  } catch {}
  return new URL("/watch/", self.location.origin).href;
}
async function validMessage(data) {
  if (
    !Array.isArray(data.job_ids) ||
    data.job_ids.length < 1 ||
    data.job_ids.length > 3
  )
    return false;
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 5000);
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) return false;
    const value = subscription.toJSON(),
      browser = {
        endpoint: value.endpoint,
        expirationTime: value.expirationTime ?? null,
        keys: value.keys,
      };
    const response = await fetch("/api/v1/push/validate", {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Aegis-Request": "sector-watch",
      },
      body: JSON.stringify({ browser, job_ids: data.job_ids }),
    });
    return response.ok && (await response.json()).current === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
self.addEventListener("push", (event) =>
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data.json();
      } catch {
        return;
      }
      if (
        !data ||
        typeof data.title !== "string" ||
        typeof data.body !== "string"
      )
        return;
      const valid = await validMessage(data);
      const title = valid
        ? data.title.slice(0, 120)
        : "AEGIS · consulta la versión vigente";
      const body = valid
        ? data.body.slice(0, 1500)
        : "Un aviso ya no se puede verificar. Consulta la programación actual; este mensaje no confirma un corte ni una cancelación.";
      await self.registration.showNotification(title, {
        body,
        icon: "/watch/icon-192.png",
        badge: "/watch/icon-192.png",
        tag: /^[A-Za-z0-9_-]{1,32}$/.test(data.tag || "")
          ? data.tag
          : "aegis-watch",
        data: { url: destination(data.url) },
      });
    })(),
  ),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = destination(event.notification.data?.url);
      for (const client of await self.clients.matchAll({
        type: "window",
        includeUncontrolled: false,
      })) {
        if (new URL(client.url).pathname === "/watch/") {
          client.postMessage({ type: "schedule-update", url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
