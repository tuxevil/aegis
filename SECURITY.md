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
