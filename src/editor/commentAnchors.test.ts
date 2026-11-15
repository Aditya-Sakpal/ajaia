import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { editorExtensions } from './extensions';
import { commentAnchorsKey, commentAnchorsPlugin, findQuoteRange, getCommentAnchors } from './commentAnchors';

const schema = getSchema(editorExtensions);

type Inline = string | { text: string; bold?: boolean };
const para = (...parts: Inline[]) => ({
  type: 'paragraph',
  content: parts.map((p) =>
    typeof p === 'string' ? { type: 'text', text: p } : { type: 'text', text: p.text, marks: p.bold ? [{ type: 'bold' }] : [] },
  ),
});
const docOf = (...blocks: ReturnType<typeof para>[]) => schema.nodeFromJSON({ type: 'doc', content: blocks });
const textAt = (d: ReturnType<typeof docOf>, r: { from: number; to: number } | null) => (r ? d.textBetween(r.from, r.to, ' ') : null);

describe('findQuoteRange', () => {
  it('finds a quote inside a single text node', () => {
    const d = docOf(para('Hello brave new world'));
    const r = findQuoteRange(d, 'brave new');
    expect(textAt(d, r)).toBe('brave new');
  });

  it('finds a quote spanning several text nodes with different marks', () => {
    const d = docOf(para('Hello ', { text: 'brave', bold: true }, ' new world'));
    const r = findQuoteRange(d, 'lo brave ne');
    expect(textAt(d, r)).toBe('lo brave ne');
  });

  it('picks the occurrence nearest to the hint', () => {
    const d = docOf(para('cat one'), para('cat two'), para('cat three'));
    const first = findQuoteRange(d, 'cat');
    expect(first?.from).toBe(1);
    const nearLast = findQuoteRange(d, 'cat', d.content.size - 3);
    expect(nearLast).not.toBeNull();
    expect(nearLast!.from).toBeGreaterThan(first!.from + 10);
    expect(textAt(d, nearLast)).toBe('cat');
  });

  it('matches a quote that spans blocks (selection text joined with a space)', () => {
    const d = docOf(para('first block end'), para('start of second'));
    const r = findQuoteRange(d, 'end start');
    expect(textAt(d, r)).toBe('end start');
  });

  it('returns null when the quote is missing or empty', () => {
    const d = docOf(para('Hello world'));
    expect(findQuoteRange(d, 'goodbye')).toBeNull();
    expect(findQuoteRange(d, '   ')).toBeNull();
  });
});

describe('comment anchors plugin', () => {
  const setup = () => {
    const doc = docOf(para('Intro text here.'), para('The quick brown fox.'));
    let state = EditorState.create({ schema, doc, plugins: [commentAnchorsPlugin()] });
    state = state.apply(state.tr.setMeta(commentAnchorsKey, { type: 'set', comments: [{ id: 'c1', quote: 'quick brown' }] }));
    return state;
  };

  it('anchors comments to their quoted text', () => {
    const state = setup();
    expect(textAt(state.doc, getCommentAnchors(state).get('c1') ?? null)).toBe('quick brown');
  });

  it('moves the anchor when text is inserted before it', () => {
    let state = setup();
    const before = getCommentAnchors(state).get('c1')!;
    state = state.apply(state.tr.insertText('Extra words. ', 1));
    const after = getCommentAnchors(state).get('c1')!;
    expect(after.from).toBe(before.from + 'Extra words. '.length);
    expect(textAt(state.doc, after)).toBe('quick brown');
  });

  it('orphans the comment when the quoted text is edited away', () => {
    let state = setup();
    const r = getCommentAnchors(state).get('c1')!;
    state = state.apply(state.tr.insertText('slow', r.from, r.from + 'quick'.length));
    expect(getCommentAnchors(state).has('c1')).toBe(false);
  });

  it('re-finds the quote if it reappears elsewhere', () => {
    let state = setup();
    const r = getCommentAnchors(state).get('c1')!;
    state = state.apply(state.tr.delete(r.from, r.to));
    expect(getCommentAnchors(state).has('c1')).toBe(false);
    state = state.apply(state.tr.insertText(' quick brown', 2));
    expect(textAt(state.doc, getCommentAnchors(state).get('c1') ?? null)).toBe('quick brown');
  });

  it('tracks the active comment', () => {
    let state = setup();
    state = state.apply(state.tr.setMeta(commentAnchorsKey, { type: 'active', id: 'c1' }));
    expect(commentAnchorsKey.getState(state)?.activeId).toBe('c1');
  });
});
