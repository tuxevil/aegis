/* Private management state lives only in this page's RAM, never URL or Storage. */
(() => {
  const $ = (id) => document.getElementById(id),
    selected = new Map();
  let config,
    registration,
    challenge,
    readyAt = 0,
    owner = null,
    secret = null,
    pending = null,
    busy = false;
  const message = (text) => ($("status").textContent = text);
  const uuid = () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    const s = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  };
  const token = () =>
    btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const keyBytes = (value) =>
    Uint8Array.from(
      atob(
        value.replace(/-/g, "+").replace(/_/g, "/") +
          "=".repeat((4 - (value.length % 4)) % 4),
      ),
      (c) => c.charCodeAt(0),
    );
  async function request(
    url,
    { method = "GET", body, authenticated = false } = {},
  ) {
    const headers = { "X-Aegis-Request": "sector-watch" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (authenticated && secret) headers.Authorization = `Bearer ${secret}`;
    const response = await fetch(url, {
      method,
      headers,
      credentials: "omit",
      cache: "no-store",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error?.message || "Servicio no disponible");
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function render() {
    $("selected").replaceChildren();
    for (const [id, value] of selected) {
      const li = document.createElement("li"),
        name = document.createElement("p"),
        label = document.createElement("label"),
        input = document.createElement("input"),
        remove = document.createElement("button");
      name.textContent = value.name;
      input.value = value.alias;
      input.maxLength = 30;
      input.id = `alias-${id}`;
      input.autocomplete = "off";
      label.htmlFor = input.id;
      label.textContent = "Alias privado (sin dirección)";
      input.addEventListener("input", () => (value.alias = input.value));
      remove.type = "button";
      remove.textContent = "Quitar";
      remove.addEventListener("click", () => {
        selected.delete(id);
        render();
      });
      li.append(name, label, input, remove);
      $("selected").append(li);
    }
    controls();
  }
  function controls() {
    const available = Boolean(
      config &&
        !busy &&
        selected.size &&
        (owner?.status === "active" ||
          (!owner && challenge && Date.now() >= readyAt)),
    );
    $("save-web").disabled = !available;
    $("enable-push").disabled =
      !available ||
      Boolean(pending) ||
      !registration ||
      !("PushManager" in window) ||
      !("Notification" in window);
    $("test").disabled = busy || !owner?.push_registered;
    $("revoke").disabled = busy || owner?.status !== "active";
  }
  async function renew() {
    challenge = await request("/api/v1/subscription-challenges", {
      method: "POST",
      body: {},
    });
    readyAt = Date.now() + challenge.min_wait_seconds * 1000;
    $("verification-status").textContent =
      "Comprobación preparada. Espera un segundo antes de guardar.";
    $("answer-label").hidden = !challenge.question;
    if (challenge.question)
      $("answer-label").firstChild.textContent = challenge.question;
    $("answer").value = "";
    controls();
    setTimeout(controls, challenge.min_wait_seconds * 1000 + 20);
  }
  function values(browser, push) {
    if (!selected.size || !$("consent").checked)
      throw Error("Elige sectores y acepta la política antes de guardar.");
    if (
      push &&
      (!$("push-consent").checked ||
        !["scheduled", "changes", "cancellations"].some((id) => $(id).checked))
    )
      throw Error(
        "Activa el consentimiento Push y elige al menos una categoría.",
      );
    const hours = ["quiet-start", "quiet-end", "digest-hour"].map((id) => {
      if ($(id).value.trim() === "")
        throw Error("Completa las horas de preferencia.");
      const h = Number($(id).value);
      if (!Number.isInteger(h) || h < 0 || h > 23)
        throw Error("Usa horas enteras de 0 a 23.");
      return h;
    });
    const [start, end, digest] = hours,
      quiet =
        start === end
          ? false
          : start < end
            ? digest >= start && digest < end
            : digest >= start || digest < end;
    if ($("mode").value === "digest" && quiet)
      throw Error("Elige una hora de resumen fuera del silencio.");
    if (
      [...selected.values()].some(
        (a) => !a.alias.trim() || a.alias.trim().length > 30,
      )
    )
      throw Error("Completa los alias privados de hasta 30 caracteres.");
    return {
      areas: [...selected].map(([area_id, a]) => ({ area_id, alias: a.alias })),
      preferences: {
        mode: $("mode").value,
        quiet_start: Number($("quiet-start").value),
        quiet_end: Number($("quiet-end").value),
        digest_hour: Number($("digest-hour").value),
        scheduled: $("scheduled").checked,
        changes: $("changes").checked,
        cancellations: $("cancellations").checked,
      },
      browser,
      push_consent: push,
      consent: true,
      consent_version: config.consent_version,
    };
  }
  function applyOwner(data) {
    owner = data;
    selected.clear();
    for (const a of data.areas)
      selected.set(a.area_id, { name: a.area_name, alias: a.alias });
    if (data.preferences) {
      $("mode").value = data.preferences.mode;
      for (const [field, key] of [
        ["quiet-start", "quiet_start"],
        ["quiet-end", "quiet_end"],
        ["digest-hour", "digest_hour"],
      ])
        $(field).value = data.preferences[key];
      for (const field of ["scheduled", "changes", "cancellations"])
        $(field).checked = data.preferences[field];
    }
    $("push-consent").checked = data.push_consent;
    $("consent").checked = false;
    $("owner-state").textContent =
      `Suscripción ${data.status === "active" ? "activa" : "dada de baja"} · versión ${data.revision}. Push ${data.endpoint_state === "active" ? "registrado" : data.endpoint_state === "invalid" ? "inválido: vuelve a activar" : "desactivado"}. Aceptación por proveedor no confirma lectura.`;
    render();
  }
  function lockPending(locked) {
    for (const node of document.querySelectorAll(
      "#preferences input,#preferences select,#selected input,#selected button,#search,#search-button",
    ))
      node.disabled = locked;
    $("save-web").textContent = locked
      ? "Reintentar envío pendiente"
      : "Guardar sin notificaciones";
  }
  async function save(browser, push) {
    busy = true;
    controls();
    try {
      if (owner) {
        const data = await request(`/api/v1/subscriptions/${owner.id}`, {
          method: "PATCH",
          authenticated: true,
          body: { ...values(browser, push), expected_revision: owner.revision },
        });
        applyOwner(data);
        if (!push)
          try {
            await (
              await registration?.pushManager.getSubscription()
            )?.unsubscribe();
          } catch {}
        message("Preferencias actualizadas.");
      } else {
        if (!pending) {
          const value = values(browser, push);
          if (!challenge || Date.now() < readyAt)
            throw Error("Renueva la comprobación y espera un segundo.");
          secret = token();
          pending = {
            ...value,
            management_token: secret,
            request_id: uuid(),
            challenge_id: challenge.challenge_id,
            answer: $("answer").value,
            website: $("website").value,
          };
        }
        const data = await request("/api/v1/subscriptions", {
          method: "POST",
          body: pending,
        });
        pending = null;
        lockPending(false);
        applyOwner(data);
        $("owner-code").value = `${data.id}.${secret}`;
        $("receipt").hidden = false;
        message("Suscripción guardada. Conserva el código antes de cerrar.");
      }
    } catch (error) {
      if (pending && (!error.status || error.status >= 500)) {
        lockPending(true);
        message(
          "Respuesta incierta. Conservamos el envío en esta pestaña: vuelve a pulsar Guardar sin notificaciones para reintentar el mismo envío.",
        );
      } else {
        pending = null;
        lockPending(false);
        message(error.message);
        if (!owner)
          try {
            await renew();
          } catch {}
      }
    } finally {
      busy = false;
      controls();
    }
  }
  $("search-button").addEventListener("click", async () => {
    try {
      const data = await request(
        `/api/v1/areas?type=sector&q=${encodeURIComponent($("search").value.trim())}&limit=50`,
      );
      $("results").replaceChildren();
      for (const a of data.data) {
        const li = document.createElement("li"),
          button = document.createElement("button");
        button.type = "button";
        button.textContent = `Elegir ${a.name}`;
        button.addEventListener("click", () => {
          if (pending || busy) return;
          if (selected.size >= 5 && !selected.has(a.id))
            return message("Máximo cinco sectores.");
          selected.set(a.id, { name: a.name, alias: a.name.slice(0, 30) });
          render();
        });
        li.append(button);
        $("results").append(li);
      }
      if (!data.data.length)
        message(
          "Sin sectores verificables para esta búsqueda. No implica suministro normal.",
        );
    } catch (error) {
      message(error.message);
    }
  });
  $("search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("search-button").click();
    }
  });
  $("preferences").addEventListener("submit", (e) => e.preventDefault());
  $("save-web").addEventListener("click", () => save(null, false));
  $("enable-push").addEventListener("click", () => {
    try {
      values(null, true);
      if (!registration || !("PushManager" in window))
        throw Error("Push no está disponible. Usa la consulta web.");
      if (Notification.permission === "denied")
        throw Error(
          "Notificaciones bloqueadas. Revisa permisos del navegador; no insistiremos con otro diálogo.",
        );
      // subscribe is called directly in the human click handler, before any await.
      const promise = registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(config.public_key),
      });
      busy = true;
      controls();
      promise
        .then((subscription) => {
          const value = subscription.toJSON();
          return save(
            {
              endpoint: value.endpoint,
              expirationTime: value.expirationTime ?? null,
              keys: value.keys,
            },
            true,
          );
        })
        .catch(() => {
          busy = false;
          controls();
          message(
            "No se activaron notificaciones. Puedes cancelar el permiso o usar la consulta web.",
          );
        });
    } catch (error) {
      message(error.message);
    }
  });
  $("renew").addEventListener("click", () =>
    renew().catch((error) => message(error.message)),
  );
  $("load").addEventListener("click", async () => {
    const code = $("management-code").value.trim();
    $("management-code").value = "";
    const match = /^(watch_[A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(code);
    if (!match) return message("Código privado no válido.");
    try {
      secret = match[2];
      applyOwner(
        await request(`/api/v1/subscriptions/${match[1]}`, {
          authenticated: true,
        }),
      );
      message(
        "Preferencias cargadas. Vuelve a aceptar la política para cambiarlas.",
      );
    } catch (error) {
      secret = null;
      owner = null;
      controls();
      message(error.message);
    }
  });
  $("revoke").addEventListener("click", async () => {
    if (!owner || !secret) return;
    busy = true;
    controls();
    try {
      const data = await request(`/api/v1/subscriptions/${owner.id}`, {
        method: "DELETE",
        authenticated: true,
        body: {},
      });
      applyOwner(data);
      secret = null;
      $("owner-code").value = "";
      $("management-code").value = "";
      $("receipt").hidden = true;
      try {
        await (
          await registration?.pushManager.getSubscription()
        )?.unsubscribe();
      } catch {}
      message(
        "Baja completada: se eliminaron datos activos y se detuvieron avisos pendientes.",
      );
    } catch (error) {
      message(error.message);
    } finally {
      busy = false;
      controls();
    }
  });
  $("test").addEventListener("click", async () => {
    try {
      await request(`/api/v1/subscriptions/${owner.id}/test`, {
        method: "POST",
        authenticated: true,
        body: { request_id: uuid() },
      });
      message(
        config.delivery_enabled
          ? "Prueba encolada. No confirma recepción."
          : "Prueba encolada; el envío está desactivado en este piloto.",
      );
    } catch (error) {
      message(error.message);
    }
  });
  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("owner-code").value);
      message("Código copiado. Guárdalo en un lugar privado.");
    } catch {
      $("owner-code").focus();
      $("owner-code").select();
      message("Selecciona y copia el código.");
    }
  });
  $("hide-code").addEventListener("click", () => {
    $("owner-code").value = "";
    $("receipt").hidden = true;
  });
  function clear() {
    secret = null;
    owner = null;
    pending = null;
    selected.clear();
    $("consent").checked = false;
    $("push-consent").checked = false;
    $("owner-code").value = "";
    $("management-code").value = "";
    $("receipt").hidden = true;
    lockPending(false);
    $("owner-state").textContent = "Sin sesión de gestión.";
    controls();
  }
  $("forget").addEventListener("click", () => {
    clear();
    selected.clear();
    render();
    message(
      "Sesión local cerrada. Una suscripción activa sigue vigente hasta la baja.",
    );
  });
  window.addEventListener("pagehide", clear);
  $("query").addEventListener("click", async () => {
    try {
      if (!selected.size) throw Error("Elige un sector para consultar.");
      const date = $("query-date").value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw Error("Elige una fecha válida.");
      const next = new Date(`${date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const to = next.toISOString().slice(0, 10);
      $("schedules").replaceChildren();
      for (const [id, area] of selected) {
        const query = new URLSearchParams({
            area_id: id,
            from: `${date}T00:00:00-05:00`,
            to: `${to}T00:00:00-05:00`,
          }),
          data = await request(`/api/v1/schedules?${query}`);
        for (const row of data.data) {
          const li = document.createElement("li"),
            text = document.createElement("p"),
            link = document.createElement("a");
          text.textContent = `${row.area_name}: ${row.original_time_string} (Ecuador). ${row.type === "industrial" ? "Industrial / alta tensión" : row.type === "maintenance" ? "Mantenimiento" : "Programación"}. ${row.effective_status === "unverified" ? "Sin verificar: consulta la fuente" : row.effective_status === "cancelled" ? "Cancelación documentada" : "Versión revisada"}. Fuente ${row.issuer}. Última consulta: ${row.last_checked_at || "desconocida"}.`;
          link.textContent = "Fuente oficial";
          if (
            row.source_url === "https://www.eeasa.com.ec/trabajos-programadas/"
          ) {
            link.href = row.source_url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
          }
          li.append(text, link);
          $("schedules").append(li);
        }
        if (!data.data.length) {
          const li = document.createElement("li");
          li.textContent = `${area.name}: sin programación revisada disponible. Cobertura desconocida; no significa que no habrá cortes.`;
          $("schedules").append(li);
        }
      }
      message("Consulta actualizada. Vuelve a consultar para ver cambios.");
    } catch (error) {
      message(error.message);
    }
  });
  navigator.serviceWorker?.addEventListener?.("message", (event) => {
    if (event.data?.type === "schedule-update")
      message(
        "Llegó un aviso. Consulta la programación actual sin perder tus preferencias pendientes.",
      );
  });
  async function init() {
    $("query-date").value = new Date(Date.now() - 5 * 3600000)
      .toISOString()
      .slice(0, 10);
    try {
      config = await request("/api/v1/push/public-key");
      $("policy").textContent = config.policy;
      $("availability").textContent =
        `${config.synthetic ? "Datos sintéticos · " : ""}${config.delivery_enabled ? "Avisos sujetos a revisión de fuente y zona." : "Piloto: el envío Push está desactivado. La consulta web sigue disponible."}`;
      const ios =
          /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
        standalone =
          window.matchMedia?.("(display-mode: standalone)").matches ||
          navigator.standalone;
      if (ios && !standalone)
        $("platform").textContent =
          "En iPhone/iPad compatibles: Safari → Compartir → Añadir a la pantalla de inicio. Abre ese icono y pulsa Activar. Si no está disponible, usa la consulta web.";
      if ("serviceWorker" in navigator && window.isSecureContext)
        try {
          registration = await navigator.serviceWorker.register(
            "/watch/sw.js",
            { scope: "/watch/" },
          );
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("SW_TIMEOUT")), 5000),
            ),
          ]);
        } catch {
          registration = null;
          $("platform").textContent =
            "No se pudo instalar el modo offline. Puedes guardar sin Push o consultar en la web.";
        }
      else
        $("platform").textContent =
          "Push no está disponible aquí. Puedes consultar en la web sin permisos.";
      await renew();
    } catch (error) {
      message(error.message);
      $("availability").textContent =
        "Seguimiento no disponible. Vuelve a consultar con conexión; no uses horarios cacheados como datos vigentes.";
    }
    controls();
  }
  init();
})();
