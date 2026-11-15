import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { loadDocWithAccess } from '../lib/access';
import { notFound } from '../lib/errors';
import { isUuid } from '../lib/validation';

/** Saves by the same person within this window update one version instead of creating a new one. */
export const VERSION_MERGE_WINDOW_SECONDS = 120;

export const versionRoutes = new Hono<AppEnv>()
  .get('/:id/versions', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'view');
    return c.json(await c.var.repo.listVersions(doc.id));
  })
  .get('/:id/versions/:versionId', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'view');
    const versionId = c.req.param('versionId');
    if (!isUuid(versionId)) throw notFound();
    const version = await c.var.repo.getVersion(doc.id, versionId);
    if (!version) throw notFound();
    return c.json(version);
  });
