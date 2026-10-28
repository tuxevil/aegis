export const FEATURE_NAMES = Object.freeze([
  "PUBLIC_API_V1", "SQLITE_STORAGE", "BLACKOUT_MAP", "BLACKOUT_DEMO", "CITIZEN_REPORTS", "EVENT_CORRELATION", "OFFICIAL_SCHEDULES",
  "PUSH_ALERTS", "OSINT_NEWS", "OSINT_X", "TIME_MACHINE", "EXPLORER_3D",
]);

// Only an explicit true enables a feature; typos and inherited values stay off.
export function readFeatureFlags(env = process.env) {
  return Object.freeze(Object.fromEntries(FEATURE_NAMES.map((name) => [
    name, Object.hasOwn(env, name) && (env[name] === "true" || env[name] === true),
  ])));
}
