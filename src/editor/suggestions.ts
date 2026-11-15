/**
 * Suggestion mode (tracked changes), Google-Docs style.
 *
 * Two marks carry the suggestions inside the ProseMirror JSON, so they persist and
 * sync like any other formatting:
 *   - `suggestionInsert` — text someone proposed adding   → <ins data-suggestion="insert">
 *   - `suggestionDelete` — text someone proposed removing → <del data-suggestion="delete">
 *
 * When suggesting is on, a plugin's `appendTransaction` rewrites each user edit:
 * inserted text gets the insert mark; deleted *inline* text is put back with the
 * delete mark (unless it was the author's own pending insert, which really goes).
 *
 * Scope (deliberate): only inline text changes inside a single textblock are tracked.
 * Structural edits — splitting/joining paragraphs, lists, headings, formatting marks —
 * apply directly, even in suggesting mode.
 */
import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import type { Node as PMNode, Mark as PMMark, Schema } from '@tiptap/pm/model';
import { Fragment } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { ReplaceStep, type Mapping } from '@tiptap/pm/transform';

export const INSERT = 'suggestionInsert';
export const DELETE = 'suggestionDelete';
export const SKIP_META = 'suggestion-skip';

export interface SuggestionUser {
  id: string;
  name: string;
}

const suggestionAttrs = {
  author: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-author'),
    renderHTML: (a: Record<string, unknown>) => (a.author ? { 'data-author': a.author } : {}),
  },
  authorName: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-author-name'),
    renderHTML: (a: Record<string, unknown>) => (a.authorName ? { 'data-author-name': a.authorName } : {}),
  },
  createdAt: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-created-at'),
    renderHTML: (a: Record<string, unknown>) => (a.createdAt ? { 'data-created-at': a.createdAt } : {}),
  },
};

export const SuggestionInsert = Mark.create({
  name: INSERT,
  inclusive: true, // keep typing inside the same suggestion
  excludes: DELETE,
  addAttributes: () => suggestionAttrs,
  parseHTML: () => [{ tag: 'ins[data-suggestion="insert"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'ins',
    mergeAttributes(HTMLAttributes, { 'data-suggestion': 'insert', class: 'suggestion-insert' }),
    0,
  ],
});

export const SuggestionDelete = Mark.create({
  name: DELETE,
  inclusive: false,
  excludes: INSERT,
  addAttributes: () => suggestionAttrs,
  parseHTML: () => [{ tag: 'del[data-suggestion="delete"]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'del',
    mergeAttributes(HTMLAttributes, { 'data-suggestion': 'delete', class: 'suggestion-delete' }),
    0,
  ],
});

// ---------------------------------------------------------------- plugin

export const suggestionKey = new PluginKey<{ enabled: boolean }>('suggestionMode');

export function isSuggesting(state: EditorState): boolean {
  return suggestionKey.getState(state)?.enabled ?? false;
}

export function setSuggestingTr(tr: Transaction, on: boolean): Transaction {
  return tr.setMeta(suggestionKey, { enabled: on }).setMeta('addToHistory', false);
}

function skip(tr: Transaction): boolean {
  return (
    !tr.docChanged ||
    !!tr.getMeta(SKIP_META) ||
    !!tr.getMeta('preventUpdate') ||
    tr.getMeta('addToHistory') === false ||
    !!tr.getMeta('history$') // undo / redo
  );
}

const isOwnInsert = (marks: readonly PMMark[], userId: string) =>
  marks.some((m) => m.type.name === INSERT && m.attrs.author === userId);

export function suggestionPlugin(opts: { user: SuggestionUser; enabled?: boolean }) {
  return new Plugin<{ enabled: boolean }>({
    key: suggestionKey,
    state: {
      init: () => ({ enabled: opts.enabled ?? false }),
      apply: (tr, value) => {
        const meta = tr.getMeta(suggestionKey) as { enabled: boolean } | undefined;
        return meta ? { enabled: meta.enabled } : value;
      },
    },
    appendTransaction(transactions, oldState, newState) {
      if (!isSuggesting(oldState)) return null;
      const insType = newState.schema.marks[INSERT];
      const delType = newState.schema.marks[DELETE];
      if (!insType || !delType) return null;
      const user = opts.user;
      const now = new Date().toISOString();
      const attrs = { author: user.id, authorName: user.name, createdAt: now };

      const out = newState.tr;
      let cursor: number | null = null;

      transactions.forEach((t, ti) => {
        if (skip(t)) return;
        // Maps a position from "after step i of t" to newState.doc, then through `out`.
        const later = (i: number): Mapping => {
          const m = t.mapping.slice(i + 1);
          for (let k = ti + 1; k < transactions.length; k++) m.appendMapping(transactions[k].mapping);
          return m;
        };
        t.steps.forEach((step, i) => {
          if (!(step instanceof ReplaceStep)) return; // structural (ReplaceAround), marks: apply directly
          const before = t.docs[i];
          const { from, to, slice } = step as unknown as { from: number; to: number; slice: { size: number } };
          const map = later(i);

          // 1. mark inserted inline text
          if (slice.size > 0) {
            const a = out.mapping.map(map.map(from, 1), 1);
            const b = out.mapping.map(map.map(from + slice.size, -1), -1);
            if (a < b) {
              out.removeMark(a, b, delType);
              out.doc.nodesBetween(a, b, (node, pos) => {
                if (!node.isText || isOwnInsert(node.marks, user.id)) return;
                out.addMark(Math.max(a, pos), Math.min(b, pos + node.nodeSize), insType.create(attrs));
              });
            }
          }

          // 2. put deleted inline text back, marked as deleted
          if (to > from) {
            const $from = before.resolve(from);
            const $to = before.resolve(to);
            if ($from.parent !== $to.parent || !$from.parent.inlineContent) return; // structural
            const nodes: PMNode[] = [];
            before.nodesBetween(from, to, (node, pos) => {
              if (!node.isInline) return;
              if (isOwnInsert(node.marks, user.id)) return; // own pending insert: really delete
              let n = node;
              if (node.isText) {
                n = node.cut(Math.max(0, from - pos), Math.min(node.nodeSize, to - pos));
              }
              if (!n.marks.some((m) => m.type === delType)) n = n.mark(delType.create(attrs).addToSet(n.marks));
              nodes.push(n);
            });
            if (!nodes.length) return;
            const at = out.mapping.map(map.map(from, -1), -1);
            const frag = Fragment.from(nodes);
            out.insert(at, frag);
            // Backspace leaves the caret before the struck text; Delete / overtype after it.
            const backspace = slice.size === 0 && oldState.selection.empty && oldState.selection.head === to;
            cursor = backspace ? at : null;
          }
        });
      });

      if (!out.docChanged) return null;
      if (cursor !== null) out.setSelection(TextSelection.create(out.doc, cursor));
      return out.setMeta(SKIP_META, true);
    },
  });
}

// ---------------------------------------------------------------- listing & resolving

export interface SuggestionRange {
  type: 'insert' | 'delete';
  from: number;
  to: number;
  text: string;
  author: string | null;
  authorName: string | null;
  createdAt: string | null;
}

/** Adjacent runs of the same kind by the same author, in document order. */
export function listSuggestions(doc: PMNode): SuggestionRange[] {
  const out: SuggestionRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isInline) return;
    const m = node.marks.find((x) => x.type.name === INSERT || x.type.name === DELETE);
    if (!m) return;
    const type = m.type.name === INSERT ? 'insert' : 'delete';
    const text = node.isText ? node.text! : '';
    const last = out[out.length - 1];
    if (last && last.type === type && last.author === m.attrs.author && last.to === pos) {
      last.to = pos + node.nodeSize;
      last.text += text;
    } else {
      out.push({
        type,
        from: pos,
        to: pos + node.nodeSize,
        text,
        author: m.attrs.author ?? null,
        authorName: m.attrs.authorName ?? null,
        createdAt: m.attrs.createdAt ?? null,
      });
    }
  });
  return out;
}

