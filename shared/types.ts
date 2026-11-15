// API DTOs shared by the Worker and the SPA. Single source of truth (spec §6).

export type Role = 'editor' | 'viewer';
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

export interface ApiErrorBody {
  error: { code: string; message: string };
  current?: Document;
}

export const ROLES: readonly Role[] = ['editor', 'viewer'] as const;
export const TITLE_MAX = 200;
export const DEFAULT_TITLE = 'Untitled document';
export const CONTENT_MAX_BYTES = 1_000_000;
export const EMPTY_DOC: DocJSON = { type: 'doc', content: [{ type: 'paragraph' }] };
