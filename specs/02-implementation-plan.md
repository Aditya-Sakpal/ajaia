# Ajaia Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. All UI work additionally REQUIRES the `impeccable` skill.

**Goal:** Ship a deployed, Google-Docs-inspired document editor with rich text, file import, owner/editor/viewer sharing and Postgres persistence, inside a 4–6 hour timebox.

**Architecture:** One Cloudflare Worker serves a Vite + React SPA (static assets) and a Hono JSON API on `/api/*`. The API talks to Aiven Postgres through Cloudflare Hyperdrive using postgres.js + Drizzle, behind a `Repo` interface so the API is tested end-to-end against an in-memory repo. Document bodies are TipTap/ProseMirror JSON in a `jsonb` column with an optimistic `version`.

**Tech Stack:** TypeScript, React 19, Vite, `@cloudflare/vite-plugin`, Wrangler, Hono, Drizzle ORM + drizzle-kit, `postgres` (postgres.js), Zod, TipTap v3 (StarterKit, Placeholder), mammoth, marked, React Router, Tailwind CSS v4, Vitest.

**Spec:** [specs/01-product-spec.md](01-product-spec.md) (brief: [specs/00-assignment.md](00-assignment.md); practices: [specs/03-engineering-practices.md](03-engineering-practices.md))

## Global Constraints

- Timebox 4–6 h total; every task boundary must leave a working app. Docs (Task 12) are never cut.
- Reviewers must not pay for anything: Cloudflare Workers Free + Hyperdrive Free + Aiven Free only.
- Repo is **public**: no secret in any committed file. Secrets live in `.env` (local) and `wrangler secret` (prod).
- Roles exactly `'editor' | 'viewer'`; access exactly `'owner' | 'editor' | 'viewer'`.
- No access → **404**; insufficient role → **403**; stale version → **409**; content > 1 MB → **413**.
- Error body exactly `{ "error": { "code": string, "message": string } }`.
- Title: trimmed, 1–200 chars; default `"Untitled document"`.
- Import: `.txt`, `.md`, `.docx` only, max **2 MB** (`2 * 1024 * 1024` bytes); UI copy `".txt, .md, .docx · up to 2 MB"`.
- Seeded users exactly: Alice Chen `alice@ajaia.test`, Bob Patel `bob@ajaia.test`, Carol Ruiz `carol@ajaia.test`.
- Autosave debounce **1000 ms**; status strings exactly `Saving…`, `Saved`, `Couldn't save — Retry`.
- Session cookie name `ajaia_session`: httpOnly, `SameSite=Lax`, `Secure` (except localhost), 7-day max age, HMAC-signed with `SESSION_SECRET`.
- Shared DTO types live only in `shared/types.ts` (spec §6); worker and client both import from there.

## Review Focus

1. **Overlapping autosaves from one tab** — typing during an in-flight save must never send two PATCHes concurrently or produce a false 409. → `saveQueue` tests in Task 9.
2. **Leaving the editor with unsaved changes** — route change flushes the queue; tab close shows the browser's unsaved-changes prompt. → `flush()` test in Task 9.
3. **Access revoked or doc deleted while open** — next save returns 403/404 and the UI shows "You no longer have access to this document", not a generic error loop. → API test in Task 7 (`revoked editor PATCH → 404`); UI handling in Task 9.
4. **Viewer tampering** — viewer calling PATCH/DELETE/share APIs directly is refused server-side regardless of UI. → access-matrix tests in Tasks 6–7.
5. **Hostile or odd imports** — empty file, wrong extension renamed, 5 MB file, markdown with raw `<script>`, corrupt `.docx` → friendly inline error or safe content, never a crash. → `fileImport` tests in Task 11.

---

## File Structure

