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
