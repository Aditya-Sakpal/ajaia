import type { Context } from 'hono';
import type { Access, Document, User } from '../../shared/types';
import type { AppEnv } from '../app';
import type { DocumentRecord } from '../db/repo';
import { ApiError, notFound } from './errors';
import { can, getAccess, type Action } from './permissions';
import { isUuid } from './validation';

/**
 * Loads a document and the caller's access, enforcing `action`.
 * No document / no access / malformed id → 404 (don't leak existence). Insufficient role → 403.
 */
export async function loadDocWithAccess(
  c: Context<AppEnv>,
  id: string,
  action: Action,
): Promise<{ doc: DocumentRecord; access: Access }> {
  if (!isUuid(id)) throw notFound();
  const { repo, user } = c.var;
  const doc = await repo.getDocument(id);
  if (!doc) throw notFound();
  const share = doc.ownerId === user.id ? null : await repo.getShare(doc.id, user.id);
  const access = getAccess(user.id, doc, share);
  if (!access) throw notFound();
  if (!can(access, action)) {
    throw new ApiError(403, 'forbidden', `Your ${access} access doesn't allow this.`);
  }
  return { doc, access };
}

export function toDocumentDto(doc: DocumentRecord, owner: User, access: Access): Document {
  return {
    id: doc.id,
    title: doc.title,
    owner,
    access,
    content: doc.content,
    version: doc.version,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function ownerOf(c: Context<AppEnv>, doc: DocumentRecord): Promise<User> {
  if (doc.ownerId === c.var.user.id) return c.var.user;
  const owner = await c.var.repo.getUserById(doc.ownerId);
  if (!owner) throw notFound();
  return owner;
}
