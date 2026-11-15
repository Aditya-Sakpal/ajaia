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

**2026-11-15 — AI provider.** Claude Code's API skill defaults to Claude models → I supplied an OpenAI key, so the assistant calls OpenAI `gpt-5.4-mini` from the Worker with plain `fetch` (no SDK, keeps the Worker small) → it's the account I have, and the key is held only as a Wrangler secret → Verify: route tests with a fake client (access matrix, 503 without a key, 400 on bad actions), mocked Playwright tests for the bar and autocomplete, and a real call on production (autocomplete ~4 s round trip).

**2026-11-15 — Parallel fixes.** A forked agent fixed the four deferred issues (conflict copy, lost-reply detection, import limit, DB timeouts) while the AI feature was built in the main thread; both touched `worker/lib/errors.ts`, and the merge was resolved by hand (502 + 503).

**2026-11-15 — AI duplicated text on "shorten the essay" (reported by me while testing).** The first AI bar always inserted custom-prompt output, so a whole-document rewrite was appended after the original → `/ai/generate` now returns a `placement` (replace selection / replace document / insert) via OpenAI structured outputs; chips use fixed rules, and replacements are refused if the document changed during the request → Verify: 16 prompt/placement unit tests, 11 route tests, 11 Playwright tests (mocked) and a real OpenAI smoke test ("shorten the essay" → replace_document).

**2026-11-15 — Concurrent edits lost one side (reported by me: Bob and Alice deleting different paragraphs).** Version-checked saves made the second writer reload and lose their edit, and the first writer never saw the other's change → added presence heartbeats (who is viewing, with avatars), live pull of remote versions while idle, and a block-level three-way merge (node-diff3) on 409 so non-overlapping edits both survive; only same-paragraph edits still ask the user. The first merge attempt failed in production because Postgres jsonb reorders object keys — fixed with canonical JSON, caught by the e2e test → Verify: merge unit tests (incl. key order), presence route tests, two-browser Playwright test on production.
