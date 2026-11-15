# Architecture Note

## Shape

```
Browser (React SPA, TipTap)
   │  JSON over /api/*  (signed httpOnly session cookie)
   ▼
Cloudflare Worker ── static assets (SPA, SPA fallback routing)
   │  Hono routes → access check → Repo
   ▼
Cloudflare Hyperdrive (connection pooling, caching disabled)
   ▼
Aiven Postgres: users · documents(content jsonb, version) · document_shares(role)
```

The whole app is one Cloudflare Worker. Requests to `/api/*` run the Hono API (`run_worker_first`); every other path serves the built SPA. The deploy has a single URL, the session cookie is first-party, and nothing needs a paid plan.

## What I prioritized, and why

1. **Correct saving.** In a document editor the most damaging bug is lost or overwritten work, so I spent the depth there:
   - Content is stored as ProseMirror JSON (`jsonb`), not HTML. Formatting round-trips exactly, and the editor's schema decides what can render, so stored-HTML XSS is not possible.
   - Every save is a compare-and-set on `version` in a single `UPDATE … WHERE id = $1 AND version = $2`. If someone else saved first, the server returns 409 with the current document, and the UI asks you to reload.
   - The client save queue (`src/editor/saveQueue.ts`) debounces for 1 s, never has two saves in flight, saves on navigation, and shows the save state the whole time. Its edge cases are unit-tested with fake timers.
2. **Access control on the server.** All permissions live in one table (`worker/lib/permissions.ts`), and every document route goes through `loadDocWithAccess`. Having no access returns 404, so a document's existence doesn't leak. Having a role that's too weak returns 403. The full matrix is tested through the real HTTP routes.
3. **A smooth reviewer flow.** Seeded users and documents, an account picker with a hint per user, owned and shared documents listed separately, role badges, and view-only and lost-access banners. Someone evaluating the app can see sharing work in a couple of minutes.

## Key decisions and tradeoffs

| Decision | Why | Cost |
|---|---|---|
| Vite SPA + Hono on Workers instead of Next.js | The Workers free plan has a 3 MB script limit, and the app has no need for server rendering or SEO | No server rendering (not needed here) |
| Hyperdrive in front of Aiven | Pooling, and it handles Aiven's private CA certificate. Caching is **disabled** because a cached read can hand you a stale version | One extra hop |
| Version check instead of real-time co-editing | Correct multi-user behaviour within the timebox | Simultaneous editors get a conflict prompt, not merged edits |
| Editor and viewer roles (the optional stretch item) | Makes the access logic meaningful and testable, at small cost | None |
| File import converted in the browser (mammoth, marked) | Keeps Node-only parsers out of the Worker. The server still validates the result like any other content | The server never sees the original file |
| `Repo` interface with Postgres and in-memory implementations | API tests run the real Hono app quickly without a database | Two implementations to keep in step (covered by tests) |
| Demo account picker instead of real auth | The brief allows simulated users; HMAC-signed cookies keep the session logic real | No passwords |

## Validation and errors

- Every request body is checked with a Zod schema. Titles are trimmed and must be 1–200 characters. Content must be a `doc` node whose ProseMirror structure is valid (no empty text nodes, depth-limited). Content over 1 MB returns 413.
- Every error has the same shape, `{ error: { code, message } }`. Unexpected errors are logged and return a generic 500.
- The UI maps error codes to plain-language messages, such as "No Ajaia user with that email" or "Only .txt, .md and .docx files are supported."

## Testing

- **Vitest, 83 tests:** the permission matrix, API access and validation through `app.request()` (as owner, editor, viewer and stranger), repository semantics, the save queue's concurrency, and file conversion, including hostile markdown and corrupt `.docx` files.
- **Playwright, 16 browser tests** (passing against production): formatting persists after a reload; rename, including a blank title; autosave over a slow network with no false conflict; leaving right after typing; a two-tab conflict; HTML in titles; markdown, `.docx` and invalid imports; sharing as a viewer, including a direct API write attempt; revoking access mid-session; delete; and a stranger opening a URL.

## Deliberately not built

Real-time co-editing (CRDT with Yjs), comments, version history, images and tables, export, real authentication, link sharing.

## Next 2–4 hours

1. **Real-time co-editing:** a Durable Object per document running a Yjs provider, with presence avatars. This replaces the conflict prompt with live merging.
2. **Version history:** keep a snapshot on each version bump and add a restore view. This also gives the conflict banner a "keep my copy" option.
3. **Export to Markdown and PDF**, and a "Request edit access" action for viewers.
4. **Lazy-load the editor** to split the 500 kB main bundle.
