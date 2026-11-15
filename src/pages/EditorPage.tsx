import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { Lock, RotateCw, Users } from 'lucide-react';
import { DEFAULT_TITLE, TITLE_MAX, type DocJSON, type Document, type Share } from '../../shared/types';
import { api, ApiError } from '../api/client';
import { AccountMenu } from '../components/AccountMenu';
import { Avatar } from '../components/Avatar';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { LogoMark } from '../components/Logo';
import { SaveStatus } from '../components/SaveStatus';
import { ShareDialog } from '../components/ShareDialog';
import { Toolbar } from '../components/Toolbar';
import { editorExtensions } from '../editor/extensions';
import { createSaveQueue, type SaveState } from '../editor/saveQueue';
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

type Banner = 'conflict' | 'lost' | null;
interface Snapshot {
  title: string;
  content: DocJSON;
}
interface Heading {
  level: number;
  text: string;
  pos: number;
}

function DocumentEditor({ initial }: { initial: Document }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const me = user!;
  const canEdit = initial.access !== 'viewer';
  const isOwner = initial.access === 'owner';

  const [title, setTitle] = useState(initial.title);
  const [savedTitle, setSavedTitle] = useState(initial.title);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [banner, setBanner] = useState<Banner>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [headings, setHeadings] = useState<Heading[]>([]);

  const versionRef = useRef(initial.version);
  const titleRef = useRef(initial.title);
  const savedTitleRef = useRef(initial.title);
  const editorRef = useRef<Editor | null>(null);

  const handleLost = useCallback(() => setBanner('lost'), []);

  const queue = useMemo(() => {
    const q = createSaveQueue<Snapshot>(async (snap) => {
        try {
          const updated = await api.patch<Document>(`/documents/${initial.id}`, {
            version: versionRef.current,
            title: snap.title,
            content: snap.content,
          });
          versionRef.current = updated.version;
          savedTitleRef.current = updated.title;
          setSavedTitle(updated.title);
        } catch (err) {
          if (err instanceof ApiError) {
            if (err.status === 409) {
              setBanner('conflict');
              q.pause();
            } else if (err.status === 401 || err.status === 403 || err.status === 404) {
              setBanner('lost');
              q.pause();
            }
          }
          throw err;
        }
      }, 1000);
    return q;
  }, [initial.id]);

  useEffect(() => queue.subscribe(setSaveState), [queue]);

  // Flush on unmount (route change) and warn before closing the tab with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (queue.hasUnsavedChanges()) {
        e.preventDefault();
        void queue.flush();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      void queue.flush().finally(() => queue.dispose());
    };
  }, [queue]);

  // Reads refs only, so editor callbacks captured at creation never see stale state.
  const snapshot = useCallback(
    (): Snapshot => ({
      title: titleRef.current.trim() || savedTitleRef.current || DEFAULT_TITLE,
      content: (editorRef.current?.getJSON() as DocJSON | undefined) ?? initial.content,
    }),
    [initial.content],
  );

  const editor = useEditor({
    extensions: editorExtensions,
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

  useEffect(() => {
    api
      .get<Share[]>(`/documents/${initial.id}/shares`)
      .then(setShares)
      .catch((err: ApiError) => {
        if (err.status === 404 || err.status === 403) handleLost();
      });
  }, [initial.id, handleLost]);

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
      (e.target as HTMLInputElement).blur();
    }
  }

  async function goHome(e: MouseEvent) {
    e.preventDefault();
    await queue.flush();
    navigate('/');
  }

  // Sync editability if access changes to lost.
  useEffect(() => {
    if (banner && editor) editor.setEditable(false);
  }, [banner, editor]);

  const editable = canEdit && banner === null;
  const roleLabel = isOwner ? null : initial.access === 'editor' ? 'Editor' : 'Viewer';

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
                className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium sm:inline ${
                  roleLabel === 'Editor' ? 'bg-[#d3e3fd] text-[#041e49]' : 'bg-[#e3e3e3] text-ink-2'
                }`}
              >
                Shared with you · {roleLabel}
              </span>
            )}
          </div>
          <div className="flex h-6 items-center gap-3 px-1.5 text-[13px]">
            <span className="hidden text-ink-2 sm:inline">{isOwner ? 'Owned by you' : `Owner: ${initial.owner.name}`}</span>
            {editable ? (
              <SaveStatus state={saveState} onRetry={() => queue.retry()} />
            ) : (
              <span className="flex items-center gap-1.5 text-ink-3">
                <Lock className="size-3.5" aria-hidden /> Read-only
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden -space-x-2 md:flex" aria-label="People with access">
            {[initial.owner, ...shares.map((s) => s.user)]
              .filter((u) => u.id !== me.id)
              .slice(0, 4)
              .map((u) => (
                <span key={u.id} className="rounded-full ring-2 ring-chrome">
                  <Avatar user={u} size={30} />
                </span>
              ))}
          </div>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            disabled={banner === 'lost'}
            className="flex h-10 items-center gap-2 rounded-full bg-share px-4 text-[14px] font-medium text-share-ink transition-colors hover:bg-share-hover disabled:opacity-50 sm:px-5"
          >
            {isOwner ? <Lock className="size-4" aria-hidden /> : <Users className="size-4" aria-hidden />}
            <span className="max-[380px]:hidden">Share</span>
          </button>
          <AccountMenu />
        </div>
      </header>

      {/* Toolbar */}
      <div className="shrink-0 px-2 pb-2 sm:px-3">{editor && <Toolbar editor={editor} editable={editable} />}</div>

      {banner === 'conflict' && (
        <Notice tone="warn" action={<NoticeButton onClick={() => window.location.reload()} icon={<RotateCw className="size-4" />} label="Reload" />}>
          This document was changed somewhere else (another tab or person). Reload to see the latest version — edits made
          since your last save won’t be kept.
        </Notice>
      )}
      {banner === 'lost' && (
        <Notice tone="danger" action={<Link to="/" className="rounded-full px-3 py-1.5 font-medium hover:bg-white/60">Back to documents</Link>}>
          You no longer have access to this document. It may have been deleted or unshared.
        </Notice>
      )}
      {!canEdit && banner === null && (
        <Notice tone="info">
          You can view this document but not edit it. Ask {initial.owner.name} for editor access.
        </Notice>
      )}

      {/* Canvas */}
      <div className="relative flex min-h-0 flex-1 overflow-y-auto border-t border-line-soft">
        <Outline headings={headings} editor={editor} />
        <div className="flex min-w-0 flex-1 justify-center px-2 py-4 sm:px-6 lg:pr-[248px]">
          <article
            className="doc-page h-max min-h-[1056px] w-full max-w-[816px] border border-line bg-white px-6 py-10 shadow-[0_1px_3px_rgb(60_64_67/0.15)] sm:px-[72px] sm:py-[72px] lg:px-[96px] lg:py-[96px]"
            onClick={(e) => {
              if (e.target === e.currentTarget) editor?.commands.focus('end');
            }}
          >
            <EditorContent editor={editor} />
          </article>
        </div>
      </div>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        docId={initial.id}
        title={savedTitle}
        owner={initial.owner}
        me={me}
        isOwner={isOwner}
        shares={shares}
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

