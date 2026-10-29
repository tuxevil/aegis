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

### Integration-stage override

This branch consolidates existing v5 and Multihazard code for supervised staging.
Real notification delivery is unconditionally blocked in notification-safety.js,
Push configuration, transport, worker and browser enrollment. No environment
value enables real Push or WAHA. Injected transports are permitted only against
synthetic stores for offline tests. Historical v5 delivery instructions describe
an inactive capability, not authorization to activate it in this stage.
Sector Watch and OpenAlert zone consent remain separate; no migration or reuse
of management credentials is performed. Production data is never a test fixture.

- With `PUBLIC_API_V1=true`, only registered GET routes explicitly marked
  public bypass the v4 policy. PR-01 registers `/api/v1/health/public` only,
  rate limited to 60 requests/minute per remote IP. No prefix-wide exemption,
  CORS permission or proxy trust is added. Other v1 paths/methods remain closed
  remotely; localhost retains the existing v4 exemption. Origin/Referer never
  unlock these private routes. See `docs/architecture/aegis-5-public-v1.md`.

- V4 `AMBIENT_MAC` is a private station credential and must be injected via
  environment variable. Never commit `.env` or real station identifiers.
- V4 `/api/*` routes retain localhost restrictions; explicit registered v1/hazards/subscription methods are separate. `/api/status` additionally allows requests
  whose `Origin`/`Referer` host matches the server host. The `Referer` header
  is client-controlled, so treat this as scanner obfuscation, not
  authentication. Do not put sensitive data behind this API.
- CELEC and CENACE are fetched with TLS verification disabled
  (`rejectUnauthorized: false`) due to non-standard chains on those hosts.
  This exposes those fetches to MITM; re-enable verification if the sources
  publish valid certificates.
  A read-only TLS investigation on 2026-10-29 verified CELEC ports443/8443 but
  CENACE still failed issuer-chain validation; no HTTP payload refresh or runtime
  change was performed. See docs/verification/integration/grid-tls-investigation.md.
- Chart.js is served from the locked local package; the interface does not load external executable scripts. Google Fonts is optional and falls back to system fonts.
- DATA_DIR includes observation history plus private multihazard source archives and
  editorial journals. Never serve or publish the directory wholesale. Mount
  persistent storage, back it up before migration, and preserve 0700/0600 permissions.
  Source errors must not expose station identifiers or private request URLs.
- `HAZARDS_ENABLED=false` by default. When enabled, only the explicit read-only
  source explorer routes are public; they expose closed DTOs, never private raw
  artifacts or editorial candidates.
- `ALERTS_ADMIN_ENABLED=false` by default. Its admin routes require Bearer
  authentication even on localhost; Origin/Referer/cookies provide no authority.
  Configuration contains unique SHA-256 token digests and `editor`/`approver`
  roles. Use independent random credentials, HTTPS remotely and rotate/revoke
  through server configuration. The interface holds a bearer only in memory,
  clears its input and private data on logout/401, and never uses URL/storage.
- Admin requests have an explicit limit before authentication (including local
  clients), bounded JSON bodies, validated schemas, no-store responses and
  sanitized errors. Private candidate import re-evaluates the archive server-side;
  callers cannot upload a replacement candidate. Approval requires a distinct
  reviewer; enqueue/process recheck evidence and validity.
- M4 has no sending transport. All outbox targets are simulation IDs; `simulated`
  is not delivery, `publishedAt` stays null, and no environment value enables
  WAHA/Push publication. Owner-reported invitation links do not prove JID/OWNER.
- Journal hashes detect corruption but are not signatures or protection against
  a privileged volume rewrite/tail deletion. Keep independently retained backups;
  do not automatically steal stale writer locks or overwrite incompatible history.

