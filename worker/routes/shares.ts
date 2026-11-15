import { Hono } from 'hono';
import type { Role } from '../../shared/types';
import type { AppEnv } from '../app';
import { loadDocWithAccess } from '../lib/access';
import { ApiError, notFound } from '../lib/errors';
import { isUuid, parseBody, shareSchema } from '../lib/validation';

export const shareRoutes = new Hono<AppEnv>()
  .get('/:id/shares', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'listShares');
    return c.json(await c.var.repo.listShares(doc.id));
  })
  .put('/:id/shares', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'manageShares');
    const { email, role } = await parseBody(c, shareSchema);
    const target = await c.var.repo.getUserByEmail(email);
    if (!target) throw new ApiError(404, 'user_not_found', 'No Ajaia user with that email.');
    if (target.id === doc.ownerId) {
      throw new ApiError(400, 'cannot_share_with_owner', 'The owner already has full access.');
    }
    return c.json(await c.var.repo.upsertShare(doc.id, target.id, role as Role));
  })
  .delete('/:id/shares/:userId', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'manageShares');
    const userId = c.req.param('userId');
    if (!isUuid(userId)) throw notFound('Collaborator');
    await c.var.repo.deleteShare(doc.id, userId);
    return c.body(null, 204);
  });
