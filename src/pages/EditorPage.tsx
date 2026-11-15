import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { Copy, Lock, MessageSquarePlus, RotateCw, Users, X } from 'lucide-react';
import { DEFAULT_TITLE, TITLE_MAX, type DocJSON, type Document, type Share } from '../../shared/types';
import { api, ApiError } from '../api/client';
import { AccountMenu } from '../components/AccountMenu';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { LogoMark } from '../components/Logo';
import { SaveStatus } from '../components/SaveStatus';
import { ShareDialog } from '../components/ShareDialog';
import { Toolbar } from '../components/Toolbar';
import { MenuBar } from '../components/MenuBar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { editorExtensions } from '../editor/extensions';
import { AiAutocomplete } from '../editor/autocomplete';
import { Pagination } from '../editor/pagination';
import { AiBar } from '../components/AiBar';
import { generateJSON } from '@tiptap/core';
import { IMPORT_ACCEPT, fileToHtml, titleFromFilename, validateImportFile } from '../import/fileImport';
import { createSaveQueue, type SaveState } from '../editor/saveQueue';
import { isSameSnapshot, type Snapshot } from '../editor/snapshot';
import { mergeDocs } from '../editor/merge';
import { Avatar } from '../components/Avatar';
import { CommentsPanel } from '../components/CommentsPanel';
import { VersionHistoryDialog } from '../components/VersionHistoryDialog';
import { docToMarkdown, downloadText, safeFilename } from '../editor/exportMarkdown';
import { ACCESS_BADGE, ACCESS_LABEL } from '../lib/format';
import type { User } from '../../shared/types';
import { useAuth } from '../lib/auth';

type LoadState = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; doc: Document };

