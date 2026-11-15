import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState, type Editor } from '@tiptap/react';
import { Check, MessageSquareDiff, X } from 'lucide-react';
import { listSuggestions, type SuggestionRange } from '../editor/suggestions';

const MAX_EXCERPT = 60;
const excerpt = (t: string) => (t.length > MAX_EXCERPT ? `${t.slice(0, MAX_EXCERPT)}…` : t) || '(empty)';

/** "Suggestions (n)" button with a popover listing tracked changes; accept/reject when `canResolve`. */
export function SuggestionsMenu({ editor, canResolve }: { editor: Editor; canResolve: boolean }) {
  const items = useEditorState({
    editor,
    selector: ({ editor: e }): SuggestionRange[] => listSuggestions(e.state.doc),
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && items.length === 0) setOpen(false);
  }, [open, items.length]);

  if (items.length === 0) return null;

  function toggle() {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setOpen((o) => !o);
  }

  const select = (s: SuggestionRange) => editor.chain().focus().setTextSelection({ from: s.from, to: s.to }).scrollIntoView().run();
  const range = (s: SuggestionRange) => ({ from: s.from, to: s.to });

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[14px] text-ink-2 hover:bg-pill-hover"
      >
        <MessageSquareDiff className="size-4" aria-hidden />
        Suggestions ({items.length})
      </button>
      {open && pos && createPortal(
        <div
          ref={panel}
          role="dialog"
          aria-label="Suggestions"
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-40 flex max-h-[60vh] w-[min(340px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl border border-line-soft bg-white shadow-lg"
        >
          {canResolve && (
            <div className="flex items-center justify-end gap-1 border-b border-line-soft px-3 py-2">
              <button
                type="button"
                onClick={() => editor.chain().focus().acceptAllSuggestions().run()}
                className="rounded px-2 py-1 text-[13px] font-medium text-[#137333] hover:bg-[#e6f4ea]"
              >
                Accept all
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().rejectAllSuggestions().run()}
                className="rounded px-2 py-1 text-[13px] font-medium text-[#c5221f] hover:bg-[#fce8e6]"
              >
                Reject all
              </button>
            </div>
          )}
          <ul className="overflow-y-auto py-1">
            {items.map((s) => (
              <li key={`${s.type}-${s.from}`} className="flex items-start gap-2 px-3 py-2 hover:bg-pill">
                <button type="button" onClick={() => select(s)} className="min-w-0 flex-1 text-left">
                  <span className="block text-[13px] text-ink-2">
                    {s.authorName ?? 'Someone'} · {s.type === 'insert' ? 'Add' : 'Delete'}
                  </span>
                  <span
                    className={`block truncate text-[14px] ${s.type === 'insert' ? 'text-[#137333]' : 'text-[#c5221f] line-through'}`}
                  >
                    {excerpt(s.text)}
                  </span>
                </button>
                {canResolve && (
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      aria-label="Accept suggestion"
                      title="Accept"
                      onClick={() => editor.chain().focus().acceptSuggestion(range(s)).run()}
                      className="flex size-7 items-center justify-center rounded text-[#137333] hover:bg-[#e6f4ea]"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Reject suggestion"
                      title="Reject"
                      onClick={() => editor.chain().focus().rejectSuggestion(range(s)).run()}
                      className="flex size-7 items-center justify-center rounded text-[#c5221f] hover:bg-[#fce8e6]"
                    >
                      <X className="size-4" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
