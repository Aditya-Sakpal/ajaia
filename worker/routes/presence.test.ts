import { describe, expect, it } from 'vitest';
import { body, loginAs, makeTestApp } from '../test/helpers';

describe('presence', () => {
  it('lists everyone with the document open and returns the current version', async () => {
    const t = makeTestApp();
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    await t.repo.upsertShare(d.id, t.bob.id, 'editor');
    const alice = await loginAs(t, 'alice@ajaia.test');
    const bob = await loginAs(t, 'bob@ajaia.test');
    await t.request(`/api/documents/${d.id}/presence`, { method: 'POST', cookie: alice, json: {} });
    const res = await t.request(`/api/documents/${d.id}/presence`, { method: 'POST', cookie: bob, json: {} });
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.version).toBe(1);
    expect(b.viewers.map((u: { email: string }) => u.email).sort()).toEqual(['alice@ajaia.test', 'bob@ajaia.test']);
  });

  it('strangers get 404 and are not recorded', async () => {
    const t = makeTestApp();
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    const carol = await loginAs(t, 'carol@ajaia.test');
    expect((await t.request(`/api/documents/${d.id}/presence`, { method: 'POST', cookie: carol, json: {} })).status).toBe(404);
    expect(t.repo.presence.size).toBe(0);
  });
});
