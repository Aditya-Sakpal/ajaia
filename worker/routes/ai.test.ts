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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response): Promise<any> => res.json();

describe('AI routes', () => {
  let calls: unknown[];
  let jsonReply: string;
  const fake: AiClient = {
    async complete(messages: unknown) {
      calls.push(messages);
      return '  generated text  ';
    },
    async completeJson(messages: unknown) {
      calls.push(messages);
      return jsonReply;
    },
  };
  beforeEach(() => {
    calls = [];
    jsonReply = '{"placement":"insert","markdown":"  generated text  "}';
  });

  async function aliceDoc(ai: AiClient | null = fake) {
    const t = setup(ai);
    const cookie = await t.login('alice@ajaia.test');
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    const generate = (body: unknown) => t.req(`/api/documents/${d.id}/ai/generate`, { method: 'POST', cookie, json: body });
    return { t, cookie, d, generate };
  }

  it('editor gets a trimmed completion', async () => {
    const { t, cookie, d } = await aliceDoc();
    const res = await t.req(`/api/documents/${d.id}/ai/complete`, { method: 'POST', cookie, json: { before: 'Our goals are' } });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ completion: 'generated text' });
  });

  it('generate returns markdown and an insert placement for generator actions', async () => {
    const { generate } = await aliceDoc();
    const res = await generate({ action: 'email_draft', context: 'Ship pilot' });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ markdown: 'generated text', placement: 'insert' });
  });

  it('custom prompt with no selection that the model marks "replace" replaces the document', async () => {
    const { generate } = await aliceDoc();
    jsonReply = '{"placement":"replace","markdown":"Short essay."}';
    const res = await generate({ action: 'custom', prompt: 'shorten the essay', context: 'Long essay…' });
    expect(await json(res)).toEqual({ markdown: 'Short essay.', placement: 'replace_document' });
  });

  it('custom prompt with a selection that the model marks "replace" replaces the selection', async () => {
    const { generate } = await aliceDoc();
    jsonReply = '{"placement":"replace","markdown":"Better."}';
    const res = await generate({ action: 'custom', prompt: 'improve', context: 'doc', selection: 'bad' });
    expect((await json(res)).placement).toBe('replace_selection');
  });

  it('rewrite chips work without a selection and replace the document', async () => {
    const { generate } = await aliceDoc();
    jsonReply = '{"placement":"insert","markdown":"Shorter."}';
    const res = await generate({ action: 'shorter', context: 'A long document.' });
    expect(res.status).toBe(200);
    expect((await json(res)).placement).toBe('replace_document');
  });

  it('malformed model output → 502 ai_failed', async () => {
    const { generate } = await aliceDoc();
    jsonReply = 'Sure! Here is your text';
    const res = await generate({ action: 'custom', prompt: 'x', context: 'doc' });
    expect(res.status).toBe(502);
    expect((await json(res)).error.code).toBe('ai_failed');
  });

  it('empty markdown from the model → 502 ai_failed', async () => {
    const { generate } = await aliceDoc();
    jsonReply = '{"placement":"insert","markdown":"   "}';
    const res = await generate({ action: 'continue', context: 'doc' });
    expect(res.status).toBe(502);
  });

  it('provider errors → 502 ai_failed', async () => {
    const failing: AiClient = {
      complete: async () => {
        throw new Error('boom');
      },
      completeJson: async () => {
        throw new Error('boom');
      },
    };
    const { generate } = await aliceDoc(failing);
    const res = await generate({ action: 'continue', context: 'doc' });
    expect(res.status).toBe(502);
  });

  it('viewers cannot use AI on a document (403) and strangers get 404', async () => {
    const t = setup(fake);
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    await t.repo.upsertShare(d.id, t.carol.id, 'viewer');
    const carol = await t.login('carol@ajaia.test');
    expect((await t.req(`/api/documents/${d.id}/ai/complete`, { method: 'POST', cookie: carol, json: { before: 'x' } })).status).toBe(403);
    expect(
      (await t.req(`/api/documents/${d.id}/ai/generate`, { method: 'POST', cookie: carol, json: { action: 'continue', context: 'x' } })).status,
    ).toBe(403);
    t.repo.addUser({ email: 'dave@ajaia.test', name: 'Dave' });
    const dave = await t.login('dave@ajaia.test');
    expect((await t.req(`/api/documents/${d.id}/ai/complete`, { method: 'POST', cookie: dave, json: { before: 'x' } })).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('bad action, missing prompt or empty document for a rewrite → 400', async () => {
    const { generate } = await aliceDoc();
    expect((await generate({ action: 'hack', context: '' })).status).toBe(400);
    expect((await generate({ action: 'custom', context: '' })).status).toBe(400);
    expect((await generate({ action: 'shorter', context: '  ' })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('without an API key the feature reports it is unavailable (503)', async () => {
    const { t, cookie, d, generate } = await aliceDoc(null);
    const res = await t.req(`/api/documents/${d.id}/ai/complete`, { method: 'POST', cookie, json: { before: 'x' } });
    expect(res.status).toBe(503);
    expect((await json(res)).error.code).toBe('ai_unavailable');
    expect((await generate({ action: 'continue', context: 'x' })).status).toBe(503);
  });
});
