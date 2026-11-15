import { Hono } from 'hono';
import type { User } from '../shared/types';
import type { Repo } from './db/repo';
import type { Env } from './env';

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

  app.get('/health', async (c) => {
    try {
      await c.var.repo.ping();
      return c.json({ ok: true, db: true });
    } catch (err) {
      console.error('health check failed', err);
      return c.json({ ok: false, db: false }, 503);
    }
  });

  return app;
}
