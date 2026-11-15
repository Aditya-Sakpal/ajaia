export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface SaveQueue<T> {
  readonly state: SaveState;
  readonly lastError: unknown;
  /** Queue a full snapshot; debounced. Newer snapshots replace older unsent ones. */
  schedule(payload: T): void;
  /** Save any pending snapshot now and resolve once nothing is pending or in flight (or saving failed). */
  flush(): Promise<void>;
  /** Re-send the last snapshot after an error. */
  retry(): void;
  /** Stop sending (e.g. after a version conflict or lost access). Pending changes are kept. */
  pause(): void;
  hasUnsavedChanges(): boolean;
  subscribe(fn: (state: SaveState) => void): () => void;
  dispose(): void;
}

/**
 * Debounced autosave that never has two saves in flight: a change made while a save is running
 * is sent right after it finishes, so version numbers advance in order and never false-conflict.
 */
export function createSaveQueue<T>(save: (payload: T) => Promise<void>, delayMs = 1000): SaveQueue<T> {
  let pending: { value: T } | null = null;
  let last: { value: T } | null = null;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  let state: SaveState = 'idle';
  let lastError: unknown = null;
  const listeners = new Set<(s: SaveState) => void>();

  const setState = (s: SaveState) => {
    if (s === state) return;
    state = s;
    listeners.forEach((fn) => fn(s));
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  function run() {
    clearTimer();
    if (paused || inFlight || !pending) return;
    const payload = pending.value;
    pending = null;
    setState('saving');
    inFlight = save(payload).then(
      () => {
        inFlight = null;
        lastError = null;
        if (pending && !paused) run();
        else setState(pending ? 'pending' : 'saved');
      },
      (err: unknown) => {
        inFlight = null;
        lastError = err;
        pending ??= { value: payload }; // keep the unsaved snapshot
        setState('error');
      },
    );
  }

  return {
    get state() {
      return state;
    },
    get lastError() {
      return lastError;
    },
    schedule(payload) {
      pending = { value: payload };
      last = pending;
      if (paused) return;
      if (!inFlight) setState('pending');
      clearTimer();
      timer = setTimeout(run, delayMs);
    },
    async flush() {
      clearTimer();
      while (!paused) {
        if (!inFlight && pending && state !== 'error') run();
        if (!inFlight) break;
        await inFlight;
      }
    },
    retry() {
      if (paused) return;
      pending ??= last;
      run();
    },
    pause() {
      paused = true;
      clearTimer();
    },
    hasUnsavedChanges: () => pending !== null || inFlight !== null,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      clearTimer();
      listeners.clear();
    },
  };
}
