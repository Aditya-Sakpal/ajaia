import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { Comment, DocJSON, DocumentSummary, Role, Share, User, Version, VersionSummary } from '../../shared/types';
import type { DocumentRecord, Repo, ShareRecord } from './repo';
import { documentComments, documentPresence, documents, documentShares, documentVersions, users } from './schema';
import { withTimeout } from '../lib/timeout';

/** A stuck database call fails with a 503 after this long instead of hanging the request. */
const QUERY_TIMEOUT_MS = 8000;

/** Wraps every repo method (except close) in the query timeout. */
function guarded(repo: PgRepo): PgRepo {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      // Only prototype methods are queries; own fields (the postgres client is itself callable) pass through.
      if (typeof value !== 'function' || prop === 'close' || prop === 'constructor' || Object.hasOwn(target, prop)) return value;
      return (...args: unknown[]) => withTimeout(Promise.resolve((value as (...a: unknown[]) => unknown).apply(target, args)), QUERY_TIMEOUT_MS);
    },
  });
}

const userCols = { id: users.id, email: users.email, name: users.name };
const summaryCols = { id: documents.id, title: documents.title, updatedAt: documents.updatedAt, owner: userCols };

export class PgRepo implements Repo {
  private constructor(
    private readonly client: postgres.Sql,
    private readonly db: PostgresJsDatabase,
  ) {}

  /**
   * One client per request with a single connection: Hyperdrive pools in production, and locally
   * (direct to Aiven, max_connections=20) this keeps concurrent requests from exhausting the server.
   */
  static fromConnectionString(url: string): PgRepo {
    const client = postgres(url, { max: 1, fetch_types: false, connect_timeout: 10, idle_timeout: 5, max_lifetime: 60 });
    return guarded(new PgRepo(client, drizzle(client)));
  }

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }

  async close(): Promise<void> {
    await this.client.end({ timeout: 2 });
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

  async touchPresence(documentId: string, userId: string, windowSeconds: number): Promise<User[]> {
    await this.db
      .insert(documentPresence)
      .values({ documentId, userId })
      .onConflictDoUpdate({ target: [documentPresence.documentId, documentPresence.userId], set: { lastSeen: sql`now()` } });
    return this.db
      .select(userCols)
      .from(documentPresence)
      .innerJoin(users, eq(users.id, documentPresence.userId))
      .where(and(eq(documentPresence.documentId, documentId), gt(documentPresence.lastSeen, sql`now() - make_interval(secs => ${windowSeconds})`)))
      .orderBy(asc(users.name));
  }

  private readonly commentCols = {
    id: documentComments.id,
    authorId: documentComments.authorId,
    body: documentComments.body,
    quote: documentComments.quote,
    resolved: documentComments.resolved,
    createdAt: documentComments.createdAt,
    author: userCols,
  };

  private toComment(r: { id: string; body: string; quote: string; resolved: boolean; createdAt: Date; author: User }): Comment {
    return { id: r.id, author: r.author, body: r.body, quote: r.quote, resolved: r.resolved, createdAt: r.createdAt.toISOString() };
  }

  async listComments(documentId: string): Promise<Comment[]> {
    const rows = await this.db
      .select(this.commentCols)
      .from(documentComments)
      .innerJoin(users, eq(users.id, documentComments.authorId))
      .where(eq(documentComments.documentId, documentId))
      .orderBy(asc(documentComments.createdAt));
    return rows.map((r) => this.toComment(r));
  }

  async getComment(documentId: string, commentId: string) {
    const [r] = await this.db
      .select(this.commentCols)
      .from(documentComments)
      .innerJoin(users, eq(users.id, documentComments.authorId))
      .where(and(eq(documentComments.id, commentId), eq(documentComments.documentId, documentId)));
    return r ? { ...this.toComment(r), authorId: r.authorId } : null;
  }

  async createComment(input: { documentId: string; authorId: string; body: string; quote: string }): Promise<Comment> {
    const [c] = await this.db.insert(documentComments).values(input).returning();
    const author = (await this.getUserById(input.authorId))!;
    return this.toComment({ ...c, author });
  }

  async setCommentResolved(documentId: string, commentId: string, resolved: boolean): Promise<Comment | null> {
    const [c] = await this.db
      .update(documentComments)
      .set({ resolved })
      .where(and(eq(documentComments.id, commentId), eq(documentComments.documentId, documentId)))
      .returning();
    if (!c) return null;
    const author = (await this.getUserById(c.authorId))!;
    return this.toComment({ ...c, author });
  }

  async deleteComment(documentId: string, commentId: string): Promise<void> {
    await this.db
      .delete(documentComments)
      .where(and(eq(documentComments.id, commentId), eq(documentComments.documentId, documentId)));
  }

  async recordVersion(
    input: { documentId: string; authorId: string; version: number; title: string; content: DocJSON },
    mergeWindowSeconds: number,
  ): Promise<void> {
    const [newest] = await this.db
      .select({
        id: documentVersions.id,
        authorId: documentVersions.authorId,
        recent: sql<boolean>`${documentVersions.updatedAt} > now() - make_interval(secs => ${mergeWindowSeconds})`,
      })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, input.documentId))
      .orderBy(desc(documentVersions.createdAt))
      .limit(1);
    if (newest && newest.authorId === input.authorId && newest.recent) {
      await this.db
        .update(documentVersions)
        .set({ version: input.version, title: input.title, content: input.content, updatedAt: sql`now()` })
        .where(eq(documentVersions.id, newest.id));
      return;
    }
    await this.db.insert(documentVersions).values(input);
  }

  async listVersions(documentId: string): Promise<VersionSummary[]> {
    const rows = await this.db
      .select({ id: documentVersions.id, version: documentVersions.version, title: documentVersions.title, updatedAt: documentVersions.updatedAt, author: userCols })
      .from(documentVersions)
      .innerJoin(users, eq(users.id, documentVersions.authorId))
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.createdAt))
      .limit(100);
    return rows.map((r) => ({ id: r.id, version: r.version, title: r.title, author: r.author, createdAt: r.updatedAt.toISOString() }));
  }

  async getVersion(documentId: string, versionId: string): Promise<Version | null> {
    const [r] = await this.db
      .select({
        id: documentVersions.id,
        version: documentVersions.version,
        title: documentVersions.title,
        content: documentVersions.content,
        updatedAt: documentVersions.updatedAt,
        author: userCols,
      })
      .from(documentVersions)
      .innerJoin(users, eq(users.id, documentVersions.authorId))
      .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, documentId)));
    return r ? { id: r.id, version: r.version, title: r.title, content: r.content, author: r.author, createdAt: r.updatedAt.toISOString() } : null;
  }
}
