import { describe, expect, it } from 'vitest';
import { isSameSnapshot } from './snapshot';

const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

describe('isSameSnapshot', () => {
  it('is true when title and content match, regardless of key order', () => {
    const server = { title: 'A', content: { content: [{ content: [{ text: 'hi', type: 'text' }], type: 'paragraph' }], type: 'doc' as const } };
    expect(isSameSnapshot({ title: 'A', content: doc('hi') }, server)).toBe(true);
  });
  it('is false when content differs', () => {
    expect(isSameSnapshot({ title: 'A', content: doc('hi') }, { title: 'A', content: doc('hello') })).toBe(false);
  });
  it('is false when title differs', () => {
    expect(isSameSnapshot({ title: 'A', content: doc('hi') }, { title: 'B', content: doc('hi') })).toBe(false);
  });
  it('is false when the server copy is missing', () => {
    expect(isSameSnapshot({ title: 'A', content: doc('hi') }, undefined)).toBe(false);
  });
});
