import { TITLE_MAX } from '../../shared/types';

export const IMPORT_ACCEPT = '.txt,.md,.docx';
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_HELP = '.txt, .md, .docx · up to 2 MB';

type Kind = 'txt' | 'md' | 'docx';

function kindOf(name: string): Kind | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === 'txt' || ext === 'md' || ext === 'docx') return ext;
  if (ext === 'markdown') return 'md';
  return null;
}

/** Returns a user-facing error message, or null when the file can be imported. */
export function validateImportFile(file: File): string | null {
  if (!kindOf(file.name)) return 'Only .txt, .md and .docx files are supported.';
  if (file.size > IMPORT_MAX_BYTES) return 'File is larger than 2 MB.';
  if (file.size === 0) return 'This file is empty.';
  return null;
}

export function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim();
  return (base || 'Imported document').slice(0, TITLE_MAX);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
}

const BLOCKED_TAGS = 'script,style,iframe,object,embed,link,meta,form,input,button,textarea,select';

/** Removes active content. TipTap's schema drops unknown nodes later; this is defence in depth. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll(BLOCKED_TAGS).forEach((el) => el.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const isScriptUrl = (name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value);
      if (name.startsWith('on') || isScriptUrl) el.removeAttribute(attr.name);
    }
  });
  return doc.body.innerHTML;
}

/** Converts a validated import file to HTML for TipTap's generateJSON. */
export async function fileToHtml(file: File): Promise<string> {
  const kind = kindOf(file.name);
  if (kind === 'txt') return textToHtml(await file.text());
  if (kind === 'md') {
    const { marked } = await import('marked');
    return sanitizeHtml(marked.parse(await file.text(), { async: false, gfm: true }) as string);
  }
  if (kind === 'docx') {
    try {
      const mammoth = await import('mammoth');
      const { value } = await (mammoth.default ?? mammoth).convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      return sanitizeHtml(value);
    } catch {
      throw new Error("Couldn't read this .docx file. It may be corrupted or not a Word document.");
    }
  }
  throw new Error('Only .txt, .md and .docx files are supported.');
}
