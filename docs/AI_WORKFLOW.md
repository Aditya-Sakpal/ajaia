# AI Workflow Note

## Tools

- **Claude Code** (Claude Opus 5.5) in VS Code was the main pair-programmer for planning, implementation, tests and deployment commands.
- **Claude Code skills** gave the work a process:
  - *superpowers*: writing-plans, executing-plans, test-driven-development, systematic-debugging, verification-before-completion and requesting-code-review.
  - *impeccable*: UI direction, design-token discipline, a design detector and a separate finish review.
- **Playwright**, driven by Claude, to open the app in a real browser and try to break it.
- A separate review subagent with a fresh context reviewed the whole branch, so the review wasn't anchored on the context that wrote the code.

## Where AI sped me up

- **Spec and plan before code.** Claude turned the brief into a spec with a permission table, API contract and data model ([specs/01-product-spec.md](../specs/01-product-spec.md)), then into a 12-task plan with test cases. I chose the scope cuts, the roles and the stack. Claude wrote them up quickly and consistently.
- **Boilerplate at speed:** Hono routes, the Drizzle schema and migrations, the seed script, the TipTap toolbar and the Docs-style screens. That freed the timebox for the parts that need judgment: saving correctly and access control.
- **Writing tests first.** For each module the failing tests were written before the implementation (permissions, API access, the save queue with fake timers, file import). Writing them took minutes, not hours.
- **Adversarial browser testing.** A 16-scenario Playwright suite covering slow networks, two tabs, revoking access mid-edit, XSS in titles and markdown, and corrupt `.docx` files. Writing it by hand would have taken longer than the timebox allowed.

## What AI produced that I changed or rejected

Every entry is in [specs/ai-decision-log.md](../specs/ai-decision-log.md). The main ones:

1. **Stack.** The first suggestion was Next.js on Vercel. I moved deployment to Cloudflare, and on review we dropped Next.js entirely because of the Workers free plan's script size limit and the absence of any server-rendering need. The result is a Vite SPA plus a Hono API in one Worker.
2. **Hyperdrive caching would have served stale documents.** The generated setup left Hyperdrive's default query cache on. A collaborator could open a cached old version and immediately hit a conflict. Caught during browser testing; caching is now disabled and origin connections are capped below Aiven's limit of 20.
3. **A broken save indicator.** The generated editor cleaned up its save queue in a way that broke under React StrictMode, so the status never left "Saved". Found by e2e; the cleanup now only flushes.
4. **The API accepted documents the editor couldn't load** (empty text nodes). I added a structural ProseMirror validation, with a failing test first.
5. **A false-positive test helper.** The first e2e helper waited for the word "Saved", which is also shown before any edit, so tests "passed" without saving. I exposed the real save state and waited for that instead.
6. **Unnecessary work in generated code:** a session check that ran twice and a document loaded twice per save. Both were trimmed.
7. **Design.** The design skill wanted to invent a novel visual direction. I pinned a near-faithful Google Docs look with no Google branding, because reviewers should recognise every control instantly.

## How I verified correctness, UX and reliability

- **Tests that were seen to fail first:** 83 Vitest tests covering the full owner/editor/viewer/stranger matrix through the real HTTP routes, version conflicts, validation limits, save-queue concurrency, and import edge cases.
- **The real browser against the real deployment:** the Playwright suite passes against the production URL, and its fixtures clean up the documents they create.
- **Infrastructure checks, not assumptions:** `/api/health` checked locally and in production before building features; 20 concurrent requests sent to production; Aiven's connection limit and live connections queried directly.
- **UX checks:** screenshots at 1440 px and 390 px for every screen and role (owner, editor, viewer). Fixes found this way include a mobile header overflow and a collapsed share input on phones. The design detector and a separate design reviewer ran after that.
- **Security checks:** the repo is public, so every commit's staged diff was scanned for the database credentials; secrets live only in `.env`, `.dev.vars` and Wrangler secrets.

Claude did a lot of the typing. The decisions recorded in the decision log, and the checks above, are how I made sure the code is correct.
