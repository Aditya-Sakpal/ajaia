import type { ApiErrorBody } from '../../shared/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: ApiErrorBody | null,
  ) {
    super(message);
  }
}

/** keepalive lets a save finish while the tab is closing; browsers cap keepalive bodies at 64 KiB of bytes. */
const KEEPALIVE_MAX_BYTES = 60_000;
export const canUseKeepalive = (payload: string) => new TextEncoder().encode(payload).length < KEEPALIVE_MAX_BYTES;

/** Fired when the server says the session is gone, so the auth layer can send the user to sign-in once. */
export const UNAUTHENTICATED_EVENT = 'ajaia:unauthenticated';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: payload !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: payload,
      keepalive: method !== 'GET' && payload !== undefined && canUseKeepalive(payload),
    });
  } catch {
    throw new ApiError(0, 'network_error', "Can't reach the server. Check your connection.", null);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as unknown;
  if (res.status === 401 && path !== '/me' && path !== '/auth/login') {
    window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
  }
  if (!res.ok) {
    const errBody = json as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      errBody?.error?.code ?? 'http_error',
      errBody?.error?.message ?? `Request failed (${res.status}).`,
      errBody,
    );
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: (path: string) => request<void>('DELETE', path),
};
