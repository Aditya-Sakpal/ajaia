import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { withTimeout } from './timeout';

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves with the value when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 8000)).resolves.toBe(42);
  });

  it('rejects with a 503 ApiError when the work hangs', async () => {
    const hung = new Promise<never>(() => {});
    const result = withTimeout(hung, 8000);
    const assertion = expect(result).rejects.toMatchObject({ status: 503, code: 'db_unavailable' });
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    await expect(result).rejects.toBeInstanceOf(ApiError);
  });

  it('passes through the original error', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 8000)).rejects.toThrow('boom');
  });
});
