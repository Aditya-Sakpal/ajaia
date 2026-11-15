import { diffIndices } from 'node-diff3';
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

interface SideChanges {
  deleted: Set<number>;
  /** Blocks inserted before base index i (i = base.length means at the end), with the base range they replaced. */
  inserted: Map<number, { blocks: string[]; replaced: [number, number] }>;
}

function changes(base: string[], side: string[]): SideChanges {
  const deleted = new Set<number>();
  const inserted: SideChanges['inserted'] = new Map();
  for (const h of diffIndices(base, side)) {
    const [start, len] = h.buffer1;
    for (let k = start; k < start + len; k++) deleted.add(k);
    if (h.buffer2Content.length) inserted.set(start, { blocks: h.buffer2Content, replaced: [start, len] });
  }
  return { deleted, inserted };
}

const overlaps = (a: [number, number], b: [number, number]) =>
  a[1] > 0 && b[1] > 0 && a[0] < b[0] + b[1] && b[0] < a[0] + a[1];

/**
 * Three-way merge at top-level block granularity (paragraphs, headings, lists).
 * Each side's changes against `base` are applied block by block, so deletions and edits of
 * different blocks - even neighbouring ones - combine. Returns null only when both sides
 * rewrote the same block differently: a real conflict a person has to resolve.
 */
export function mergeDocs(base: DocJSON, local: DocJSON, remote: DocJSON): DocJSON | null {
  const b = blocks(base);
  const L = changes(b, blocks(local));
  const R = changes(b, blocks(remote));
  const merged: string[] = [];
  for (let i = 0; i <= b.length; i++) {
    const li = L.inserted.get(i);
    const ri = R.inserted.get(i);
    if (li && ri) {
      const same = li.blocks.length === ri.blocks.length && li.blocks.every((v, k) => v === ri.blocks[k]);
      if (same) merged.push(...li.blocks);
      else if (overlaps(li.replaced, ri.replaced)) return null;
      else merged.push(...ri.blocks, ...li.blocks);
    } else if (li) merged.push(...li.blocks);
    else if (ri) merged.push(...ri.blocks);
    if (i < b.length && !L.deleted.has(i) && !R.deleted.has(i)) merged.push(b[i]!);
  }
  return { ...remote, type: 'doc', content: merged.map((x) => JSON.parse(x) as unknown) };
}
