import { createApp } from './app';
import { PgRepo } from './db/pgRepo';
import type { Env } from './env';

const app = createApp({ getRepo: (env) => PgRepo.fromConnectionString(env.HYPERDRIVE.connectionString) });

export default app satisfies ExportedHandler<Env>;
