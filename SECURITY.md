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

- `AMBIENT_MAC` is the only operational credential and must be injected via
  environment variable. Never commit `.env` or real station identifiers.
- Legacy `/api/*` allows localhost only, with the explicit exceptions described below. `/api/status` additionally allows requests
  whose `Origin`/`Referer` host matches the server host. The `Referer` header
  is client-controlled, so treat this as scanner obfuscation, not
  authentication. Do not put sensitive data behind this API.
- CELEC and CENACE are fetched with TLS verification disabled
  (`rejectUnauthorized: false`) due to non-standard chains on those hosts.
  This exposes those fetches to MITM; re-enable verification if the sources
  publish valid certificates.
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