```
wrangler.jsonc            Worker config: assets (SPA fallback), run_worker_first /api/*, Hyperdrive binding
vite.config.ts            React + Tailwind + Cloudflare plugin
vitest.config.ts          node env default; jsdom for src/import tests
drizzle.config.ts         drizzle-kit → DATABASE_URL
drizzle/                  generated SQL migrations (committed)
scripts/seed.ts           idempotent seed: 3 users + 2 demo docs + shares
shared/types.ts           DTOs + Role/Access (spec §6)
worker/
  index.ts                Worker entry: createApp({ getRepo: env => new PgRepo(...) })
  app.ts                  createApp(): Hono app, routes, error handler
  env.ts                  Env bindings type
  lib/errors.ts           ApiError + helpers
  lib/permissions.ts      getAccess, can
  lib/session.ts          cookie sign/verify helpers, requireUser middleware
  lib/validation.ts       Zod schemas
  db/schema.ts            Drizzle tables
  db/repo.ts              Repo interface + record types
  db/pgRepo.ts            Postgres implementation
  db/memoryRepo.ts        In-memory implementation (tests)
  routes/auth.ts | documents.ts | shares.ts
  test/helpers.ts         makeTestApp(), loginAs()
src/
  main.tsx, App.tsx       router + auth guard
  api/client.ts           typed fetch wrapper → ApiError
  pages/LoginPage.tsx | DocumentsPage.tsx | EditorPage.tsx
  components/Toolbar.tsx | ShareDialog.tsx | ImportButton.tsx | SaveStatus.tsx
  editor/extensions.ts    single TipTap extension list (editor + import)
  editor/saveQueue.ts     debounced, serialized autosave
  import/fileImport.ts    validateImportFile, fileToHtml
  styles/index.css        Tailwind + design tokens
```

---

### Task 1: Scaffold + infrastructure spike (Worker ↔ Hyperdrive ↔ Aiven)

**Files:**
- Create: `package.json`, `tsconfig*.json`, `vite.config.ts`, `wrangler.jsonc`, `worker/index.ts`, `worker/app.ts`, `worker/env.ts`, `src/main.tsx`, `src/App.tsx`, `.env.example`, `.dev.vars.example`

**Interfaces:**
- Produces: `createApp(deps: { getRepo: (env: Env) => Repo }): Hono<{ Bindings: Env; Variables: { user: User } }>` (Repo typed as `unknown` placeholder until Task 4); `Env = { HYPERDRIVE: Hyperdrive; ASSETS: Fetcher; SESSION_SECRET: string }`.

- [ ] **Step 1:** Scaffold Vite React-TS app; add `hono`, `postgres`, `@cloudflare/vite-plugin`, `wrangler`, `@cloudflare/workers-types`, `tailwindcss`, `@tailwindcss/vite`, `vitest`.
- [ ] **Step 2:** `wrangler.jsonc`: `main: worker/index.ts`, `compatibility_flags: ["nodejs_compat"]`, `assets: { not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, `hyperdrive: [{ binding: "HYPERDRIVE", id: "<from step 4>" }]`. Local connection string comes from env var `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` in `.env` — never in `wrangler.jsonc`.
- [ ] **Step 3:** `GET /api/health` runs `select 1` via `postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false })` → `{ ok: true, db: true }`; on failure `{ ok: false, db: false }` with 503.
- [ ] **Step 4:** `npx wrangler login` (user approves in browser) → `npx wrangler hyperdrive create ajaia-db --connection-string="$DATABASE_URL"` → put id in `wrangler.jsonc`.
- [ ] **Step 5: Verify locally** — `npm run dev`, `curl localhost:5173/api/health` → `{"ok":true,"db":true}`. If local TLS to Aiven fails, fall back to `wrangler dev --remote` for DB work and log the decision in `specs/ai-decision-log.md`.
- [ ] **Step 6: Verify deployed** — `npm run deploy`; `curl https://<worker>.workers.dev/api/health` → `{"ok":true,"db":true}`. **Gate:** if this fails after 20 min, switch DB to Neon free tier (spec §9).
- [ ] **Step 7:** Commit `chore: scaffold worker + spa, hyperdrive health check`; push to `origin main`.

### Task 2: Schema, migrations, seed

**Files:**
- Create: `worker/db/schema.ts`, `drizzle.config.ts`, `drizzle/*.sql` (generated), `scripts/seed.ts`

**Interfaces:**
- Produces: Drizzle tables `users`, `documents`, `documentShares` exactly per spec §5; `npm run db:migrate`, `npm run db:seed`.

- [ ] **Step 1:** Define tables (spec §5, including `pk(document_id, user_id)`, `role` check constraint, cascades, two indexes).
- [ ] **Step 2:** `npx drizzle-kit generate` then `npx drizzle-kit migrate` against `DATABASE_URL` (postgres.js with `ssl: 'require'`).
- [ ] **Step 3:** `scripts/seed.ts` (run with `tsx`), idempotent via `on conflict do nothing` keyed on email / fixed UUIDs:
  - users Alice, Bob, Carol (Global Constraints);
  - "Welcome to Ajaia Docs" owned by Alice — H1, a paragraph with **bold**/*italic*/underline, a bulleted list, a numbered list; shared with Bob as `editor`;
  - "Q3 Planning Notes" owned by Bob; shared with Carol as `viewer`.
