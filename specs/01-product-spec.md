# Product Spec — Ajaia Docs

Status: **Approved for build** · Owner: Aditya · Timebox: 4–6 h · Brief: [00-assignment.md](00-assignment.md)

## 1. Product slice

A small team document editor where a signed-in user can write formatted documents, import existing files, and share documents with teammates as **editor** or **viewer**. Optimised for one reviewer clicking through in five minutes: sign in as Alice, see owned vs shared docs, edit with formatting, import a file, share with Bob, switch to Bob and see it.

## 2. Scope

### In scope (must ship)

| # | Capability | Definition of done |
|---|---|---|
| S1 | Mock sign-in | Pick one of 3 seeded users; session cookie; sign out; switch user. |
| S2 | Document list | Two sections — **My documents** and **Shared with me** — with owner name, role badge, last-updated time; empty states. |
| S3 | Create / rename / delete | Create opens editor on a new "Untitled document"; inline title rename; delete (owner only) with confirm. |
| S4 | Rich-text editor | Bold, italic, underline, H1/H2/H3, bulleted list, numbered list, undo/redo. Keyboard shortcuts work. |
| S5 | Autosave | Debounced save (1 s) with visible status: *Saving… / Saved / Couldn't save — Retry*. Reopen shows identical formatting. |
| S6 | File import | `.txt`, `.md`, `.docx` (≤ 2 MB) → new document. Supported types stated in UI and README. Images/tables in `.docx` are dropped (stated). |
| S7 | Sharing | Owner shares by email with role **editor** or **viewer**; can change role or revoke. Recipients see doc under *Shared with me*. |
| S8 | Access enforcement | Server enforces every rule in §4. Viewer UI is read-only. |
| S9 | Edit conflict guard | Optimistic version check; stale save gets 409 and a clear "changed elsewhere — reload" message instead of silently overwriting. |
| S10 | Deployment | Public URL on Cloudflare Workers, seeded and demo-ready. |
| S11 | Quality | Vitest suite for permissions + API access matrix + import conversion + save queue; README, ARCHITECTURE, AI_WORKFLOW, SUBMISSION docs. |

### Deliberately out of scope (state in README/video)

Real-time co-editing (CRDT/WebSockets) · real authentication/passwords · suggestions by commenters · images & tables in the editor · link sharing / public docs · email notifications · mobile-optimised editing (layout is responsive, not tuned).

Rationale: real-time co-editing is the most Google-Docs-like feature but is a multi-day problem done properly; a version-checked save gives correct multi-user behaviour within the timebox. Role-based sharing (editor/viewer) is the one stretch item taken, because it makes the access logic meaningful and testable at small cost.

## 3. Users (seeded)

| Name | Email | Purpose in demo |
|---|---|---|
| Alice Chen | `alice@ajaia.test` | Owns the welcome doc; shares with Bob |
| Bob Patel | `bob@ajaia.test` | Editor on Alice's doc; owns a doc shared with Carol |
| Carol Ruiz | `carol@ajaia.test` | Viewer on Bob's doc — demonstrates read-only |

No passwords: sign-in is a user picker. Clearly labelled "Demo sign-in" in the UI.

## 4. Access model

`access(user, doc)` = `owner` if `doc.ownerId = user.id`; else the share's role (`editor`/`viewer`) if a share exists; else **none**.

| Action | owner | editor | viewer | none |
|---|---|---|---|---|
| View document | ✅ | ✅ | ✅ | 404 |
| Edit content | ✅ | ✅ | 403 | 404 |
| Rename | ✅ | ✅ | 403 | 404 |
| Delete | ✅ | 403 | 403 | 404 |
| List collaborators | ✅ | ✅ | ✅ | 404 |
| Add / change / revoke shares | ✅ | 403 | 403 | 404 |

**Enhancements (added after the core slice, §10):** a fourth role, **commenter** — view + comment, no edits. Comment/resolve: owner, editor, commenter (viewer 403). Delete a comment: its author or the document owner. Version history: anyone with view access can list and preview; restoring is a normal content edit (owner/editor).

