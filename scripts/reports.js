// Local operator only. Never registered as an HTTP/admin route.
import fs from "node:fs";
import path from "node:path";
import { openStore } from "../storage/sqlite-store.js";
const [command, id, revision] = process.argv.slice(2);
try {
  const directory = process.env.DB_DIR || ".data/v5";
  if (!fs.existsSync(path.join(directory, "aegis-v5.sqlite"))) throw new Error("Inicializar el store explícitamente antes de moderar");
  const store = await openStore({ directory, synthetic: process.env.SQLITE_DEMO === "true", allowMigrations: false });
  try {
    if (command === "queue" && !id) console.log(JSON.stringify(store.reports.queue(), null, 2));
    else if (["approve", "reject"].includes(command) && id && /^[1-9][0-9]*$/.test(revision || "")) {
      console.log(JSON.stringify(store.reports.moderate(id, Number(revision), command === "approve" ? "approved" : "rejected")));
    } else if (command === "prune" && !id) console.log(JSON.stringify({ removed: store.reports.prune() }));
    else throw new Error("Uso: reports.js queue | approve <id> <revision> | reject <id> <revision> | prune");
  } finally { store.close(); }
} catch (error) { console.error(error.reportCode || error.message); process.exitCode = 1; }