export function EditorPage() {
  const { id = '' } = useParams();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    api
      .get<Document>(`/documents/${id}`)
      .then((doc) => !cancelled && setLoad({ status: 'ready', doc }))
      .catch((err: ApiError) => {
        if (cancelled) return;
        if (err.status === 401) window.location.assign('/login');
        setLoad({ status: 'error', message: err.message, notFound: err.status === 404 });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (load.status === 'loading') return <FullPageSpinner label="Opening document" />;
  if (load.status === 'error') return <OpenError notFound={load.notFound} message={load.message} />;
  return <DocumentEditor key={load.doc.id} initial={load.doc} />;
}

function OpenError({ notFound, message }: { notFound: boolean; message: string }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark size={48} />
      <h1 className="text-[22px] text-ink">{notFound ? 'This document isn’t available' : 'Couldn’t open this document'}</h1>
      <p className="max-w-md text-[14px] text-ink-2">
        {notFound
          ? 'It may have been deleted, or it hasn’t been shared with the account you’re signed in as. Try switching accounts.'
          : message}
      </p>
      <Link to="/" className="rounded-full bg-action px-6 py-2.5 text-[14px] font-medium text-white hover:bg-action-hover">
        Back to documents
      </Link>
    </main>
  );
}

type Banner = 'conflict' | 'lost' | 'forbidden' | 'signedOut' | null;
interface Heading {
  level: number;
  text: string;
  pos: number;
}

function DocumentEditor({ initial }: { initial: Document }) {
  const { user, registerBeforeSignOut } = useAuth();
  const navigate = useNavigate();
  const me = user!;
  const canEdit = initial.access === 'owner' || initial.access === 'editor';
  const canComment = initial.access !== 'viewer';
  const isOwner = initial.access === 'owner';

  const [title, setTitle] = useState(initial.title);
  const [savedTitle, setSavedTitle] = useState(initial.title);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [banner, setBanner] = useState<Banner>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [sharesError, setSharesError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingCopy, setSavingCopy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [headings, setHeadings] = useState<Heading[]>([]);

  const versionRef = useRef(initial.version);
  const titleRef = useRef(initial.title);
  const savedTitleRef = useRef(initial.title);
  const editorRef = useRef<Editor | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const leavingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importModeRef = useRef<'new' | 'insert'>('new');
  const [importNotice, setImportNotice] = useState<{ tone: 'danger' | 'info'; text: string } | null>(null);

  const handleLost = useCallback(() => setBanner('lost'), []);

  // Live collaboration: the content both sides last agreed on (for three-way merges), who is here,
  // and a short note when someone else's edits were merged in.
  const baseRef = useRef<DocJSON>(initial.content);
  const [viewers, setViewers] = useState<User[]>([]);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const bannerRef = useRef<Banner>(null);
  bannerRef.current = banner;

  /** Replace the editor content without creating a save or losing the caret. */
  const applyContent = useCallback((content: DocJSON) => {
    const ed = editorRef.current;
    if (!ed || JSON.stringify(ed.getJSON()) === JSON.stringify(content)) return;
    const { from, to } = ed.state.selection;
    ed.commands.setContent(content as JSONContent, { emitUpdate: false });
    const max = ed.state.doc.content.size;
    ed.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
    setHeadings(collectHeadings(ed));
  }, []);

  const queue = useMemo(() => {
    const q = createSaveQueue<Snapshot>(async (snap) => {
        try {
          const updated = await api.patch<Document>(`/documents/${initial.id}`, {
            version: versionRef.current,
            title: snap.title,
            content: snap.content,
          });
          versionRef.current = updated.version;
          baseRef.current = snap.content;
          setSaveError(null);
          savedTitleRef.current = updated.title;
          setSavedTitle(updated.title);
        } catch (err) {
          // A previous save landed but its reply was lost: the server already holds exactly this snapshot.
          const current = err instanceof ApiError && err.status === 409 ? err.body?.current : undefined;
          if (current && isSameSnapshot(snap, current)) {
            versionRef.current = current.version;
            savedTitleRef.current = current.title;
            setSavedTitle(current.title);
            setSaveError(null);
            return;
          }
          // Someone else saved first: merge their blocks with ours instead of making the user choose.
          if (current) {
            const mine = (editorRef.current?.getJSON() as DocJSON | undefined) ?? snap.content;
            const merged = mergeDocs(baseRef.current, mine, current.content);
            if (merged) {
              try {
                applyContent(merged);
                const saved = await api.patch<Document>(`/documents/${initial.id}`, {
                  version: current.version,
                  title: snap.title,
                  content: merged,
                });
                versionRef.current = saved.version;
                baseRef.current = merged;
                savedTitleRef.current = saved.title;
                setSavedTitle(saved.title);
                setSaveError(null);
                setSyncNote('Merged with edits made by someone else.');
                return;
              } catch {
                /* fall through to the conflict banner */
              }
            }
          }
          setSaveError(err instanceof ApiError ? err.message : 'Your changes could not be saved.');
          if (err instanceof ApiError) {
            if (err.status === 409) {
              setBanner('conflict');
              q.pause();
            } else if (err.status === 401 || err.status === 403 || err.status === 404) {
              setBanner(err.status === 401 ? 'signedOut' : err.status === 403 ? 'forbidden' : 'lost');
              q.pause();
            }
          }
          throw err;
        }
      }, 1000);
    return q;
  }, [initial.id, applyContent]);

  useEffect(() => queue.subscribe(setSaveState), [queue]);

  // Heartbeat every 4 s: report presence, see who else is here, and pull remote edits while idle.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const p = await api.post<{ version: number; viewers: User[] }>(`/documents/${initial.id}/presence`, {});
        if (stopped) return;
        setViewers(p.viewers);
        if (p.version <= versionRef.current || bannerRef.current || queue.hasUnsavedChanges()) return;
        const latest = await api.get<Document>(`/documents/${initial.id}`);
        if (stopped || latest.version <= versionRef.current || queue.hasUnsavedChanges()) return;
        versionRef.current = latest.version;
        baseRef.current = latest.content;
        applyContent(latest.content);
        savedTitleRef.current = latest.title;
        setSavedTitle(latest.title);
        if (document.activeElement !== titleInputRef.current) {
          titleRef.current = latest.title;
          setTitle(latest.title);
        }
        setSyncNote('Updated with the latest changes.');
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setBanner('lost');
      }
    };
    void tick();
    const id = setInterval(tick, 4000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [initial.id, queue, applyContent]);

  useEffect(() => {
    if (!syncNote) return;
    const t = setTimeout(() => setSyncNote(null), 3500);
    return () => clearTimeout(t);
  }, [syncNote]);

  // Flush on unmount (route change) and warn before closing the tab with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!leavingRef.current && queue.hasUnsavedChanges()) {
        e.preventDefault();
        void queue.flush();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Flush only: StrictMode re-runs effects on the same queue, so it must stay usable.
      void queue.flush();
    };
  }, [queue]);

  // Switching account from this page: save first, then let the session be cleared.
  useEffect(() => registerBeforeSignOut(() => queue.flush()), [registerBeforeSignOut, queue]);

  // Reads refs only, so editor callbacks captured at creation never see stale state.
  const snapshot = useCallback(
    (): Snapshot => ({
      title: titleRef.current.trim() || savedTitleRef.current || DEFAULT_TITLE,
      content: (editorRef.current?.getJSON() as DocJSON | undefined) ?? initial.content,
    }),
    [initial.content],
  );

  // AI autocomplete preference (per browser); switched off automatically if the server has no AI key.
  const [autocompleteOn, setAutocompleteOn] = useState(() => {
    try {
      return localStorage.getItem('ajaia.autocomplete') !== 'off';
    } catch {
      return true;
    }
  });
  const autocompleteRef = useRef(autocompleteOn);
  function changeAutocomplete(on: boolean) {
    autocompleteRef.current = on;
    setAutocompleteOn(on);
    try {
      localStorage.setItem('ajaia.autocomplete', on ? 'on' : 'off');
    } catch {
      /* storage unavailable: preference lasts for this page only */
    }
  }

  const editor = useEditor({
    extensions: [
      ...editorExtensions,
      Pagination,
      AiAutocomplete.configure({
        debounceMs: 900,
        isEnabled: () => canEdit && autocompleteRef.current,
        fetchCompletion: async (before) => {
          try {
            const r = await api.post<{ completion: string }>(`/documents/${initial.id}/ai/complete`, { before });
            return r.completion;
          } catch (err) {
            if (err instanceof ApiError && err.status === 503) autocompleteRef.current = false;
            throw err;
          }
        },
      }),
    ],
    content: initial.content as JSONContent,
    editable: canEdit,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        'aria-label': 'Document body',
        role: 'textbox',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
    },
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
      setHeadings(collectHeadings(e));
    },
    onUpdate: ({ editor: e }) => {
      editorRef.current = e;
      setHeadings(collectHeadings(e));
      if (canEdit) queue.schedule(snapshot());
    },
  });

  const loadShares = useCallback(() => {
    setSharesError(false);
    api
      .get<Share[]>(`/documents/${initial.id}/shares`)
      .then(setShares)
      .catch((err: ApiError) => {
        if (err.status === 404 || err.status === 403) handleLost();
        else setSharesError(true);
      });
  }, [initial.id, handleLost]);

  useEffect(loadShares, [loadShares]);

  // Comments, version history and export.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [pendingQuote, setPendingQuote] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  function startComment() {
    const ed = editorRef.current;
    if (ed && canComment) {
      const { from, to } = ed.state.selection;
      setPendingQuote(from === to ? '' : ed.state.doc.textBetween(from, to, ' ').trim());
    }
    setCommentsOpen(true);
  }

  function downloadMarkdown() {
    const ed = editorRef.current;
    if (!ed) return;
    downloadText(`${safeFilename(titleRef.current)}.md`, docToMarkdown(ed.getJSON() as DocJSON), 'text/markdown;charset=utf-8');
  }

  /** Restoring is an ordinary edit: the content goes through autosave, so it is itself versioned and undoable. */
  function restoreVersion(content: DocJSON) {
    const ed = editorRef.current;
    if (!ed || !ed.isEditable) return;
    ed.commands.setContent(content as JSONContent, { emitUpdate: true });
    setHeadings(collectHeadings(ed));
  }

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.altKey && !e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        startComment();
      } else if (mod && e.altKey && e.shiftKey && e.code === 'KeyH') {
        e.preventDefault();
        setHistoryOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openShare() {
    setShareOpen(true);
    loadShares(); // always show the current list, not the one from page load
  }

  /** After a conflict: keep this tab's edits by saving them as a new document the user owns. */
  async function saveMyVersionAsCopy() {
    if (savingCopy) return;
    setSavingCopy(true);
    const snap = snapshot();
    try {
      const copy = await api.post<Document>('/documents', {
        title: `${snap.title} (my version)`.slice(0, TITLE_MAX),
        content: snap.content,
      });
      leavingRef.current = true;
      navigate(`/d/${copy.id}`);
    } catch (err) {
      setSavingCopy(false);
      setSaveError(err instanceof ApiError ? err.message : 'Could not save a copy.');
    }
  }

  function pickFile(mode: 'new' | 'insert') {
    importModeRef.current = mode;
    fileInputRef.current?.click();
  }

  /** File → Import (new document) or Insert (at the cursor). Same converter as the documents page. */
  async function handleFile(file: File) {
    const invalid = validateImportFile(file);
    if (invalid) {
      setImportNotice({ tone: 'danger', text: `${file.name}: ${invalid}` });
      return;
    }
    setImportNotice({ tone: 'info', text: `Importing ${file.name}…` });
    try {
      const html = (await fileToHtml(file)) || '<p></p>';
      if (importModeRef.current === 'insert' && editor) {
        editor.chain().focus().insertContentAt(editor.state.selection.to, html).run();
        setImportNotice(null);
        return;
      }
      await queue.flush();
      const content = generateJSON(html, editorExtensions) as DocJSON;
      const doc = await api.post<Document>('/documents', { title: titleFromFilename(file.name), content });
      setImportNotice(null);
      navigate(`/d/${doc.id}`);
    } catch (err) {
      setImportNotice({ tone: 'danger', text: `${file.name}: ${err instanceof Error ? err.message : 'Import failed.'}` });
    }
  }

  async function createNew() {
    await queue.flush();
    try {
      const doc = await api.post<Document>('/documents', {});
      navigate(`/d/${doc.id}`);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not create a document.');
    }
  }

  async function deleteThis() {
    setDeleting(true);
    try {
      leavingRef.current = true;
      queue.pause();
      await api.del(`/documents/${initial.id}`);
      navigate('/');
    } catch (err) {
      leavingRef.current = false;
      setDeleting(false);
      setConfirmDelete(false);
      setSaveError(err instanceof ApiError ? err.message : 'Could not delete the document.');
    }
  }

  function onTitleChange(value: string) {
    setTitle(value);
    titleRef.current = value;
    if (canEdit && value.trim()) queue.schedule(snapshot());
  }

  function onTitleCommit() {
    if (!title.trim()) {
      setTitle(savedTitle);
      titleRef.current = savedTitle;
    } else if (title !== title.trim()) {
      onTitleChange(title.trim());
    }
  }

  function onTitleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onTitleCommit();
      editor?.commands.focus('start');
    }
    if (e.key === 'Escape') {
      setTitle(savedTitle);
      titleRef.current = savedTitle;
      if (canEdit) queue.schedule(snapshot()); // supersede a rename that was already queued
      (e.target as HTMLInputElement).blur();
    }
  }

  async function goHome(e?: MouseEvent) {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return; // let "open in new tab" work
    e?.preventDefault();
    await queue.flush();
    if (queue.hasUnsavedChanges() && !window.confirm('Your latest changes are not saved. Leave anyway?')) return;
    leavingRef.current = true;
    navigate('/');
  }

  // Sync editability if access changes to lost.
  useEffect(() => {
    if (banner && editor) editor.setEditable(false);
  }, [banner, editor]);

  const editable = canEdit && banner === null;
  const roleLabel = isOwner ? null : ACCESS_LABEL[initial.access];

  return (
    <div className="flex h-full flex-col bg-chrome">
      {/* Title bar */}
      <header className="flex shrink-0 items-center gap-2 px-3 pt-2 pb-1 sm:px-4">
        <a href="/" onClick={goHome} className="shrink-0 rounded-full p-1.5 hover:bg-hover" aria-label="Back to documents" title="Back to documents">
          <LogoMark size={36} />
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor="doc-title" className="sr-only">
              Document title
            </label>
            <input
              id="doc-title"
              ref={titleInputRef}
              value={title}
              readOnly={!editable}
              maxLength={TITLE_MAX}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={onTitleCommit}
              onKeyDown={onTitleKey}
              spellCheck={false}
              style={{ width: `calc(${Math.min(Math.max(title.length, 8), 60)}ch + 16px)` }}
              className="max-w-full min-w-0 truncate rounded border border-transparent px-1.5 py-0.5 text-[18px] leading-6 text-ink hover:border-[#747775] focus:border-action focus:outline-none read-only:hover:border-transparent"
            />
            {roleLabel && (
              <span
                title={`Owner: ${initial.owner.name}`}
                className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium sm:inline ${ACCESS_BADGE[initial.access]}`}
              >
                Shared with you · {roleLabel}
              </span>
            )}
            {editable && (
              <span className="shrink-0 text-[13px]">
                <SaveStatus state={saveState} onRetry={() => queue.retry()} />
              </span>
            )}
          </div>
          <MenuBar
            editor={editor}
            editable={editable}
            isOwner={isOwner}
            onNew={createNew}
            onImportNew={() => pickFile('new')}
            onInsertFile={() => pickFile('insert')}
            onRename={() => titleInputRef.current?.select()}
            onShare={openShare}
            onDelete={() => setConfirmDelete(true)}
            onHome={() => void goHome()}
            canComment={canComment && banner === null}
            onComment={startComment}
            onHistory={() => setHistoryOpen(true)}
            onDownloadMarkdown={downloadMarkdown}
            onPrint={() => window.print()}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {syncNote && (
            <span role="status" className="hidden text-[13px] text-ink-2 lg:inline">
              {syncNote}
            </span>
          )}
          {viewers.filter((u) => u.id !== me.id).length > 0 && (
            <div className="flex -space-x-1.5" aria-label="People viewing now" data-testid="presence">
              {viewers
                .filter((u) => u.id !== me.id)
                .slice(0, 4)
                .map((u) => (
                  <span key={u.id} className="rounded-full p-[2px] ring-2 ring-[#1e8e3e]">
                    <Avatar user={u} size={28} title={`${u.name} is viewing now`} />
                  </span>
                ))}
            </div>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (commentsOpen && !pendingQuote ? setCommentsOpen(false) : startComment())}
            aria-pressed={commentsOpen}
            aria-label="Comments"
            title={canComment ? 'Comments — select text first to comment on it' : 'Comments'}
            className={`flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-hover ${commentsOpen ? 'bg-active' : ''}`}
          >
            <MessageSquarePlus className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={openShare}
            disabled={banner !== null && banner !== 'conflict'}
            className="flex h-10 items-center gap-2 rounded-full bg-share px-4 text-[14px] font-medium text-share-ink transition-colors hover:bg-share-hover disabled:opacity-50 sm:px-5"
          >
            {isOwner ? <Lock className="size-4" aria-hidden /> : <Users className="size-4" aria-hidden />}
            <span className="max-[380px]:hidden">Share</span>
          </button>
          <AccountMenu />
        </div>
      </header>

      {/* Toolbar */}
      <div className="shrink-0 px-2 pb-2 sm:px-3">
        {editor && <Toolbar editor={editor} editable={editable} viewHint={canEdit ? undefined : `Ask ${initial.owner.name} for editor access`} />}
      </div>

      {banner === 'conflict' && (
        <Notice
          tone="warn"
          action={
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              <NoticeButton
                onClick={() => void saveMyVersionAsCopy()}
                icon={<Copy className="size-4" />}
                label={savingCopy ? 'Saving copy…' : 'Save my version as a copy'}
              />
              <NoticeButton
                onClick={() => {
                  leavingRef.current = true;
                  window.location.reload();
                }}
                icon={<RotateCw className="size-4" />}
                label="Reload"
              />
            </span>
          }
        >
          This document was changed somewhere else (another tab or person). Your edits are still here: save them as a copy,
          or reload to see the latest version.
        </Notice>
      )}
      {banner === 'lost' && (
        <Notice tone="danger" action={<Link to="/" className="rounded-full px-3 py-1.5 font-medium hover:bg-white/60">Back to documents</Link>}>
          You no longer have access to this document. It may have been deleted or unshared.
        </Notice>
      )}
      {banner === 'forbidden' && (
        <Notice tone="danger" action={<NoticeButton onClick={() => { leavingRef.current = true; window.location.reload(); }} icon={<RotateCw className="size-4" />} label="Reload" />}>
          Your access to this document changed, so your latest edits couldn’t be saved. Reload to see what you can do now.
        </Notice>
      )}
      {banner === 'signedOut' && (
        <Notice tone="danger" action={<Link to="/login" className="rounded-full px-3 py-1.5 font-medium hover:bg-white/60">Sign in</Link>}>
          You’ve been signed out, so your latest edits couldn’t be saved.
        </Notice>
      )}
      {importNotice && (
        <Notice
          tone={importNotice.tone}
          action={
            importNotice.tone === 'danger' ? (
              <NoticeButton onClick={() => setImportNotice(null)} icon={<X className="size-4" />} label="Dismiss" />
            ) : undefined
          }
        >
          {importNotice.text}
        </Notice>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        data-testid="editor-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />
      {saveState === 'error' && banner === null && saveError && (
        <Notice tone="danger" action={<NoticeButton onClick={() => queue.retry()} icon={<RotateCw className="size-4" />} label="Retry" />}>
          Your latest changes aren’t saved yet. {saveError}
        </Notice>
      )}

      {/* Canvas */}
      <div className="relative flex min-h-0 flex-1 overflow-y-auto border-t border-line-soft">
        <Outline headings={headings} editor={editor} />
        <div className={`flex min-w-0 flex-1 flex-col items-center px-2 py-4 sm:px-6 ${commentsOpen ? '' : 'lg:pr-[248px]'}`}>
          <article
            className="doc-page h-max min-h-[1056px] w-full max-w-[816px] shrink-0 lg:min-h-0 border border-line bg-white px-6 py-10 shadow-[0_1px_3px_rgb(60_64_67/0.15)] sm:px-[72px] sm:py-[72px] lg:px-[96px] lg:py-[96px]"
            onClick={(e) => {
              if (e.target === e.currentTarget) editor?.commands.focus('end');
            }}
          >
            <EditorContent editor={editor} />
          </article>
          {editor && editable && (
            <AiBar editor={editor} docId={initial.id} autocomplete={autocompleteOn} onAutocompleteChange={changeAutocomplete} />
          )}
        </div>
        {commentsOpen && (
          <div className="sticky top-0 h-full shrink-0 border-l border-line-soft bg-white" data-print-hide>
            <CommentsPanel
              documentId={initial.id}
              me={me}
              access={initial.access}
              ownerId={initial.owner.id}
              pendingQuote={pendingQuote}
              onClearQuote={() => setPendingQuote('')}
              onClose={() => {
                setCommentsOpen(false);
                setPendingQuote('');
              }}
            />
          </div>
        )}
      </div>

      <VersionHistoryDialog
        documentId={initial.id}
        open={historyOpen}
        canRestore={editable}
        onClose={() => setHistoryOpen(false)}
        onRestore={(v) => restoreVersion(v.content)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete document?"
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={deleteThis}
        onCancel={() => setConfirmDelete(false)}
      >
        “{savedTitle}” will be deleted for you and everyone it’s shared with. This can’t be undone.
      </ConfirmDialog>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        docId={initial.id}
        title={savedTitle}
        owner={initial.owner}
        me={me}
        isOwner={isOwner}
        shares={shares}
        sharesError={sharesError}
        onRetryShares={loadShares}
        onSharesChange={setShares}
        onAccessLost={() => {
          setShareOpen(false);
          handleLost();
        }}
      />
    </div>
  );
}

function collectHeadings(editor: Editor): Heading[] {
  const out: Heading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      out.push({ level: node.attrs.level as number, text: node.textContent, pos });
      return false;
    }
    return node.type.name === 'doc';
  });
  return out;
}

function Outline({ headings, editor }: { headings: Heading[]; editor: Editor | null }) {
  function jump(h: Heading) {
    if (!editor) return;
    editor.commands.setTextSelection(h.pos + 1);
    const dom = editor.view.nodeDOM(h.pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
    editor.commands.focus();
  }

  return (
    <nav aria-label="Document outline" className="sticky top-0 hidden h-max w-[248px] shrink-0 px-4 pt-6 lg:block">
      <p className="px-3 pb-2 text-[14px] font-medium text-ink-2">Outline</p>
      {headings.length === 0 ? (
        <p className="px-3 text-[12px] leading-4 text-ink-3 italic">Headings that you add to the document will appear here.</p>
      ) : (
        <ul className="space-y-0.5">
          {headings.map((h, i) => (
            <li key={`${h.pos}-${i}`}>
              <button
                type="button"
                onClick={() => jump(h)}
                className="block w-full truncate rounded-full py-1.5 pr-3 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink"
                style={{ paddingLeft: 12 + (h.level - 1) * 14 }}
              >
                {h.text || 'Untitled heading'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function Notice({ tone, children, action }: { tone: 'warn' | 'danger' | 'info'; children: ReactNode; action?: ReactNode }) {
  const tones = {
    warn: 'bg-warn-bg text-warn-ink',
    danger: 'bg-danger-bg text-danger',
    info: 'bg-[#e8f0fe] text-[#174ea6]',
  } as const;
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`mx-2 mb-2 flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] sm:mx-3 ${tones[tone]}`}>
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function NoticeButton({ onClick, icon, label }: { onClick(): void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-medium hover:bg-white/60">
      {icon}
      {label}
    </button>
  );
}

