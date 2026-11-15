import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { editorExtensions } from './extensions';
import { isSuggesting, listSuggestions, resolveSuggestions, setSuggestingTr, suggestionPlugin } from './suggestions';

const schema = getSchema(editorExtensions);
const alice = { id: 'u-alice', name: 'Alice' };

function make(text: string, on = true) {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, text ? [schema.text(text)] : [])]);
  let state = EditorState.create({ schema, doc, plugins: [suggestionPlugin({ user: alice, enabled: on })] });
  // cursor at end of the paragraph
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + text.length)));
  return state;
}

const text = (s: EditorState) => s.doc.textContent;
const kinds = (s: EditorState) => listSuggestions(s.doc).map((g) => `${g.type}:${g.text}`);

describe('suggestion mode', () => {
  it('typing marks the new text as a suggested insert', () => {
    let s = make('Hello');
    s = s.apply(s.tr.insertText(' world', 6));
    expect(text(s)).toBe('Hello world');
    const [g] = listSuggestions(s.doc);
    expect(g).toMatchObject({ type: 'insert', text: ' world', authorName: 'Alice', author: 'u-alice' });
  });

  it('typing char by char groups into one suggestion', () => {
    let s = make('Hi');
    for (const ch of 'abc') s = s.apply(s.tr.insertText(ch, s.selection.from));
    expect(kinds(s)).toEqual(['insert:abc']);
  });

  it('backspace keeps the text and marks it deleted; cursor moves before it', () => {
    let s = make('Hello');
    s = s.apply(s.tr.delete(5, 6)); // backspace the "o"
    expect(text(s)).toBe('Hello');
    expect(kinds(s)).toEqual(['delete:o']);
    expect(s.selection.from).toBe(5);
    s = s.apply(s.tr.delete(4, 5)); // backspace again ("l")
    expect(kinds(s)).toEqual(['delete:lo']);
  });

  it('replacing a selection shows the old text deleted and the new text inserted', () => {
    let s = make('cat');
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 1, 4)));
    s = s.apply(s.tr.insertText('dog'));
    expect(text(s)).toBe('catdog');
    expect(kinds(s)).toEqual(['delete:cat', 'insert:dog']);
  });

  it('deleting your own suggested insert really removes it', () => {
    let s = make('Hi');
    s = s.apply(s.tr.insertText('!', 3));
    s = s.apply(s.tr.delete(3, 4));
    expect(text(s)).toBe('Hi');
    expect(listSuggestions(s.doc)).toEqual([]);
  });

  it('accept: insert keeps text, delete removes text', () => {
    let s = make('Hello');
    s = s.apply(s.tr.delete(1, 2)); // delete "H"
    s = s.apply(s.tr.insertText('!', 6));
    const tr = s.tr;
    expect(resolveSuggestions(tr, true)).toBe(true);
    s = s.apply(tr);
    expect(text(s)).toBe('ello!');
    expect(listSuggestions(s.doc)).toEqual([]);
  });

  it('reject: insert removes text, delete restores text', () => {
    let s = make('Hello');
    s = s.apply(s.tr.delete(1, 2));
    s = s.apply(s.tr.insertText('!', 6));
    const tr = s.tr;
    resolveSuggestions(tr, false);
    s = s.apply(tr);
    expect(text(s)).toBe('Hello');
    expect(listSuggestions(s.doc)).toEqual([]);
  });

  it('accept/reject can target one range only', () => {
    let s = make('Hello');
    s = s.apply(s.tr.delete(1, 2)); // delete:H at 1..2
    s = s.apply(s.tr.insertText('!', 6)); // insert:! at 6..7
    const tr = s.tr;
    resolveSuggestions(tr, true, { from: 6, to: 7 });
    s = s.apply(tr);
    expect(text(s)).toBe('Hello!');
    expect(kinds(s)).toEqual(['delete:H']);
  });

  it('mode off: edits apply normally, and it can be toggled', () => {
    let s = make('Hello', false);
    expect(isSuggesting(s)).toBe(false);
    s = s.apply(s.tr.delete(5, 6));
    expect(text(s)).toBe('Hell');
    s = s.apply(setSuggestingTr(s.tr, true));
    expect(isSuggesting(s)).toBe(true);
    s = s.apply(s.tr.insertText('o', 5));
    expect(kinds(s)).toEqual(['insert:o']);
  });

  it('skips transactions flagged as remote / non-history', () => {
    let s = make('Hello');
    s = s.apply(s.tr.insertText('X', 1).setMeta('preventUpdate', true));
    s = s.apply(s.tr.insertText('Y', 1).setMeta('addToHistory', false));
    expect(text(s)).toBe('YXHello');
    expect(listSuggestions(s.doc)).toEqual([]);
  });
});
