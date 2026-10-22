# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 4.x | Yes |
| 3.x | Legacy |

## Reporting a Vulnerability

Open a GitHub Security Advisory for this repository (preferred), or contact the
maintainer. Please include steps to reproduce, affected endpoint, and observed
vs. expected behavior.

Do not open a public issue for unpatched vulnerabilities involving credentials,
bypass of the localhost restriction, or injection via scraped sources.

## Security Model (read before deploying)

- With `PUBLIC_API_V1=true`, only registered GET routes explicitly marked
  public bypass the v4 policy. PR-01 registers `/api/v1/health/public` only,
  rate limited to 60 requests/minute per remote IP. No prefix-wide exemption,
  CORS permission or proxy trust is added. Other v1 paths/methods remain closed
  remotely; localhost retains the existing v4 exemption. Origin/Referer never
  unlock these private routes. See `docs/architecture/aegis-5-public-v1.md`.

- `AMBIENT_MAC` is the only operational credential and must be injected via
  environment variable. Never commit `.env` or real station identifiers.
- `/api/*` allows localhost only. `/api/status` additionally allows requests
  whose `Origin`/`Referer` host matches the server host. The `Referer` header
  is client-controlled, so treat this as scanner obfuscation, not
  authentication. Do not put sensitive data behind this API.
- CELEC and CENACE are fetched with TLS verification disabled
  (`rejectUnauthorized: false`) due to non-standard chains on those hosts.
  This exposes those fetches to MITM; re-enable verification if the sources
  publish valid certificates.
- Chart.js is served from the locked local package; the interface does not load external executable scripts. Google Fonts is optional and falls back to system fonts.
- DATA_DIR stores public observations only. Mount persistent storage to retain trends across redeployments. Source errors must not expose station identifiers or private request URLs.
- Optional v5 SQLite is internal only, disabled by default, and never replaces
  v4 history. DB_DIR/snapshots require private filesystem permissions and a
  persistent volume. Demo databases refuse live records and vice versa. Backups
  are operator CLI actions, not public HTTP routes; restoration refuses existing
  destinations. See `docs/architecture/aegis-5-storage.md` for limits and recovery.
- PR-03 exposes only explicit GET areas/outages/event/evidence DTO routes when
  BLACKOUT_MAP + PUBLIC_API_V1 are enabled. Publication requires approved
  observations, reviewed evidence links, enabled public sources and matching
  demo/live mode. Source text still needs human privacy review before approval;
  a schema cannot detect personal details embedded in a summary. Source URLs
  with credentials, query or fragment are withheld. Demo lives only in memory
  and refuses enabling live SQLite concurrently. The optional local map never
  uses household coordinates or external tile requests. `/map` has a local-only
  CSP; user/source text uses textContent. These read routes expose no writes,
  report receipts or Push endpoints.

- PR-04 registers explicit citizen-report methods only with CITIZEN_REPORTS.
  A canonical HTTPS REPORTS_ORIGIN is mandatory for live reception; JSON, custom
  request header and browser-origin/fetch-metadata checks mitigate CSRF, never
  substitute for receipt authorization. Management requires a 256-bit bearer
  secret generated with browser CSPRNG; only its SHA256 is stored. No token in
  URL, localStorage, public output or screenshots. Logger stays disabled.
- Citizen inputs are closed enums/sector IDs/optional dates, without free text,
  household coordinates, contact data or uploads. All create/correct operations
  go to moderation. Local CLI approves an exact revision; no admin HTTP route.
  Aggregates suppress fewer than three approved reports per sector/24 h and do
  not assert independent sources, blackout confirmation or restoration.
- Report abuse state uses per-process ephemeral keyed IP fingerprints in bounded
  RAM, expires within an hour plus a minute sweep, and never enters SQLite or
  backups. Quotas reset on restart and are not shared across replicas. Progressive
  textual arithmetic/honeypot are friction for a controlled pilot, not robust
  human verification against adaptive bots. Keep the flag OFF pending source,
  moderation, infrastructure/privacy review for the intended reception volume.
- Report rows logically expire after 30 days (withdrawn/rejected after seven);
  old revisions/reviews cascade on pruning. Snapshots can retain prior values:
  daily backups and pre-migration snapshots have distinct operational retention.
  Preserve current volumes on rollback and audit logging at any external proxy.

- PR-05 correlation mutations are local operator CLI actions gated by explicit
  EVENT_CORRELATION=true, never public HTTP. Closed inputs, bounded stdin/candidate
  queries/per-event evidence and SQLite transactions preserve audit history.
  Origin independence and authority competence/period are reviewed institutional
  assertions, never receipt counts or automatic trust of an authority flag.
  Raw citizen sources/receipt-linked observations are rejected. Source privacy
  review remains mandatory; no new external requests or executable source text.
- Live elevated claims without engine audit are projected unknown; originals and
  explicit synthetic demo scenarios are preserved. Correction/retraction appends
  evidence and revisions, never erases the original. A sticky local safety hold
  can suspend even a saturated event; recalculate cannot silently reactivate it.
  CLI audit is filesystem-private and contains institutional provenance/reviewer
  reasons, not bearer receipts. Keep private personal details out of those reasons.
  See `docs/architecture/aegis-5-correlation.md` for limits and non-destructive
  rollback. No official-source ingest or alert delivery is enabled in PR-05.
