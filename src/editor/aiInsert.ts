import { marked } from 'marked';
import { sanitizeHtml } from '../import/fileImport';

/** AI replies are Markdown; convert and strip anything active before it reaches the editor. */
export function markdownToHtml(markdown: string): string {
  const cleaned = markdown.replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  return sanitizeHtml(marked.parse(cleaned, { async: false, gfm: true }) as string);
}
