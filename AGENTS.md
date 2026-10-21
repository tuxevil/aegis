# Working on AEGIS (instructions for coding agents)

AEGIS v4 is a working public Ecuador energy + Pallatanga climate dashboard. Maintain it. This repository's proposed v5 roadmap is **not implementation code**.

Before changing code, read:
- CONTEXT.md
- README.md
- SECURITY.md
- docs/roadmap/aegis-5-prd.md
- docs/architecture/aegis-5-design.md
- docs/roadmap/aegis-5-backlog.md
- docs/roadmap/aegis-5-codex.md

## Development workflow
- Branch from the latest reviewed base; implement **one backlog PR at a time**, PR-01 first. Do not commit to main, auto-merge, or deploy production without explicit instruction.
- Keep the existing Fastify / vanilla-JS modules and interfaces unless a focused refactor is justified.
- Preserve GET /, /ui, /api/status and other v4 outputs, sources, data freshness semantics, keyboard navigation, and screen-reader/mobile support.
- Keep v5 behind disabled-by-default feature flags until the specific milestone's tests, security review and data-source validation pass.
- Add targeted unit/integration tests and run npm ci, npm run check, npm test. Explicitly report failures, including pre-existing ones.
- If moving persistence, back up DATA_DIR and validate non-destructive migration/rollback; no overwriting historical data or credentials.
- Don't assume connected services, paid APIs, verified cartography or operational deployments are available.

## Domain invariants
- 2115 m is a Mazar safety threshold; 2098 m is the original design minimum. Neither equals a predicted blackout. Height != useful volume != electrical energy reserve. Power MW != energy MWh.
- Source observations, citizen reports, official schedules, inferred incidents and model scenarios are separate things. Missing/stale != 0 or «no cuts». Always expose evidence provenance, timestamps and geography precision.
- Never publish house-level addresses/coordinates, private station MAC, raw IPs, Push secrets/endpoints or identifiers in public API, logs or demo screenshots.
- Keep public routes explicit and validated. Origin/Referer is not authentication. Public report submission requires anti-abuse protection. Notifications require opt-in and reliable official source/version matching.
- Preserve source URLs and corrections; don't infer cancellation from a deleted PDF row or restoration from missing reports.
- No automatic controlling of real infrastructure on heuristics; no certainty/prediction of blackout probability without validated model.
- OSINT must obey platform terms/rates/licences. No LLM-generated «confirmed» events without evidence.
- 3D terrain is illustrative until bathymetry/validated cota-volume information is available; show fallback for weak mobile devices.

## Immediate assignment
Start at docs/roadmap/aegis-5-backlog.md **PR-01**. Do not implement every feature from the spec in a single change. See docs/roadmap/aegis-5-codex.md for the handoff prompt and review requirements.
