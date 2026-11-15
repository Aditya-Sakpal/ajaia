# AI Decision Log

Running log of where AI output was changed, rejected, or caught wrong, and key decisions made with AI assistance. Source material for `docs/AI_WORKFLOW.md`.

Format: **Date — Area** · AI proposed → What we did → Why → How verified

---

**2026-11-15 — Hosting.** Claude's first stack suggestion was Next.js on Vercel → Switched to Cloudflare Workers at my direction, then Claude re-evaluated the framework: dropped Next.js for a Vite React SPA + Hono API in a single Worker → Next.js via OpenNext risks the Workers Free 3 MB compressed script limit and the app has no SSR/SEO need → Verify: deployed bundle size in Task 1.

**2026-11-15 — Database connectivity.** Direct Worker → Aiven connection considered → Use Cloudflare Hyperdrive in front of Aiven → Aiven certificates are signed by a private CA, which a Worker's TLS socket may reject; Hyperdrive also pools connections → Verify: `/api/health` returns `db:true` locally and in production (Task 1 gate).

**2026-11-15 — Storage format.** Storing editor HTML considered → Store ProseMirror JSON (`jsonb`) → lossless formatting, schema-constrained rendering removes stored-HTML XSS risk → Verify: format → refresh → identical (Task 9).
