import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import type { AppEnv } from '../app';
import { ApiError } from './errors';

export const SESSION_COOKIE = 'ajaia_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret(c: Context<AppEnv>): string {
  const s = c.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not configured');
  return s;
}

const isSecure = (c: Context) => new URL(c.req.url).protocol === 'https:';

export async function startSession(c: Context<AppEnv>, userId: string) {
  await setSignedCookie(c, SESSION_COOKIE, userId, secret(c), {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecure(c),
    maxAge: MAX_AGE,
  });
}

export function endSession(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: isSecure(c) });
}

/** Requires a valid signed session for an existing user; sets c.var.user. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = await getSignedCookie(c, secret(c), SESSION_COOKIE);
  const user = userId ? await c.var.repo.getUserById(userId) : null;
  if (!user) {
    if (userId !== undefined) endSession(c);
    throw new ApiError(401, 'unauthenticated', 'Please sign in.');
  }
  c.set('user', user);
  await next();
};
