# AEGIS v4

AEGIS 5 PR-01 adds disabled-by-default flags (`feature-flags.js`), closed public
DTO schemas (`api/schemas.js`) and an isolated GET `/api/v1/health/public` behind
`PUBLIC_API_V1`. Public access uses explicit route metadata + GET, never a URL
prefix or Origin/Referer. V4 interfaces/access and JSON history are preserved.
See `docs/architecture/aegis-5-public-v1.md` and `docs/verification/aegis-5-pr-01.md`.

PR-02 adds optional `SQLITE_STORAGE` (OFF): `storage/sqlite-store.js` uses
Node >=22.16 built-in SQLite, WAL, checksum migrations, immutable transactional
repositories and verified snapshots. `DB_DIR` is separate from v4 JSON, default
`.data/v5` locally or `/data/v5` in Docker. Demo/live mode is fixed per database.
No ingestors are active; PR-03 adds an optional reviewed public reader. Operational commands and
limits: `docs/architecture/aegis-5-storage.md`; never copy only a live WAL main
file or restore over an active database. No DATA_DIR migration in PR-02.

PR-03 adds `/map` behind BLACKOUT_MAP + PUBLIC_API_V1, preserving `/` and `/ui`.
BLACKOUT_DEMO adds explicitly synthetic, ephemeral SQLite fixtures and refuses
SQLITE_STORAGE (no demo/live mixing). Live read APIs project reviewed public
evidence only; no verified supply/coverage is inferred from an empty result.
Map is an optional local SVG/GeoJSON reference, never home pins or outage polygons.
See `docs/architecture/aegis-5-blackout-map.md` for routes, publication gates,
geography limits and browser verification. No Push/OSINT ingestion yet.

PR-04 adds `/report` behind CITIZEN_REPORTS (OFF) and migration 002 for private
report roots/revisions/reviews. Live requires configured HTTPS REPORTS_ORIGIN;
demo remains memory-only. Inputs have no free text/GPS/contact data. Receipts are
client CSPRNG bearer secrets, SHA256 only in DB, never URL/localStorage. All new
reports/corrections await local operator review; only aggregates of >=3 approved
reports per sector/24 h are public. No incidents inferred or created yet (PR-05).
IP-based guard is bounded/ephemeral in RAM, single process, with documented limits.
See `docs/architecture/aegis-5-citizen-reports.md` for consent, retention, moderation,
antiabuse, migration/rollback and prerequisites before live reception.

PR-05 adds deterministic local `store.correlation` and migration 003. CLI mutations
require EVENT_CORRELATION=true (OFF), no background ingest/admin HTTP. Matching
uses exact area/type/semantic kind and a fixed ±60 min anchor; ambiguous time or
multiple candidates stays separate. Reviewed origin components deduplicate source,
owner, article URL, hash and copied summary. Official needs reviewed documentary
competence/period; partial restoration never closes an entire area. Corrections
append evidence and immutable audit snapshots. Private citizen receipts remain
aggregated only. Live elevated pre-engine claims project unknown without rewriting
history; synthetic demos remain explicit. Bounded 500 claims/event, local sticky
safety hold available even at capacity. See `docs/architecture/aegis-5-correlation.md`
and `docs/verification/aegis-5-pr-05.md`. No PR-06 ingestion or production changes.

PR-06 adds manually triggered EEASA HTML schedule capture and migration 004,
original bytes in private SQLite BLOBs, hashes/versioned semantic revisions,
reviewed exact sector bindings and append-only publication decisions. Public
GET /api/v1/schedules requires OFFICIAL_SCHEDULES (OFF), PUBLIC_API_V1 and SQLite
without BLACKOUT_DEMO. No network at startup; no PDF/OCR/new deps/Push. Fixed
HTTPS source, no redirects/cookies, timeout/256 KiB/cooldown; source failure or
missing row never implies cancellation. Unreviewed geography/rights stay private.
Local import does not assert a new live source check. Source permissions/catalog
remain pending before live. See `docs/architecture/aegis-5-schedules.md`, research
and `docs/verification/aegis-5-pr-06.md`. Prior PR-05 review fix (51172ea) restores
predecessor evidence when its replacement stops being public; baseline 109 tests.

