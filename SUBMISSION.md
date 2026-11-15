# Submission — Ajaia Docs

**Live app:** https://ajaia-docs.salesdesk-app.workers.dev
**Source:** this folder (also at https://github.com/Aditya-Sakpal/ajaia)
**Walkthrough video:** see `VIDEO_URL.txt`

## Test accounts (no password, pick one on the sign-in screen)

| User | Email | Role in the seeded data |
|---|---|---|
| Alice Chen | alice@ajaia.test | Owns "Welcome to Ajaia Docs", shared with Bob as editor |
| Bob Patel | bob@ajaia.test | Editor on Alice's doc; owns "Q3 Planning Notes", shared with Carol as viewer |
| Carol Ruiz | carol@ajaia.test | Viewer on Bob's notes (read-only) |

Switch users from the avatar menu (top right) → **Switch account**.

## What's included

| Path | What it is |
|---|---|
| `README.md` | Overview, 5-minute reviewer tour, local setup/run/test/deploy instructions, limitations |
| `docs/ARCHITECTURE.md` | Architecture note: priorities, decisions and tradeoffs, testing, what's next |
| `docs/AI_WORKFLOW.md` | AI workflow note: tools, where AI helped, what was changed/rejected, how it was verified |
| `docs/screenshots/` | Screenshots: sign-in, documents home, editor, share dialog, viewer mode, mobile editor |
| `VIDEO_URL.txt` | Link to the walkthrough video |
| `SUBMISSION.md` | This file |
| `specs/` | Brief, product spec, implementation plan, engineering practices, AI decision log |
| `src/` | React SPA (pages, components, TipTap editor, autosave queue, file import) |
| `worker/` | Hono API on Cloudflare Workers (routes, permissions, sessions, validation, Drizzle repo) |
| `shared/` | API types shared by client and server |
| `drizzle/`, `scripts/seed.ts` | SQL migrations and idempotent demo seed |
| `e2e/`, `playwright.config.ts` | Playwright end-to-end tests (run against local or production) |
| `worker/**/*.test.ts`, `src/**/*.test.ts` | Vitest unit/API tests (83) |
| `.github/workflows/ci.yml` | CI: typecheck, unit tests, build |
| `package.json`, `wrangler.jsonc`, `vite.config.ts`, `tsconfig*.json`, `.env.example`, `.dev.vars.example` | Build, deploy and config (no secrets) |

## Status

**Working end to end:** demo sign-in and account switching; create, rename, edit, delete; rich text (bold, italic, underline, H1–H3, bulleted and numbered lists, undo/redo); autosave with visible status, persisted across refresh; version-conflict detection; `.txt`/`.md`/`.docx` import (≤ 2 MB) into new documents; sharing by email as editor or viewer, role changes and removal, all server-enforced; owned vs shared lists; view-only mode; lost-access handling; deployment on Cloudflare with Postgres.

**Deliberately not built:** real-time co-editing, comments, version history, images/tables, export, real authentication.

**Incomplete / rough edges:** after a version conflict the only option is to reload, so unsaved local edits in the stale tab are dropped (the banner says so). The main JS bundle is ~500 kB because the editor isn't lazy-loaded. The Aiven free-tier database may power off after long inactivity; if the app shows connection errors, it needs restarting.

**Next 2–4 hours:** real-time co-editing with Yjs on a Durable Object (live merge and presence); version history with restore (also fixes the conflict data loss); Markdown/PDF export; a "Request edit access" action for viewers; lazy-loading the editor.
