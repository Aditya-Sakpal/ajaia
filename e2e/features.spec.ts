import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { asUser, deleteDoc, share, waitSaved } from './helpers';

const stamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

async function createRichDoc(request: APIRequestContext, title: string) {
  const res = await request.post('/api/documents', {
    data: {
      title,
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Quarterly plan' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Ship the ' },
              { type: 'text', marks: [{ type: 'bold' }], text: 'pilot' },
              { type: 'text', text: ' by Friday.' },
            ],
          },
        ],
      },
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

async function createTextDoc(request: APIRequestContext, title: string, text: string) {
  const res = await request.post('/api/documents', {
    data: { title, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

async function openFileMenuItem(page: Page, item: RegExp) {
  await page.getByRole('menubar', { name: 'Document menu' }).getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: item }).click();
}

async function appendText(page: Page, text: string) {
  const body = page.getByRole('textbox', { name: 'Document body' });
  await expect(body).toHaveAttribute('contenteditable', 'true');
  await body.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
  // Dismiss any AI ghost suggestion so it can't swallow or follow later keystrokes.
  await page.keyboard.press('Escape');
  await waitSaved(page);
}

test.describe('Comments, version history and export', () => {
  // Multi-user flows against the deployed app need more than the 45s default.
  test.describe.configure({ timeout: 120_000 });

  test('a commenter can quote and comment on a read-only doc; the owner resolves it', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const carol = await asUser(browser, 'carol');
    const doc = await createTextDoc(alice.request, `Comments ${stamp()}`, 'The launch date needs sign-off.');
    try {
      await share(alice.request, doc.id, 'carol', 'commenter');

      const body = carol.page.getByRole('textbox', { name: 'Document body' });
      await carol.page.goto(`/d/${doc.id}`, { waitUntil: 'domcontentloaded' });
      await expect(body).toHaveAttribute('contenteditable', 'false');
      await expect(body).toHaveText('The launch date needs sign-off.');

      // Select the paragraph text, then open the comment composer with it quoted.
      await body.locator('p').first().click({ clickCount: 3 });
      await carol.page.getByRole('button', { name: 'Comments', exact: true }).click();
      const panel = carol.page.getByRole('complementary', { name: 'Comments' });
      await expect(panel).toBeVisible();
      await expect(panel.getByText('The launch date needs sign-off.')).toBeVisible();
      await panel.getByRole('textbox', { name: 'Add a comment' }).fill('Who owns the sign-off?');
      await panel.getByRole('button', { name: 'Comment', exact: true }).click();
      const posted = panel.getByRole('listitem').filter({ hasText: 'Who owns the sign-off?' });
      // The production API can take several seconds per request; allow the post round-trip.
      await expect(posted).toBeVisible({ timeout: 30_000 });
      await expect(posted).toContainText('The launch date needs sign-off.');
      await expect(posted).toContainText('Carol Ruiz');
      // The comment did not touch the document.
      await expect(body).toHaveText('The launch date needs sign-off.');

      await alice.page.goto(`/d/${doc.id}`, { waitUntil: 'domcontentloaded' });
      await alice.page.getByRole('button', { name: 'Comments', exact: true }).click();
      const alicePanel = alice.page.getByRole('complementary', { name: 'Comments' });
      const item = alicePanel.getByRole('listitem').filter({ hasText: 'Who owns the sign-off?' });
      await expect(item).toBeVisible({ timeout: 30_000 });
      await item.getByRole('button', { name: 'Resolve' }).click();
      const resolvedToggle = alicePanel.getByRole('button', { name: 'Resolved (1)' });
      await expect(resolvedToggle).toBeVisible({ timeout: 30_000 });
      await expect(alicePanel.getByRole('listitem').filter({ hasText: 'Who owns the sign-off?' })).toHaveCount(0);
      await resolvedToggle.click();
      await expect(alicePanel.getByRole('button', { name: 'Reopen' })).toBeVisible();
    } finally {
      await deleteDoc(alice.request, doc.id);
      await alice.context.close();
      await carol.context.close();
    }
  });

  test('a viewer can read comments but not add them', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const bob = await asUser(browser, 'bob');
    const doc = await createTextDoc(alice.request, `Viewer comments ${stamp()}`, 'Read-only text.');
    try {
      await share(alice.request, doc.id, 'bob', 'viewer');
      await bob.page.goto(`/d/${doc.id}`, { waitUntil: 'domcontentloaded' });
      await expect(bob.page.getByRole('textbox', { name: 'Document body' })).toHaveAttribute('contenteditable', 'false');
      await bob.page.getByRole('button', { name: 'Comments', exact: true }).click();
      const panel = bob.page.getByRole('complementary', { name: 'Comments' });
      await expect(panel.getByText('You can read comments but not add them.')).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByRole('textbox', { name: 'Add a comment' })).toHaveCount(0);
    } finally {
      await deleteDoc(alice.request, doc.id);
      await alice.context.close();
      await bob.context.close();
    }
  });

  test('version history previews an older version and restores it', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const bob = await asUser(browser, 'bob');
    const doc = await createTextDoc(alice.request, `History ${stamp()}`, 'Draft one.');
    try {
      await share(alice.request, doc.id, 'bob', 'editor');

      await alice.page.goto(`/d/${doc.id}`, { waitUntil: 'domcontentloaded' });
      await appendText(alice.page, ' Alpha edit.');

      // A different author makes a new version.
      await bob.page.goto(`/d/${doc.id}`, { waitUntil: 'domcontentloaded' });
      await expect(bob.page.getByRole('textbox', { name: 'Document body' })).toContainText('Alpha edit.');
      await appendText(bob.page, ' Bravo edit.');
      await bob.context.close();

      await alice.page.reload({ waitUntil: 'domcontentloaded' });
      const body = alice.page.getByRole('textbox', { name: 'Document body' });
      await expect(body).toContainText('Bravo edit.');

      await openFileMenuItem(alice.page, /^Version history/);
      const dialog = alice.page.getByRole('dialog', { name: 'Version history' });
      await expect(dialog).toBeVisible();
      const list = dialog.getByRole('navigation', { name: 'Saved versions' });
      const preview = dialog.getByRole('article', { name: 'Read-only preview' });

      // Newest (Bob's) is selected and previewed first.
      const bobVersion = list.getByRole('button').filter({ hasText: 'Bob Patel' }).first();
      await expect(bobVersion).toHaveAttribute('aria-current', 'true');
      await expect(preview).toContainText('Bravo edit.');

      // Alice's older version previews without Bob's text.
      await list.getByRole('button').filter({ hasText: 'Alice Chen' }).first().click();
      await expect(preview).toContainText('Alpha edit.');
      await expect(preview).not.toContainText('Bravo edit.');

      await dialog.getByRole('button', { name: 'Restore this version' }).click();
      await expect(dialog).toBeHidden();
      // Read the document text without the AI autocomplete ghost widget (a grey decoration + "Tab" hint
      // that can appear after any content change and would otherwise leak into textContent).
      const docText = () =>
        // e2e is compiled without the DOM lib, so the in-page callback is typed loosely.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body.evaluate((el: any): string => {
          const copy = el.cloneNode(true);
          copy.querySelectorAll('.ai-ghost').forEach((n: { remove(): void }) => n.remove());
          return copy.textContent ?? '';
        });
      await expect.poll(docText).toContain('Alpha edit.');
      await expect.poll(docText).not.toContain('Bravo edit.');
      await waitSaved(alice.page);

      // The restore persisted.
      const saved = await alice.request.get(`/api/documents/${doc.id}`);
      expect(JSON.stringify(await saved.json())).not.toContain('Bravo edit.');
    } finally {
      await deleteDoc(alice.request, doc.id);
      await alice.context.close();
    }
  });

  test('File › Download as Markdown saves headings and bold as Markdown', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createRichDoc(alice.request, `Markdown ${stamp()}`);
    try {
      await alice.page.goto(`/d/${doc.id}`, { waitUntil: 'domcontentloaded' });
      await expect(alice.page.getByRole('textbox', { name: 'Document body' }).locator('h1')).toHaveText('Quarterly plan');
      const downloadPromise = alice.page.waitForEvent('download');
      await openFileMenuItem(alice.page, /^Download as Markdown/);
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.md$/);
      const md = await readFile((await download.path())!, 'utf8');
      expect(md).toContain('# Quarterly plan');
      expect(md).toContain('**pilot**');
    } finally {
      await deleteDoc(alice.request, doc.id);
      await alice.context.close();
    }
  });
});
