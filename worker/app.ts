import { Hono } from 'hono';
import type { User } from '../shared/types';
import type { Repo } from './db/repo';
import type { Env } from './env';
import { ApiError, errorBody } from './lib/errors';
import { authRoutes } from './routes/auth';
import { documentRoutes } from './routes/documents';

export type AppEnv = { Bindings: Env; Variables: { user: User; repo: Repo } };

export interface AppDeps {
  getRepo(env: Env): Repo;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.use('*', async (c, next) => {
    const repo = deps.getRepo(c.env);
    c.set('repo', repo);
    try {
      await next();
    } finally {
      if (repo.close) {
        const closing = repo.close().catch((err) => console.error('repo close failed', err));
        try {
          c.executionCtx.waitUntil(closing);
        } catch {
          await closing; // no ExecutionContext (tests)
        }
      }
    }
  });

  app.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.get('/health', async (c) => {
    try {
      await c.var.repo.ping();
      return c.json({ ok: true, db: true });
    } catch (err) {
      console.error('health check failed', err);
      return c.json({ ok: false, db: false }, 503);
    }
  });

  app.route('/', authRoutes);
  app.route('/documents', documentRoutes);

  app.notFound((c) => c.json(errorBody('not_found', 'Not found.'), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(errorBody(err.code, err.message, err.extra), err.status);
    console.error('unhandled error', err);
    return c.json(errorBody('internal_error', 'Something went wrong. Please try again.'), 500);
  });

  return app;
}
