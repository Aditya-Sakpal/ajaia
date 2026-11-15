import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { loadDocWithAccess } from '../lib/access';

/** Seconds after the last heartbeat that someone still counts as "in the document". */
export const PRESENCE_WINDOW_SECONDS = 15;

/**
 * Heartbeat: marks the caller as viewing, returns who else is here and the current version,
 * so open tabs can pull remote edits.
 */
export const presenceRoutes = new Hono<AppEnv>().post('/:id/presence', async (c) => {
  const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'view');
  const viewers = await c.var.repo.touchPresence(doc.id, c.var.user.id, PRESENCE_WINDOW_SECONDS);
  return c.json({ version: doc.version, updatedAt: doc.updatedAt.toISOString(), viewers });
});
