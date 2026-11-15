import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type ApiStatus = 400 | 401 | 403 | 404 | 409 | 413 | 502 | 503;

/** Expected, client-facing failure. Formatted by app.onError as { error: { code, message } }. */
export class ApiError extends Error {
  constructor(
    readonly status: ApiStatus,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Document') => new ApiError(404, 'not_found', `${what} not found.`);

export function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message }, ...extra };
}

export type { ContentfulStatusCode };
