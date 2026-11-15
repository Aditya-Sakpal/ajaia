import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { loadDocWithAccess } from '../lib/access';
import { ApiError, notFound } from '../lib/errors';
import { createCommentSchema, isUuid, parseBody, patchCommentSchema } from '../lib/validation';

export const commentRoutes = new Hono<AppEnv>()
  .get('/:id/comments', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'view');
    return c.json(await c.var.repo.listComments(doc.id));
  })
  .post('/:id/comments', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'comment');
    const input = await parseBody(c, createCommentSchema);
    const comment = await c.var.repo.createComment({ documentId: doc.id, authorId: c.var.user.id, body: input.body, quote: input.quote });
    return c.json(comment, 201);
  })
  .patch('/:id/comments/:commentId', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'comment');
    const commentId = c.req.param('commentId');
    if (!isUuid(commentId)) throw notFound();
    const input = await parseBody(c, patchCommentSchema);
    const updated = await c.var.repo.setCommentResolved(doc.id, commentId, input.resolved);
    if (!updated) throw notFound();
    return c.json(updated);
  })
  .delete('/:id/comments/:commentId', async (c) => {
    const { doc } = await loadDocWithAccess(c, c.req.param('id'), 'view');
    const commentId = c.req.param('commentId');
    if (!isUuid(commentId)) throw notFound();
    const comment = await c.var.repo.getComment(doc.id, commentId);
    if (!comment) throw notFound();
    if (comment.authorId !== c.var.user.id && doc.ownerId !== c.var.user.id) {
      throw new ApiError(403, 'forbidden', 'Only the author or the document owner can delete this comment.');
    }
    await c.var.repo.deleteComment(doc.id, commentId);
    return c.body(null, 204);
  });
