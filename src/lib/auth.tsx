import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from '../../shared/types';
import { api, ApiError, UNAUTHENTICATED_EVENT } from '../api/client';

type BeforeSignOut = () => Promise<void>;

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn(email: string): Promise<User>;
  signOut(): Promise<void>;
  /** Lets an open editor flush pending saves before the session cookie is cleared. */
  registerBeforeSignOut(fn: BeforeSignOut): () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const hooks = useRef(new Set<BeforeSignOut>());

  useEffect(() => {
    api
      .get<User>('/me')
      .then(setUser)
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // The session cookie is shared by every tab. When this tab regains focus, make sure it still
  // belongs to the same person; if another tab signed out or switched account, follow it.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'hidden' || !userRef.current) return;
      api
        .get<User>('/me')
        .then((me) => {
          if (me.id !== userRef.current?.id) window.location.reload();
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) setUser(null);
        });
    };
    const onUnauthenticated = () => setUser(null);
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    };
  }, []);

  const signIn = useCallback(async (email: string) => {
    const u = await api.post<User>('/auth/login', { email });
    setUser(u);
    return u;
  }, []);

  const signOut = useCallback(async () => {
    await Promise.allSettled([...hooks.current].map((fn) => fn()));
    await api.post('/auth/logout').catch(() => undefined);
    setUser(null);
  }, []);

  const registerBeforeSignOut = useCallback((fn: BeforeSignOut) => {
    hooks.current.add(fn);
    return () => {
      hooks.current.delete(fn);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, registerBeforeSignOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
