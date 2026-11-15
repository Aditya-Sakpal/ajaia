import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { COMMENT_MAX, QUOTE_MAX, type Access, type Comment, type User } from '../../shared/types';
import { api, ApiError } from '../api/client';
import { relativeTime } from '../lib/format';
import { Avatar } from './Avatar';

interface Props {
  documentId: string;
  me: User;
  access: Access;
  ownerId: string;
  pendingQuote: string;
  onClearQuote(): void;
  onClose(): void;
  /** Bump to reload the list (e.g. after a live pull). */
  refreshKey?: number;
}

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');

export function CommentsPanel({ documentId, me, access, ownerId, pendingQuote, onClearQuote, onClose, refreshKey }: Props) {
  const canComment = access !== 'viewer';
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<ReadonlySet<string>>(new Set());
  const [showResolved, setShowResolved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setComments(await api.get<Comment[]>(`/documents/${documentId}/comments`));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // A fresh quote means the user just asked to comment on a selection: put them in the composer.
  useEffect(() => {
    if (pendingQuote && canComment) textareaRef.current?.focus();
  }, [pendingQuote, canComment]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const created = await api.post<Comment>(`/documents/${documentId}/comments`, {
        body: text,
        quote: pendingQuote.slice(0, QUOTE_MAX),
      });
      setComments((list) => [...(list ?? []), created]);
      setBody('');
      onClearQuote();
    } catch (err) {
      setPostError(errorText(err));
    } finally {
      setPosting(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }

  async function withRow(id: string, fn: () => Promise<void>) {
    setRowBusy((b) => new Set(b).add(id));
    setRowError(null);
    try {
      await fn();
    } catch (err) {
      setRowError(errorText(err));
    } finally {
      setRowBusy((b) => {
        const next = new Set(b);
        next.delete(id);
        return next;
      });
    }
  }

  const setResolved = (c: Comment, resolved: boolean) =>
    withRow(c.id, async () => {
      const updated = await api.patch<Comment>(`/documents/${documentId}/comments/${c.id}`, { resolved });
      setComments((list) => (list ?? []).map((x) => (x.id === c.id ? updated : x)));
    });

  const remove = (c: Comment) =>
    withRow(c.id, async () => {
      await api.del(`/documents/${documentId}/comments/${c.id}`);
      setComments((list) => (list ?? []).filter((x) => x.id !== c.id));
    });

  const open = (comments ?? []).filter((c) => !c.resolved);
  const resolved = (comments ?? []).filter((c) => c.resolved);

  const renderItem = (c: Comment) => (
    <CommentItem
      key={c.id}
      comment={c}
      me={me}
      busy={rowBusy.has(c.id)}
      canResolve={canComment}
      canDelete={c.author.id === me.id || me.id === ownerId}
      onResolve={(r) => void setResolved(c, r)}
      onDelete={() => void remove(c)}
    />
  );

  return (
    <aside
      aria-labelledby="comments-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      className="flex h-full w-[300px] shrink-0 flex-col border-l border-line-soft bg-chrome text-ink"
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h2 id="comments-title" className="flex-1 text-[16px] font-medium">
          Comments
        </h2>
        <button type="button" onClick={onClose} aria-label="Close comments" className="-mr-2 rounded-full p-2 text-ink-2 hover:bg-hover">
          <X className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {canComment ? (
          <form onSubmit={submit} className="mb-3 rounded-lg border border-line-soft bg-white p-3 shadow-[0_1px_2px_rgb(60_64_67/0.15)]" noValidate>
            {pendingQuote && (
              <div className="mb-2 flex items-start gap-1 border-l-[3px] border-[#fbbc04] pl-2">
                <p className="line-clamp-3 min-w-0 flex-1 text-[12px] leading-4 break-words text-ink-3">{pendingQuote}</p>
                <button
                  type="button"
                  onClick={onClearQuote}
                  aria-label="Remove quoted text"
                  className="-mt-1 -mr-1 rounded-full p-1 text-ink-3 hover:bg-hover"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <label htmlFor="comment-body" className="sr-only">
              Add a comment
            </label>
            <textarea
              id="comment-body"
              ref={textareaRef}
              value={body}
              maxLength={COMMENT_MAX}
              rows={3}
              onChange={(e) => {
                setBody(e.target.value);
                setPostError(null);
              }}
              onKeyDown={onKeyDown}
              placeholder="Add a comment"
              aria-invalid={postError !== null}
              aria-describedby={postError ? 'comment-post-error' : 'comment-hint'}
              className="block w-full resize-y rounded border border-[#747775] px-3 py-2 text-[14px] leading-5 placeholder:text-ink-3 focus:border-action focus:outline-2 focus:-outline-offset-2 focus:outline-action"
            />
            {postError && (
              <p id="comment-post-error" role="alert" className="mt-2 text-[12px] text-danger">
                {postError}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span id="comment-hint" className="text-[11px] text-ink-3">
                Ctrl+Enter to post
              </span>
              <button
                type="submit"
                disabled={posting || body.trim() === ''}
                className="h-8 rounded-full bg-action px-4 text-[13px] font-medium text-white hover:bg-action-hover disabled:opacity-50"
              >
                {posting ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </form>
        ) : (
          <p className="mb-3 rounded-lg bg-pill px-3 py-2 text-[13px] text-ink-2">You can read comments but not add them.</p>
        )}

        <div aria-live="polite">
          {rowError && (
            <p role="alert" className="mb-2 text-[12px] text-danger">
              {rowError}
            </p>
          )}
        </div>

        {comments === null && !loadError && (
          <p className="flex items-center gap-2 px-1 text-[13px] text-ink-3" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading comments…
          </p>
        )}
        {loadError && (
          <p className="px-1 text-[13px] text-danger" role="alert">
            Couldn't load comments.{' '}
            <button type="button" onClick={() => void load()} className="font-medium underline underline-offset-2">
              Try again
            </button>
          </p>
        )}

        {comments !== null && open.length === 0 && resolved.length === 0 && (
          <div className="px-1 pt-2 text-[13px]">
            <p className="text-ink-2">No comments yet.</p>
            {canComment && <p className="mt-1 text-ink-3">Select text and press Comment to discuss it.</p>}
          </div>
        )}

        {open.length > 0 && <ul className="flex flex-col gap-2">{open.map(renderItem)}</ul>}

        {resolved.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowResolved((v) => !v)}
              aria-expanded={showResolved}
              aria-controls="resolved-comments"
              className="flex w-full items-center gap-1 rounded px-1 py-1 text-[13px] font-medium text-ink-2 hover:bg-hover"
            >
              {showResolved ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
              Resolved ({resolved.length})
            </button>
            {showResolved && (
              <ul id="resolved-comments" className="mt-2 flex flex-col gap-2">
                {resolved.map(renderItem)}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function CommentItem({
  comment: c,
  me,
  busy,
  canResolve,
  canDelete,
  onResolve,
  onDelete,
}: {
  comment: Comment;
  me: User;
  busy: boolean;
  canResolve: boolean;
  canDelete: boolean;
  onResolve(resolved: boolean): void;
  onDelete(): void;
}) {
  const absolute = new Date(c.createdAt).toLocaleString();
  return (
    <li
      className={`rounded-lg border border-line-soft bg-white p-3 shadow-[0_1px_2px_rgb(60_64_67/0.15)] ${c.resolved ? 'opacity-75' : ''}`}
      aria-busy={busy}
    >
      <div className="flex items-center gap-2">
        <Avatar user={c.author} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">
            {c.author.name}
            {c.author.id === me.id && <span className="font-normal text-ink-3"> (you)</span>}
          </p>
          <p className="text-[11px] text-ink-3">
            <time dateTime={c.createdAt} title={absolute}>
              {relativeTime(c.createdAt)}
            </time>
          </p>
        </div>
        {busy && <LoaderCircle className="size-4 animate-spin text-action" aria-label="Updating" />}
      </div>
      {c.quote && (
        <p className="mt-2 line-clamp-3 border-l-[3px] border-[#fbbc04] pl-2 text-[12px] leading-4 break-words text-ink-3">{c.quote}</p>
      )}
      <p className="mt-2 text-[14px] leading-5 break-words whitespace-pre-wrap text-ink">{c.body}</p>
      {(canResolve || canDelete) && (
        <div className="mt-2 -mb-1 flex justify-end gap-1">
          {canResolve && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(!c.resolved)}
              className="rounded-full px-3 py-1 text-[13px] font-medium text-action hover:bg-hover disabled:opacity-50"
            >
              {c.resolved ? 'Reopen' : 'Resolve'}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              aria-label={`Delete comment by ${c.author.name}`}
              className="rounded-full px-3 py-1 text-[13px] font-medium text-ink-2 hover:bg-hover hover:text-danger disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  );
}