Public dashboard with equal emphasis on Ecuadorian energy and Pallatanga weather. Research with dated primary sources lives in `docs/research/`; these reports are background, never live data feeds.

The small module interfaces are `createApp({fetchUrl, store, now, mac})`, source parsers/loaders and `buildAssessment(data, now)`. Tests and production use these same interfaces. Sources are independently cached and failures preserve original measurement dates. `HistoryStore` supports an in-memory adapter for tests and atomic persisted observations for production.

Core domain distinctions:

- Observation vs forecast vs official diagnosis vs AEGIS monitoring rule.
- Cota (height) vs useful volume vs energy reserve.
- 2115 m safety threshold vs 2098 m original design minimum. Neither a measured unit shutdown nor a national blackout is inferred from height alone.
- Energy accumulated in MWh vs instantaneous production/demand in MW vs unused available reserve (not currently measured).
- Mazar inflow vs turbinated discharge vs later reuse of the same water in the Paute cascade.
- One local station vs canton model forecast vs basin or national conditions.
- Relative weekly Niño SST vs ONI/RONI quarterly index vs official NOAA ENSO status.

Never fill unknown data with zero, compute a fake reserve margin from production minus served demand, or label neutral ENSO/La Niña as no risk. Monitoring thresholds are explicitly experimental; no calibrated probabilities are currently produced.

Serving assets is allowlisted. Source text is rendered with DOM textContent; external scripts are never executed. Keep station identifiers out of API responses, captured artifacts and logs. Persist history on a mounted DATA_DIR before redeploying. Preserve measurements and their timestamps on source failures.

Public UI: retro terminal console, five workspaces (overview/energy/weather/enso/sources), keyboard shortcuts, searchable command palette and chart/data inspector. Keep overview terse and graphical; contextual interpretation lives in the inspector and methodology. Energy and climate retain equal prominence. CRT is optional; typing fields must never trigger bare-key shortcuts.

PR-07 adds scoped /watch/ PWA and anonymous subscriptions with five curated sectors,
separate opt-in and private management code. PUSH_ALERTS stays OFF; delivery also
requires PUSH_DELIVERY=true and live storage. Migration 005 encrypts endpoints,
keys, aliases and outbox payloads with a persistent private PUSH_STORAGE_KEY.
Reviewed fresh official schedules only; explicit documentary cancellation, never
missing rows. Before-send and receive validation suppress stale details. No
production sends; see docs/architecture/aegis-5-push.md and verification PR-07.

PR-08 adds permission-gated manual RSS/Atom metadata ingestion, immutable reviews and migration006. OSINT_NEWS stays OFF, no automatic ingestion/events/Push. See docs/architecture/aegis-5-feeds.md.

PR-09 is a documented social NO-GO: no access/budget/validated coverage/deletion policy. OSINT_X remains OFF and no social adapter exists. See docs/research/aegis-5-social-feasibility.md. PR-10 is independent.

PR-10 adds TIME_MACHINE (OFF), /history/ and GET timeline using immutable PR05 revisions. Separates occurrence from known_at; current privacy/permissions/hold override replay. No fabricated 2024, no new migration. See docs/architecture/aegis-5-timeline.md.

PR-11 adds EXPLORER_3D (OFF), /explorer/ 2D measured Mazar cota and explicit illustrative optional isometric mesh (no real DEM/bathymetry). Narrow public projection reuses v4 cache/history. 2115 safety !=2098 design, no volume/energy model. See docs/architecture/aegis-5-explorer.md.

PR-12 is NO-GO for real cota-volume/energy model: no validated licensed current curve/datum/uncertainty. Keep volume_model unavailable and height-only observations. See docs/research/aegis-5-volume-decision.md; no invented linear reserve.
