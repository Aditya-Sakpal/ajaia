import type { Comment, DocJSON, DocumentSummary, Role, Share, User, Version, VersionSummary } from '../../shared/types';

export interface DocumentRecord {
  id: string;
  ownerId: string;
  title: string;
  content: DocJSON;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShareRecord {
  documentId: string;
  userId: string;
  role: Role;
  createdAt: Date;
}

/** Data access boundary. PgRepo in production, MemoryRepo in tests. */
export interface Repo {
  ping(): Promise<void>;
  close?(): Promise<void>;
  listUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  /** `email` must already be normalized (trimmed, lower-cased). */
  getUserByEmail(email: string): Promise<User | null>;
  listDocumentsForUser(userId: string): Promise<{ owned: DocumentSummary[]; shared: DocumentSummary[] }>;
  getDocument(id: string): Promise<DocumentRecord | null>;
  createDocument(input: { ownerId: string; title: string; content: DocJSON }): Promise<DocumentRecord>;
  /** Atomic compare-and-set on `version`. */
  updateDocument(
    id: string,
    expectedVersion: number,
    patch: { title?: string; content?: DocJSON },
  ): Promise<DocumentRecord | 'conflict' | null>;
  deleteDocument(id: string): Promise<void>;
  getShare(documentId: string, userId: string): Promise<ShareRecord | null>;
  listShares(documentId: string): Promise<Share[]>;
  upsertShare(documentId: string, userId: string, role: Role): Promise<Share>;
  deleteShare(documentId: string, userId: string): Promise<void>;
  /** Records that `userId` has the document open and returns everyone seen in the last `windowSeconds`. */
  touchPresence(documentId: string, userId: string, windowSeconds: number): Promise<User[]>;

  /** Oldest first. */
  listComments(documentId: string): Promise<Comment[]>;
  /** Scoped to the document: a comment id from another document returns null. */
  getComment(documentId: string, commentId: string): Promise<(Comment & { authorId: string }) | null>;
  createComment(input: { documentId: string; authorId: string; body: string; quote: string }): Promise<Comment>;
  setCommentResolved(documentId: string, commentId: string, resolved: boolean): Promise<Comment | null>;
  deleteComment(documentId: string, commentId: string): Promise<void>;

  /**
   * Records a content snapshot. If the newest snapshot is by the same author and was last touched within
   * `mergeWindowSeconds`, it is updated in place instead (so autosave doesn't create a version per keystroke).
   */
  recordVersion(
    input: { documentId: string; authorId: string; version: number; title: string; content: DocJSON },
    mergeWindowSeconds: number,
  ): Promise<void>;
  /** Newest first, without content. */
  listVersions(documentId: string): Promise<VersionSummary[]>;
  getVersion(documentId: string, versionId: string): Promise<Version | null>;
}
