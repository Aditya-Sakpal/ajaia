// API DTOs shared by the Worker and the SPA. Single source of truth (spec §6).

/** commenter: can read and comment, but not edit (spec §4). */
export type Role = 'editor' | 'commenter' | 'viewer';
export type Access = 'owner' | Role;

export interface User {
  id: string;
  email: string;
  name: string;
}

/** ProseMirror / TipTap document JSON. */
export interface DocJSON {
  type: 'doc';
  content?: unknown[];
  [key: string]: unknown;
}

export interface DocumentSummary {
  id: string;
  title: string;
  owner: User;
  access: Access;
  updatedAt: string;
}

export interface Document extends DocumentSummary {
  content: DocJSON;
  version: number;
  createdAt: string;
}

export interface Share {
  user: User;
  role: Role;
  createdAt: string;
}

export interface DocumentLists {
  owned: DocumentSummary[];
  shared: DocumentSummary[];
}

export interface Comment {
  id: string;
  author: User;
  /** The text that was selected when the comment was made (may be empty). */
  quote: string;
  body: string;
  resolved: boolean;
  createdAt: string;
}

export interface VersionSummary {
  id: string;
  /** Document version number this snapshot captured. */
  version: number;
  title: string;
  author: User;
  createdAt: string;
}

export interface Version extends VersionSummary {
  content: DocJSON;
}

export const COMMENT_MAX = 2000;
export const QUOTE_MAX = 500;

export interface ApiErrorBody {
  error: { code: string; message: string };
  current?: Document;
}

export const ROLES: readonly Role[] = ['editor', 'commenter', 'viewer'] as const;
export const TITLE_MAX = 200;
export const DEFAULT_TITLE = 'Untitled document';
export const CONTENT_MAX_BYTES = 1_000_000;
export const EMPTY_DOC: DocJSON = { type: 'doc', content: [{ type: 'paragraph' }] };
