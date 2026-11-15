import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import JSZip from 'jszip';

export const USERS = {
  alice: { email: 'alice@ajaia.test', name: 'Alice Chen' },
  bob: { email: 'bob@ajaia.test', name: 'Bob Patel' },
  carol: { email: 'carol@ajaia.test', name: 'Carol Ruiz' },
} as const;
export type Who = keyof typeof USERS;

/** Signs in through the real account chooser UI. */
export async function signInUI(page: Page, who: Who) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(USERS[who].name) }).click();
  await expect(page.getByRole('heading', { name: /My documents/ })).toBeVisible();
}

/** New isolated browser context signed in as `who` (via API, fast). */
export async function asUser(browser: Browser, who: Who) {
  const context = await browser.newContext();
  const res = await context.request.post('/api/auth/login', { data: { email: USERS[who].email } });
  expect(res.ok()).toBeTruthy();
  const page = await context.newPage();
  return { context, page, request: context.request };
}

export async function createDoc(request: APIRequestContext, title: string, text = 'Hello from e2e') {
  const res = await request.post('/api/documents', {
    data: { title, content: { type: 'doc', content: [text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }] } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; version: number; title: string };
}

export async function deleteDoc(request: APIRequestContext, id: string) {
  await request.delete(`/api/documents/${id}`);
}

export async function share(request: APIRequestContext, id: string, who: Who, role: 'editor' | 'commenter' | 'viewer') {
  const res = await request.put(`/api/documents/${id}/shares`, { data: { email: USERS[who].email, role } });
  expect(res.ok()).toBeTruthy();
}

/** Waits until every queued change has been written (state 'saved' only happens with nothing pending). */
export async function waitSaved(page: Page) {
  await expect(page.locator('[data-save-state]')).toHaveAttribute('data-save-state', 'saved', { timeout: 15_000 });
}

export async function makeDocx(paragraphs: { text: string; style?: 'Heading1'; bold?: boolean; list?: boolean }[]) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const body = paragraphs
    .map((p) => {
      const pPr = p.style ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>` : '';
      const rPr = p.bold ? '<w:rPr><w:b/></w:rPr>' : '';
      return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${p.text}</w:t></w:r></w:p>`;
    })
    .join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}
