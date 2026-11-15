# CLAUDE.md — Ajaia Docs

Take-home for Ajaia LLC (AI-Native Full Stack Developer): a lightweight Google-Docs-inspired editor with rich text, file import, owner/editor/viewer sharing and Postgres persistence, deployed on Cloudflare. **Timebox 4–6 hours** — prefer a smaller, solid slice over breadth.

## Read first

- `specs/00-assignment.md` — the brief (requirements + deliverables)
- `specs/01-product-spec.md` — what we're building, access model, API, data model (**source of truth**)
- `specs/02-implementation-plan.md` — task-by-task plan; tick checkboxes as you go
- `specs/03-engineering-practices.md` — how we work (testing, security, git, definition of done)
- `specs/ai-decision-log.md` — append whenever AI output is changed/rejected

All specification and planning documents live in `specs/`. New specs go there, not in `docs/` (which is for submission deliverables).

## Required skills

- **superpowers — always, during all development:**
  - `superpowers:brainstorming` before any new feature or behaviour change not in the spec
  - `superpowers:writing-plans` for planning; plans are saved in `specs/`
  - `superpowers:executing-plans` / `superpowers:subagent-driven-development` to run the plan
  - `superpowers:test-driven-development` for all logic (failing test first)
  - `superpowers:systematic-debugging` for any bug or failing test
  - `superpowers:verification-before-completion` before claiming anything works
  - `superpowers:requesting-code-review` at the end of each feature and before deploy
- **impeccable — for ALL UI work** (layout, components, styling, copy, empty/error/loading states, accessibility). Invoke it before writing or changing any frontend component.
- Cloudflare: `cloudflare:wrangler` and `cloudflare:workers-best-practices` for Worker config and deploys.

## Stack

Vite + React + TypeScript SPA · TipTap v3 editor · Tailwind v4 · Hono API in a single Cloudflare Worker (static assets + `/api/*`) · Aiven Postgres via Cloudflare Hyperdrive · postgres.js + Drizzle · Zod · Vitest.

## Commands

```bash
npm run dev          # Vite + Worker locally (Cloudflare Vite plugin)
npm test             # vitest run
npm run typecheck
npm run db:migrate   # drizzle-kit migrate (uses DATABASE_URL from .env)
npm run db:seed      # idempotent seed: Alice, Bob, Carol + demo docs
npm run deploy       # build + wrangler deploy
```

## Rules

- **The GitHub repo (Aditya-Sakpal/ajaia) is public.** Never commit `.env`, `.dev.vars`, connection strings or secrets. Check `git diff --cached` before committing.
- Server is the authority on access: every document route goes through `loadDocWithAccess` + `permissions.ts`. No access → 404, wrong role → 403.
- DTOs only in `shared/types.ts`. Errors only via `ApiError` → `{ error: { code, message } }`.
- Document content is ProseMirror JSON; never render user content with `dangerouslySetInnerHTML`.
- Full test suite + typecheck green before every commit. Conventional commits; push after each task.
- Out-of-scope features (spec §2) stay out unless the spec is updated first.
