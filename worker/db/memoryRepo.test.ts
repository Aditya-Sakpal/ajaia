import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepo } from './memoryRepo';

const doc = { type: 'doc' as const, content: [] };

describe('MemoryRepo', () => {
  let repo: MemoryRepo;
  let alice: string;
  let bob: string;

  beforeEach(() => {
    repo = new MemoryRepo();
    alice = repo.addUser({ email: 'alice@ajaia.test', name: 'Alice' }).id;
    bob = repo.addUser({ email: 'bob@ajaia.test', name: 'Bob' }).id;
  });

  it('updateDocument with the current version increments version and bumps updatedAt', async () => {
    const d = await repo.createDocument({ ownerId: alice, title: 'A', content: doc });
    await new Promise((r) => setTimeout(r, 2));
    const updated = await repo.updateDocument(d.id, 1, { title: 'B' });
    expect(updated).not.toBe('conflict');
    expect(updated).not.toBeNull();
    if (updated && updated !== 'conflict') {
      expect(updated.version).toBe(2);
      expect(updated.title).toBe('B');
      expect(updated.updatedAt.getTime()).toBeGreaterThan(d.updatedAt.getTime());
    }
  });

  it('updateDocument with a stale version returns conflict', async () => {
    const d = await repo.createDocument({ ownerId: alice, title: 'A', content: doc });
    await repo.updateDocument(d.id, 1, { title: 'B' });
    expect(await repo.updateDocument(d.id, 1, { title: 'C' })).toBe('conflict');
  });

  it('updateDocument on a missing id returns null', async () => {
    expect(await repo.updateDocument(crypto.randomUUID(), 1, { title: 'X' })).toBeNull();
  });

  it('listDocumentsForUser splits owned/shared, sorts by updatedAt desc and sets access', async () => {
    const a1 = await repo.createDocument({ ownerId: alice, title: 'a1', content: doc });
    await new Promise((r) => setTimeout(r, 2));
    const a2 = await repo.createDocument({ ownerId: alice, title: 'a2', content: doc });
    const b1 = await repo.createDocument({ ownerId: bob, title: 'b1', content: doc });
    await repo.upsertShare(b1.id, alice, 'viewer');

    const lists = await repo.listDocumentsForUser(alice);
    expect(lists.owned.map((d) => d.id)).toEqual([a2.id, a1.id]);
    expect(lists.owned[0].access).toBe('owner');
    expect(lists.shared).toHaveLength(1);
    expect(lists.shared[0]).toMatchObject({ id: b1.id, access: 'viewer', owner: { email: 'bob@ajaia.test' } });
  });

  it('deleteDocument cascades shares', async () => {
    const d = await repo.createDocument({ ownerId: alice, title: 'A', content: doc });
    await repo.upsertShare(d.id, bob, 'editor');
    await repo.deleteDocument(d.id);
    expect(await repo.getShare(d.id, bob)).toBeNull();
    expect((await repo.listDocumentsForUser(bob)).shared).toHaveLength(0);
  });

  it('upsertShare twice changes the role and keeps a single row', async () => {
    const d = await repo.createDocument({ ownerId: alice, title: 'A', content: doc });
    await repo.upsertShare(d.id, bob, 'editor');
    await repo.upsertShare(d.id, bob, 'viewer');
    const shares = await repo.listShares(d.id);
    expect(shares).toHaveLength(1);
    expect(shares[0]).toMatchObject({ role: 'viewer', user: { id: bob } });
  });
});
