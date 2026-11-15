---
name: Ajaia Docs
description: A collaborative document editor in the familiar Docs grammar, with save state and access always legible.
colors:
  action: "#0b57d0"
  action-hover: "#0842a0"
  share: "#c2e7ff"
  share-hover: "#b3d7ef"
  share-ink: "#001d35"
  active: "#d3e3fd"
  active-ink: "#041e49"
  chrome: "#f9fbfd"
  pill: "#edf2fa"
  pill-hover: "#dfe5ee"
  hover: "#e9eef6"
  page: "#ffffff"
  ink: "#1f1f1f"
  ink-2: "#444746"
  ink-3: "#5f6368"
  outline: "#747775"
  line: "#c7c7c7"
  line-soft: "#e1e3e1"
  danger: "#b3261e"
  danger-bg: "#fce8e6"
  warn-bg: "#fef7e0"
  warn-ink: "#5c3c00"
  ok: "#146c2e"
  mark-blue: "#2f6fde"
  mark-fold: "#a8c7fa"
typography:
  display:
    fontFamily: "Roboto, 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: "36px"
  headline:
    fontFamily: "Roboto, 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: "28px"
  title:
    fontFamily: "Roboto, 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 500
  body:
    fontFamily: "Roboto, 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Roboto, 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  doc-body:
    fontFamily: "Arial, 'Liberation Sans', Helvetica, sans-serif"
    fontSize: "14.667px"
    fontWeight: 400
    lineHeight: 1.5
  doc-h1:
    fontFamily: "Arial, 'Liberation Sans', Helvetica, sans-serif"
    fontSize: "26.667px"
    fontWeight: 400
    lineHeight: 1.25
  doc-h2:
    fontFamily: "Arial, 'Liberation Sans', Helvetica, sans-serif"
    fontSize: "21.333px"
    fontWeight: 400
    lineHeight: 1.3
  doc-h3:
    fontFamily: "Arial, 'Liberation Sans', Helvetica, sans-serif"
    fontSize: "18.667px"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  sm: "4px"
  lg: "8px"
  xl: "12px"
  menu: "24px"
  dialog: "28px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.page}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-share:
    backgroundColor: "{colors.share}"
    textColor: "{colors.share-ink}"
    rounded: "{rounded.full}"
    padding: "0 20px"
    height: "40px"
  button-share-hover:
    backgroundColor: "{colors.share-hover}"
  button-text:
    textColor: "{colors.action}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-text-hover:
    backgroundColor: "{colors.hover}"
  toolbar-pill:
    backgroundColor: "{colors.pill}"
    rounded: "{rounded.full}"
    padding: "0 8px"
    height: "40px"
  tool-button:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    size: "28px"
  tool-button-active:
    backgroundColor: "{colors.active}"
    textColor: "{colors.active-ink}"
  input-outlined:
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "48px"
  search-pill:
    backgroundColor: "{colors.pill}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "48px"
  dialog:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "24px"
  doc-page:
    backgroundColor: "{colors.page}"
    width: "816px"
    padding: "96px"
  list-row:
    rounded: "{rounded.full}"
    padding: "0 12px"
  list-row-hover:
    backgroundColor: "{colors.hover}"
---

# Design System: Ajaia Docs

## Overview

**Creative North Star: "The Familiar Desk"**

Ajaia Docs speaks the Docs grammar near-faithfully so the tool disappears: a cool off-white chrome, one rounded toolbar pill, a white Letter-size page on the canvas, a pale-blue Share pill, and one saturated action blue. Nothing is invented for decoration. Every bit of novelty the system allows goes to legibility of state: whether the document is saved, who owns it, and what role you hold.

The system is dense and quiet. Chrome text sits at 14px in Roboto; the document itself is Arial at 11pt, exactly like a word-processor page. Surfaces are flat tints of blue-grey; depth appears only where something floats (page, menus, dialogs). Shapes split cleanly: interactive controls and pills are fully round, the page and fields are nearly square.

