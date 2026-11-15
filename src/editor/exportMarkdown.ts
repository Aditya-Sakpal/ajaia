import type { DocJSON } from '../../shared/types';

/** Loose view of a ProseMirror JSON node (StarterKit + Underline). */
interface PMNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
  content?: PMNode[];
}

const children = (n: PMNode): PMNode[] => (Array.isArray(n.content) ? n.content : []);

/** Plain text of a node and its descendants (used for unknown nodes). */
function textOf(n: PMNode): string {
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'hardBreak') return '\n';
  return children(n).map(textOf).join('');
}

/** Escapes characters that would otherwise be read as inline markdown. */
const escapeInline = (s: string) => s.replace(/([\\`*_[\]])/g, '\\$1');

/** Escapes a line start that would otherwise become a heading, quote, list item or rule. */
const escapeLineStart = (line: string) =>
  line.replace(/^(\s*)(#|>|[-+](?=\s|$))/, '$1\\$2').replace(/^(\s*\d+)([.)])(?=\s|$)/, '$1\\$2');

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

function renderText(n: PMNode): string {
  const raw = n.text ?? '';
  const marks = n.marks ?? [];
  const has = (type: string) => marks.some((m) => m.type === type);
  if (has('code')) {
    const link = marks.find((m) => m.type === 'link');
    const span = codeSpan(raw);
    return link ? `[${span}](${String(link.attrs?.href ?? '')})` : span;
  }
  // Keep surrounding whitespace outside the delimiters so `** bold**` doesn't break emphasis.
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw) ?? ['', '', raw, ''];
  if (!core) return raw;
  let out = escapeInline(core);
  // First mark becomes the outermost wrapper.
  for (const m of [...marks].reverse()) {
    switch (m.type) {
      case 'bold':
        out = `**${out}**`;
        break;
      case 'italic':
        out = `*${out}*`;
        break;
      case 'strike':
        out = `~~${out}~~`;
        break;
      case 'underline':
        out = `<u>${out}</u>`;
        break;
      // Pending suggestions keep their meaning in the export as HTML change tags.
      case 'suggestionInsert':
        out = `<ins>${out}</ins>`;
        break;
      case 'suggestionDelete':
        out = `<del>${out}</del>`;
        break;
      case 'link':
        out = `[${out}](${String(m.attrs?.href ?? '')})`;
        break;
    }
  }
  return `${lead}${out}${trail}`;
}

function renderInline(nodes: PMNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return renderText(n);
      if (n.type === 'hardBreak') return '\\\n';
      return escapeInline(textOf(n));
    })
    .join('');
}

const prefixLines = (text: string, first: string, rest: string) =>
  text
    .split('\n')
    .map((line, i) => (line === '' && i > 0 ? (rest.trimEnd() === rest ? rest : rest.trimEnd()) : (i === 0 ? first : rest) + line))
    .join('\n');

function renderList(n: PMNode, ordered: boolean): string {
  const start = Number(n.attrs?.start ?? 1);
  const first = Number.isFinite(start) ? start : 1;
  return children(n)
    .map((item, i) => {
      const marker = ordered ? `${first + i}. ` : '- ';
      const indent = ' '.repeat(marker.length);
      const parts = children(item).map((c) => ({ c, md: renderBlock(c) }));
      let body = '';
      parts.forEach(({ c, md }, j) => {
        if (j > 0) body += c.type === 'bulletList' || c.type === 'orderedList' ? '\n' : '\n\n';
        body += md;
      });
      return prefixLines(body, marker, indent).replace(/[ \t]+$/gm, '');
    })
    .join('\n');
}

function renderBlocks(nodes: PMNode[]): string {
  return nodes
    .map(renderBlock)
    .filter((s) => s !== '')
    .join('\n\n');
}

function renderBlock(n: PMNode): string {
  switch (n.type) {
    case 'paragraph':
      return renderInline(children(n)).split('\n').map(escapeLineStart).join('\n');
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1) || 1));
      const text = renderInline(children(n)).replace(/\\\n/g, ' ');
      return text ? `${'#'.repeat(level)} ${text}` : '';
    }
    case 'bulletList':
      return renderList(n, false);
    case 'orderedList':
      return renderList(n, true);
    case 'listItem':
      return renderBlocks(children(n));
    case 'blockquote': {
      const inner = renderBlocks(children(n));
      return inner ? inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n') : '';
    }
    case 'codeBlock': {
      const code = textOf(n).replace(/\n$/, '');
      const longest = Math.max(0, ...(code.match(/`{3,}/g) ?? []).map((m) => m.length));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      const lang = typeof n.attrs?.language === 'string' ? n.attrs.language : '';
      return `${fence}${lang}\n${code}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'hardBreak':
      return '';
    case 'text':
      return renderInline([n]);
    default: {
      const kids = children(n);
      // Unknown block whose children are known blocks: keep their structure; otherwise plain text.
      if (kids.length > 0 && kids.every((k) => k.type && KNOWN_BLOCKS.has(k.type))) return renderBlocks(kids);
      return escapeLineStart(escapeInline(textOf(n)));
    }
  }
}

const KNOWN_BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule']);

/** Serialises a TipTap/ProseMirror document to CommonMark-ish Markdown (GFM strikethrough). */
export function docToMarkdown(doc: DocJSON): string {
  const md = renderBlocks((doc.content ?? []) as PMNode[]);
  return md ? `${md}\n` : '';
}

/** Triggers a browser download of `text` as `filename`. */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A file-name-safe version of a document title (no extension). */
export function safeFilename(title: string): string {
  let name = title
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 120)
    .trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name = `${name}_`;
  return name || 'Untitled document';
}
