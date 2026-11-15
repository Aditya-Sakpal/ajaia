import { describe, expect, it } from 'vitest';
import { mergeDocs } from './merge';
import type { DocJSON } from '../../shared/types';

const p = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const doc = (...ps: string[]): DocJSON => ({ type: 'doc', content: ps.map(p) });

describe('mergeDocs (block-level three-way merge)', () => {
  it('two people deleting different paragraphs keeps both deletions', () => {
    const base = doc('A', 'B', 'C', 'D');
    const bob = doc('A', 'C', 'D'); // Bob removed B (saved first)
    const alice = doc('A', 'B', 'C'); // Alice removed D
    expect(mergeDocs(base, alice, bob)).toEqual(doc('A', 'C'));
  });

  it('edits to different paragraphs combine', () => {
    const base = doc('A', 'B', 'C');
    expect(mergeDocs(base, doc('A!', 'B', 'C'), doc('A', 'B', 'C!'))).toEqual(doc('A!', 'B', 'C!'));
  });

  it('returns local when remote did not change, and remote when local did not change', () => {
    const base = doc('A');
    expect(mergeDocs(base, doc('A', 'X'), base)).toEqual(doc('A', 'X'));
    expect(mergeDocs(base, base, doc('Y'))).toEqual(doc('Y'));
  });

  it('identical changes on both sides are not a conflict', () => {
    const base = doc('A', 'B');
    expect(mergeDocs(base, doc('A', 'B2'), doc('A', 'B2'))).toEqual(doc('A', 'B2'));
  });

  it('different edits to the same paragraph are a real conflict (null)', () => {
    const base = doc('A', 'B');
    expect(mergeDocs(base, doc('A', 'B local'), doc('A', 'B remote'))).toBeNull();
  });
});

describe('mergeDocs key order', () => {
  // Postgres jsonb returns object keys in its own order; the editor uses another.
  const pg = (t: string) => ({ content: [{ text: t, type: 'text' }], type: 'paragraph' });
  it('treats blocks with different JSON key order as equal', () => {
    const base: DocJSON = { type: 'doc', content: [pg('A'), pg('B'), pg('C')] };
    const local = doc('B', 'C'); // removed A, editor key order
    const remote: DocJSON = { type: 'doc', content: [pg('A'), pg('B'), pg('C'), pg('D')] };
    expect(mergeDocs(base, local, remote)).toEqual(doc('B', 'C', 'D'));
  });
});
