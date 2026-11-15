import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Comment anchors: highlights the text each open comment quotes, client-side only.
 *
 * Commenters can't write document content, so comments are NOT stored as marks. Instead each
 * comment carries the `quote` that was selected when it was made, and this plugin finds that text
 * in the document. The found range is remembered and mapped through every edit; if the mapped
 * range no longer reads as the quote, the quote is searched for again (nearest occurrence to the
 * old spot wins). If it's gone, the comment has no anchor ("orphaned").
 *
 * Text is matched the way the quote was captured (`doc.textBetween(from, to, ' ')`): blocks are
 * joined with a single space, so a quote spanning several paragraphs matches and is highlighted
 * across all of them. Whitespace runs are collapsed on both sides. Inline non-text nodes (hard
 * breaks, images) contribute no text.
 */

export interface AnchorComment {
  id: string;
  quote: string;
}
export interface AnchorRange {
  from: number;
  to: number;
}

interface AnchorState {
  comments: AnchorComment[];
  ranges: Map<string, AnchorRange>;
  activeId: string | null;
  /** Last known range per comment, kept while orphaned so a re-search can prefer the old spot. */
  lastSeen: Map<string, AnchorRange>;
  decorations: DecorationSet;
}

type AnchorMeta = { type: 'set'; comments: AnchorComment[] } | { type: 'active'; id: string | null };

export const commentAnchorsKey = new PluginKey<AnchorState>('commentAnchors');

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Flattens the doc to text (blocks joined by one space, whitespace collapsed) with a doc position per char. */
function flatten(doc: PMNode): { text: string; starts: number[]; ends: number[] } {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let lastEnd = 0;
  const push = (ch: string, start: number, end: number) => {
    const isSpace = /\s/.test(ch);
    if (isSpace && (text === '' || text.endsWith(' '))) return;
    text += isSpace ? ' ' : ch;
    starts.push(start);
    ends.push(end);
  };
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (text !== '') push(' ', pos + 1, lastEnd);
      node.forEach((child, offset) => {
        if (!child.isText) return;
        const base = pos + 1 + offset;
        const t = child.text ?? '';
        for (let i = 0; i < t.length; i++) push(t[i], base + i, base + i + 1);
      });
      lastEnd = pos + 1 + node.content.size;
      return false;
    }
    return true;
  });
  return { text, starts, ends };
}

/** Finds `quote` in the doc; with `near`, the occurrence whose start is closest to it. */
export function findQuoteRange(doc: PMNode, quote: string, near?: number): AnchorRange | null {
  const q = normalize(quote);
  if (!q) return null;
  const { text, starts, ends } = flatten(doc);
  let best: AnchorRange | null = null;
  for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + 1)) {
    const r = { from: starts[i], to: ends[i + q.length - 1] };
    if (near === undefined) return r;
    if (!best || Math.abs(r.from - near) < Math.abs(best.from - near)) best = r;
  }
  return best;
}

function rangeReads(doc: PMNode, r: AnchorRange, quote: string): boolean {
  if (r.from >= r.to || r.from < 0 || r.to > doc.content.size) return false;
  return normalize(doc.textBetween(r.from, r.to, ' ')) === normalize(quote);
}

function buildDecorations(doc: PMNode, ranges: Map<string, AnchorRange>, activeId: string | null): DecorationSet {
  const decos: Decoration[] = [];
  for (const [id, r] of ranges) {
    const cls = id === activeId ? 'comment-anchor comment-anchor-active' : 'comment-anchor';
    decos.push(Decoration.inline(r.from, r.to, { class: cls, 'data-comment-id': id }, { commentId: id }));
  }
  return DecorationSet.create(doc, decos);
}

function locateAll(doc: PMNode, comments: AnchorComment[], prev: Map<string, AnchorRange>): Map<string, AnchorRange> {
  const ranges = new Map<string, AnchorRange>();
  for (const c of comments) {
    const old = prev.get(c.id);
    const r = old && rangeReads(doc, old, c.quote) ? old : findQuoteRange(doc, c.quote, old?.from);
    if (r) ranges.set(c.id, r);
  }
  return ranges;
}

export interface CommentAnchorsOptions {
  /** Called when the user clicks highlighted text. */
  onActivate?: (commentId: string) => void;
}

export function commentAnchorsPlugin(options: CommentAnchorsOptions = {}): Plugin<AnchorState> {
  return new Plugin<AnchorState>({
    key: commentAnchorsKey,
    state: {
      init: (_, { doc }) => ({ comments: [], ranges: new Map(), activeId: null, lastSeen: new Map(), decorations: DecorationSet.create(doc, []) }),
      apply(tr, value, _old, newState) {
        const meta = tr.getMeta(commentAnchorsKey) as AnchorMeta | undefined;
        let { comments, ranges, activeId } = value;
        let changed = false;
        const lastSeen = new Map(value.lastSeen);
        if (tr.docChanged) {
          for (const [id, r] of lastSeen) lastSeen.set(id, { from: tr.mapping.map(r.from, 1), to: tr.mapping.map(r.to, -1) });
          const mapped = new Map<string, AnchorRange>();
          for (const c of comments) {
            const m = lastSeen.get(c.id);
            if (m) mapped.set(c.id, m);
          }
          ranges = locateAll(newState.doc, comments, mapped);
          changed = true;
        }
        if (meta?.type === 'set') {
          comments = meta.comments.filter((c) => normalize(c.quote) !== '');
          const ids = new Set(comments.map((c) => c.id));
          for (const id of lastSeen.keys()) if (!ids.has(id)) lastSeen.delete(id);
          ranges = locateAll(newState.doc, comments, new Map([...lastSeen, ...ranges]));
          changed = true;
        } else if (meta?.type === 'active') {
          activeId = meta.id;
          changed = true;
        }
        if (!changed) return value;
        for (const [id, r] of ranges) lastSeen.set(id, r);
        return { comments, ranges, activeId, lastSeen, decorations: buildDecorations(newState.doc, ranges, activeId) };
      },
    },
    props: {
      decorations: (state) => commentAnchorsKey.getState(state)?.decorations,
      handleDOMEvents: {
        click: (_view, event) => {
          const el = (event.target as HTMLElement | null)?.closest?.('[data-comment-id]');
          const id = el?.getAttribute('data-comment-id');
          if (id) options.onActivate?.(id);
          return false;
        },
      },
    },
  });
}

/** Current anchor range per comment id; comments with a quote but no entry are orphaned. */
export function getCommentAnchors(state: EditorState): ReadonlyMap<string, AnchorRange> {
  return commentAnchorsKey.getState(state)?.ranges ?? new Map();
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentAnchors: {
      setCommentAnchors: (comments: AnchorComment[]) => ReturnType;
      setActiveComment: (id: string | null) => ReturnType;
    };
  }
}

export const CommentAnchors = Extension.create<CommentAnchorsOptions>({
  name: 'commentAnchors',
  addOptions: () => ({ onActivate: undefined }),
  addCommands() {
    return {
      setCommentAnchors:
        (comments) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(commentAnchorsKey, { type: 'set', comments }).setMeta('addToHistory', false);
          return true;
        },
      setActiveComment:
        (id) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(commentAnchorsKey, { type: 'active', id }).setMeta('addToHistory', false);
          return true;
        },
    };
  },
  addProseMirrorPlugins() {
    return [commentAnchorsPlugin({ onActivate: (id) => this.options.onActivate?.(id) })];
  },
});
