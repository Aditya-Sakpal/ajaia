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