- `ZONE_SUBSCRIPTIONS_ENABLED=false` by default. Zone preferences require explicit
  versioned consent, bounded signed one-use challenges and per-route limits.
  Management uses a random 32-byte bearer whose digest alone is persisted in a
  separate private journal. No contact details, residential coordinates, Push
  endpoints or raw IPs are stored. Preference expiry is 30 days; revocation
  removes active zones but does not erase immutable audit history. Retention,
  LOPDP and reliable recovery/deletion require review before public beta.
  Interest in PWA is not permission or delivery; demand metrics are private,
  suppress small groups and never claim unique people or real channel follows.

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

- PR-06 schedules use a fixed registered HTTPS EEASA URL with standard TLS,
  redirects rejected, no cookies/subresources, 10 s timeout, 256 KiB stream cap,
  up to 100 cards and a persistent per-provider 15-minute attempt reservation.
  No network on startup or scheduled polling. Original HTML stays in private
  SQLite/backups, never static assets or public HTTP. JSDOM parsing executes no
  remote scripts. CLI mutations require OFFICIAL_SCHEDULES=true and an existing
  schema; all HTTP mutations remain closed. No additional dependencies.
- Schedule publication requires exact reviewed geography, strict extraction and
  explicit per-version rights review. Unknown/industrial classifications cannot
  become residential alerts automatically. Bindings/reviews/revisions preserve
  audit history; changing a binding suppresses the prior area until re-reviewed.
  Local import does not assert a successful live network check. Missing/failed/
  stale source data is unverified, never inferred cancellation or restoration.
  Source reuse permissions and operational catalog remain pending before public
  operation. See `docs/architecture/aegis-5-schedules.md`; flags remain OFF.

- PR-07 management uses a client CSPRNG 256-bit bearer secret, only SHA256 stored;
  origin/custom headers mitigate CSRF and do not authenticate ownership. Separate
  consent is mandatory for Push, and browser permission requires a user gesture.
  Endpoints/keys/aliases/payloads are AES-256-GCM encrypted with per-row AAD;
  PUSH_STORAGE_KEY and VAPID private key stay outside git/logs/screenshots.
- Native Push endpoints are closed HTTPS vendor allowlists; transport rejects
  redirects/private DNS and bounds time/body/TTL/retries. No citizen-supplied
  arbitrary fetch. Only reviewed fresh current source versions generate notices;
  cancellations require explicit documentary quote and immutable operator review.
- Receive eligibility uses native subscription endpoint+keys as private proof,
  never a management token persisted in a service worker. Revoked/expired/changed
  notices show only generic consultation text. Provider acceptance is not delivery.
- The /watch/ service worker caches static shell only, never API/receipts/v4.
  Logical expiry and deletion do not erase old WAL/snapshots; protect those copies.
  PUSH_DELIVERY is a separate OFF gate; no real Push was sent in development.

- PR-08 fetch uses fixed HTTPS feed/robots registry, bounded bodies and timeout, no redirects or arbitrary URL fetch. XML DTD rejected, no article/script/image execution. Persistent permission record and per-item human rights/geography review gate publication; lexical classification never confirms incidents. Source permission expiry/revocation hides feed evidence while preserving audit. Local CLI only, OSINT_NEWS OFF.

- PR-10 replay applies current publication/privacy gates and safety holds, never resurrects withdrawn evidence via old known_at. Public projection excludes audit reasons/inputs and private identities. CSV formula prefixes neutralized. TIME_MACHINE OFF; fixed public GET and local-only UI CSP, bounded range/pages/evidence.

- PR-11 narrow infrastructure GET projects only public cota/date/history from v4 cached loader, never station MAC or raw errors. Illustrative mesh is local and optional, no external terrain/scripts, DOM textContent/CSP. No volume/reserve/prediction claim; source TLS limitation inherited from v4 remains explicit.

- PR-13 publishes schemas for registered public GETs only; no owner/admin/mutation routes or generated key values enter OpenAPI. Aggregate counters exclude IPs, individual paths, bodies and tokens. HA sample uses HTTPS GET, current exact reviewed source versions, synthetic/stale/industrial exclusions, and two OFF opt-in gates; its sole action is a local informational notification, never device/inverter/host control.
