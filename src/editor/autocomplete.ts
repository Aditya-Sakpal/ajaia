import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

interface Suggestion {
  text: string | null;
  pos: number;
}

export interface AutocompleteOptions {
  /** Returns a continuation for the text before the cursor ('' for none). */
  fetchCompletion: (before: string) => Promise<string>;
  /** Checked on every keystroke; lets the page switch the feature off. */
  isEnabled: () => boolean;
  debounceMs: number;
}

export const autocompleteKey = new PluginKey<Suggestion>('aiAutocomplete');
const EMPTY: Suggestion = { text: null, pos: 0 };

/** Joins a suggestion onto the text before it with sensible spacing. */
export function joinSuggestion(before: string, suggestion: string): string {
  const s = suggestion.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (!before || /\s$/.test(before) || /^[.,;:!?)\]'’"”]/.test(s)) return s;
  return ` ${s}`;
}

/** Only suggest when the cursor sits at the end of a block that already has some words. */
function contextForSuggestion(state: EditorState): string | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if (!$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size) return null;
  if ($from.parent.textContent.trim().split(/\s+/).length < 3) return null;
  return state.doc.textBetween(Math.max(0, $from.pos - 1500), $from.pos, '\n', ' ');
}

/** Ghost-text autocomplete: pause typing → grey suggestion; Tab accepts, Esc dismisses. */
export const AiAutocomplete = Extension.create<AutocompleteOptions>({
  name: 'aiAutocomplete',
  priority: 1000, // before list keymaps so Tab accepts a visible suggestion

  addOptions() {
    return { fetchCompletion: async () => '', isEnabled: () => false, debounceMs: 900 };
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const s = autocompleteKey.getState(editor.state);
        if (!s?.text) return false;
        editor.chain().insertContentAt(s.pos, s.text).run();
        return true;
      },
      Escape: ({ editor }) => {
        const s = autocompleteKey.getState(editor.state);
        if (!s?.text) return false;
        editor.view.dispatch(editor.state.tr.setMeta(autocompleteKey, EMPTY));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestId = 0;

    const schedule = (view: EditorView) => {
      clearTimeout(timer);
      requestId++;
      if (!view.editable || !options.isEnabled()) return;
      const before = contextForSuggestion(view.state);
      if (before === null) return;
      const id = requestId;
      const docAtRequest = view.state.doc;
      timer = setTimeout(async () => {
        let text = '';
        try {
          text = await options.fetchCompletion(before);
        } catch {
          return; // autocomplete is best-effort; never interrupt typing with errors
        }
        if (id !== requestId || view.isDestroyed || !view.state.doc.eq(docAtRequest)) return;
        const joined = joinSuggestion(before, text);
        if (!joined) return;
        view.dispatch(view.state.tr.setMeta(autocompleteKey, { text: joined, pos: view.state.selection.from }));
      }, options.debounceMs);
    };

    return [
      new Plugin<Suggestion>({
        key: autocompleteKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev) {
            const meta = tr.getMeta(autocompleteKey) as Suggestion | undefined;
            if (meta) return meta;
            if (tr.docChanged || tr.selectionSet) return EMPTY;
            return prev;
          },
        },
        props: {
          decorations(state) {
            const s = autocompleteKey.getState(state);
            if (!s?.text) return null;
            const ghost = document.createElement('span');
            ghost.className = 'ai-ghost';
            ghost.textContent = s.text;
            const hint = document.createElement('span');
            hint.className = 'ai-ghost-hint';
            hint.textContent = 'Tab';
            ghost.appendChild(hint);
            return DecorationSet.create(state.doc, [Decoration.widget(s.pos, ghost, { side: 1, key: 'ai-ghost' })]);
          },
        },
        view() {
          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) schedule(view);
            },
            destroy() {
              clearTimeout(timer);
              requestId++;
            },
          };
        },
      }),
    ];
  },
});
