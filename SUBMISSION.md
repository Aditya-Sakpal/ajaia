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
| `e2e/`, `playwright.config.ts` | Playwright end-to-end tests, 21 (run against local or production) |
| `worker/**/*.test.ts`, `src/**/*.test.ts` | Vitest unit/API tests (88) |
| `PRODUCT.md`, `DESIGN.md`, `.impeccable/` | Product record, design system and the UI direction contract used while building |
| `.github/workflows/ci.yml` | CI: typecheck, unit tests, build |
| `package.json`, `wrangler.jsonc`, `vite.config.ts`, `tsconfig*.json`, `.env.example`, `.dev.vars.example` | Build, deploy and config (no secrets) |

## Status

**Working end to end:** demo sign-in and account switching; create, rename, edit, delete; rich text (bold, italic, underline, H1–H3, bulleted and numbered lists, undo/redo); autosave with visible status, persisted across refresh; version-conflict detection; `.txt`/`.md` (≤ 1 MB) and `.docx` (≤ 2 MB) import into new documents; after a conflict the stale tab can save its edits as a copy; sharing by email as editor or viewer, role changes and removal, all server-enforced; owned vs shared lists; view-only mode; lost-access handling; deployment on Cloudflare with Postgres.

**Deliberately not built:** real-time co-editing, comments, version history, images/tables, export, real authentication.

**Incomplete / rough edges:**
- Size limits count characters rather than bytes.
- The server checks document structure but not every mark or attribute.
- The main JS bundle is about 500 kB because the editor isn't lazy-loaded.
- Running locally, the dev server connects directly to Aiven (no pooling). A stuck query now fails with a clear 503 after 8 s instead of hanging, but heavy parallel load locally can still see those errors; production goes through Hyperdrive, so run the e2e suite against production.
- The Aiven free-tier database may power off after long inactivity; if the app shows connection errors, it needs restarting.

**Next 2–4 hours:** real-time co-editing with Yjs on a Durable Object (live merge and presence); version history with restore (merging conflicting edits instead of saving a copy); Markdown/PDF export; a "Request edit access" action for viewers; lazy-loading the editor.
