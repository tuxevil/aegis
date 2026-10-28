import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID, createECDH } from "node:crypto";
import webPush from "web-push";
import { openStore } from "../storage/sqlite-store.js";
import { PUSH_CONSENT_VERSION, readPushConfig } from "../push/policy.js";
export const fixture = JSON.parse(
  fs.readFileSync(new URL("../test/fixtures/storage-v1.json", import.meta.url)),
);
export const document = (name) =>
  fs.readFileSync(
    new URL(`../test/fixtures/schedules/eeasa-${name}.html`, import.meta.url),
  );
export const temporary = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aegis-push-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
let browserNumber = 0;
export function browser() {
  const point = createECDH("prime256v1");
  point.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/synthetic_${++browserNumber}`,
    expirationTime: null,
    keys: {
      p256dh: point.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}
export async function setupPush(t, options = {}) {
  let clock = Date.parse("2026-10-22T12:00:00Z");
  const now = () => new Date(clock),
    key = options.pushStorageKey ?? randomBytes(32),
    vapid = webPush.generateVAPIDKeys();
  const config = readPushConfig({
    WATCH_ORIGIN: "https://watch.example",
    PUSH_STORAGE_KEY: key.toString("base64url"),
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    PUSH_DELIVERY: "false",
  });
  const store = await openStore({
    directory: ":memory:",
    synthetic: true,
    now,
    pushStorageKey: key,
    ...options,
  });
  t.after(() => store.close());
  store.writeBatch({
    areas: [
      {
        ...fixture.areas[0],
        id: "canton",
        type: "canton",
        location_precision: "administrative_area",
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        ...fixture.areas[0],
        id: `sector-${i}`,
        name: `Synthetic area ${i}`,
        parent_id: "canton",
      })),
    ],
  });
  const prefs = {
    mode: "immediate",
    quiet_start: 22,
    quiet_end: 7,
    digest_hour: 8,
    scheduled: true,
    changes: true,
    cancellations: true,
  };
  const input = (patch = {}) => ({
    request_id: randomUUID(),
    management_token: randomBytes(32).toString("base64url"),
    consent: true,
    consent_version: PUSH_CONSENT_VERSION,
    push_consent: true,
    areas: [{ area_id: "sector-0", alias: "Private synthetic alias" }],
    preferences: { ...prefs },
    browser: browser(),
    ...patch,
  });
  const create = (patch) => {
    const payload = input(patch);
    return { payload, owner: store.subscriptions.create(payload) };
  };
  const schedule = (name = "v1", approve = true) => {
    store.schedules.ingest({
      provider_id: "eeasa-maintenance",
      body: document(name),
    });
    const queue = store.schedules.queue();
    if (approve)
      for (const row of queue) {
        if (!row.row_present || row.parser_confidence !== 1) continue;
        const area = row.type === "industrial" ? "sector-1" : "sector-0";
        store.schedules.bind({
          provider_id: "eeasa-maintenance",
          sector_label: row.sector_label,
          area_id: area,
          reference_url: "https://www.eeasa.com.ec/trabajos-programadas/",
          review_reason: "Synthetic exact mapping",
        });
        store.schedules.review({
          revision_id: row.id,
          decision: "reviewed",
          rights_reviewed: true,
          review_reason: "Synthetic document and scope reviewed",
        });
      }
    return queue;
  };
  return {
    store,
    key,
    config,
    now,
    prefs,
    input,
    create,
    schedule,
    advance: (ms) => (clock += ms),
    set: (iso) => (clock = Date.parse(iso)),
  };
}
