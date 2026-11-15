import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { LoaderCircle, X } from 'lucide-react';
import type { Version, VersionSummary } from '../../shared/types';
import { api, ApiError } from '../api/client';
import { editorExtensions } from '../editor/extensions';
import { relativeTime } from '../lib/format';

interface Props {
  documentId: string;
  open: boolean;
  canRestore: boolean;
  onClose(): void;
  onRestore(version: Version): void;
}

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
const absoluteTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function VersionHistoryDialog({ documentId, open, canRestore, onClose, onRestore }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [full, setFull] = useState<Version | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const editor = useEditor({ extensions: editorExtensions, content: '', editable: false });

  const loadList = useCallback(async () => {
    setVersions(null);
    setListError(null);
    try {
      const list = await api.get<VersionSummary[]>(`/documents/${documentId}/versions`);
      setVersions(list);
      setSelectedId(list[0]?.id ?? null);
    } catch (err) {
      setListError(errorText(err));
    }
  }, [documentId]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setSelectedId(null);
      setFull(null);
      void loadList();
    }
    if (!open && d.open) d.close();
  }, [open, loadList]);

  const loadPreview = useCallback(
    async (id: string, signal: { cancelled: boolean }) => {
      setPreviewLoading(true);
      setPreviewError(null);
      setFull(null);
      try {
        const v = await api.get<Version>(`/documents/${documentId}/versions/${id}`);
        if (!signal.cancelled) setFull(v);
      } catch (err) {
        if (!signal.cancelled) setPreviewError(errorText(err));
      } finally {
        if (!signal.cancelled) setPreviewLoading(false);
      }
    },
    [documentId],
  );

  useEffect(() => {
    if (!open || !selectedId) return;
    const signal = { cancelled: false };
    void loadPreview(selectedId, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [open, selectedId, loadPreview]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.setContent(full ? (full.content as JSONContent) : '', { emitUpdate: false });
  }, [editor, full]);

  function restore() {
    if (!full) return;
    onRestore(full);
    onClose();
  }

  const selected = versions?.find((v) => v.id === selectedId) ?? null;

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="versions-title"
      className="m-auto h-[min(720px,calc(100vh-24px))] w-[min(1040px,calc(100vw-24px))] overflow-hidden rounded-[28px] bg-white p-0 text-ink shadow-[0_4px_24px_rgb(0_0_0/0.25)]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-line-soft px-6 pt-5 pb-4">
          <h2 id="versions-title" className="min-w-0 flex-1 text-[22px] leading-7">
            Version history
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-ink-2 hover:bg-hover">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Version list */}
          <nav aria-label="Saved versions" className="max-h-[35%] shrink-0 overflow-y-auto border-b border-line-soft bg-chrome sm:max-h-none sm:w-[280px] sm:border-r sm:border-b-0">
            {versions === null && !listError && (
              <p className="flex items-center gap-2 px-5 py-4 text-[13px] text-ink-3" role="status">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading versions…
              </p>
            )}
            {listError && (
              <p className="px-5 py-4 text-[13px] text-danger" role="alert">
                Couldn't load version history.{' '}
                <button type="button" onClick={() => void loadList()} className="font-medium underline underline-offset-2">
                  Try again
                </button>
              </p>
            )}
            {versions !== null && versions.length === 0 && (
              <p className="px-5 py-4 text-[13px] text-ink-2">No saved versions yet. Versions are saved automatically as you edit.</p>
            )}
            {versions !== null && versions.length > 0 && (
              <ul className="py-2">
                {versions.map((v) => {
                  const active = v.id === selectedId;
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(v.id)}
                        aria-current={active ? 'true' : undefined}
                        className={`block w-full px-5 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-action ${
                          active ? 'bg-active' : 'hover:bg-hover'
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[14px] font-medium text-ink">
                            <time dateTime={v.createdAt} title={absoluteTime(v.createdAt)}>
                              {absoluteTime(v.createdAt)}
                            </time>
                          </span>
                          <span className="shrink-0 text-[12px] text-ink-3">v{v.version}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-ink-2">
                          {v.author.name} · {relativeTime(v.createdAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          {/* Preview */}
          <section aria-label="Version preview" className="relative min-h-0 flex-1 overflow-y-auto bg-[#f0f4f9] px-3 py-4 sm:px-6">
            {selected && (
              <p className="mx-auto mb-3 max-w-[816px] truncate text-[13px] text-ink-2">
                <span className="font-medium text-ink">{selected.title}</span> · v{selected.version} by {selected.author.name}
              </p>
            )}
            {previewLoading && (
              <p className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading preview…
              </p>
            )}
            {previewError && (
              <p className="text-[13px] text-danger" role="alert">
                Couldn't load this version.{' '}
                <button
                  type="button"
                  onClick={() => selectedId && void loadPreview(selectedId, { cancelled: false })}
                  className="font-medium underline underline-offset-2"
                >
                  Try again
                </button>
              </p>
            )}
            <article
              aria-label="Read-only preview"
              hidden={!full}
              className="doc-page mx-auto w-full max-w-[816px] border border-line bg-white px-6 py-10 shadow-[0_1px_3px_rgb(60_64_67/0.15)] sm:px-[72px] sm:py-[72px]"
            >
              <EditorContent editor={editor} />
            </article>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-6 py-4">
          <p className="text-[12px] text-ink-3">
            {canRestore ? 'Restoring replaces the current content with the selected version.' : 'Only editors can restore versions.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-[14px] font-medium text-action hover:bg-hover">
              Close
            </button>
            {canRestore && selectedId && (
              <button
                type="button"
                onClick={restore}
                disabled={!full}
                className="h-10 rounded-full bg-action px-6 text-[14px] font-medium text-white hover:bg-action-hover disabled:opacity-60"
              >
                Restore this version
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