- [ ] **Step 4: Verify** — run seed twice; `select count(*)` → users 3, documents 2, shares 2.
- [ ] **Step 5:** Commit `feat(db): schema, migrations and idempotent seed`.

### Task 3: Permissions module

**Files:**
- Create: `worker/lib/permissions.ts`, `worker/lib/permissions.test.ts`

**Interfaces:**
- Produces: `type Action = 'view' | 'edit' | 'rename' | 'delete' | 'listShares' | 'manageShares'`; `getAccess(userId: string, doc: { ownerId: string }, share: { role: Role } | null): Access | null`; `can(access: Access | null, action: Action): boolean`.

- [ ] **Step 1: Write the failing test** — table-driven over the full spec §4 matrix:

```ts
const matrix: Record<Access, Action[]> = {
  owner: ['view', 'edit', 'rename', 'delete', 'listShares', 'manageShares'],
  editor: ['view', 'edit', 'rename', 'listShares'],
  viewer: ['view', 'listShares'],
};
it.each(ALL_ACCESS.flatMap(a => ALL_ACTIONS.map(x => [a, x])))('%s %s', (a, x) =>
  expect(can(a, x)).toBe(matrix[a].includes(x)));
it('no access can do nothing', () => ALL_ACTIONS.forEach(x => expect(can(null, x)).toBe(false)));
it('owner wins even if a share row exists', () =>
  expect(getAccess('u1', { ownerId: 'u1' }, { role: 'viewer' })).toBe('owner'));
it('share role used for non-owner', () =>
  expect(getAccess('u2', { ownerId: 'u1' }, { role: 'editor' })).toBe('editor'));
it('no share → null', () => expect(getAccess('u3', { ownerId: 'u1' }, null)).toBeNull());
```

- [ ] **Step 2:** `npx vitest run worker/lib/permissions.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement as a lookup table.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(api): access model with full matrix tests`.

### Task 4: Repo interface, MemoryRepo, PgRepo

**Files:**
- Create: `shared/types.ts`, `worker/db/repo.ts`, `worker/db/memoryRepo.ts`, `worker/db/pgRepo.ts`, `worker/db/memoryRepo.test.ts`

**Interfaces:**
- Produces (`worker/db/repo.ts`):

```ts
interface DocumentRecord { id: string; ownerId: string; title: string; content: DocJSON; version: number; createdAt: Date; updatedAt: Date }
interface ShareRecord { documentId: string; userId: string; role: Role; createdAt: Date }
interface Repo {
  listUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;          // email already normalized
  listDocumentsForUser(userId: string): Promise<{ owned: DocumentSummary[]; shared: DocumentSummary[] }>;
  getDocument(id: string): Promise<DocumentRecord | null>;
  createDocument(input: { ownerId: string; title: string; content: DocJSON }): Promise<DocumentRecord>;
  updateDocument(id: string, expectedVersion: number, patch: { title?: string; content?: DocJSON }): Promise<DocumentRecord | 'conflict' | null>;
  deleteDocument(id: string): Promise<void>;
  getShare(documentId: string, userId: string): Promise<ShareRecord | null>;
  listShares(documentId: string): Promise<Share[]>;
  upsertShare(documentId: string, userId: string, role: Role): Promise<Share>;
  deleteShare(documentId: string, userId: string): Promise<void>;
}
```

- [ ] **Step 1: Write failing MemoryRepo tests** — `updateDocument` with matching version increments `version` by 1 and bumps `updatedAt`; with stale version returns `'conflict'`; on missing id returns `null`; `listDocumentsForUser` splits owned/shared, sorts by `updatedAt` desc, sets `access`; `deleteDocument` cascades shares; `upsertShare` twice changes role, keeps one row.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement MemoryRepo. **Step 4:** Run → PASS.
- [ ] **Step 5:** Implement PgRepo with Drizzle; `updateDocument` is a single `UPDATE … WHERE id = $1 AND version = $2 RETURNING *` (atomic — no read-then-write race); if 0 rows, a follow-up `SELECT` distinguishes `'conflict'` from `null`.
- [ ] **Step 6: Verify PgRepo** against Aiven with a throwaway script: create → update(v1) → update(v1 again) returns `'conflict'` → delete. Remove the script.
- [ ] **Step 7:** Commit `feat(db): repo interface with memory and postgres implementations`.

