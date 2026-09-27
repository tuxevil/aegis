# Contributing

Small, focused PRs. One source or one endpoint per change.

## Workflow

1. Create a branch from `main`.
2. Copy config: `cp .env.example .env` and set a test `AMBIENT_MAC`.
3. Run: `npm install && npm start`, open `http://localhost:3010/`.
4. Verify the affected endpoint directly:
   - `/api/weather`, `/api/dams`, `/api/cenace`, `/api/enso`, `/api/status`.
5. Syntax check: `node --check backend.js`.
6. Open a PR describing: source touched, how you verified it, and sample
   output (redact any real station MAC).

## Rules

- Never commit `.env`, real MACs, tokens, or credentials.
- Scrapers break when sources change HTML/JS: keep parsing defensive and
  return a clear error (`4xx`/`5xx` with message) instead of crashing the
  aggregator. `/api/status` uses `Promise.allSettled` — keep it that way.
- Do not weaken the localhost restriction on `/api/*` without documenting
  the reason and the replacement control in `SECURITY.md`.
- Keep `README.md` endpoint TTLs and env vars in sync with `backend.js`.
