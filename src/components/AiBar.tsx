import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { ArrowUp, ChevronDown, FileText, LoaderCircle, Mail, NotebookPen, Sparkles, Wand2, X } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { markdownToHtml } from '../editor/aiInsert';

type Action =
  | 'continue'
  | 'summarize'
  | 'meeting_notes'
  | 'email_draft'
  | 'improve'
  | 'shorter'
  | 'longer'
  | 'fix_grammar'
  | 'custom';

const REWRITES: { id: Action; label: string }[] = [
  { id: 'improve', label: 'Improve writing' },
  { id: 'shorter', label: 'Make shorter' },
  { id: 'longer', label: 'Make longer' },
  { id: 'fix_grammar', label: 'Fix spelling & grammar' },
];

interface Props {
  editor: Editor;
  docId: string;
  autocomplete: boolean;
  onAutocompleteChange(on: boolean): void;
}

/** "Write with AI" bar pinned to the bottom of the page, Docs-style. */
export function AiBar({ editor, docId, autocomplete, onAutocompleteChange }: Props) {
  const [open, setOpen] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const hasSelection = useEditorState({ editor, selector: ({ editor: e }) => !e.state.selection.empty });

  useEffect(() => {
    if (!more) return;
    const close = (e: MouseEvent) => !moreRef.current?.contains(e.target as Node) && setMore(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [more]);

  async function run(action: Action, customPrompt?: string) {
    const { from, to, empty } = editor.state.selection;
    const selection = empty ? undefined : editor.state.doc.textBetween(from, to, '\n', ' ');
    setBusy(action);
    setError(null);
    setMore(false);
    try {
      const { markdown } = await api.post<{ markdown: string }>(`/documents/${docId}/ai/generate`, {
        action,
        context: editor.getText({ blockSeparator: '\n' }),
        selection,
        prompt: customPrompt,
      });
      if (!markdown.trim()) {
        setError('The assistant had nothing to add. Try rephrasing.');
        return;
      }
      const html = markdownToHtml(markdown);
      const replace = selection !== undefined && (REWRITES.some((r) => r.id === action) || action === 'custom');
      // One transaction, so a single Undo removes the AI text.
      editor
        .chain()
        .focus()
        .insertContentAt(replace ? { from, to } : to, html)
        .run();
      if (action === 'custom') setPrompt('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The assistant could not respond. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    void run('custom', prompt.trim());
  }

  if (!open) {
    return (
      <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] text-ink shadow-[0_1px_3px_rgb(60_64_67/0.3),0_4px_8px_3px_rgb(60_64_67/0.15)] hover:bg-hover"
        >
          <Sparkles className="size-4 text-action" aria-hidden /> Write with AI
        </button>
      </div>
    );
  }

  const chip = (id: Action, label: string, icon: ReactNode) => (
    <button
      key={id}
      type="button"
      disabled={busy !== null}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(id)}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-pill px-3 py-1.5 text-[13px] text-ink hover:bg-pill-hover disabled:opacity-50"
    >
      {busy === id ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {label}
    </button>
  );

  return (
    <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center px-2">
      <div className="pointer-events-auto w-full max-w-[600px]" role="region" aria-label="AI writing assistant">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
          {chip('continue', 'Continue writing', <Wand2 className="size-4" aria-hidden />)}
          {chip('meeting_notes', 'Meeting notes', <NotebookPen className="size-4" aria-hidden />)}
          {chip('email_draft', 'Email draft', <Mail className="size-4" aria-hidden />)}
          {chip('summarize', 'Summarize', <FileText className="size-4" aria-hidden />)}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={more}
              disabled={busy !== null}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMore((m) => !m)}
              className="flex items-center gap-1 rounded-full bg-pill px-3 py-1.5 text-[13px] text-ink hover:bg-pill-hover disabled:opacity-50"
            >
              More <ChevronDown className="size-4" aria-hidden />
            </button>
            {more && (
              <div role="menu" className="absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-lg bg-white py-1.5 shadow-[0_2px_6px_2px_rgb(60_64_67/0.15),0_1px_2px_rgb(60_64_67/0.3)]">
                <p className="px-4 pt-1 pb-1.5 text-[12px] text-ink-3">
                  {hasSelection ? 'Rewrite the selected text' : 'Select text in the document to rewrite it'}
                </p>
                {REWRITES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="menuitem"
                    disabled={!hasSelection}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run(r.id)}
                    className="block w-full px-4 py-1.5 text-left text-[14px] text-ink hover:bg-hover disabled:text-ink-3/60 disabled:hover:bg-transparent"
                  >
                    {r.label}
                  </button>
                ))}
                <label className="mt-1 flex cursor-pointer items-center justify-between border-t border-line-soft px-4 pt-2.5 pb-1.5 text-[14px] text-ink">
                  Autocomplete suggestions
                  <input
                    type="checkbox"
                    checked={autocomplete}
                    onChange={(e) => onAutocompleteChange(e.target.checked)}
                    className="size-4 accent-[var(--color-action)]"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-full border border-line-soft bg-white py-1.5 pr-1.5 pl-4 shadow-[0_1px_3px_rgb(60_64_67/0.3),0_4px_8px_3px_rgb(60_64_67/0.15)]"
        >
          <Sparkles className="size-5 shrink-0 text-action" aria-hidden />
          <label htmlFor="ai-prompt" className="sr-only">
            Write with AI
          </label>
          <input
            id="ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={hasSelection ? 'Tell AI how to change the selection…' : 'Write with AI…'}
            maxLength={2000}
            autoComplete="off"
            className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || busy !== null}
            aria-label="Generate"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action text-white hover:bg-action-hover disabled:bg-[#e3e3e3] disabled:text-ink-3"
          >
            {busy === 'custom' ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Hide AI assistant"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-hover"
          >
            <X className="size-4" />
          </button>
        </form>
        {(error || busy) && (
          <p
            role={error ? 'alert' : 'status'}
            className={`mt-2 rounded-full bg-white/95 px-4 py-1 text-center text-[13px] shadow-sm ${error ? 'text-danger' : 'text-ink-2'}`}
          >
            {error ?? 'Writing…'}
          </p>
        )}
      </div>
    </div>
  );
}
