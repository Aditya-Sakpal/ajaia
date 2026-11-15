import { ApiError } from './errors';

/** Fails a stuck database call with a 503 instead of letting the request hang. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ApiError(503, 'db_unavailable', 'The database is not responding. Please try again.')),
      ms,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
