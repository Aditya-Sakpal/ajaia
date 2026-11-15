import { Hono } from 'hono';
import { DEFAULT_TITLE, EMPTY_DOC } from '../../shared/types';
import type { AppEnv } from '../app';
import { loadDocWithAccess, ownerOf, toDocumentDto } from '../lib/access';
import { ApiError, notFound } from '../lib/errors';
import { can } from '../lib/permissions';
import { createDocumentSchema, parseBody, patchDocumentSchema } from '../lib/validation';
import { VERSION_MERGE_WINDOW_SECONDS } from './versions';

export const documentRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await c.var.repo.listDocumentsForUser(c.var.user.id)))
  .post('/', async (c) => {
    const input = await parseBody(c, createDocumentSchema);
    const doc = await c.var.repo.createDocument({
      ownerId: c.var.user.id,
      title: input.title ?? DEFAULT_TITLE,
      content: input.content ?? EMPTY_DOC,
    });
    return c.json(toDocumentDto(doc, c.var.user, 'owner'), 201);
  })
  .get('/:id', async (c) => {
    const { doc, access } = await loadDocWithAccess(c, c.req.param('id'), 'view');
    return c.json(toDocumentDto(doc, await ownerOf(c, doc), access));
  })
  .patch('/:id', async (c) => {
    const id = c.req.param('id');
    // Authorize before parsing so strangers get 404 regardless of body.
    const { access } = await loadDocWithAccess(c, id, 'view');
    const input = await parseBody(c, patchDocumentSchema);
    const action = input.content !== undefined ? 'edit' : 'rename';
    if (!can(access, action)) throw new ApiError(403, 'forbidden', `Your ${access} access doesn't allow this.`);
    const result = await c.var.repo.updateDocument(id, input.version, { title: input.title, content: input.content });
    if (result === null) throw notFound();
    if (result === 'conflict') {
      const current = await c.var.repo.getDocument(id);
      if (!current) throw notFound();
      throw new ApiError(409, 'version_conflict', 'This document was changed elsewhere.', {
        current: toDocumentDto(current, await ownerOf(c, current), access),
      });
    }
    if (input.content !== undefined) {
      await c.var.repo.recordVersion(
        { documentId: id, authorId: c.var.user.id, version: result.version, title: result.title, content: result.content },
        VERSION_MERGE_WINDOW_SECONDS,
      );
    }
    return c.json(toDocumentDto(result, await ownerOf(c, result), access));
  })
  .delete('/:id', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'delete');
    await c.var.repo.deleteDocument(doc.id);
    return c.body(null, 204);
  });
