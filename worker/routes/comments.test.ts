import { describe, expect, it } from 'vitest';
import { body, loginAs, makeTestApp } from '../test/helpers';

async function setup() {
  const t = makeTestApp();
  const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'A', content: { type: 'doc' } });
  await t.repo.upsertShare(d.id, t.bob.id, 'commenter');
  await t.repo.upsertShare(d.id, t.carol.id, 'viewer');
  const alice = await loginAs(t, 'alice@ajaia.test');
  const bob = await loginAs(t, 'bob@ajaia.test');
  const carol = await loginAs(t, 'carol@ajaia.test');
  const url = `/api/documents/${d.id}/comments`;
  return { t, d, alice, bob, carol, url };
}

describe('comments', () => {
  it('a commenter can add a comment and everyone with access sees it', async () => {
    const { t, bob, carol, url } = await setup();
    const res = await t.request(url, { method: 'POST', cookie: bob, json: { body: '  Looks good  ', quote: 'intro' } });
    expect(res.status).toBe(201);
    expect(await body(res)).toMatchObject({ body: 'Looks good', quote: 'intro', resolved: false, author: { email: 'bob@ajaia.test' } });
    const list = await body(await t.request(url, { cookie: carol }));
    expect(list).toHaveLength(1);
  });

  it('viewers cannot comment (403); strangers get 404', async () => {
    const { t, carol, alice, url } = await setup();
    expect((await t.request(url, { method: 'POST', cookie: carol, json: { body: 'x', quote: '' } })).status).toBe(403);
    const other = await t.repo.createDocument({ ownerId: t.bob.id, title: 'B', content: { type: 'doc' } });
    expect((await t.request(`/api/documents/${other.id}/comments`, { cookie: alice })).status).toBe(404);
  });

  it('rejects empty bodies', async () => {
    const { t, alice, url } = await setup();
    expect((await t.request(url, { method: 'POST', cookie: alice, json: { body: '   ', quote: '' } })).status).toBe(400);
  });

  it('resolve toggles; viewer cannot resolve', async () => {
    const { t, alice, carol, url } = await setup();
    const c = await body(await t.request(url, { method: 'POST', cookie: alice, json: { body: 'fix', quote: '' } }));
    expect((await t.request(`${url}/${c.id}`, { method: 'PATCH', cookie: carol, json: { resolved: true } })).status).toBe(403);
    const res = await t.request(`${url}/${c.id}`, { method: 'PATCH', cookie: alice, json: { resolved: true } });
    expect(res.status).toBe(200);
    expect((await body(res)).resolved).toBe(true);
  });

  it('only the author or the document owner can delete', async () => {
    const { t, alice, bob, url } = await setup();
    const mine = await body(await t.request(url, { method: 'POST', cookie: alice, json: { body: 'owner note', quote: '' } }));
    const bobs = await body(await t.request(url, { method: 'POST', cookie: bob, json: { body: 'bob note', quote: '' } }));
    expect((await t.request(`${url}/${mine.id}`, { method: 'DELETE', cookie: bob })).status).toBe(403);
    expect((await t.request(`${url}/${bobs.id}`, { method: 'DELETE', cookie: bob })).status).toBe(204);
    expect((await t.request(`${url}/${mine.id}`, { method: 'DELETE', cookie: alice })).status).toBe(204);
    expect(await body(await t.request(url, { cookie: alice }))).toEqual([]);
  });

  it('a comment id from another document is 404', async () => {
    const { t, alice, url } = await setup();
    const other = await t.repo.createDocument({ ownerId: t.alice.id, title: 'B', content: { type: 'doc' } });
    const c = await body(await t.request(url, { method: 'POST', cookie: alice, json: { body: 'x', quote: '' } }));
    const res = await t.request(`/api/documents/${other.id}/comments/${c.id}`, { method: 'PATCH', cookie: alice, json: { resolved: true } });
    expect(res.status).toBe(404);
  });

  it('commenters cannot edit content', async () => {
    const { t, d, bob } = await setup();
    const res = await t.request(`/api/documents/${d.id}`, { method: 'PATCH', cookie: bob, json: { version: 1, content: { type: 'doc' } } });
    expect(res.status).toBe(403);
  });

  it('owner can share as commenter', async () => {
    const { t, d, alice } = await setup();
    const dave = t.repo.addUser({ email: 'dave@ajaia.test', name: 'Dave' });
    const res = await t.request(`/api/documents/${d.id}/shares`, { method: 'PUT', cookie: alice, json: { email: dave.email, role: 'commenter' } });
    expect(res.status).toBe(200);
    expect((await body(res)).role).toBe('commenter');
  });
});
