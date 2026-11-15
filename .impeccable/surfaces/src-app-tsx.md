---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/pages/EditorPage.tsx","src/pages/DocumentsPage.tsx","src/pages/LoginPage.tsx"]
---

# Surface: Ajaia Docs app (sign-in, documents home, editor, share dialog)

Mode: Operate. Audience: hiring reviewers on a 5-minute test (confirmed). Task: sign in as a demo user, edit with formatting, import a file, share, switch user and verify.

Direction: user-pinned canon — near-faithful Google Docs look (confirmed answer "Near-faithful Docs look"). The concept roll was not run because the brief pins the world; no Google branding.

## Direction contract
THESIS: The tool disappears into the familiar Docs grammar; it refuses invented chrome and any ambiguity about save state or access.
OWN-WORLD: #f9fbfd chrome and canvas, #edf2fa rounded toolbar pill, white 8.5in page with hairline #c7c7c7 edge, #c2e7ff Share pill, #0b57d0 action blue, #1f1f1f/#444746 ink, Arial 11pt document body, system sans chrome, 20px stroke icons, Ajaia "A" page mark.
STORY: Reviewer sees whose documents are theirs vs shared, edits confidently because "Saved" is always visible, shares in a Docs-style dialog, and sees roles enforced when switching user.
FIRST VIEWPORT: Editor — title row (mark, title, save status) left; avatars, Share pill, account avatar right; toolbar pill full width beneath; outline rail left; page centered on canvas.
FORM: Docs canon, position 1 (pinned), seed key: none (pinned by user).
Signature interaction: live save-status line next to the title plus heading outline that tracks the document.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
