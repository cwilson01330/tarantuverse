# Herpetoverse — Web

Pre-launch landing page for [herpetoverse.com](https://herpetoverse.com). Deployed to Vercel, pointed at `apps/web-herpetoverse/` as the root directory.

## Dev

```bash
pnpm install
pnpm --filter web-herpetoverse dev
```

Runs on [http://localhost:3001](http://localhost:3001) (separate port from Tarantuverse on 3000).

## Environment

- `NEXT_PUBLIC_API_URL` — Tarantuverse API base URL. Shared backend between brands. Defaults to `http://localhost:8000` locally; set to `https://tarantuverse-api.onrender.com` in Vercel.

## Architecture

This app is the Herpetoverse brand face of the shared Tarantuverse backend. See `docs/design/PRD-herpetoverse-v1.md` and `docs/design/ADR-002-taxon-discriminator.md` for the platform-level architecture.

Pre-launch scope: single landing page + waitlist signup. Full app is scheduled for Sprint 5–6 of the Herpetoverse v1 sprint plan (see `docs/design/SPRINT-herpetoverse-v1.md`).
