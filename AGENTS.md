# AGENTS.md — AEGIS (development guardrails)

## Multi-hazard implementation (Weather / Flood / Terrain / AEGIS Alerts)
Before editing or designing, **read [docs/handoff/START_HERE_CODEX.md](docs/handoff/START_HERE_CODEX.md)**. That document links to architectural decisions, source contracts, verified historical evidence, the Guayaquil replay, phased roadmap and WhatsApp design. Do not ask the project owner to restate previously recorded decisions.

**Preserve the existing Grid Sentinel** energy, Pallatanga, ENSO and dashboard behavior. Repo uses Node >=22, ESM, Fastify; run \`npm ci\`, \`npm run check\`, \`npm test\`. Keep design and implementation incremental, tested, reversible, and in reviewable branches/PRs.

**Safety:** No public alert, push message, real WhatsApp post, channel creation, WAHA public-line access, production deploy or merge to \`main\` without fresh explicit owner approval. Preserve \`DRY_RUN\` and fail-closed dispatch; no simulated/test source data in real notifications. Separate official warnings, observations, forecasts, independent assessments and unverified reports; retain real source timestamps and geospatial precision. A source failure never means safe.

Source testing is opt-in, read-only, with rate limits and legal/licensing checks. Don't guess license, API availability, retrospective publication times, outage predictions or flood probability. M0–M4 are authorized development milestones in safe test/shadow mode; M5/public operation requires independent sign-off. Do not touch personal contacts, phone numbers or HA/WAHA credentials unless specifically authorized.

## Current priority: integration and supervised staging
Read the updated handoff and integration matrix. Intensive feature development is suspended. Preserve Grid, blackout schedules, citizen information and read-only Home Assistant examples. Keep v5 flags OFF by default; do not convert consent between Sector Watch and OpenAlert. No main merge, production data changes, Proxmox access, published host ports, real Push or messaging without specific owner approval. Use the existing Fastify app and existing persistence formats; no new database or service.

## Additional energy and citizen-data invariants
2115 m is a Mazar safety threshold, 2098 m the original design minimum; neither predicts a blackout. MW != MWh; height != volume != reserve. Source observations, reports, schedules and inferred incidents remain separate. Preserve corrections, timestamps and geographical precision; absence is not restoration. No private station MAC, raw IPs, household coordinates or Push endpoints in public outputs. Terrain is illustrative without validated bathymetry.
