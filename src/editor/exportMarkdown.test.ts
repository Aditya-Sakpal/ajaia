import { describe, expect, it } from 'vitest';
import type { DocJSON } from '../../shared/types';
import { docToMarkdown, safeFilename } from './exportMarkdown';

type N = Record<string, unknown>;
const doc = (...content: N[]): DocJSON => ({ type: 'doc', content });
const t = (text: string, marks?: N[]): N => (marks ? { type: 'text', text, marks } : { type: 'text', text });
const p = (...content: N[]): N => ({ type: 'paragraph', content });
const h = (level: number, text: string): N => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const li = (...content: N[]): N => ({ type: 'listItem', content });
const ul = (...items: N[]): N => ({ type: 'bulletList', content: items });
const ol = (start: number | undefined, ...items: N[]): N => ({ type: 'orderedList', attrs: start === undefined ? {} : { start }, content: items });

describe('docToMarkdown', () => {
  it('returns an empty string for an empty document', () => {
    expect(docToMarkdown({ type: 'doc' })).toBe('');
    expect(docToMarkdown(doc({ type: 'paragraph' }))).toBe('');
  });

  it('separates blocks with a blank line and ends with a newline', () => {
    expect(docToMarkdown(doc(p(t('One')), p(t('Two'))))).toBe('One\n\nTwo\n');
  });

  it('renders headings by level', () => {
    expect(docToMarkdown(doc(h(1, 'Title'), h(2, 'Sub'), h(3, 'Third'), h(4, 'Fourth')))).toBe(
      '# Title\n\n## Sub\n\n### Third\n\n#### Fourth\n',
    );
  });

  it('renders inline marks', () => {
    const md = docToMarkdown(
      doc(
        p(
          t('b', [{ type: 'bold' }]),
          t(' '),
          t('i', [{ type: 'italic' }]),
          t(' '),
          t('s', [{ type: 'strike' }]),
          t(' '),
          t('c', [{ type: 'code' }]),
          t(' '),
          t('u', [{ type: 'underline' }]),
          t(' '),
          t('link', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
        ),
      ),
    );
    expect(md).toBe('**b** *i* ~~s~~ `c` <u>u</u> [link](https://example.com)\n');
  });

  it('combines marks on the same text', () => {
    expect(docToMarkdown(doc(p(t('x', [{ type: 'bold' }, { type: 'italic' }]))))).toBe('***x***\n');
  });

  it('does not escape text inside inline code', () => {
    expect(docToMarkdown(doc(p(t('a*b_c', [{ type: 'code' }]))))).toBe('`a*b_c`\n');
  });

  it('escapes markdown-significant characters in plain text', () => {
    expect(docToMarkdown(doc(p(t('# not a heading'))))).toBe('\\# not a heading\n');
    expect(docToMarkdown(doc(p(t('2*3 = 6 and a_b and `x`'))))).toBe('2\\*3 = 6 and a\\_b and \\`x\\`\n');
    expect(docToMarkdown(doc(p(t('- not a list'))))).toBe('\\- not a list\n');
    expect(docToMarkdown(doc(p(t('1. not a list'))))).toBe('1\\. not a list\n');
    expect(docToMarkdown(doc(p(t('> not a quote'))))).toBe('\\> not a quote\n');
  });

  it('renders bullet lists', () => {
    expect(docToMarkdown(doc(ul(li(p(t('a'))), li(p(t('b'))))))).toBe('- a\n- b\n');
  });

  it('renders ordered lists respecting start', () => {
    expect(docToMarkdown(doc(ol(undefined, li(p(t('a'))), li(p(t('b'))))))).toBe('1. a\n2. b\n');
    expect(docToMarkdown(doc(ol(3, li(p(t('c'))), li(p(t('d'))))))).toBe('3. c\n4. d\n');
  });

  it('indents nested lists', () => {
    const md = docToMarkdown(doc(ul(li(p(t('a')), ol(1, li(p(t('a1'))), li(p(t('a2'))))), li(p(t('b'))))));
    expect(md).toBe('- a\n  1. a1\n  2. a2\n- b\n');
  });

  it('renders blockquotes, including multiple paragraphs', () => {
    expect(docToMarkdown(doc({ type: 'blockquote', content: [p(t('one')), p(t('two'))] }))).toBe('> one\n>\n> two\n');
  });

  it('renders code blocks with language fences and no escaping', () => {
    const md = docToMarkdown(doc({ type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1 * 2;\n# x')] }));
    expect(md).toBe('```ts\nconst a = 1 * 2;\n# x\n```\n');
    expect(docToMarkdown(doc({ type: 'codeBlock', attrs: { language: null }, content: [t('x')] }))).toBe('```\nx\n```\n');
  });

  it('renders horizontal rules and hard breaks', () => {
    expect(docToMarkdown(doc(p(t('a')), { type: 'horizontalRule' }, p(t('b'), { type: 'hardBreak' }, t('c'))))).toBe(
      'a\n\n---\n\nb\\\nc\n',
    );
  });

  it('renders the text of unknown nodes', () => {
    expect(docToMarkdown(doc({ type: 'mystery', content: [{ type: 'whatever', content: [t('inner')] }] }))).toBe('inner\n');
  });
});

describe('safeFilename', () => {
  it('strips characters invalid on Windows and macOS', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });
  it('trims whitespace and trailing dots', () => {
    expect(safeFilename('  Report.  ')).toBe('Report');
  });
  it('falls back when nothing usable remains', () => {
    expect(safeFilename('')).toBe('Untitled document');
    expect(safeFilename('  ///  ')).toBe('Untitled document');
  });
});