**Key Characteristics:**
- Cool blue-grey chrome (#f9fbfd) around a white, hairline-edged page.
- One action blue for commits; a pale Share pill as the single signature control.
- Two type worlds: Roboto for the app, Arial 11pt for the document.
- Fully rounded controls and hover rows; near-square page, fields and cards.
- Save status and role are always visible text, never inferred.

## Colors

A restrained blue-grey family with one saturated blue; semantic red, amber and green appear only for state.

### Primary
- **Commit Blue** (action): Filled primary buttons (Done, confirm), focus outlines, focused field borders, text-button labels, spinners and creation icons. Hover deepens to **Commit Blue Deep** (action-hover).

### Secondary
- **Share Sky** (share, with share-ink text): Reserved for the Share pill in the editor header. Hover to share-hover.
- **Pressed Blue** (active, with active-ink text): Pressed toolbar toggles, the open menubar item, and the "Editor" role chip.

### Neutral
- **Chrome Mist** (chrome): App background around the page; editor frame; row hover inside dialogs.
- **Pill Tint** (pill): Toolbar pill, search field at rest, skeleton blocks, read-only notice. Hover to pill-hover.
- **Hover Wash** (hover): Hover fill for rows, icon buttons, menu items and text buttons.
- **Paper** (page): The document page, dialogs, menus, the documents home.
- **Ink / Ink 2 / Ink 3** (ink, ink-2, ink-3): Primary text; secondary text and icons; tertiary metadata, save status, helper copy.
- **Outline** (outline): 1px stroke on outlined fields, role selects, outlined buttons, title hover.
- **Hairline / Soft Hairline** (line, line-soft): Page edge, toolbar dividers, import card dashes; list separators and section borders.

### Semantic
- **Danger** (danger on danger-bg): Save failure, errors, destructive confirm.
- **Warn** (warn-ink on warn-bg): Advisory notice bars.
- **Ok** (ok): Share success confirmation text.

### Brand mark
- **Mark Blue / Mark Fold** (mark-blue, mark-fold): Only inside the folded-page "A" logo and the document-row icon. Not a UI color.

### Named Rules
**The One Blue Rule.** Commit Blue is the only saturated color in chrome. Fills are reserved for the single committing action in a view; everything else is a tint or text.

**The Share Pill Rule.** Share Sky belongs to Share. Do not reuse it for other buttons, badges or banners.

## Typography

**Chrome Font:** Roboto (self-hosted; fallback Segoe UI, system-ui, sans-serif)
**Document Font:** Arial (fallback Liberation Sans, Helvetica)
**Code:** ui-monospace, Consolas, Courier New (inside documents only)

**Character:** A neutral UI sans for the app and a classic word-processor face for content, so the page reads as a document, not a web view.

### Hierarchy
- **Display** (400, 28px/36px): Sign-in heading only.
- **Headline** (400, 22px/28px): Dialog titles, wordmark, error-page heading.
- **Title** (500, 16px): Section headings ("People with access", document list groups). The document title field is 18px/24px regular.
- **Body** (400 or 500, 14px): All chrome text; base `body` size. Names and primary list text take 500.
- **Label** (400, 12-13px): Emails, metadata, save status (13px), shortcuts, helper copy, role chips (12px/500).
- **Document** (Arial 400, 14.667px / 1.5; H1 26.667px, H2 21.333px, H3 18.667px in #434343): Point-size mapping 11/20/16/14pt; headings stay regular weight.

### Named Rules
**The Two Worlds Rule.** Arial never appears in chrome, and Roboto never appears on the page.

**The Regular Heading Rule.** Headings in both worlds are weight 400 except 16px section titles (500). Hierarchy comes from size, not bold.

## Layout

App frames are full-height flex columns. The editor stacks a title row (mark, title, role chip, save status, menubar) over a full-width toolbar pill, then a scrolling canvas with a centered page (max 816px wide, min 1056px tall; padding 24/40px mobile, 72px at sm, 96px at lg) and a 248px sticky outline rail on the left at lg. The documents home uses a 64px sticky header with a centered 720px search pill, a grey "Start a new document" band, and a 1000px content column of grid list rows (name / owner 160px / modified 150px / menu 40px; collapses to name / date / menu below sm). Sign-in is a single centered 448px card on #f0f4f9.

Spacing follows a 4px Tailwind rhythm; 8px gaps between controls, 12-16px inside rows and notices, 24px dialog padding.

## Elevation & Depth

Mostly flat tonal layering: chrome, pill and hover tints separate regions. Shadows appear only on elements that float above the canvas, and stay soft and grey.

### Shadow Vocabulary
- **Page lift** (`0 1px 3px rgb(60 64 67 / 0.15)` plus 1px #c7c7c7 border): The document page.
- **Menu** (`0 2px 6px 2px rgb(60 64 67 / 0.15), 0 1px 2px rgb(60 64 67 / 0.3)`): Menubar dropdowns; row menus use `0 2px 10px rgb(0 0 0 / 0.2)`.
- **Account menu** (`0 4px 16px rgb(0 0 0 / 0.14), 0 1px 3px rgb(0 0 0 / 0.1)`).
- **Dialog** (`0 4px 24px rgb(0 0 0 / 0.25)`) over a `rgb(32 33 36 / 0.45)` backdrop.
- **Search focus** (`0 1px 3px rgb(0 0 0 / 0.2)`): Search pill turns white and lifts on focus.

### Named Rules
**The Float-Only Shadow Rule.** Only the page and floating layers (menus, dialogs, focused search) cast shadows. Bars, rows, buttons and cards stay flat.

## Shapes

Two corner families. **Fully round** (9999px) for every button, pill, avatar, chip and hover row, including whole list rows and outline items. **Near-square** for content and inputs: page (0), fields, toolbar buttons, and template cards (4px), menus and inline alerts (8px), notice bars (12px). Containers that float get large soft corners: account menu (24px), dialogs and sign-in card (28px). Borders are 1px; the import card's dashed border marks a drop target.

## Components

### Buttons
- **Shape:** Fully round (9999px).
- **Primary:** Commit Blue fill, white 14px/500 text, 40px tall, 24px horizontal padding. Hover to Commit Blue Deep. Destructive variant uses Danger.
- **Share:** Share Sky pill, 40px, 14px/500 share-ink text with a lock (owner) or people (shared) icon.
- **Text:** No fill, Commit Blue label, 8px 16px padding; Hover Wash on hover. Outlined variant (Share in dialog) adds a 1px Outline stroke at 48px tall.
- **Icon:** Round, 6-8px padding, ink-2 glyph, Hover Wash on hover.
- **Focus:** Global 2px Commit Blue outline, 2px offset. Disabled drops to 60% opacity (toolbar 35%).

### Toolbar
- **Style:** A single 40px Pill Tint capsule, full width, groups separated by 1px x 20px Hairline dividers.
- **Tool buttons:** 28px squares, 4px radius, 18px Lucide stroke icons at 2.25 weight; pressed state Pressed Blue fill with active-ink glyph. Shortcuts live in titles.
- **Mode chip:** Right-aligned "Editing" / "Viewing" with pencil/eye icon.

### Inputs / Fields
- **Outlined:** 48px, 4px radius, 1px Outline stroke, 16px text, 16px padding; focus swaps the border to Commit Blue with a 2px inset outline.
- **Search pill:** 48px Pill Tint capsule; on focus turns Paper with search-focus shadow.
- **Title field:** Borderless 18px text; Outline border on hover, Commit Blue on focus.

### Lists
- **Document rows:** Fully round hover rows (Hover Wash) with DocIcon, 14px/500 title, owner and relative time columns, overflow menu revealed on hover/focus.
- **Person rows:** 36px avatar, name 14px, email 12px ink-2, role select or label right.

### Chips
- **Role chip:** 12px/500 round chip. Editor: Pressed Blue on active-ink. Viewer: #e3e3e3 on ink-2.

### Dialogs & Menus
- **Dialog:** Native `<dialog>`, Paper, 28px radius, 22px headline, footer with helper text left and Done right.
- **Menubar dropdown:** Paper, 8px radius, 260px min, items 14px with right-aligned 12px shortcuts, groups separated by Soft Hairline.
- **Account menu:** Hover Wash shell (24px radius) holding a white card (16px radius) with 56px avatar and greeting, then round menu items.

### Save Status (signature)
Text-and-icon line beside the title at 13px ink-3: "Saving..." with a spinner, "Saved" with a cloud-check. Failure becomes a Danger button "Couldn't save — Retry" with Danger-bg hover. It is never hidden while editable.

### Notices
Full-width bars under the toolbar: 12px radius, 14px text, tone fills (warn, danger), with a round inline action at `white/60` hover.

## Do's and Don'ts

### Do:
- **Do** keep a single Commit Blue filled button per view; secondary actions are text buttons.
- **Do** render document content in Arial at 11pt (14.667px) with regular-weight headings.
- **Do** make every control, chip and hover row fully round; keep the page and fields near-square.
- **Do** show save state and the user's role as visible text at all times.
- **Do** use Lucide stroke icons (16-20px chrome, 18px toolbar at 2.25 stroke).
- **Do** generate avatar colors from the fixed seven-color set keyed by email.

### Don't:
- **Don't** use Share Sky anywhere but the Share control.
- **Don't** add shadows to bars, rows, cards or buttons; only floating layers lift.
- **Don't** introduce new saturated hues in chrome; semantic colors are for state only.
- **Don't** use Google branding or the Google logo; the Ajaia folded-page mark is the identity.
- **Don't** bold headings for hierarchy; scale size instead.
