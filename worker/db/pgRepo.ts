import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

export class PgRepo {
  private constructor(
    private readonly client: postgres.Sql,
    private readonly db: PostgresJsDatabase,
  ) {}

  static fromConnectionString(url: string): PgRepo {
    const client = postgres(url, { max: 5, fetch_types: false, prepare: true });
    return new PgRepo(client, drizzle(client));
  }

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }

  async close(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
