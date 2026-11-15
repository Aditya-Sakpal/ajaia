import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DocJSON, DocumentSummary, Role, Share, User } from '../../shared/types';
import type { DocumentRecord, Repo, ShareRecord } from './repo';
import { documents, documentShares, users } from './schema';

const userCols = { id: users.id, email: users.email, name: users.name };
const summaryCols = { id: documents.id, title: documents.title, updatedAt: documents.updatedAt, owner: userCols };

export class PgRepo implements Repo {
  private constructor(
    private readonly client: postgres.Sql,
    private readonly db: PostgresJsDatabase,
  ) {}

  /** One client per request: Hyperdrive does the pooling (Cloudflare guidance). */
  static fromConnectionString(url: string): PgRepo {
    const client = postgres(url, { max: 5, fetch_types: false });
    return new PgRepo(client, drizzle(client));
  }

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }

  async close(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }

  async listUsers(): Promise<User[]> {
    return this.db.select(userCols).from(users).orderBy(asc(users.name));
  }

  async getUserById(id: string): Promise<User | null> {
    const [u] = await this.db.select(userCols).from(users).where(eq(users.id, id));
    return u ?? null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [u] = await this.db.select(userCols).from(users).where(eq(users.email, email));
    return u ?? null;
  }

  async listDocumentsForUser(userId: string) {
    const toSummary = (r: { id: string; title: string; updatedAt: Date; owner: User }, access: DocumentSummary['access']) => ({
      id: r.id,
      title: r.title,
      owner: r.owner,
      access,
      updatedAt: r.updatedAt.toISOString(),
    });
    const [owned, shared] = await Promise.all([
      this.db
        .select(summaryCols)
        .from(documents)
        .innerJoin(users, eq(users.id, documents.ownerId))
        .where(eq(documents.ownerId, userId))
        .orderBy(desc(documents.updatedAt)),
      this.db
        .select({ ...summaryCols, role: documentShares.role })
        .from(documentShares)
        .innerJoin(documents, eq(documents.id, documentShares.documentId))
        .innerJoin(users, eq(users.id, documents.ownerId))
        .where(eq(documentShares.userId, userId))
        .orderBy(desc(documents.updatedAt)),
    ]);
    return {
      owned: owned.map((r) => toSummary(r, 'owner')),
      shared: shared.map((r) => toSummary(r, r.role)),
    };
  }

  async getDocument(id: string): Promise<DocumentRecord | null> {
    const [d] = await this.db.select().from(documents).where(eq(documents.id, id));
    return d ?? null;
  }

  async createDocument(input: { ownerId: string; title: string; content: DocJSON }): Promise<DocumentRecord> {
    const [d] = await this.db.insert(documents).values(input).returning();
    return d;
  }

  async updateDocument(
    id: string,
    expectedVersion: number,
    patch: { title?: string; content?: DocJSON },
  ): Promise<DocumentRecord | 'conflict' | null> {
    // Single atomic compare-and-set: no read-then-write race between concurrent saves.
    const [d] = await this.db
      .update(documents)
      .set({ ...patch, version: sql`${documents.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(documents.id, id), eq(documents.version, expectedVersion)))
      .returning();
    if (d) return d;
    const [exists] = await this.db.select({ id: documents.id }).from(documents).where(eq(documents.id, id));
    return exists ? 'conflict' : null;
  }

  async deleteDocument(id: string): Promise<void> {
    await this.db.delete(documents).where(eq(documents.id, id));
  }

  async getShare(documentId: string, userId: string): Promise<ShareRecord | null> {
    const [s] = await this.db
      .select()
      .from(documentShares)
      .where(and(eq(documentShares.documentId, documentId), eq(documentShares.userId, userId)));
    return s ?? null;
  }

  async listShares(documentId: string): Promise<Share[]> {
    const rows = await this.db
      .select({ user: userCols, role: documentShares.role, createdAt: documentShares.createdAt })
      .from(documentShares)
      .innerJoin(users, eq(users.id, documentShares.userId))
      .where(eq(documentShares.documentId, documentId))
      .orderBy(asc(documentShares.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async upsertShare(documentId: string, userId: string, role: Role): Promise<Share> {
    const [s] = await this.db
      .insert(documentShares)
      .values({ documentId, userId, role })
      .onConflictDoUpdate({ target: [documentShares.documentId, documentShares.userId], set: { role } })
      .returning();
    const user = (await this.getUserById(userId))!;
    return { user, role: s.role, createdAt: s.createdAt.toISOString() };
  }

  async deleteShare(documentId: string, userId: string): Promise<void> {
    await this.db
      .delete(documentShares)
      .where(and(eq(documentShares.documentId, documentId), eq(documentShares.userId, userId)));
  }
}
