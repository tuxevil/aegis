import fs from "node:fs";
import path from "node:path";
import { openStore } from "../storage/sqlite-store.js";
import { readFeatureFlags } from "../feature-flags.js";
import { captureFeed } from "../feeds/capture.js";
const [command, arg, extra] = process.argv.slice(2);
try {
  if (
    extra ||
    !["fetch", "import", "queue", "review", "grant", "history"].includes(
      command,
    ) ||
    (["fetch", "import", "history"].includes(command)
      ? !arg
      : arg !== undefined)
  )
    throw Error(
      "Uso: feeds.js fetch|import PROVIDER | queue | review < JSON | history ITEM_ID",
    );
  if (!["queue", "history"].includes(command) && !readFeatureFlags().OSINT_NEWS)
    throw Error("OSINT_NEWS requiere activación explícita");
  const directory = process.env.DB_DIR || ".data/v5";
  if (!fs.existsSync(path.join(directory, "aegis-v5.sqlite")))
    throw Error("Inicializar DB explícitamente");
  let body;
  if (["import", "review", "grant"].includes(command)) {
    const parts = [];
    let size = 0;
    for await (const part of process.stdin) {
      size += part.length;
      if (size > (command === "import" ? 262144 : 8192))
        throw Error("Entrada excede límite");
      parts.push(part);
    }
    body = Buffer.concat(parts);
  }
  const store = await openStore({
    directory,
    synthetic: process.env.SQLITE_DEMO === "true",
    allowMigrations: false,
  });
  try {
    const result =
      command === "fetch"
        ? await captureFeed(store, arg, {
            rightsReviewed: process.env.OSINT_RIGHTS_REVIEWED === "true",
          })
        : command === "import"
          ? store.feeds.ingest(arg, body)
          : command === "review"
            ? store.feeds.review(JSON.parse(body))
            : command === "grant"
              ? store.feeds.grant(JSON.parse(body))
              : command === "history"
                ? store.feeds.history(arg)
                : store.feeds.queue();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    store.close();
  }
} catch {
  console.error(
    "Feeds: operación no disponible; revisar comando, permisos, cuota o esquema localmente",
  );
  process.exitCode = 1;
}
