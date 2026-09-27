# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 3.x (main) | Yes |
| < 3.0 | No |

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
- Frontend dependencies load from CDN (Tailwind, Chart.js). A CDN compromise
  would affect the dashboard; pin or vendor these files if your threat model
  requires it.
