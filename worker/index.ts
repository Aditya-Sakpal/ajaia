import type { Repo } from './db/repo';
import { createApp } from './app';
import { PgRepo } from './db/pgRepo';

const app = createApp({ getRepo: (env) => PgRepo.fromConnectionString(env.HYPERDRIVE.connectionString) as unknown as Repo });

export default app satisfies ExportedHandler<import('./env').Env>;
