import { describe, expect, it } from 'vitest';
import { body, loginAs, makeTestApp } from '../test/helpers';

const para = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

describe('version history', () => {
  it('a content save records a version that can be listed and fetched', async () => {
    const t = makeTestApp();
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    await t.repo.upsertShare(d.id, t.carol.id, 'viewer');
    const alice = await loginAs(t, 'alice@ajaia.test');
    await t.request(`/api/documents/${d.id}`, { method: 'PATCH', cookie: alice, json: { version: 1, content: para('first') } });
    const carol = await loginAs(t, 'carol@ajaia.test');
    const list = await body(await t.request(`/api/documents/${d.id}/versions`, { cookie: carol }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ version: 2, title: 'A', author: { email: 'alice@ajaia.test' } });
    expect(list[0].content).toBeUndefined();
    const v = await body(await t.request(`/api/documents/${d.id}/versions/${list[0].id}`, { cookie: carol }));
    expect(v.content).toEqual(para('first'));
  });

  it('rapid saves by the same person collapse into one version; title-only saves record none', async () => {
    const t = makeTestApp();
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    const alice = await loginAs(t, 'alice@ajaia.test');
    await t.request(`/api/documents/${d.id}`, { method: 'PATCH', cookie: alice, json: { version: 1, content: para('a') } });
    await t.request(`/api/documents/${d.id}`, { method: 'PATCH', cookie: alice, json: { version: 2, content: para('ab') } });
    await t.request(`/api/documents/${d.id}`, { method: 'PATCH', cookie: alice, json: { version: 3, title: 'B' } });
    const list = await body(await t.request(`/api/documents/${d.id}/versions`, { cookie: alice }));
    expect(list).toHaveLength(1);
    // The open snapshot is refreshed to the latest content rather than going stale.
    const v = await body(await t.request(`/api/documents/${d.id}/versions/${list[0].id}`, { cookie: alice }));
    expect(v.content).toEqual(para('ab'));
    expect(v.version).toBe(3);
  });

  it('a different author starts a new version', async () => {
    const t = makeTestApp();
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    await t.repo.upsertShare(d.id, t.bob.id, 'editor');
    const alice = await loginAs(t, 'alice@ajaia.test');
    const bob = await loginAs(t, 'bob@ajaia.test');
    await t.request(`/api/documents/${d.id}`, { method: 'PATCH', cookie: alice, json: { version: 1, content: para('a') } });
    await t.request(`/api/documents/${d.id}`, { method: 'PATCH', cookie: bob, json: { version: 2, content: para('b') } });
    const list = await body(await t.request(`/api/documents/${d.id}/versions`, { cookie: alice }));
    expect(list.map((v: { author: { email: string } }) => v.author.email)).toEqual(['bob@ajaia.test', 'alice@ajaia.test']);
  });

  it('creating a document with content (import) records a first version', async () => {
    const t = makeTestApp();
    const alice = await loginAs(t, 'alice@ajaia.test');
    const res = await t.request('/api/documents', { method: 'POST', cookie: alice, json: { title: 'Imported', content: para('from file') } });
    const d = await body(res);
    const list = await body(await t.request(`/api/documents/${d.id}/versions`, { cookie: alice }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ version: 1, title: 'Imported' });
  });

  it('strangers get 404; unknown version id is 404', async () => {
    const t = makeTestApp();
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
    const bob = await loginAs(t, 'bob@ajaia.test');
    expect((await t.request(`/api/documents/${d.id}/versions`, { cookie: bob })).status).toBe(404);
    const alice = await loginAs(t, 'alice@ajaia.test');
    expect((await t.request(`/api/documents/${d.id}/versions/${crypto.randomUUID()}`, { cookie: alice })).status).toBe(404);
  });
});
