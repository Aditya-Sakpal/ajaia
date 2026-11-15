import { marked } from 'marked';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { sanitizeHtml } from '../import/fileImport';

export type Placement = 'replace_selection' | 'replace_document' | 'insert';

/** AI replies are Markdown; convert and strip anything active before it reaches the editor. */
export function markdownToHtml(markdown: string): string {
  const cleaned = markdown
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  return sanitizeHtml(marked.parse(cleaned, { async: false, gfm: true }) as string);
}

/**
 * Puts AI output into the document as one undoable step.
 * - insert: at the end of the selection the user had when they asked
 * - replace_selection: over that selection
 * - replace_document: over the whole document
 * Replacements are refused ('stale') if the document changed while the AI was writing,
 * so we never overwrite edits the model didn't see.
 */
export function applyAiResult(
  editor: Editor,
  r: { html: string; placement: Placement; range: { from: number; to: number }; docAtRequest: PMNode },
): 'applied' | 'stale' {
  const changed = !editor.state.doc.eq(r.docAtRequest);
  if (r.placement === 'replace_document') {
    if (changed) return 'stale';
    editor
      .chain()
      .focus()
      .insertContentAt({ from: 0, to: editor.state.doc.content.size }, r.html)
      .run();
    return 'applied';
  }
  if (r.placement === 'replace_selection') {
    if (changed || r.range.from === r.range.to) return 'stale';
    editor.chain().focus().insertContentAt({ from: r.range.from, to: r.range.to }, r.html).run();
    return 'applied';
  }
  const size = editor.state.doc.content.size;
  const at = changed ? editor.state.selection.to : Math.min(r.range.to, size);
  editor.chain().focus().insertContentAt(at, r.html).run();
  return 'applied';
}
