# AEGIS v4

AEGIS 5 PR-01 adds disabled-by-default flags (`feature-flags.js`), closed public
DTO schemas (`api/schemas.js`) and an isolated GET `/api/v1/health/public` behind
`PUBLIC_API_V1`. Public access uses explicit route metadata + GET, never a URL
prefix or Origin/Referer. V4 interfaces/access and JSON history are preserved.
See `docs/architecture/aegis-5-public-v1.md` and `docs/verification/aegis-5-pr-01.md`.

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
