# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Vite + React + TypeScript SPA, Tailwind CSS v4, TipTap v3 editor, Hono API on a single Cloudflare Worker, Aiven Postgres via Hyperdrive (see specs/01-product-spec.md §8).

## Users
Primary: hiring reviewers at Ajaia evaluating a take-home in about five minutes — they sign in as seeded demo users (Alice, Bob, Carol), edit, import a file, share, then switch users to confirm sharing works. Secondary (framing only): small internal teams writing shared working documents.

## Product Purpose
A lightweight, Google-Docs-inspired collaborative document editor: create, rename, format and autosave documents, import .txt/.md/.docx files as new documents, and share documents with teammates as editor or viewer. Success = a reviewer completes the full flow without instructions and trusts that saving and access rules are correct.

## Positioning
A deliberately scoped slice: depth in editing, persistence and access control rather than breadth. Version-checked saves instead of real-time co-editing; server-enforced owner/editor/viewer roles.

## Operating Context
Desktop browser, reviewer switching between demo accounts (often in two tabs). Documents are short working docs. Demo sign-in has no passwords.

## Capabilities and Constraints
- Rich text: bold, italic, underline, H1–H3, bulleted and numbered lists, undo/redo.
- Import: .txt, .md, .docx up to 2 MB; images and tables in .docx are dropped.
- Sharing: owner shares by email; roles editor/viewer; only owner deletes or manages sharing.
- Out of scope: real-time co-editing, comments, version history, real auth, images/tables.

## Brand Commitments
- User-pinned: near-faithful Google Docs look and layout (light grey chrome, rounded toolbar pill, white page on a grey canvas, light-blue Share pill). Reference: ui_references/Screenshot 2026-11-15 194620.png.
- Never use Google logos, product names or trademarks; the product is "Ajaia Docs" with its own mark.

## Evidence on Hand
Seeded demo content only (Welcome doc, Q3 Planning Notes). No customers, metrics or testimonials exist; none may be invented.

## Product Principles
1. Familiar beats novel: a Docs user should never pause at a control.
2. Trust the save: always show whether work is saved, and never lose or silently overwrite it.
3. Access is visible: owned vs shared, and your role, are always on screen.
4. Make the demo self-explanatory: hints point at sharing and import for first-time reviewers.

## Accessibility & Inclusion
WCAG AA contrast, full keyboard operation of toolbar and dialogs, aria-pressed on formatting toggles.
