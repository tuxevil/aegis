// Schema export only: ephemeral synthetic DB, no source fetch, no Push transport.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import webPush from "web-push";
import { openStore } from "../storage/sqlite-store.js";
import { createApp } from "../backend.js";
import { HistoryStore } from "../history.js";
const key = randomBytes(32),
  vapid = webPush.generateVAPIDKeys(),
  origin = "https://example.invalid",
  store = await openStore({
    directory: ":memory:",
    synthetic: true,
    pushStorageKey: key,
  });
let app;
try {
  app = await createApp({
    store: new HistoryStore(),
    mac: null,
    openV5Store: async () => store,
    fetchUrl: async () => {
      throw Error("Schema export never fetches sources");
    },
    reportsOrigin: origin,
    pushConfig: {
      origin,
      storageKey: key,
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
      delivery: false,
    },
    flags: {
      PUBLIC_API_V1: true,
      SQLITE_STORAGE: true,
      BLACKOUT_MAP: true,
      CITIZEN_REPORTS: true,
      OFFICIAL_SCHEDULES: true,
      PUSH_ALERTS: true,
      TIME_MACHINE: true,
      EXPLORER_3D: true,
    },
  });
  const response = await app.inject("/api/v1/openapi.json");
  if (response.statusCode !== 200) throw Error("OpenAPI export unavailable");
  const document = response.json(),
    destination = process.argv[2] || "docs/api/openapi.json";
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(document, null, 2) + "\n");
  console.log(
    JSON.stringify({
      file: destination,
      public_get_paths: Object.keys(document.paths).length,
    }),
  );
} finally {
  await app?.close();
  store.close();
}
