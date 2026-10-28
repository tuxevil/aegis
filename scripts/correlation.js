// Local filesystem permission is the operator credential. No HTTP admin route.
import fs from "node:fs";
import path from "node:path";
import { openStore } from "../storage/sqlite-store.js";
import { readFeatureFlags } from "../feature-flags.js";
const [command, eventId, extra] = process.argv.slice(2);
try {
  if (extra || !["submit","recalculate","hold","history","evidence"].includes(command) || (command === "submit" ? eventId !== undefined : !eventId)) throw new Error("Uso: correlation.js submit < JSON | recalculate <event_id> | hold <event_id> | history <event_id> | evidence <event_id>");
  if (!["history","evidence"].includes(command) && !readFeatureFlags().EVENT_CORRELATION) throw new Error("EVENT_CORRELATION debe habilitarse explícitamente");
  const directory = process.env.DB_DIR || ".data/v5";
  if (!fs.existsSync(path.join(directory,"aegis-v5.sqlite"))) throw new Error("Inicializar almacenamiento explícitamente");
  let input;
  if (command === "submit") {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 16384) throw new Error("Entrada excede 16 KiB");
      chunks.push(chunk);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  const store = await openStore({ directory,synthetic:process.env.SQLITE_DEMO === "true",allowMigrations:false });
  try {
    const result = command === "submit" ? store.correlation.submit(input)
      : command === "hold" ? store.correlation.hold(eventId)
      : command === "recalculate" ? store.correlation.recalculate(eventId) : command === "evidence" ? store.correlation.decisions(eventId) : store.correlation.revisions(eventId);
    console.log(JSON.stringify(result,null,2));
  } finally { store.close(); }
} catch (error) { console.error(error.message); process.exitCode = 1; }
