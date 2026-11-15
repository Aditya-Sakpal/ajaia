# AI Decision Log

Running log of where AI output was changed, rejected, or caught wrong, and key decisions made with AI assistance. Source material for `docs/AI_WORKFLOW.md`.

Format: **Date — Area** · AI proposed → What we did → Why → How verified

---

**2026-11-15 — Hosting.** Claude's first stack suggestion was Next.js on Vercel → Switched to Cloudflare Workers at my direction, then Claude re-evaluated the framework: dropped Next.js for a Vite React SPA + Hono API in a single Worker → Next.js via OpenNext risks the Workers Free 3 MB compressed script limit and the app has no SSR/SEO need → Verify: deployed bundle size in Task 1.

**2026-11-15 — Database connectivity.** Direct Worker → Aiven connection considered → Use Cloudflare Hyperdrive in front of Aiven → Aiven certificates are signed by a private CA, which a Worker's TLS socket may reject; Hyperdrive also pools connections → Verify: `/api/health` returns `db:true` locally and in production (Task 1 gate).

**2026-11-15 — Storage format.** Storing editor HTML considered → Store ProseMirror JSON (`jsonb`) → lossless formatting, schema-constrained rendering removes stored-HTML XSS risk → Verify: format → refresh → identical (Task 9).

**2026-11-15 — Hyperdrive caching (caught during e2e).** The default Hyperdrive config from the scaffold step left query caching on → Disabled caching (`wrangler hyperdrive update --caching-disabled true`) and capped origin connections at 10 → cached reads would let a collaborator open a stale version and immediately hit a version conflict, and Aiven's free tier allows only 20 connections → Verify: e2e conflict / revoke tests on the deployed URL.

**2026-11-15 — e2e "Saved" wait was a false positive.** The first e2e helper waited for the text "Saved", which is also shown before any edit, so tests reloaded before the save landed → Exposed `data-save-state` and wait for `saved`, which only occurs when nothing is pending → Verify: rename / formatting / slow-network e2e tests.

**2026-11-15 — Local DB connection exhaustion.** Per-request postgres clients with `max: 5` hung the local dev server under e2e load (Aiven max_connections = 20) → `max: 1` per request → Verify: full e2e suite locally.

**2026-11-15 — Save status stuck on "Saved" in dev (caught by e2e).** The generated editor disposed the save queue in an effect cleanup; React StrictMode re-runs effects on the same instance, so the status listener was cleared and the UI never left "Saved" → Cleanup now only flushes → Verify: e2e formatting/rename tests wait for the real `saved` state.

**2026-11-15 — Invalid documents accepted by the API (caught by e2e).** A test fixture created a paragraph with an empty text node; the API stored it and TipTap refused to load it → Added a structural ProseMirror check (string `type`, non-empty text nodes, depth limit) to the content schema, test-first → Verify: `rejects content the editor cannot load` API test.

**2026-11-15 — Over-generated middleware/queries (self-review).** First draft ran `requireUser` twice on share routes and loaded the document twice per PATCH → session check mounted once at `/documents/*`; PATCH authorizes once and checks the role from the body → Verify: full API suite unchanged and green.

**2026-11-15 — Design direction.** The design skill wanted to roll a novel visual direction; I pinned "near-faithful Google Docs look, no Google branding" because reviewers should recognise every control instantly → Verify: screenshot round at 1440 px and 390 px.