/**
 * Accept (true) or reject (false) every suggestion overlapping `range` (default: whole doc).
 * Accept insert → unmark; accept delete → remove text. Reject is the mirror image.
 * Returns whether anything changed. Callers dispatch `tr` (it is tagged to bypass tracking).
 */
export function resolveSuggestions(tr: Transaction, accept: boolean, range?: { from: number; to: number }): boolean {
  const schema: Schema = tr.doc.type.schema;
  const insType = schema.marks[INSERT];
  const delType = schema.marks[DELETE];
  if (!insType || !delType) return false;
  const groups = listSuggestions(tr.doc).filter(
    (g) => !range || (g.from < range.to && g.to > range.from) || (range.from === range.to && g.from <= range.from && g.to >= range.from),
  );
  if (!groups.length) return false;
  const remove: SuggestionRange[] = [];
  for (const g of groups) {
    const keepText = (g.type === 'insert') === accept;
    if (keepText) tr.removeMark(g.from, g.to, g.type === 'insert' ? insType : delType);
    else remove.push(g);
  }
  for (const g of remove.sort((a, b) => b.from - a.from)) tr.delete(g.from, g.to);
  tr.setMeta(SKIP_META, true);
  return true;
}

// ---------------------------------------------------------------- TipTap extension

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestionMode: {
      setSuggesting: (on: boolean) => ReturnType;
      acceptSuggestion: (range?: { from: number; to: number }) => ReturnType;
      rejectSuggestion: (range?: { from: number; to: number }) => ReturnType;
      acceptAllSuggestions: () => ReturnType;
      rejectAllSuggestions: () => ReturnType;
    };
  }
}

export const SuggestionMode = Extension.create<{ user: SuggestionUser; enabled: boolean }>({
  name: 'suggestionMode',
  addOptions: () => ({ user: { id: '', name: '' }, enabled: false }),
  addProseMirrorPlugins() {
    return [suggestionPlugin({ user: this.options.user, enabled: this.options.enabled })];
  },
  addCommands() {
    const one =
      (accept: boolean) =>
      (range?: { from: number; to: number }) =>
      ({ tr, state, dispatch }: { tr: Transaction; state: EditorState; dispatch?: unknown }) => {
        const r = range ?? { from: state.selection.from, to: state.selection.to };
        const t = dispatch ? tr : state.tr;
        return resolveSuggestions(t, accept, r);
      };
    const all =
      (accept: boolean) =>
      () =>
      ({ tr, state, dispatch }: { tr: Transaction; state: EditorState; dispatch?: unknown }) =>
        resolveSuggestions(dispatch ? tr : state.tr, accept);
    return {
      setSuggesting:
        (on: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) setSuggestingTr(tr, on);
          return true;
        },
      acceptSuggestion: one(true),
      rejectSuggestion: one(false),
      acceptAllSuggestions: all(true),
      rejectAllSuggestions: all(false),
    };
  },
});
