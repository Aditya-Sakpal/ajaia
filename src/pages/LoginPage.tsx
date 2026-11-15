import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ChevronRight, LoaderCircle } from 'lucide-react';
import type { User } from '../../shared/types';
import { api, ApiError } from '../api/client';
import { Avatar } from '../components/Avatar';
import { LogoMark } from '../components/Logo';
import { useAuth } from '../lib/auth';

const ROLE_HINTS: Record<string, string> = {
  'alice@ajaia.test': 'Owns the Welcome doc · shared it with Bob',
  'bob@ajaia.test': 'Editor on Alice’s doc · owns Q3 Planning Notes',
  'carol@ajaia.test': 'Viewer on Bob’s Q3 Planning Notes',
};

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<User[]>('/users')
      .then(setUsers)
      .catch((err: ApiError) => setError(err.message));
  }, []);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user && !pending) return <Navigate to={from} replace />;

  async function choose(u: User) {
    setPending(u.email);
    setError(null);
    try {
      await signIn(u.email);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
      setPending(null);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-[#f0f4f9] px-4 py-10">
      <div className="w-full max-w-[448px] rounded-[28px] bg-white px-6 pt-9 pb-6 sm:px-10">
        <div className="flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-5 text-[28px] leading-9 font-normal text-ink">Choose an account</h1>
          <p className="mt-2 text-[15px] text-ink-2">to continue to Ajaia Docs</p>
        </div>

        <ul className="mt-8 border-y border-line-soft" aria-busy={users === null}>
          {users === null && !error
            ? [0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 border-b border-line-soft px-2 py-3 last:border-0">
                  <span className="size-9 animate-pulse rounded-full bg-pill" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-3 w-28 animate-pulse rounded bg-pill" />
                    <span className="block h-3 w-40 animate-pulse rounded bg-pill" />
                  </span>
                </li>
              ))
            : users?.map((u) => (
                <li key={u.id} className="border-b border-line-soft last:border-0">
                  <button
                    type="button"
                    onClick={() => choose(u)}
                    disabled={pending !== null}
                    className="group flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-hover disabled:opacity-60"
                  >
                    <Avatar user={u} size={36} title="" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{u.name}</span>
                      <span className="block truncate text-[13px] text-ink-2">{u.email}</span>
                      {ROLE_HINTS[u.email] && (
                        <span className="mt-0.5 block truncate text-[12px] text-ink-3">{ROLE_HINTS[u.email]}</span>
                      )}
                    </span>
                    {pending === u.email ? (
                      <LoaderCircle className="size-5 animate-spin text-action" aria-label="Signing in" />
                    ) : (
                      <ChevronRight className="size-5 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
        </ul>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <p className="mt-6 text-[12px] leading-5 text-ink-3">
          Demo sign-in — no password needed. Sign in as one person, then switch accounts from the avatar menu to see
          shared documents and roles from the other side.
        </p>
      </div>
    </main>
  );
}
