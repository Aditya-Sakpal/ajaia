import { describe, expect, it } from 'vitest';
import type { Access } from '../../shared/types';
import { can, getAccess, type Action } from './permissions';

const ALL_ACCESS: Access[] = ['owner', 'editor', 'viewer'];
const ALL_ACTIONS: Action[] = ['view', 'edit', 'rename', 'delete', 'listShares', 'manageShares'];

// Spec §4 access matrix.
const matrix: Record<Access, Action[]> = {
  owner: ['view', 'edit', 'rename', 'delete', 'listShares', 'manageShares'],
  editor: ['view', 'edit', 'rename', 'listShares'],
  viewer: ['view', 'listShares'],
};

describe('can', () => {
  it.each(ALL_ACCESS.flatMap((a) => ALL_ACTIONS.map((x) => [a, x] as const)))('%s → %s', (access, action) => {
    expect(can(access, action)).toBe(matrix[access].includes(action));
  });

  it('no access can do nothing', () => {
    for (const action of ALL_ACTIONS) expect(can(null, action)).toBe(false);
  });
});

describe('getAccess', () => {
  it('owner wins even if a share row exists', () => {
    expect(getAccess('u1', { ownerId: 'u1' }, { role: 'viewer' })).toBe('owner');
  });
  it('uses the share role for non-owners', () => {
    expect(getAccess('u2', { ownerId: 'u1' }, { role: 'editor' })).toBe('editor');
    expect(getAccess('u2', { ownerId: 'u1' }, { role: 'viewer' })).toBe('viewer');
  });
  it('returns null without ownership or share', () => {
    expect(getAccess('u3', { ownerId: 'u1' }, null)).toBeNull();
  });
});