No-access returns **404** (don't leak existence); insufficient role returns **403**.

Sharing rules: email is trimmed and lower-cased; unknown email → 404 "No user with that email"; sharing with yourself (owner) → 400; sharing again updates the role (upsert).

## 5. Data model (Postgres)

- `users` — `id uuid pk`, `email text unique not null`, `name text not null`, `created_at timestamptz`
- `documents` — `id uuid pk`, `owner_id uuid fk users on delete cascade`, `title text not null`, `content jsonb not null` (TipTap/ProseMirror JSON), `version int not null default 1`, `created_at`, `updated_at timestamptz`
- `document_shares` — `document_id uuid fk documents on delete cascade`, `user_id uuid fk users on delete cascade`, `role text check in ('editor','viewer')`, `created_at`; **pk (document_id, user_id)**
- Index: `documents(owner_id)`, `document_shares(user_id)`

Content stored as ProseMirror JSON, not HTML: lossless for formatting, schema-constrained (the editor only renders known nodes/marks, so no stored-HTML XSS surface), and versionable later.

## 6. API (all JSON, under `/api`)

Errors: `{ "error": { "code": string, "message": string } }` with 400 / 401 / 403 / 404 / 409 / 413 / 500.

| Method & path | Auth | Body → Response |
|---|---|---|
| `GET /health` | — | → `{ ok, db }` |
| `GET /users` | — | → `User[]` (for the sign-in picker) |
| `POST /auth/login` | — | `{ email }` → `User`, sets cookie |
| `POST /auth/logout` | — | → 204, clears cookie |
| `GET /me` | ✔ | → `User` |
| `GET /documents` | ✔ | → `{ owned: DocumentSummary[], shared: DocumentSummary[] }` sorted by `updatedAt` desc |
| `POST /documents` | ✔ | `{ title?, content? }` → 201 `Document` |
| `GET /documents/:id` | ✔ | → `Document` |
| `PATCH /documents/:id` | ✔ | `{ version, title?, content? }` → `Document` · 409 `{ error, current: Document }` |
| `DELETE /documents/:id` | ✔ | → 204 |
| `GET /documents/:id/shares` | ✔ | → `Share[]` |
| `PUT /documents/:id/shares` | ✔ | `{ email, role }` → `Share` |
| `DELETE /documents/:id/shares/:userId` | ✔ | → 204 |

DTOs (in `shared/types.ts`):

```ts
type Role = 'editor' | 'viewer';
type Access = 'owner' | Role;
interface User { id: string; email: string; name: string }
interface DocumentSummary { id: string; title: string; owner: User; access: Access; updatedAt: string }
interface Document extends DocumentSummary { content: DocJSON; version: number; createdAt: string }
interface Share { user: User; role: Role; createdAt: string }
type DocJSON = { type: 'doc'; content?: unknown[] };
```

Validation limits: title trimmed, 1–200 chars (create defaults to "Untitled document"); content must be `{ type: 'doc' }` and ≤ 1 MB serialized (413 otherwise); `version` positive integer; ids are UUIDs (malformed → 404).

## 7. UX notes

- Visual design and polish via the **impeccable** skill; calm, document-first, no gratuitous chrome.
- Editor page: back link, editable title, role badge, Share button (owner), save status, sticky toolbar, A4-ish centered page.
- Viewer: toolbar hidden, banner "You have view-only access".
- Import: button on the documents page; label lists ".txt, .md, .docx · up to 2 MB"; errors inline.
- Losing access mid-session (revoked/deleted) → save returns 403/404 → banner "You no longer have access to this document" with link back.

## 8. Architecture & deployment

- **Single Cloudflare Worker** serving the Vite-built React SPA as static assets and a **Hono** API on `/api/*` (`run_worker_first`).
- **Aiven Postgres** reached through **Cloudflare Hyperdrive** (pooling + handles Aiven's private CA over TLS). Driver: `postgres` (postgres.js). ORM/migrations: **Drizzle**.
- Data access behind a `Repo` interface: `PgRepo` in production, `MemoryRepo` in tests, so the API's access matrix is tested end-to-end through Hono without a database.
- File import converts on the **client** (mammoth for `.docx`, marked for `.md`, escaped paragraphs for `.txt` → HTML → TipTap JSON); the server validates the resulting JSON like any other content. Keeps the Worker small and free of Node-only parsers.
- Session: HMAC-signed, httpOnly, `SameSite=Lax`, `Secure` cookie holding the user id; secret in `SESSION_SECRET` Worker secret.
- Why not Next.js: Workers Free has a 3 MB compressed script limit; an SPA + Hono worker is tiny, and the app has no SEO/SSR need.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Worker → Aiven TLS (private CA) fails | Hyperdrive in front (verified in Task 1 spike). Fallback: Neon free tier. |
| Aiven free service powers off when idle | Check before submitting; note in SUBMISSION.md. |
| `.docx` conversion quirks | Supported subset stated; conversion errors surfaced, never crash. |
| Overrunning timebox | Tasks ordered so every prefix is a shippable product; docs task is never skipped. |

## 10. Enhancements (post-core)

| # | Capability | Definition of done |
|---|---|---|
| E1 | Commenter role | Owner can share as **commenter**; commenter sees the doc read-only but can comment. DB check constraint allows `commenter`. |
| E2 | Comments | Select text → Insert › Comment (Ctrl+Alt+M) or the comment button; side panel lists open + resolved comments with the quoted text. `GET/POST /documents/:id/comments`, `PATCH/DELETE /documents/:id/comments/:commentId`. Comments are anchored client-side: the quoted text is highlighted in the document and the anchor is remapped through edits; if the text is removed the comment is flagged as orphaned. |
| E3 | Version history | Every content save records a snapshot; saves by the same author within 2 min update one snapshot. File › Version history lists versions (newest first, max 100) with a read-only preview; editors can restore (goes through autosave, so it is undoable and versioned). `GET /documents/:id/versions[/:versionId]`. |
| E4 | Export | File › Download as Markdown (client-side ProseMirror → Markdown); File › Print / Save as PDF uses the browser print dialog with a print stylesheet that prints only the page. |
| E5 | Suggestion mode | Owners/editors switch the toolbar between **Editing** and **Suggesting**. In Suggesting, insertions are kept as `suggestionInsert` marks and deletions as `suggestionDelete` marks (stored in the document JSON, attributed to the author). Owners/editors accept or reject each suggestion or all at once. Commenters cannot suggest (the server rejects their content writes). |