### Task 5: Session + auth routes

**Files:**
- Create: `worker/lib/errors.ts`, `worker/lib/session.ts`, `worker/lib/validation.ts`, `worker/routes/auth.ts`, `worker/test/helpers.ts`, `worker/routes/auth.test.ts`
- Modify: `worker/app.ts` (mount routes, `app.onError` → error body; unknown errors → 500 `internal_error`, logged)

**Interfaces:**
- Produces: `class ApiError extends Error { constructor(status: 400|401|403|404|409|413, code: string, message: string, extra?: object) }`; `requireUser` middleware sets `c.var.user`; `makeTestApp(): { app; repo: MemoryRepo; env: Env; alice: User; bob: User; carol: User }`; `loginAs(app, env, email): Promise<string /* Cookie header */>`.

- [ ] **Step 1: Write failing tests:** `GET /api/me` without cookie → 401 `unauthenticated`; `POST /api/auth/login {email:' Alice@Ajaia.test '}` → 200 Alice + `Set-Cookie` containing `ajaia_session` and `HttpOnly`; unknown email → 404; tampered cookie value → 401; logout → cookie cleared and `/api/me` → 401; `GET /api/users` → 3 users without auth.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement with `hono/cookie` `setSignedCookie`/`getSignedCookie`; session user re-loaded from repo each request (deleted user → 401). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): demo sign-in with signed session cookie`.

### Task 6: Documents routes

**Files:**
- Create: `worker/routes/documents.ts`, `worker/routes/documents.test.ts`
- Modify: `worker/lib/validation.ts` (create/patch schemas), `worker/app.ts`

**Interfaces:**
- Consumes: `can`, `getAccess` (Task 3); `Repo` (Task 4); `requireUser`, `ApiError` (Task 5).
- Produces: `loadDocWithAccess(c, id, action): Promise<{ doc: DocumentRecord; access: Access }>` — throws 404 if no doc / no access / non-UUID id, 403 if `!can(access, action)`. Reused by shares routes.

- [ ] **Step 1: Write failing tests** (seed via `repo` in `makeTestApp`: Alice's doc shared with Bob=editor, Carol=viewer):
  - create with no body → 201, title `"Untitled document"`, `version: 1`, `access: 'owner'`.
  - `GET /api/documents` as Bob → doc appears in `shared` with `access:'editor'` and `owner.email === 'alice@ajaia.test'`, not in `owned`.
  - Bob PATCH content with `version:1` → 200, `version:2`.
  - Carol PATCH → 403; Carol DELETE → 403; Bob DELETE → 403; Alice DELETE → 204 then GET → 404.
  - stranger (create a 4th user in repo) GET → 404 (not 403).
  - PATCH with stale `version` → 409 and body `current.version` equals server version.
  - PATCH title `"   "` → 400; title of 201 chars → 400; content `{type:'paragraph'}` → 400; content > 1 MB → 413.
  - `GET /api/documents/not-a-uuid` → 404.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. Size check on `JSON.stringify(content).length` before Zod deep parse. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): document CRUD with access enforcement and version conflicts`.

### Task 7: Shares routes

**Files:**
- Create: `worker/routes/shares.ts`, `worker/routes/shares.test.ts`
- Modify: `worker/app.ts`

**Interfaces:**
- Consumes: `loadDocWithAccess` (Task 6).

- [ ] **Step 1: Write failing tests:**
  - Alice `PUT …/shares {email:'CAROL@ajaia.test', role:'editor'}` → 200; Carol now sees doc in `shared`.
  - same PUT with `role:'viewer'` → role updated, `GET …/shares` has exactly one Carol entry.
  - Alice shares with `alice@ajaia.test` → 400 `cannot_share_with_owner`.
  - unknown email → 404 `user_not_found`; `role:'admin'` → 400.
  - Bob (editor) PUT share → 403; Carol (viewer) `GET …/shares` → 200.
  - Alice `DELETE …/shares/<bobId>` → 204; then Bob PATCH the doc → **404** (Review Focus 3).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run full suite `npx vitest run` → all PASS.
- [ ] **Step 5:** Commit `feat(api): sharing with editor/viewer roles`.

### Task 8: Frontend shell — API client, sign-in, documents list

