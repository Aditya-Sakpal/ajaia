import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MemoryRepo } from '../db/memoryRepo';
import type { Env } from '../env';
import type { AiClient } from '../lib/ai';

function setup(ai: AiClient | null) {
  const repo = new MemoryRepo();
  const app = createApp({ getRepo: () => repo, getAi: () => ai });
  const env = { SESSION_SECRET: 'test-secret-test-secret-test-secret' } as Env;
  const alice = repo.addUser({ email: 'alice@ajaia.test', name: 'Alice' });
  const carol = repo.addUser({ email: 'carol@ajaia.test', name: 'Carol' });
  const req = (path: string, init: { method?: string; json?: unknown; cookie?: string } = {}) =>
    app.request(
      `http://localhost${path}`,
      {
        method: init.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...(init.cookie ? { Cookie: init.cookie } : {}) },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
      },
      env,
    );
  const login = async (email: string) =>
    ((await req('/api/auth/login', { method: 'POST', json: { email } })).headers.get('Set-Cookie') ?? '').split(';')[0]!;
  return { repo, req, login, alice, carol };
}

describe('AI routes', () => {
  let calls: unknown[];
  const fake: AiClient = {
    async complete(messages) {
      calls.push(messages);
      return '  generated text  ';
    },
  };
  beforeEach(() => {
    calls = [];
  });

  it('editor gets a trimmed completion', async () => {
    const t = setup(fake);
    const cookie = await t.login('alice@ajaia.test');
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    const res = await t.req(`/api/documents/${d.id}/ai/complete`, { method: 'POST', cookie, json: { before: 'Our goals are' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ completion: 'generated text' });
  });

  it('generate returns markdown for an action', async () => {
    const t = setup(fake);
    const cookie = await t.login('alice@ajaia.test');
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    const res = await t.req(`/api/documents/${d.id}/ai/generate`, {
      method: 'POST',
      cookie,
      json: { action: 'email_draft', context: 'Ship pilot' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ markdown: 'generated text' });
  });

  it('viewers cannot use AI on a document (403) and strangers get 404', async () => {
    const t = setup(fake);
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    await t.repo.upsertShare(d.id, t.carol.id, 'viewer');
    const carol = await t.login('carol@ajaia.test');
    expect((await t.req(`/api/documents/${d.id}/ai/complete`, { method: 'POST', cookie: carol, json: { before: 'x' } })).status).toBe(403);
    t.repo.addUser({ email: 'dave@ajaia.test', name: 'Dave' });
    const dave = await t.login('dave@ajaia.test');
    expect((await t.req(`/api/documents/${d.id}/ai/complete`, { method: 'POST', cookie: dave, json: { before: 'x' } })).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('bad action or missing prompt → 400', async () => {
    const t = setup(fake);
    const cookie = await t.login('alice@ajaia.test');
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    const url = `/api/documents/${d.id}/ai/generate`;
    expect((await t.req(url, { method: 'POST', cookie, json: { action: 'hack', context: '' } })).status).toBe(400);
    expect((await t.req(url, { method: 'POST', cookie, json: { action: 'custom', context: '' } })).status).toBe(400);
  });

  it('without an API key the feature reports it is unavailable (503)', async () => {
    const t = setup(null);
    const cookie = await t.login('alice@ajaia.test');
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    const res = await t.req(`/api/documents/${d.id}/ai/complete`, { method: 'POST', cookie, json: { before: 'x' } });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ai_unavailable");
  });
});
