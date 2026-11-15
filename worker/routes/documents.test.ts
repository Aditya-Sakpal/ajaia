import { beforeEach, describe, expect, it } from 'vitest';
import { body, loginAs, makeTestApp, type TestApp } from '../test/helpers';

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

describe('documents API', () => {
  let t: TestApp;
  let alice: string, bob: string, carol: string, dave: string;
  let docId: string;

  beforeEach(async () => {
    t = makeTestApp();
    t.repo.addUser({ email: 'dave@ajaia.test', name: 'Dave Stranger' });
    [alice, bob, carol, dave] = await Promise.all(
      ['alice', 'bob', 'carol', 'dave'].map((n) => loginAs(t, `${n}@ajaia.test`)),
    );
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'Plan', content: doc('hello') as never });
    await t.repo.upsertShare(d.id, t.bob.id, 'editor');
    await t.repo.upsertShare(d.id, t.carol.id, 'viewer');
    docId = d.id;
  });

  const patch = (cookie: string, json: unknown, id = docId) =>
    t.request(`/api/documents/${id}`, { method: 'PATCH', cookie, json });

  it('requires a session', async () => {
    expect((await t.request('/api/documents')).status).toBe(401);
    expect((await t.request(`/api/documents/${docId}`)).status).toBe(401);
  });

  it('create with no body → 201 Untitled document v1 owned by caller', async () => {
    const res = await t.request('/api/documents', { method: 'POST', cookie: alice, json: {} });
    expect(res.status).toBe(201);
    expect(await body(res)).toMatchObject({
      title: 'Untitled document',
      version: 1,
      access: 'owner',
      owner: { email: 'alice@ajaia.test' },
      content: { type: 'doc' },
    });
  });

  it('create with title and content keeps them (trimmed title)', async () => {
    const res = await t.request('/api/documents', {
      method: 'POST',
      cookie: alice,
      json: { title: '  Imported notes ', content: doc('x') },
    });
    expect(await body(res)).toMatchObject({ title: 'Imported notes', content: doc('x') });
  });

  it('list separates owned and shared with owner + access', async () => {
    const a = await body(await t.request('/api/documents', { cookie: alice }));
    expect(a.owned.map((d: { id: string }) => d.id)).toEqual([docId]);
    expect(a.shared).toEqual([]);
    const b = await body(await t.request('/api/documents', { cookie: bob }));
    expect(b.owned).toEqual([]);
    expect(b.shared[0]).toMatchObject({ id: docId, access: 'editor', owner: { email: 'alice@ajaia.test' } });
    const d = await body(await t.request('/api/documents', { cookie: dave }));
    expect(d).toEqual({ owned: [], shared: [] });
  });

  it('GET returns content and the caller access', async () => {
    const res = await t.request(`/api/documents/${docId}`, { cookie: carol });
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ id: docId, access: 'viewer', version: 1, content: doc('hello') });
  });

  it('editor can edit content → version 2', async () => {
    const res = await patch(bob, { version: 1, content: doc('edited by bob') });
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ version: 2, content: doc('edited by bob'), access: 'editor' });
  });

  it('editor can rename', async () => {
    const res = await patch(bob, { version: 1, title: 'Renamed' });
    expect((await body(res)).title).toBe('Renamed');
  });

  it('viewer cannot edit or rename → 403', async () => {
    expect((await patch(carol, { version: 1, content: doc('nope') })).status).toBe(403);
    expect((await patch(carol, { version: 1, title: 'nope' })).status).toBe(403);
    expect((await t.repo.getDocument(docId))!.version).toBe(1);
  });

  it('only the owner can delete', async () => {
    expect((await t.request(`/api/documents/${docId}`, { method: 'DELETE', cookie: carol })).status).toBe(403);
    expect((await t.request(`/api/documents/${docId}`, { method: 'DELETE', cookie: bob })).status).toBe(403);
    expect((await t.request(`/api/documents/${docId}`, { method: 'DELETE', cookie: alice })).status).toBe(204);
    expect((await t.request(`/api/documents/${docId}`, { cookie: alice })).status).toBe(404);
    expect((await t.request(`/api/documents/${docId}`, { cookie: bob })).status).toBe(404);
  });

  it('a user without access gets 404, not 403', async () => {
    expect((await t.request(`/api/documents/${docId}`, { cookie: dave })).status).toBe(404);
    expect((await patch(dave, { version: 1, title: 'x' })).status).toBe(404);
    expect((await t.request(`/api/documents/${docId}`, { method: 'DELETE', cookie: dave })).status).toBe(404);
  });

  it('stale version → 409 with the current document', async () => {
    await patch(bob, { version: 1, content: doc('first') });
    const res = await patch(alice, { version: 1, content: doc('second') });
    expect(res.status).toBe(409);
    const b = await body(res);
    expect(b.error.code).toBe('version_conflict');
    expect(b.current).toMatchObject({ version: 2, content: doc('first') });
  });

  it('validates title', async () => {
    expect((await patch(alice, { version: 1, title: '   ' })).status).toBe(400);
    expect((await patch(alice, { version: 1, title: 'x'.repeat(201) })).status).toBe(400);
    expect((await patch(alice, { version: 1, title: 'x'.repeat(200) })).status).toBe(200);
  });

  it('validates content shape and version', async () => {
    expect((await patch(alice, { version: 1, content: { type: 'paragraph' } })).status).toBe(400);
    expect((await patch(alice, { version: 1, content: 'hello' })).status).toBe(400);
    expect((await patch(alice, { content: doc('x') })).status).toBe(400);
    expect((await patch(alice, { version: 0, content: doc('x') })).status).toBe(400);
    expect((await patch(alice, { version: 1 })).status).toBe(400);
  });

  it('content over 1 MB → 413', async () => {
    const res = await patch(alice, { version: 1, content: doc('x'.repeat(1_100_000)) });
    expect(res.status).toBe(413);
    expect((await body(res)).error.code).toBe('payload_too_large');
  });

  it('malformed id → 404', async () => {
    expect((await t.request('/api/documents/not-a-uuid', { cookie: alice })).status).toBe(404);
    expect((await patch(alice, { version: 1, title: 'x' }, 'not-a-uuid')).status).toBe(404);
  });

  it('PATCH on a missing document → 404', async () => {
    expect((await patch(alice, { version: 1, title: 'x' }, crypto.randomUUID())).status).toBe(404);
  });
});
