import type { DocJSON } from '../../shared/types';

export interface Snapshot {
  title: string;
  content: DocJSON;
}

/** Key-order-independent deep equality for JSON values. */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => jsonEqual(v, bb[i]));
  }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * True when the server's current document is exactly what this tab just tried to save —
 * i.e. an earlier save landed but its reply was lost, so a 409 is not a real conflict.
 */
export function isSameSnapshot(sent: Snapshot, server: Snapshot | undefined | null): boolean {
  if (!server) return false;
  return sent.title === server.title && jsonEqual(sent.content, server.content);
}
