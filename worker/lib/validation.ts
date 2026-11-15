import type { Context } from 'hono';
import { z } from 'zod';
import { CONTENT_MAX_BYTES, ROLES, TITLE_MAX } from '../../shared/types';
import { ApiError } from './errors';

export const emailSchema = z.string().trim().toLowerCase().min(1, 'Email is required.').max(320);

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title can't be empty.")
  .max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters.`);

const MAX_DEPTH = 64;

/** Structural ProseMirror check: every node is an object with a string type; text nodes are non-empty. */
function isValidNode(node: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH || typeof node !== 'object' || node === null || Array.isArray(node)) return false;
  const n = node as { type?: unknown; text?: unknown; content?: unknown };
  if (typeof n.type !== 'string' || n.type.length === 0) return false;
  if (n.type === 'text' && (typeof n.text !== 'string' || n.text.length === 0)) return false;
  if (n.content === undefined) return true;
  return Array.isArray(n.content) && n.content.every((c) => isValidNode(c, depth + 1));
}

const contentSchema = z
  .looseObject({
    type: z.literal('doc', { error: 'Content must be a document.' }),
    content: z.array(z.unknown()).optional(),
  })
  .refine((doc) => isValidNode(doc, 0), 'Document content is malformed.');

export const loginSchema = z.object({ email: emailSchema });

export const createDocumentSchema = z.object({
  title: titleSchema.optional(),
  content: contentSchema.optional(),
});

export const patchDocumentSchema = z
  .object({
    version: z.number().int().positive(),
    title: titleSchema.optional(),
    content: contentSchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, 'Nothing to update.');

export const shareSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES as [string, ...string[]], { error: 'Role must be editor or viewer.' }),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

/** Postgres jsonb cannot store U+0000; reject it as a 400 instead of failing with a 500. */
function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes(String.fromCharCode(0));
  if (depth > 100 || typeof value !== 'object' || value === null) return false;
  return Object.values(value).some((v) => containsNul(v, depth + 1));
}

/** Parses and validates a JSON body. Enforces the content size limit before deep validation. */
export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.text();
  if (raw.length > CONTENT_MAX_BYTES + 10_000) {
    throw new ApiError(413, 'payload_too_large', 'Document is too large (max 1 MB).');
  }
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, 'invalid_request', 'Request body must be valid JSON.');
  }
  if (containsNul(json)) {
    throw new ApiError(400, 'invalid_request', 'Text contains characters that cannot be saved.');
  }
  const maybeContent = (json as { content?: unknown } | null)?.content;
  if (maybeContent !== undefined && JSON.stringify(maybeContent).length > CONTENT_MAX_BYTES) {
    throw new ApiError(413, 'payload_too_large', 'Document is too large (max 1 MB).');
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(400, 'invalid_request', result.error.issues[0]?.message ?? 'Invalid request.');
  }
  return result.data;
}
