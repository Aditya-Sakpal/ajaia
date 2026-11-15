import type { Comment, DocJSON, DocumentSummary, Role, Share, User, Version, VersionSummary } from '../../shared/types';
import type { DocumentRecord, Repo, ShareRecord } from './repo';

/** In-memory Repo used by tests. Mirrors PgRepo semantics (cascades, CAS on version). */
export class MemoryRepo implements Repo {
  readonly users = new Map<string, User>();
  readonly documents = new Map<string, DocumentRecord>();
  readonly shares = new Map<string, ShareRecord>(); // key: `${documentId}:${userId}`

  /** Monotonic clock so ordering by updatedAt is deterministic. */
  private lastTime = 0;
  private now(): Date {
    this.lastTime = Math.max(Date.now(), this.lastTime + 1);
    return new Date(this.lastTime);
  }

  addUser(input: { email: string; name: string; id?: string }): User {
    const user = { id: input.id ?? crypto.randomUUID(), email: input.email, name: input.name };
    this.users.set(user.id, user);
    return user;
  }

  async ping() {}

  async listUsers() {
    return [...this.users.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async getUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  private summary(d: DocumentRecord, access: DocumentSummary['access']): DocumentSummary {
    return { id: d.id, title: d.title, owner: this.users.get(d.ownerId)!, access, updatedAt: d.updatedAt.toISOString() };
  }

  async listDocumentsForUser(userId: string) {
    const byRecent = (a: DocumentSummary, b: DocumentSummary) => b.updatedAt.localeCompare(a.updatedAt);
    const owned = [...this.documents.values()].filter((d) => d.ownerId === userId).map((d) => this.summary(d, 'owner'));
    const shared = [...this.shares.values()]
      .filter((s) => s.userId === userId && this.documents.has(s.documentId))
      .map((s) => this.summary(this.documents.get(s.documentId)!, s.role));
    return { owned: owned.sort(byRecent), shared: shared.sort(byRecent) };
  }

  async getDocument(id: string) {
    const d = this.documents.get(id);
    return d ? { ...d } : null;
  }

  async createDocument(input: { ownerId: string; title: string; content: DocJSON }) {
    const now = this.now();
    const d: DocumentRecord = { id: crypto.randomUUID(), ...input, version: 1, createdAt: now, updatedAt: now };
    this.documents.set(d.id, d);
    return { ...d };
  }

  async updateDocument(id: string, expectedVersion: number, patch: { title?: string; content?: DocJSON }) {
    const d = this.documents.get(id);
    if (!d) return null;
    if (d.version !== expectedVersion) return 'conflict' as const;
    const next: DocumentRecord = {
      ...d,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      version: d.version + 1,
      updatedAt: this.now(),
    };
    this.documents.set(id, next);
    return { ...next };
  }

  async deleteDocument(id: string) {
    this.documents.delete(id);
    for (const [key, s] of this.shares) if (s.documentId === id) this.shares.delete(key);
    for (const [key, c] of this.comments) if (c.documentId === id) this.comments.delete(key);
    for (const [key, v] of this.versions) if (v.documentId === id) this.versions.delete(key);
  }

  async getShare(documentId: string, userId: string) {
    return this.shares.get(`${documentId}:${userId}`) ?? null;
  }

  async listShares(documentId: string): Promise<Share[]> {
    return [...this.shares.values()]
      .filter((s) => s.documentId === documentId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((s) => ({ user: this.users.get(s.userId)!, role: s.role, createdAt: s.createdAt.toISOString() }));
  }

  async upsertShare(documentId: string, userId: string, role: Role): Promise<Share> {
    const key = `${documentId}:${userId}`;
    const existing = this.shares.get(key);
    const s: ShareRecord = { documentId, userId, role, createdAt: existing?.createdAt ?? this.now() };
    this.shares.set(key, s);
    return { user: this.users.get(userId)!, role, createdAt: s.createdAt.toISOString() };
  }

  async deleteShare(documentId: string, userId: string) {
    this.shares.delete(`${documentId}:${userId}`);
  }

  readonly presence = new Map<string, Date>(); // key: `${documentId}:${userId}`

  async touchPresence(documentId: string, userId: string, windowSeconds: number): Promise<User[]> {
    this.presence.set(`${documentId}:${userId}`, new Date());
    const cutoff = Date.now() - windowSeconds * 1000;
    return [...this.presence.entries()]
      .filter(([k, seen]) => k.startsWith(`${documentId}:`) && seen.getTime() >= cutoff)
      .map(([k]) => this.users.get(k.split(':')[1]!))
      .filter((u): u is User => !!u);
  }

  readonly comments = new Map<string, { id: string; documentId: string; authorId: string; body: string; quote: string; resolved: boolean; createdAt: Date }>();

  private commentDto(c: { id: string; authorId: string; body: string; quote: string; resolved: boolean; createdAt: Date }): Comment {
    return { id: c.id, author: this.users.get(c.authorId)!, body: c.body, quote: c.quote, resolved: c.resolved, createdAt: c.createdAt.toISOString() };
  }

  async listComments(documentId: string): Promise<Comment[]> {
    return [...this.comments.values()]
      .filter((c) => c.documentId === documentId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((c) => this.commentDto(c));
  }

  async getComment(documentId: string, commentId: string) {
    const c = this.comments.get(commentId);
    return c && c.documentId === documentId ? { ...this.commentDto(c), authorId: c.authorId } : null;
  }

  async createComment(input: { documentId: string; authorId: string; body: string; quote: string }): Promise<Comment> {
    const c = { id: crypto.randomUUID(), ...input, resolved: false, createdAt: this.now() };
    this.comments.set(c.id, c);
    return this.commentDto(c);
  }

  async setCommentResolved(documentId: string, commentId: string, resolved: boolean): Promise<Comment | null> {
    const c = this.comments.get(commentId);
    if (!c || c.documentId !== documentId) return null;
    c.resolved = resolved;
    return this.commentDto(c);
  }

  async deleteComment(documentId: string, commentId: string): Promise<void> {
    if (this.comments.get(commentId)?.documentId === documentId) this.comments.delete(commentId);
  }

  readonly versions = new Map<string, { id: string; documentId: string; authorId: string; version: number; title: string; content: DocJSON; createdAt: Date; updatedAt: Date }>();

  async recordVersion(
    input: { documentId: string; authorId: string; version: number; title: string; content: DocJSON },
    mergeWindowSeconds: number,
  ): Promise<void> {
    const newest = [...this.versions.values()]
      .filter((v) => v.documentId === input.documentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const now = this.now();
    if (newest && newest.authorId === input.authorId && now.getTime() - newest.updatedAt.getTime() <= mergeWindowSeconds * 1000) {
      Object.assign(newest, { version: input.version, title: input.title, content: input.content, updatedAt: now });
      return;
    }
    const v = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.versions.set(v.id, v);
  }

  private versionSummary(v: { id: string; authorId: string; version: number; title: string; updatedAt: Date }): VersionSummary {
    return { id: v.id, version: v.version, title: v.title, author: this.users.get(v.authorId)!, createdAt: v.updatedAt.toISOString() };
  }

  async listVersions(documentId: string): Promise<VersionSummary[]> {
    return [...this.versions.values()]
      .filter((v) => v.documentId === documentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((v) => this.versionSummary(v));
  }

  async getVersion(documentId: string, versionId: string): Promise<Version | null> {
    const v = this.versions.get(versionId);
    return v && v.documentId === documentId ? { ...this.versionSummary(v), content: v.content } : null;
  }
}
