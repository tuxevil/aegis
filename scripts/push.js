import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import webPush from "web-push";
import { openStore } from "../storage/sqlite-store.js";
import { readFeatureFlags } from "../feature-flags.js";
import { readPushConfig } from "../push/policy.js";
import { dispatchPush } from "../push/transport.js";
const [command, arg, extra] = process.argv.slice(2);
try {
  if (
    extra ||
    !["init-keys", "enqueue", "dispatch", "cancel", "status", "prune"].includes(
      command,
    )
  )
    throw new Error(
      "Uso: push.js init-keys FILE | enqueue [OFFSET] | dispatch | cancel < JSON | status | prune",
    );
  if (command === "init-keys") {
    if (!arg) throw new Error("Archivo nuevo requerido");
    const origin = process.env.WATCH_ORIGIN,
      url = new URL(origin);
    if (url.origin !== origin || url.protocol !== "https:")
      throw new Error("WATCH_ORIGIN HTTPS requerido");
    const keys = webPush.generateVAPIDKeys();
    fs.writeFileSync(
      arg,
      `WATCH_ORIGIN=${origin}\nPUSH_STORAGE_KEY=${randomBytes(32).toString("base64url")}\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nPUSH_DELIVERY=false\n`,
      { flag: "wx", mode: 0o600 },
    );
    console.log(JSON.stringify({ created: true, mode: "0600" }));
  } else {
    if (command !== "status" && !readFeatureFlags().PUSH_ALERTS)
      throw new Error("PUSH_ALERTS debe habilitarse explícitamente");
    if (command !== "enqueue" && arg) throw new Error("Argumento inesperado");
    const directory = process.env.DB_DIR || ".data/v5";
    if (!fs.existsSync(path.join(directory, "aegis-v5.sqlite")))
      throw new Error("Inicializar almacenamiento explícitamente");
    const store = await openStore({
      directory,
      synthetic: process.env.SQLITE_DEMO === "true",
      allowMigrations: false,
    });
    try {
      let result;
      if (command === "enqueue") {
        if (arg && !/^\d+$/.test(arg)) throw new Error("Offset inválido");
        result = store.subscriptions.enqueue({ offset: Number(arg || 0) });
      } else if (command === "dispatch")
        result = await dispatchPush(store, readPushConfig());
      else if (command === "status") result = store.subscriptions.diagnostics();
      else if (command === "prune") result = store.subscriptions.prune();
      else {
        const chunks = [];
        let size = 0;
        for await (const chunk of process.stdin) {
          size += chunk.length;
          if (size > 8192) throw new Error("Entrada excede límite");
          chunks.push(chunk);
        }
        result = store.subscriptions.confirmCancellation(
          JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
      }
      console.log(JSON.stringify(result));
    } finally {
      store.close();
    }
  }
} catch (error) {
  console.error(error.pushCode || error.message);
  process.exitCode = 1;
}
