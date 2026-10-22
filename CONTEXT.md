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
