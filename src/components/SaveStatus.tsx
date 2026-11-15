import { CloudCheck, CloudOff, LoaderCircle } from 'lucide-react';
import type { SaveState } from '../editor/saveQueue';

/** Docs-style save indicator next to the title. Copy fixed by the plan's Global Constraints. */
export function SaveStatus({ state, onRetry }: { state: SaveState; onRetry(): void }) {
  return (
    <span data-save-state={state} className="contents">
      <Label state={state} onRetry={onRetry} />
    </span>
  );
}

function Label({ state, onRetry }: { state: SaveState; onRetry(): void }) {
  if (state === 'idle') {
    return (
      <span className="flex items-center gap-1.5 text-ink-3">
        <CloudCheck className="size-4" aria-hidden /> Saved
      </span>
    );
  }
  if (state === 'pending' || state === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-ink-3" aria-live="polite">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Saving…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-ink-3" aria-live="polite">
        <CloudCheck className="size-4" aria-hidden /> Saved
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onRetry}
      className="flex items-center gap-1.5 rounded px-1 font-medium text-danger hover:bg-danger-bg"
      aria-live="assertive"
    >
      <CloudOff className="size-4" aria-hidden /> Couldn&apos;t save — Retry
    </button>
  );
}
