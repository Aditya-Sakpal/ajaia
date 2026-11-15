import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { ChevronDown, LoaderCircle, X } from 'lucide-react';
import type { Role, Share, User } from '../../shared/types';
import { api, ApiError } from '../api/client';
import { Avatar } from './Avatar';

const ERROR_COPY: Record<string, string> = {
  user_not_found: 'No Ajaia user with that email. Try alice@, bob@ or carol@ajaia.test.',
  cannot_share_with_owner: 'You already own this document.',
};

interface Props {
  open: boolean;
  onClose(): void;
  docId: string;
  title: string;
  owner: User;
  me: User;
  isOwner: boolean;
  /** null while loading. */
  shares: Share[] | null;
  sharesError: boolean;
  onRetryShares(): void;
  onSharesChange: Dispatch<SetStateAction<Share[] | null>>;
  /** The server refused (401/403/404): the caller handles lost access. */
  onAccessLost(err: ApiError): void;
}

export function ShareDialog({ open, onClose, docId, title, owner, me, isOwner, shares, sharesError, onRetryShares, onSharesChange, onAccessLost }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setError(null);
      setNotice(null);
      api.get<User[]>('/users').then(setUsers).catch(() => setUsers([]));
      if (isOwner) setTimeout(() => emailRef.current?.focus(), 0);
    }
    if (!open && d.open) d.close();
  }, [open, isOwner]);

  const suggestions = useMemo(() => {
    const taken = new Set([owner.id, ...(shares ?? []).map((s) => s.user.id)]);
    return users.filter((u) => !taken.has(u.id));
  }, [users, shares, owner.id]);

  function fail(err: unknown) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403 || (err.status === 404 && err.code === 'not_found'))) {
      onAccessLost(err);
      return;
    }
    setError(err instanceof ApiError ? (ERROR_COPY[err.code] ?? err.message) : 'Something went wrong. Please try again.');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) {
      setError('Enter an email address to share with.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const share = await api.put<Share>(`/documents/${docId}/shares`, { email: value, role });
      onSharesChange((list) => {
        const cur = list ?? [];
        return cur.some((s) => s.user.id === share.user.id)
          ? cur.map((s) => (s.user.id === share.user.id ? share : s))
          : [...cur, share];
      });
      setEmail('');
      setNotice(`${share.user.name} can now ${share.role === 'editor' ? 'edit' : 'view'} this document.`);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(s: Share, next: Role | 'remove') {
    setRowBusy((b) => new Set(b).add(s.user.id));
    setError(null);
    setNotice(null);
    try {
      if (next === 'remove') {
        await api.del(`/documents/${docId}/shares/${s.user.id}`);
        onSharesChange((list) => (list ?? []).filter((x) => x.user.id !== s.user.id));
        setNotice(`Removed ${s.user.name}’s access.`);
      } else {
        const updated = await api.put<Share>(`/documents/${docId}/shares`, { email: s.user.email, role: next });
        onSharesChange((list) => (list ?? []).map((x) => (x.user.id === s.user.id ? updated : x)));
      }
    } catch (err) {
      fail(err);
    } finally {
      setRowBusy((b) => {
        const next = new Set(b);
        next.delete(s.user.id);
        return next;
      });
    }
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="share-title"
      className="m-auto w-[min(512px,calc(100vw-24px))] rounded-[28px] bg-white p-0 text-ink shadow-[0_4px_24px_rgb(0_0_0/0.25)]"
    >
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-start gap-3">
          <h2 id="share-title" className="min-w-0 flex-1 text-[22px] leading-7">
            Share “<span className="break-words">{title}</span>”
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 rounded-full p-2 text-ink-2 hover:bg-hover">
            <X className="size-5" />
          </button>
        </div>

        {isOwner ? (
          <form onSubmit={submit} className="mt-5 flex flex-col gap-2 sm:flex-row" noValidate>
            <label className="sr-only" htmlFor="share-email">
              Add people by email
            </label>
            <input
              id="share-email"
              ref={emailRef}
              type="email"
              list="share-suggestions"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="Add people by email"
              aria-invalid={error !== null}
              aria-describedby={error ? 'share-error' : undefined}
              className="h-12 w-full shrink-0 min-w-0 rounded border sm:w-auto sm:flex-1 border-[#747775] px-4 text-[16px] placeholder:text-ink-2 focus:border-action focus:outline-2 focus:-outline-offset-2 focus:outline-action"
            />
            <datalist id="share-suggestions">
              {suggestions.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name}
                </option>
              ))}
            </datalist>
            <div className="flex gap-2">
              <RoleSelect value={role} onChange={(r) => setRole(r as Role)} label="Role for new person" />
              <button
                type="submit"
                disabled={busy}
                className="h-12 rounded-full border border-[#747775] px-6 text-[14px] font-medium text-action hover:bg-hover disabled:opacity-60"
              >
                {busy ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-4 rounded-lg bg-pill px-4 py-3 text-[14px] text-ink-2">
            Only {owner.name} (the owner) can change who has access.
          </p>
        )}

        <div aria-live="polite" className="min-h-0">
          {error && (
            <p id="share-error" role="alert" className="mt-3 text-[13px] text-danger">
              {error}
            </p>
          )}
          {notice && <p className="mt-3 text-[13px] text-ok">{notice}</p>}
        </div>

        <h3 className="mt-6 mb-1 text-[16px] font-medium">People with access</h3>
        <ul className="-mx-2 max-h-[300px] overflow-y-auto">
          <PersonRow user={owner} me={me}>
            <span className="pr-2 text-[14px] text-ink-2">Owner</span>
          </PersonRow>
          {(shares ?? []).map((s) => (
            <PersonRow key={s.user.id} user={s.user} me={me}>
              {isOwner ? (
                rowBusy.has(s.user.id) ? (
                  <LoaderCircle className="mr-3 size-5 animate-spin text-action" aria-label="Updating" />
                ) : (
                  <RoleSelect
                    value={s.role}
                    onChange={(v) => changeRole(s, v as Role | 'remove')}
                    label={`Access for ${s.user.name}`}
                    allowRemove
                    compact
                  />
                )
              ) : (
                <span className="pr-2 text-[14px] text-ink-2">{s.role === 'editor' ? 'Editor' : 'Viewer'}</span>
              )}
            </PersonRow>
          ))}
        </ul>
        {shares === null && !sharesError && (
          <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-3" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading people with access…
          </p>
        )}
        {sharesError && (
          <p className="mt-1 text-[13px] text-danger" role="alert">
            Couldn't load who has access.{' '}
            <button type="button" onClick={onRetryShares} className="font-medium underline underline-offset-2">
              Try again
            </button>
          </p>
        )}
        {shares !== null && shares.length === 0 && (
          <p className="mt-1 text-[13px] text-ink-3">Not shared yet. Add someone above to collaborate.</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-6 pt-4 pb-6">
        <p className="text-[12px] text-ink-3">Editors can change content and the title. Viewers can only read.</p>
        <button type="button" onClick={onClose} className="h-10 shrink-0 rounded-full bg-action px-6 text-[14px] font-medium text-white hover:bg-action-hover">
          Done
        </button>
      </div>
    </dialog>
  );
}

function PersonRow({ user, me, children }: { user: User; me: User; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-chrome">
      <Avatar user={user} size={36} title="" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] text-ink">
          {user.name}
          {user.id === me.id && ' (you)'}
        </span>
        <span className="block truncate text-[12px] text-ink-2">{user.email}</span>
      </span>
      {children}
    </li>
  );
}

function RoleSelect({
  value,
  onChange,
  label,
  allowRemove,
  compact,
}: {
  value: string;
  onChange(v: string): void;
  label: string;
  allowRemove?: boolean;
  compact?: boolean;
}) {
  return (
    <label className={`relative flex items-center rounded ${compact ? 'h-9 hover:bg-hover' : 'h-12 border border-[#747775]'}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full cursor-pointer appearance-none bg-transparent pr-8 pl-3 text-[14px] text-ink focus:outline-none"
      >
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
        {allowRemove && (
          <>
            <option disabled>──────────</option>
            <option value="remove">Remove access</option>
          </>
        )}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-4 text-ink-2" aria-hidden />
    </label>
  );
}
