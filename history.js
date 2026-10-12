import fs from "node:fs";
import path from "node:path";

// Public observations only. A mounted DATA_DIR preserves them across deployments.
export class HistoryStore {
  constructor(directory = null) {
    this.file = directory ? path.join(directory, "observations.json") : null;
    this.data = {};
    if (this.file && fs.existsSync(this.file)) {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (
        parsed.version !== 1 ||
        !parsed.series ||
        typeof parsed.series !== "object"
      ) {
        throw new Error(
          "Formato de historial incompatible; conservar el archivo antes de migrar.",
        );
      }
      this.data = parsed.series;
    }
  }

  record(key, readings, now = new Date()) {
    const cutoff = now.getTime() - 14 * 86400000;
    const merged = new Map();
    for (const r of [...this.read(key), ...readings]) {
      const time = Date.parse(r.loctimestamp);
      if (
        Number.isFinite(time) &&
        time >= cutoff &&
        time <= now.getTime() + 300000
      ) {
        merged.set(time, { ...r });
      }
    }
    this.data[key] = [...merged.values()]
      .sort((a, b) => Date.parse(a.loctimestamp) - Date.parse(b.loctimestamp))
      .slice(-10000);
    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.tmp`;
      fs.writeFileSync(
        temporary,
        JSON.stringify({ version: 1, series: this.data }),
      );
      fs.renameSync(temporary, this.file);
    }
    return this.read(key);
  }

  read(key) {
    return (this.data[key] || []).map((r) => ({ ...r }));
  }
}