**REQUIRED SKILL:** `impeccable` (establish tokens, type scale, layout before writing components).

**Files:**
- Create: `src/api/client.ts`, `src/pages/LoginPage.tsx`, `src/pages/DocumentsPage.tsx`, `src/styles/index.css`
- Modify: `src/App.tsx`, `src/main.tsx`

**Interfaces:**
- Produces: `api.get/post/patch/put/del<T>(path, body?) → Promise<T>` throwing `ApiError { status: number; code: string; message: string; body: unknown }`; `useMe()` hook returning `{ user, loading, refresh }`; routes `/login`, `/` (documents), `/d/:id` (editor). Unauthenticated → redirect `/login`.

- [ ] **Step 1:** API client + routing + auth guard.
- [ ] **Step 2:** LoginPage: three user cards (name, email), label "Demo sign-in — no password needed".
- [ ] **Step 3:** DocumentsPage: header with current user + Switch user; **New document** (creates then navigates to `/d/:id`); sections *My documents* / *Shared with me* (owner name + role badge + relative updated time); empty states; delete (owner, confirm).
- [ ] **Step 4: Verify** in browser via `npm run dev`: sign in as each seeded user; Bob sees Welcome doc under *Shared with me* with "Editor"; create and delete work; refresh keeps session.
- [ ] **Step 5:** Commit `feat(ui): sign-in and documents list`.

### Task 9: Editor page with serialized autosave

**REQUIRED SKILL:** `impeccable`.

**Files:**
- Create: `src/editor/extensions.ts`, `src/editor/saveQueue.ts`, `src/editor/saveQueue.test.ts`, `src/components/Toolbar.tsx`, `src/components/SaveStatus.tsx`, `src/pages/EditorPage.tsx`

**Interfaces:**
- Produces: `editorExtensions` (StarterKit with `heading.levels = [1,2,3]` — add `@tiptap/extension-underline` only if StarterKit lacks it — plus Placeholder `"Start writing…"`); `createSaveQueue<T>(save: (p: T) => Promise<void>, delayMs = 1000): { schedule(p: T): void; flush(): Promise<void>; retry(): void; subscribe(fn: (s: SaveState) => void): () => void }` with `type SaveState = 'idle' | 'saving' | 'saved' | 'error'`.

- [ ] **Step 1: Write failing saveQueue tests** (Vitest fake timers):
  - three `schedule()` calls within 1000 ms → exactly one `save` call, with the last payload.
  - `schedule(B)` while save(A) is in flight → save(B) starts only after A resolves; never two in flight (assert with a concurrency counter).
  - `save` rejects → state `'error'`; `retry()` re-sends the last payload → `'saved'`.
  - `flush()` with a pending debounce → save runs immediately and `flush` resolves after it completes.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** EditorPage: load doc; title input (rename saves through same queue); Toolbar buttons B / I / U / H1 / H2 / H3 / bullets / numbers / undo / redo with active states and `aria-pressed`; save function sends `{ version, title, content }` and stores returned `version`; `SaveStatus` shows exact strings from Global Constraints.
  - 409 → banner "This document was changed elsewhere. Reload to see the latest version." with Reload button; queue paused.
  - 403/404 on save → banner "You no longer have access to this document." + link to documents.
  - viewer → `editor.setEditable(false)`, toolbar hidden, banner "You have view-only access".
  - route leave → `await flush()`; `beforeunload` prompt while state is `saving` or pending.
- [ ] **Step 6: Verify** in browser: format text with every toolbar action, refresh → identical; log in as Carol on Bob's doc → read-only; open the same doc as Alice in two tabs, edit both → second tab gets the conflict banner.
- [ ] **Step 7:** Commit `feat(ui): rich-text editor with serialized autosave and conflict handling`.

### Task 10: Share dialog

**REQUIRED SKILL:** `impeccable`.

**Files:**
- Create: `src/components/ShareDialog.tsx`
- Modify: `src/pages/EditorPage.tsx` (Share button for owner; collaborator avatars for all)

- [ ] **Step 1:** Dialog (accessible: focus trap, Esc closes): email input + role select + Share; list of collaborators with role select and Remove; owner shown first as "Owner". Seeded emails offered as `<datalist>` suggestions to help reviewers.
- [ ] **Step 2:** Server error codes mapped to inline copy: `user_not_found` → "No Ajaia user with that email.", `cannot_share_with_owner` → "You already own this document.".
- [ ] **Step 3: Verify** end-to-end: Alice shares with Carol as viewer → switch to Carol → doc in *Shared with me*, read-only; Alice upgrades to editor → Carol can edit; Alice removes → Carol's list no longer shows it.
- [ ] **Step 4:** Commit `feat(ui): share dialog with role management`.

