import { beforeEach, describe, expect, it } from 'vitest';
import { body, loginAs, makeTestApp, type TestApp } from '../test/helpers';

describe('shares API', () => {
  let t: TestApp;
  let alice: string, bob: string, carol: string, dave: string;
  let docId: string;

  beforeEach(async () => {
    t = makeTestApp();
    t.repo.addUser({ email: 'dave@ajaia.test', name: 'Dave Stranger' });
    [alice, bob, carol, dave] = await Promise.all(
      ['alice', 'bob', 'carol', 'dave'].map((n) => loginAs(t, `${n}@ajaia.test`)),
    );
    const d = await t.repo.createDocument({ ownerId: t.alice.id, title: 'Plan', content: { type: 'doc', content: [] } });
    await t.repo.upsertShare(d.id, t.bob.id, 'editor');
    docId = d.id;
  });

  const share = (cookie: string, json: unknown) =>
    t.request(`/api/documents/${docId}/shares`, { method: 'PUT', cookie, json });
  const list = (cookie: string) => t.request(`/api/documents/${docId}/shares`, { cookie });

  it('owner shares by email (normalized) and the recipient sees it under shared', async () => {
    const res = await share(alice, { email: '  CAROL@ajaia.test ', role: 'editor' });
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ role: 'editor', user: { email: 'carol@ajaia.test' } });
    const lists = await body(await t.request('/api/documents', { cookie: carol }));
    expect(lists.shared).toEqual([expect.objectContaining({ id: docId, access: 'editor' })]);
  });

  it('sharing again updates the role without duplicating', async () => {
    await share(alice, { email: 'carol@ajaia.test', role: 'editor' });
    await share(alice, { email: 'carol@ajaia.test', role: 'viewer' });
    const shares = await body(await list(alice));
    const carols = shares.filter((s: { user: { email: string } }) => s.user.email === 'carol@ajaia.test');
    expect(carols).toEqual([expect.objectContaining({ role: 'viewer' })]);
  });

  it('cannot share with the owner', async () => {
    const res = await share(alice, { email: 'alice@ajaia.test', role: 'viewer' });
    expect(res.status).toBe(400);
    expect((await body(res)).error.code).toBe('cannot_share_with_owner');
  });

  it('unknown email → 404 user_not_found', async () => {
    const res = await share(alice, { email: 'ghost@ajaia.test', role: 'viewer' });
    expect(res.status).toBe(404);
    expect((await body(res)).error.code).toBe('user_not_found');
  });

  it('invalid role or missing email → 400', async () => {
    expect((await share(alice, { email: 'carol@ajaia.test', role: 'admin' })).status).toBe(400);
    expect((await share(alice, { email: '', role: 'viewer' })).status).toBe(400);
    expect((await share(alice, { role: 'viewer' })).status).toBe(400);
  });

  it('only the owner manages shares', async () => {
    expect((await share(bob, { email: 'carol@ajaia.test', role: 'viewer' })).status).toBe(403);
    expect((await t.request(`/api/documents/${docId}/shares/${t.bob.id}`, { method: 'DELETE', cookie: bob })).status).toBe(403);
    expect((await share(dave, { email: 'carol@ajaia.test', role: 'viewer' })).status).toBe(404);
  });

  it('collaborators can list shares; strangers cannot', async () => {
    await share(alice, { email: 'carol@ajaia.test', role: 'viewer' });
    expect((await list(carol)).status).toBe(200);
    expect((await list(bob)).status).toBe(200);
    expect((await list(dave)).status).toBe(404);
  });

  it('revoking access: the former editor can no longer read or save (404)', async () => {
    const res = await t.request(`/api/documents/${docId}/shares/${t.bob.id}`, { method: 'DELETE', cookie: alice });
    expect(res.status).toBe(204);
    expect((await t.request(`/api/documents/${docId}`, { cookie: bob })).status).toBe(404);
    const save = await t.request(`/api/documents/${docId}`, { method: 'PATCH', cookie: bob, json: { version: 1, title: 'x' } });
    expect(save.status).toBe(404);
  });

  it('revoking with a malformed user id → 404', async () => {
    const res = await t.request(`/api/documents/${docId}/shares/nope`, { method: 'DELETE', cookie: alice });
    expect(res.status).toBe(404);
  });
});
