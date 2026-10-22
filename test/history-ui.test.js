import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
const script = fs.readFileSync(
    new URL("../public/history/app.js", import.meta.url),
    "utf8",
  ),
  html = fs.readFileSync(
    new URL("../public/history/index.html", import.meta.url),
    "utf8",
  );
const wait = async (condition) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("UI timeout");
};
test("history UI exposes unknown durations and sources as inert text, clears stale results on failure and requires chosen area", async (t) => {
  const dom = new JSDOM(html, {
      url: "https://example.invalid/history/",
      runScripts: "outside-only",
    }),
    { window } = dom,
    $ = (id) => window.document.getElementById(id);
  t.after(() => dom.window.close());
  window.AbortSignal = AbortSignal;
  let failed = false;
  window.fetch = async (url) => ({
    ok: !failed,
    json: async () =>
      url.startsWith("/api/v1/areas")
        ? { data: [{ id: "area", name: "<img src=x onerror=alert(1)>" }] }
        : {
            data: [
              {
                area_name: "<script>bad</script>",
                type: "unplanned",
                status: "unknown",
                revision: 2,
                start_at: null,
                end_at: null,
                recorded_at: "2026-10-22T12:10:00Z",
                duration_seconds: null,
                synthetic: true,
                redacted: false,
                evidence: [
                  {
                    source_name: "Synthetic source",
                    source_url: "https://example.invalid/source",
                    source_published_at: null,
                    ingested_at: "2026-10-22T12:10:00Z",
                    relation: "retraction",
                  },
                ],
              },
            ],
            meta: {
              known_at: "2026-10-22T12:10:00Z",
              next_offset: null,
              synthetic: true,
            },
          },
  });
  window.eval(script);
  $("filters").dispatchEvent(new window.Event("submit", { cancelable: true }));
  assert.match($("status").textContent, /Selecciona área/);
  $("search").value = "test";
  $("find").click();
  await wait(() => $("areas").querySelector("button"));
  $("areas").querySelector("button").click();
  $("filters").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await wait(() => $("results").querySelector("article"));
  assert.equal($("results").querySelectorAll("script,img").length, 0);
  assert.match($("results").textContent, /Duración respaldada: desconocida/);
  assert.equal(
    $("results").querySelector("a").href,
    "https://example.invalid/source",
  );
  assert.equal(window.localStorage.length, 0);
  failed = true;
  $("filters").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await wait(() => $("status").textContent.includes("no disponible"));
  assert.equal($("results").children.length, 0);
  assert.equal($("csv").disabled, true);
});
