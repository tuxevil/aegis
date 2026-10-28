import { openStore } from "../storage/sqlite-store.js";
import { restoreSnapshot, verifySnapshot, snapshot, pruneDailySnapshots } from "../storage/backups.js";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "restore" && args.length === 2) {
    console.log(await restoreSnapshot(args[0], args[1]));
  } else if (command === "verify" && args.length === 1) {
    console.log(`Snapshot válido; schema ${verifySnapshot(args[0])}`);
  } else if (command === "init" && args.length === 0) {
    const store = await openStore({ synthetic: process.env.SQLITE_DEMO === "true" });
    try {
      console.log(JSON.stringify(store.info()));
    } finally { store.close(); }
  } else if (["status", "backup"].includes(command) && args.length === 0) {
    const directory = process.env.DB_DIR || ".data/v5";
    const file = path.join(directory, "aegis-v5.sqlite");
    const version = verifySnapshot(file); // Missing/corrupt/future DB fails; no init/migrations.
    if (command === "status") console.log(JSON.stringify({ version }));
    else {
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        const backups = path.join(directory, "backups");
        const destination = await snapshot(db, backups);
        pruneDailySnapshots(backups, 7, destination);
        console.log(destination);
      } finally { db.close(); }
    }
  } else {
    throw new Error("Uso: storage.js init|status|backup|verify <snapshot>|restore <snapshot> <directorio-nuevo>");
  }
} catch (error) {
  // Operator CLI only, never an API handler or request log.
  console.error(error.message);
  process.exitCode = 1;
}
