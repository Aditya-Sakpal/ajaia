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

const contentSchema = z.looseObject({
  type: z.literal('doc', { error: 'Content must be a document.' }),
  content: z.array(z.unknown()).optional(),
});

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
