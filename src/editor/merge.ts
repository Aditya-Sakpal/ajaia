import { diff3Merge } from 'node-diff3';
import type { DocJSON } from '../../shared/types';

/** JSON with sorted keys: Postgres jsonb and the editor order object keys differently. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const blocks = (d: DocJSON) => (d.content ?? []).map(canonical);

/**
 * Three-way merge at top-level block granularity (paragraphs, headings, lists).
 * `base` is the version both sides started from. Returns null when both sides
 * changed the same block differently - a real conflict the user must resolve.
 */
export function mergeDocs(base: DocJSON, local: DocJSON, remote: DocJSON): DocJSON | null {
  const b = blocks(base);
  const l = blocks(local);
  const r = blocks(remote);
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (same(l, b)) return remote;
  if (same(r, b)) return local;

  const merged: string[] = [];
  for (const region of diff3Merge(l, b, r)) {
    if (region.ok) merged.push(...region.ok);
    else if (region.conflict && same(region.conflict.a, region.conflict.b)) merged.push(...region.conflict.a);
    else return null;
  }
  return { ...remote, type: 'doc', content: merged.map((s) => JSON.parse(s) as unknown) };
}
