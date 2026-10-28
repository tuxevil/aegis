// Local operator CLI. No HTTP mutation/admin registration.
import fs from "node:fs";
import path from "node:path";
import { openStore } from "../storage/sqlite-store.js";
import { readFeatureFlags } from "../feature-flags.js";
import { provider } from "../schedules/providers.js";
import { captureSchedule } from "../schedules/capture.js";
const [command, arg, extra] = process.argv.slice(2);
try {
  if (
    extra ||
    ![
      "fetch",
      "import",
      "bind",
      "review",
      "queue",
      "history",
      "document",
    ].includes(command)
  )
    throw new Error(
      "Uso: schedules.js fetch PROVIDER | import PROVIDER < HTML | bind < JSON | review < JSON | queue | history ENTRY_ID | document ARTIFACT_ID",
    );
  if (
    !["queue", "history", "document"].includes(command) &&
    !readFeatureFlags().OFFICIAL_SCHEDULES
  )
    throw new Error("OFFICIAL_SCHEDULES debe habilitarse explícitamente");
  const directory = process.env.DB_DIR || ".data/v5";
  if (!fs.existsSync(path.join(directory, "aegis-v5.sqlite")))
    throw new Error("Inicializar almacenamiento explícitamente");
  let input;
  if (["import", "bind", "review"].includes(command)) {
    const max = command === "import" ? provider(arg).max_bytes : 16384,
      chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > max) throw new Error("Entrada excede límite");
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks);
    if (command !== "import") input = JSON.parse(input.toString("utf8"));
  }
  if (
    ["fetch", "import", "history", "document"].includes(command)
      ? !arg
      : arg !== undefined
  )
    throw new Error("Argumentos inválidos");
  const store = await openStore({
    directory,
    synthetic: process.env.SQLITE_DEMO === "true",
    allowMigrations: false,
  });
  try {
    let result;
    if (command === "fetch") result = await captureSchedule(store, arg);
    else if (command === "import")
      result = store.schedules.ingest({ provider_id: arg, body: input });
    else if (command === "bind") result = store.schedules.bind(input);
    else if (command === "review") result = store.schedules.review(input);
    else if (command === "queue") result = store.schedules.queue();
    else if (command === "history") result = store.schedules.history(arg);
    else {
      const body = store.schedules.document(arg);
      if (!body) throw new Error("Documento no encontrado");
      process.stdout.write(body);
      result = null;
    }
    if (result) {
      console.log(JSON.stringify(result, null, 2));
      if (result.outcome === "failed" || result.parse_error)
        process.exitCode = 1;
    }
  } finally {
    store.close();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
