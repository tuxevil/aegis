import fs from "node:fs";
import { createHash } from "node:crypto";
import { openStore } from "../storage/sqlite-store.js";
const fixture = JSON.parse(
  fs.readFileSync(new URL("../test/fixtures/storage-v1.json", import.meta.url)),
);
export async function setupTimeline(t, options = {}) {
  let time = Date.parse("2026-10-22T12:00:00Z");
  const now = () => new Date(time),
    store = await openStore({
      directory: ":memory:",
      synthetic: true,
      now,
      ...options,
    });
  t.after(() => store.close());
  store.writeBatch({
    areas: [
      { ...fixture.areas[0], id: "area", name: "Área sintética de replay" },
    ],
  });
  const add = (id, signal = "outage", event_id = null, replaces = null) => {
    const source_id = `source_${id}`,
      artifact_id = `artifact_${id}`;
    store.writeBatch({
      sources: [
        {
          ...fixture.sources[0],
          id: source_id,
          kind: "news",
          official: false,
          enabled: true,
          access_policy: "public",
        },
      ],
      artifacts: [
        {
          ...fixture.artifacts[0],
          id: artifact_id,
          source_id,
          source_url: `https://example.invalid/${id}`,
          sha256: createHash("sha256").update(id).digest("hex"),
          extraction_status: "parsed",
          fetched_at: now().toISOString(),
        },
      ],
      observations: [
        {
          ...fixture.observations[0],
          id,
          source_id,
          artifact_id,
          area_id: "area",
          dedupe_key: id,
          summary: `Evidencia sintética ${id}`,
          occurred_at: signal === "restored" ? "2026-10-22T11:00:00.000Z" : "2026-10-22T10:00:00.000Z",
          observed_at: null,
          reported_start_at: null,
          ingested_at: now().toISOString(),
          temporal_confidence: "exact",
          moderation_state: "approved",
        },
      ],
    });
    return store.correlation.submit({
      observation_id: id,
      signal,
      type: "unplanned",
      origin_key: `institution_${id}`,
      origin_reviewed: true,
      review_reason: "Synthetic review",
      ...(event_id ? { event_id } : {}),
      ...(replaces ? { replaces } : {}),
    });
  };
  return {
    store,
    now,
    add,
    set: (iso) => (time = Date.parse(iso)),
    query: (known_at) => ({
      area_id: "area",
      from: "2026-10-22T00:00:00Z",
      to: "2026-10-23T00:00:00Z",
      known_at,
    }),
  };
}
