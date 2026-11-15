import { describe, expect, it } from 'vitest';
import { body, loginAs, makeTestApp } from '../test/helpers';

describe('auth', () => {
  it('GET /api/me without a cookie → 401 unauthenticated', async () => {
    const t = makeTestApp();
    const res = await t.request('/api/me');
    expect(res.status).toBe(401);
    expect(await body(res)).toEqual({ error: { code: 'unauthenticated', message: expect.any(String) } });
  });

  it('login normalizes email, returns the user and sets an httpOnly session cookie', async () => {
    const t = makeTestApp();
    const res = await t.request('/api/auth/login', { method: 'POST', json: { email: ' Alice@Ajaia.test ' } });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual(t.alice);
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('ajaia_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('session cookie authenticates /api/me', async () => {
    const t = makeTestApp();
    const cookie = await loginAs(t, 'bob@ajaia.test');
    const res = await t.request('/api/me', { cookie });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual(t.bob);
  });

  it('unknown email → 404 user_not_found', async () => {
    const t = makeTestApp();
    const res = await t.request('/api/auth/login', { method: 'POST', json: { email: 'nobody@ajaia.test' } });
    expect(res.status).toBe(404);
    expect((await body(res)).error.code).toBe('user_not_found');
  });

  it('malformed login body → 400 invalid_request', async () => {
    const t = makeTestApp();
    const res = await t.request('/api/auth/login', { method: 'POST', json: { email: 42 } });
    expect(res.status).toBe(400);
    expect((await body(res)).error.code).toBe('invalid_request');
  });

  it('non-JSON body → 400 invalid_request', async () => {
    const t = makeTestApp();
    const res = await t.request('/api/auth/login', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('tampered cookie → 401', async () => {
    const t = makeTestApp();
    const cookie = await loginAs(t, 'alice@ajaia.test');
    const [name, value] = cookie.split('=');
    const forged = `${name}=${encodeURIComponent(t.bob.id)}.${decodeURIComponent(value).split('.').slice(1).join('.')}`;
    expect((await t.request('/api/me', { cookie: forged })).status).toBe(401);
  });

  it('session of a deleted user → 401', async () => {
    const t = makeTestApp();
    const cookie = await loginAs(t, 'carol@ajaia.test');
    t.repo.users.delete(t.carol.id);
    expect((await t.request('/api/me', { cookie })).status).toBe(401);
  });

  it('logout clears the cookie', async () => {
    const t = makeTestApp();
    await loginAs(t, 'alice@ajaia.test');
    const res = await t.request('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Set-Cookie')).toMatch(/ajaia_session=;.*Max-Age=0/);
  });

  it('GET /api/users lists the three users without auth', async () => {
    const t = makeTestApp();
    const res = await t.request('/api/users');
    expect(res.status).toBe(200);
    expect((await body(res)).map((u: { email: string }) => u.email)).toEqual([
      'alice@ajaia.test',
      'bob@ajaia.test',
      'carol@ajaia.test',
    ]);
  });

  it('unknown API route → 404 JSON error', async () => {
    const t = makeTestApp();
    const res = await t.request('/api/nope');
    expect(res.status).toBe(404);
    expect((await body(res)).error.code).toBe('not_found');
  });
});
