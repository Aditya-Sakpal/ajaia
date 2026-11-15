import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { FilePlus2, MoreVertical, Search, Trash2, X } from 'lucide-react';
import type { Document, DocumentLists, DocumentSummary } from '../../shared/types';
import { api, ApiError } from '../api/client';
import { AccountMenu } from '../components/AccountMenu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DocIcon } from '../components/DocIcon';
import { ImportTile } from '../components/ImportButton';
import { LogoMark } from '../components/Logo';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/format';

export function DocumentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState<DocumentLists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<DocumentSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .get<DocumentLists>('/documents')
      .then(setLists)
      .catch((err: ApiError) => {
        if (err.status !== 401) setError(err.message); // 401 is handled by the auth layer
      });
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    if (!lists) return null;
    const q = query.trim().toLowerCase();
    const match = (d: DocumentSummary) => !q || d.title.toLowerCase().includes(q) || d.owner.name.toLowerCase().includes(q);
    return { owned: lists.owned.filter(match), shared: lists.shared.filter(match) };
  }, [lists, query]);

  async function createBlank() {
    setCreating(true);
    try {
      const doc = await api.post<Document>('/documents', {});
      navigate(`/d/${doc.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a document.');
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.del(`/documents/${toDelete.id}`);
      setLists((l) => l && { ...l, owned: l.owned.filter((d) => d.id !== toDelete.id) });
      setToDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the document.');
      setToDelete(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 bg-white px-2 sm:px-4">
        <Link to="/" className="flex items-center gap-2 rounded-full py-1 pr-3 pl-2 hover:bg-hover" aria-label="Ajaia Docs home">
          <LogoMark size={36} />
          <span className="text-[22px] text-ink-2">
            Ajaia <span className="max-[420px]:hidden">Docs</span>
          </span>
        </Link>
        <div className="mx-auto flex h-12 w-full min-w-0 max-w-[720px] items-center gap-2 rounded-full bg-pill px-4 focus-within:bg-white focus-within:shadow-[0_1px_3px_rgb(0_0_0/0.2)]">
          <Search className="size-5 shrink-0 text-ink-2" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents"
            aria-label="Search documents"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-2 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="rounded-full p-1 hover:bg-hover">
              <X className="size-5 text-ink-2" />
            </button>
          )}
        </div>
        <AccountMenu />
      </header>

      <section className="border-b border-line-soft bg-[#f1f3f4]">
        <div className="mx-auto max-w-[1000px] px-4 pt-4 pb-6 sm:px-8">
          <h2 className="py-2 text-[16px] text-ink">Start a new document</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <button
                type="button"
                onClick={createBlank}
                disabled={creating}
                className="flex h-[188px] w-[144px] items-center justify-center rounded border border-line-soft bg-white transition-colors hover:border-action disabled:opacity-60"
                aria-label="Blank document"
              >
                <FilePlus2 className="size-14 stroke-[1.25] text-action" aria-hidden />
              </button>
              <p className="mt-2 text-[14px] font-medium text-ink">{creating ? 'Creating…' : 'Blank document'}</p>
            </div>
            <ImportTile onError={setError} />
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1000px] flex-1 px-4 pt-4 pb-16 sm:px-8">
        {error && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg bg-danger-bg px-4 py-3 text-[14px] text-danger">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="rounded-full p-0.5 hover:bg-white/50">
              <X className="size-4" />
            </button>
          </div>
        )}

        {!filtered ? (
          <ListSkeleton />
        ) : (
          <>
            <DocSection
              title="My documents"
              docs={filtered.owned}
              mine
              empty={
                query
                  ? 'No documents of yours match your search.'
                  : 'You don’t own any documents yet. Start a blank one or import a file above.'
              }
              onDelete={setToDelete}
            />
            <DocSection
              title="Shared with me"
              docs={filtered.shared}
              empty={
                query
                  ? 'No shared documents match your search.'
                  : `Nothing has been shared with ${user?.name.split(' ')[0] ?? 'you'} yet. When someone shares a document, it shows up here with your role.`
              }
            />
          </>
        )}
      </main>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete document?"
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        “{toDelete?.title}” will be deleted for you and everyone it’s shared with. This can’t be undone.
      </ConfirmDialog>
    </div>
  );
}

function DocSection({
  title,
  docs,
  mine,
  empty,
  onDelete,
}: {
  title: string;
  docs: DocumentSummary[];
  mine?: boolean;
  empty: string;
  onDelete?(d: DocumentSummary): void;
}) {
  return (
    <section className="mt-6 first:mt-2" aria-labelledby={`h-${title}`}>
      <div className="grid grid-cols-[1fr_auto_40px] items-center gap-2 sm:gap-4 border-b border-line-soft px-3 pb-2 sm:grid-cols-[1fr_160px_150px_40px]">
        <h2 id={`h-${title}`} className="text-[16px] font-medium text-ink">
          {title} <span className="text-[14px] font-normal text-ink-3">· {docs.length}</span>
        </h2>
        <span className="hidden text-[13px] font-medium text-ink-2 sm:block">{mine ? 'Owner' : 'Shared by'}</span>
        <span className="hidden text-[13px] font-medium text-ink-2 sm:block">Last modified</span>
        <span aria-hidden />
      </div>
      {docs.length === 0 ? (
        <p className="px-3 py-6 text-[14px] text-ink-3">{empty}</p>
      ) : (
        <ul>
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} mine={mine} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DocRow({ doc, mine, onDelete }: { doc: DocumentSummary; mine?: boolean; onDelete?(d: DocumentSummary): void }) {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  return (
    <li className="group relative grid grid-cols-[1fr_auto_40px] items-center gap-2 sm:gap-4 rounded-full px-3 hover:bg-hover sm:grid-cols-[1fr_160px_150px_40px]">
      <Link to={`/d/${doc.id}`} className="flex min-w-0 items-center gap-4 py-3 after:absolute after:inset-0 after:content-['']">
        <DocIcon size={22} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium text-ink">{doc.title}</span>
          {!mine && (
            <span className="block truncate text-[12px] text-ink-3 sm:hidden">
              {doc.access === 'editor' ? 'Editor' : 'Viewer'} · shared by {doc.owner.name}
            </span>
          )}
        </span>
        {!mine && (
          <span
            className={`hidden shrink-0 sm:inline rounded-full px-2 py-0.5 text-[12px] font-medium ${
              doc.access === 'editor' ? 'bg-[#d3e3fd] text-[#041e49]' : 'bg-[#e3e3e3] text-ink-2'
            }`}
          >
            {doc.access === 'editor' ? 'Editor' : 'Viewer'}
          </span>
        )}
      </Link>
      <span className="hidden truncate text-[14px] text-ink-2 sm:block">{mine ? 'me' : doc.owner.name}</span>
      <span className="text-[14px] text-ink-2 max-sm:text-[12px]" title={new Date(doc.updatedAt).toLocaleString()}>
        {relativeTime(doc.updatedAt)}
      </span>
      <span className="relative z-10">
        {mine && onDelete && (
          <>
            <button
              type="button"
              aria-label={`More actions for ${doc.title}`}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={(e) => {
                e.stopPropagation();
                setMenu((m) => !m);
              }}
              className="rounded-full p-2 text-ink-2 transition-opacity hover:bg-pill-hover sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:aria-expanded:opacity-100"
            >
              <MoreVertical className="size-5" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 z-30 mt-1 w-44 rounded-lg bg-white py-2 shadow-[0_2px_10px_rgb(0_0_0/0.2)]">
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => onDelete(doc)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] text-ink hover:bg-hover"
                >
                  <Trash2 className="size-4 text-ink-2" aria-hidden /> Delete
                </button>
              </div>
            )}
          </>
        )}
      </span>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading documents" className="mt-4 space-y-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-3">
          <span className="h-5 w-4 animate-pulse rounded-sm bg-pill" />
          <span className="h-3.5 animate-pulse rounded bg-pill" style={{ width: `${40 - i * 6}%` }} />
        </div>
      ))}
    </div>
  );
}
