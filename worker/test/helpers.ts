import { createApp } from '../app';
import { MemoryRepo } from '../db/memoryRepo';
import type { Env } from '../env';

export function makeTestApp() {
  const repo = new MemoryRepo();
  const app = createApp({ getRepo: () => repo });
  const env = { SESSION_SECRET: 'test-secret-test-secret-test-secret' } as Env;
  const alice = repo.addUser({ email: 'alice@ajaia.test', name: 'Alice Chen' });
  const bob = repo.addUser({ email: 'bob@ajaia.test', name: 'Bob Patel' });
  const carol = repo.addUser({ email: 'carol@ajaia.test', name: 'Carol Ruiz' });

  /** Makes a request as an optional signed-in user (cookie header). */
  const request = (path: string, init: RequestInit & { json?: unknown; cookie?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.cookie) headers.set('Cookie', init.cookie);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(init.json);
    }
    return app.request(`http://localhost${path}`, { ...init, headers, body }, env);
  };

  return { app, repo, env, alice, bob, carol, request };
}

export type TestApp = ReturnType<typeof makeTestApp>;

/** Logs in through the real endpoint and returns the Cookie header value. */
export async function loginAs(t: TestApp, email: string): Promise<string> {
  const res = await t.request('/api/auth/login', { method: 'POST', json: { email } });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  return setCookie.split(';')[0];
}

/** Parsed JSON body (typed loosely for assertions). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const body = async (res: Response): Promise<any> => res.json();
