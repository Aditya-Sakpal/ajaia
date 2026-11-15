import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveQueue, type SaveState } from './saveQueue';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('createSaveQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces rapid schedules into one save with the last payload', async () => {
    const save = vi.fn(async (_p: string) => {});
    const q = createSaveQueue(save, 1000);
    q.schedule('a');
    await vi.advanceTimersByTimeAsync(400);
    q.schedule('b');
    await vi.advanceTimersByTimeAsync(400);
    q.schedule('c');
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('c');
  });

  it('never runs two saves at once; a change during a save is sent after it completes', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const gates: ReturnType<typeof deferred>[] = [];
    const save = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const g = deferred();
      gates.push(g);
      await g.promise;
      inFlight--;
    });
    const q = createSaveQueue(save, 1000);
    q.schedule('A');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    q.schedule('B');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1); // B waits for A
    gates[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('B');
    gates[1]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(maxInFlight).toBe(1);
  });

  it('reports state transitions saving → saved', async () => {
    const states: SaveState[] = [];
    const q = createSaveQueue(async () => {}, 1000);
    q.subscribe((s) => states.push(s));
    q.schedule('x');
    expect(q.state).toBe('pending');
    await vi.advanceTimersByTimeAsync(1000);
    expect(states).toEqual(['pending', 'saving', 'saved']);
  });

  it('on failure goes to error; retry re-sends the last payload', async () => {
    let fail = true;
    const save = vi.fn(async () => {
      if (fail) throw new Error('boom');
    });
    const q = createSaveQueue(save, 1000);
    q.schedule('p1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(q.state).toBe('error');
    expect(q.lastError).toBeInstanceOf(Error);
    fail = false;
    q.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenLastCalledWith('p1');
    expect(q.state).toBe('saved');
  });

  it('flush() saves a pending change immediately and resolves after it completes', async () => {
    const save = vi.fn(async () => {});
    const q = createSaveQueue(save, 1000);
    q.schedule('now');
    await q.flush();
    expect(save).toHaveBeenCalledWith('now');
    expect(q.state).toBe('saved');
  });

  it('flush() waits for an in-flight save and any change queued behind it', async () => {
    const gate = deferred();
    const save = vi.fn(async (p: string) => {
      if (p === 'first') await gate.promise;
    });
    const q = createSaveQueue(save, 1000);
    q.schedule('first');
    await vi.advanceTimersByTimeAsync(1000);
    q.schedule('second');
    let done = false;
    const flushed = q.flush().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    gate.resolve();
    await flushed;
    expect(save).toHaveBeenLastCalledWith('second');
    expect(q.hasUnsavedChanges()).toBe(false);
  });

  it('pause() stops further saves (used after a conflict) and keeps the payload', async () => {
    const save = vi.fn(async () => {});
    const q = createSaveQueue(save, 1000);
    q.pause();
    q.schedule('x');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    expect(q.hasUnsavedChanges()).toBe(true);
  });
});
