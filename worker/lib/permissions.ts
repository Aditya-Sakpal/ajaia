import type { Access, Role } from '../../shared/types';

export type Action = 'view' | 'edit' | 'rename' | 'delete' | 'listShares' | 'manageShares';

/** Spec §4: what each access level may do. */
const ALLOWED: Record<Access, ReadonlySet<Action>> = {
  owner: new Set<Action>(['view', 'edit', 'rename', 'delete', 'listShares', 'manageShares']),
  editor: new Set<Action>(['view', 'edit', 'rename', 'listShares']),
  viewer: new Set<Action>(['view', 'listShares']),
};

export function getAccess(userId: string, doc: { ownerId: string }, share: { role: Role } | null): Access | null {
  if (doc.ownerId === userId) return 'owner';
  return share?.role ?? null;
}

export function can(access: Access | null, action: Action): boolean {
  return access !== null && ALLOWED[access].has(action);
}