### Task 11: File import

**Files:**
- Create: `src/import/fileImport.ts`, `src/import/fileImport.test.ts`, `src/components/ImportButton.tsx`
- Modify: `src/pages/DocumentsPage.tsx`

**Interfaces:**
- Produces: `IMPORT_ACCEPT = '.txt,.md,.docx'`; `IMPORT_MAX_BYTES = 2 * 1024 * 1024`; `validateImportFile(file: File): string | null` (error message or null); `fileToHtml(file: File): Promise<string>`; `titleFromFilename(name: string): string`.

- [ ] **Step 1: Write failing tests** (jsdom environment):
  - `validateImportFile` → `.pdf` → `"Only .txt, .md and .docx files are supported."`; 5 MB `.txt` → `"File is larger than 2 MB."`; empty file → `"This file is empty."`; `notes.MD` (uppercase) → `null`.
  - `.txt` `"a < b\n\nsecond"` → `<p>a &lt; b</p><p>second</p>`.
  - `.md` `"# Title\n\n- one\n- two"` → contains `<h1>Title</h1>` and `<li>one</li>`.
  - `.md` containing `<script>alert(1)</script>` → output contains no `<script`.
  - `.docx` with garbage bytes → rejects with `"Couldn't read this .docx file."`.
  - `titleFromFilename('Q3 plan.final.docx')` → `'Q3 plan.final'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (mammoth `convertToHtml({ arrayBuffer })` for `.docx`; `marked` for `.md` then strip `<script>`/`<style>`/`<iframe>` and `on*` attributes via DOMParser; TipTap later drops unknown nodes anyway). **Step 4:** Run → PASS.
- [ ] **Step 5:** ImportButton: hidden `<input type=file accept={IMPORT_ACCEPT}>`; helper text `".txt, .md, .docx · up to 2 MB"`; on file → validate → `fileToHtml` → `generateJSON(html, editorExtensions)` → `POST /api/documents { title, content }` → navigate to editor; errors inline; busy state.
- [ ] **Step 6: Verify** in browser with a real `.docx` (headings, bold, lists), a `.md` and a `.txt`.
- [ ] **Step 7:** Commit `feat: import .txt/.md/.docx as new documents`.

### Task 12: Deploy, CI, and submission docs

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`, `docs/ARCHITECTURE.md`, `docs/AI_WORKFLOW.md`, `SUBMISSION.md`, `VIDEO_URL.txt`, `docs/screenshots/*.png`

- [ ] **Step 1:** CI: on push → `npm ci`, `npm run typecheck`, `npx vitest run`.
- [ ] **Step 2:** `npx wrangler secret put SESSION_SECRET` (random 32+ bytes); `npm run db:migrate && npm run db:seed` against Aiven; `npm run deploy`.
- [ ] **Step 3: Verify production** — run the full reviewer script on the live URL: sign in as Alice → edit Welcome doc with formatting → refresh → import a `.docx` → share with Carol as viewer → switch to Carol → read-only → switch to Bob → edit shared doc. `curl /api/health` → `db:true`.
- [ ] **Step 4:** README: live URL, seeded users, local setup (Node 20+, `.env` keys from `.env.example`, `npm i`, `db:migrate`, `db:seed`, `dev`, `test`, `deploy`), supported import types, known limitations.
- [ ] **Step 5:** ARCHITECTURE.md (≤ 1 page): diagram, decisions & tradeoffs from spec §2/§8, what's next with 2–4 h (real-time via Durable Objects + Yjs, version history, export).
- [ ] **Step 6:** AI_WORKFLOW.md built from `specs/ai-decision-log.md`: tools, where AI sped things up, what was changed/rejected (concrete entries), how verified (tests, browser checks, prod script).
- [ ] **Step 7:** SUBMISSION.md: exact file list, live URL, credentials, what works / incomplete / next. `VIDEO_URL.txt` placeholder for the user's link. Screenshots of list, editor, share dialog, viewer mode.
- [ ] **Step 8:** Commit `docs: readme, architecture, ai workflow, submission`; push.
