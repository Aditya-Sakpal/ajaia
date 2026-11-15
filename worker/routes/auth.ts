import { Hono } from 'hono';
import type { AppEnv } from '../app';
import { ApiError } from '../lib/errors';
import { endSession, requireUser, startSession } from '../lib/session';
import { loginSchema, parseBody } from '../lib/validation';

export const authRoutes = new Hono<AppEnv>()
  .get('/users', async (c) => c.json(await c.var.repo.listUsers()))
  .post('/auth/login', async (c) => {
    const { email } = await parseBody(c, loginSchema);
    const user = await c.var.repo.getUserByEmail(email);
    if (!user) throw new ApiError(404, 'user_not_found', 'No user with that email.');
    await startSession(c, user.id);
    return c.json(user);
  })
  .post('/auth/logout', (c) => {
    endSession(c);
    return c.body(null, 204);
  })
  .get('/me', requireUser, (c) => c.json(c.var.user));
