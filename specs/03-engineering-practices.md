# Engineering Practices

How work is done on this repo. Applies to humans and AI agents alike.

## 1. Workflow (superpowers skills)

| When | Skill |
|---|---|
| New feature or behaviour change not already in the spec | `superpowers:brainstorming` → update `specs/01-product-spec.md` first |
| Turning spec into tasks | `superpowers:writing-plans` → `specs/02-implementation-plan.md` |
| Executing the plan | `superpowers:executing-plans` (inline) or `superpowers:subagent-driven-development` |
| Any logic (permissions, API, save queue, import) | `superpowers:test-driven-development` — red → green → commit |
| Any bug or unexpected test failure | `superpowers:systematic-debugging` — root cause before fix |
| Before claiming anything works | `superpowers:verification-before-completion` — run the command, read the output |
| End of a feature / before deploy | `superpowers:requesting-code-review` |
| All UI: layout, components, copy, states | `impeccable` |
| Cloudflare config / deploy | `cloudflare:wrangler`, `cloudflare:workers-best-practices` |

## 2. Spec-driven

- `specs/` is the source of truth. Code that disagrees with the spec is a bug in one of them — fix the spec deliberately, don't drift.
- Every plan task cites the spec section it implements. Scope additions go through the spec, with a line on what they displace in the timebox.

## 3. Testing

- Vitest. Test **behaviour at boundaries**: the permission matrix, API responses (status + error code) via `app.request()` against `MemoryRepo`, the save queue's concurrency, import conversion.
- A test must fail before the code exists (TDD). Never weaken an assertion to make it pass.
- UI is verified in the browser against the task's *Verify* step; record anything surprising in the decision log.
- `npx vitest run` and `npm run typecheck` must be green before every commit.

## 4. Code

- TypeScript `strict`. No `any` in exported signatures. DTOs only in `shared/types.ts`.
- Small files with one responsibility (see plan's File Structure). Routes stay thin: parse → authorize → repo → respond.
- Validate every request body with Zod at the edge; never trust client-side checks alone.
- Errors: throw `ApiError(status, code, message)`; one `onError` handler formats `{ error: { code, message } }`. Unknown errors → 500 `internal_error`, logged with `console.error`, no stack to the client.
- Authorization lives in `permissions.ts` + `loadDocWithAccess`; no ad-hoc role checks in route bodies.
- No speculative abstractions (YAGNI); the `Repo` interface exists because tests need it.

## 5. Security & secrets

- **The GitHub repo is public.** Never commit `.env`, `.dev.vars`, connection strings, or the session secret. Check `git status` / `git diff --cached` before every commit.
- Prod secrets via `wrangler secret put`; Hyperdrive holds the DB credentials.
- Cookies: httpOnly, Secure, SameSite=Lax, HMAC-signed.
- Stored content is ProseMirror JSON rendered only through TipTap's schema — never `dangerouslySetInnerHTML` on user content.

## 6. Git

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), one task ≈ one or a few commits, push after each task so the history tells the build story.
- Never `--no-verify`, never force-push `main`.

## 7. AI usage log

- Append to `specs/ai-decision-log.md` whenever AI output is **changed, rejected, or caught wrong**, or a non-obvious decision is made. One entry: what AI proposed → what we did → why → how verified.
- This log is the raw material for `docs/AI_WORKFLOW.md`; keep entries concrete.

## 8. Definition of done (per task)

1. Tests for the task written first and passing; full suite green; typecheck green.
2. *Verify* step executed and its result observed (not assumed).
3. UI work passed through `impeccable` and checked in the browser, including empty/error/loading states.
4. Decision log updated if anything was changed or rejected.
5. Committed and pushed.

## 9. Timebox discipline

- Tasks are ordered so any prefix is shippable. If behind, cut from the bottom of the *feature* list (share dialog polish → import `.docx` → conflict banner), **never** the docs task.
- Stretch work only after Task 12 is complete and deployed.
