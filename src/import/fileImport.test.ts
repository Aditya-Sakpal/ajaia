// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_BYTES, TEXT_IMPORT_MAX_BYTES, fileToHtml, titleFromFilename, validateImportFile } from './fileImport';

const file = (content: BlobPart, name: string, type = '') => new File([content], name, { type });

describe('validateImportFile', () => {
  it('rejects unsupported extensions', () => {
    expect(validateImportFile(file('x', 'report.pdf'))).toBe('Only .txt, .md and .docx files are supported.');
    expect(validateImportFile(file('x', 'noextension'))).toBe('Only .txt, .md and .docx files are supported.');
  });
  it('limits .txt and .md to 1 MB (the converted document must fit the 1 MB save limit)', () => {
    expect(validateImportFile(file(new Uint8Array(TEXT_IMPORT_MAX_BYTES + 1), 'big.txt'))).toBe('File is larger than 1 MB.');
    expect(validateImportFile(file(new Uint8Array(TEXT_IMPORT_MAX_BYTES + 1), 'big.md'))).toBe('File is larger than 1 MB.');
    expect(validateImportFile(file(new Uint8Array(TEXT_IMPORT_MAX_BYTES), 'ok.txt'))).toBeNull();
  });
  it('allows .docx up to 2 MB (it is compressed)', () => {
    expect(validateImportFile(file(new Uint8Array(TEXT_IMPORT_MAX_BYTES + 1), 'mid.docx'))).toBeNull();
    expect(validateImportFile(file(new Uint8Array(IMPORT_MAX_BYTES + 1), 'big.docx'))).toBe('File is larger than 2 MB.');
  });
  it('rejects empty files', () => {
    expect(validateImportFile(file('', 'empty.txt'))).toBe('This file is empty.');
  });
  it('accepts supported types case-insensitively', () => {
    expect(validateImportFile(file('# hi', 'notes.MD'))).toBeNull();
    expect(validateImportFile(file('hi', 'a.txt'))).toBeNull();
    expect(validateImportFile(file('PK', 'a.docx'))).toBeNull();
  });
});

describe('fileToHtml', () => {
  it('.txt → escaped paragraphs split on blank lines, single newlines kept as breaks', async () => {
    expect(await fileToHtml(file('a < b\n\nsecond', 'a.txt'))).toBe('<p>a &lt; b</p><p>second</p>');
    expect(await fileToHtml(file('line1\nline2', 'a.txt'))).toBe('<p>line1<br>line2</p>');
  });
  it('.txt handles CRLF line endings', async () => {
    expect(await fileToHtml(file('one\r\n\r\ntwo', 'a.txt'))).toBe('<p>one</p><p>two</p>');
  });
  it('.md → headings and lists', async () => {
    const html = await fileToHtml(file('# Title\n\n- one\n- two', 'a.md'));
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<li>one</li>');
  });
  it('.md strips scripts and inline event handlers', async () => {
    const html = await fileToHtml(file('hello\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">', 'a.md'));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });
  it('corrupt .docx → friendly error', async () => {
    await expect(fileToHtml(file('definitely not a zip', 'broken.docx'))).rejects.toThrow("Couldn't read this .docx file.");
  });
});

describe('titleFromFilename', () => {
  it('drops only the final extension', () => {
    expect(titleFromFilename('Q3 plan.final.docx')).toBe('Q3 plan.final');
  });
  it('falls back for empty names and caps length at 200', () => {
    expect(titleFromFilename('.md')).toBe('Imported document');
    expect(titleFromFilename(`${'x'.repeat(250)}.txt`)).toHaveLength(200);
  });
});
