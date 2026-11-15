import { createApp } from './app';
import { PgRepo } from './db/pgRepo';
import { openAiClient } from './lib/ai';
import type { Env } from './env';

const app = createApp({
  getRepo: (env) => PgRepo.fromConnectionString(env.HYPERDRIVE.connectionString),
  getAi: (env) => (env.OPENAI_API_KEY ? openAiClient(env.OPENAI_API_KEY, env.OPENAI_MODEL) : null),
});

export default app satisfies ExportedHandler<Env>;
