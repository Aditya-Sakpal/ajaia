import { expect, test } from '@playwright/test';
import { asUser, createDoc, deleteDoc } from './helpers';

const stamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// AI responses are mocked at the network layer so these tests are deterministic and free.
test.describe('AI writing assistant', () => {
  test('a chip inserts formatted AI text that one Undo removes', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `AI chip ${stamp()}`, 'Kickoff with Bob about the pilot.');
    const { page } = alice;
    await page.route('**/ai/generate', (route) =>
      route.fulfill({ json: { markdown: '## Meeting notes\n\n- **Owner:** Bob\n- Ship the pilot', placement: 'insert' } }),
    );
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'Meeting notes' }).click();
    const body = page.locator('.ProseMirror');
    await expect(body.locator('h2')).toHaveText('Meeting notes');
    await expect(body.locator('li strong')).toHaveText('Owner:');
    await page.keyboard.press('Control+z');
    await expect(body.locator('h2')).toHaveCount(0);
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('custom prompt rewrites the selection', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `AI prompt ${stamp()}`, 'teh quick brwn fox');
    const { page } = alice;
    let sent: { selection?: string; prompt?: string } = {};
    await page.route('**/ai/generate', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { markdown: 'The quick brown fox', placement: 'replace_selection' } });
    });
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+a');
    await page.getByLabel('Write with AI').fill('fix the typos');
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.locator('.ProseMirror')).toHaveText('The quick brown fox');
    expect(sent.selection).toBe('teh quick brwn fox');
    expect(sent.prompt).toBe('fix the typos');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('a no-selection rewrite prompt replaces the whole document (no duplication) and one Undo restores it', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const original = 'This is a very long and wordy essay paragraph about artificial intelligence.';
    const doc = await createDoc(alice.request, `AI replace ${stamp()}`, original);
    const { page } = alice;
    let sent: { selection?: string; prompt?: string } = {};
    await page.route('**/ai/generate', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { markdown: '# AI essay\n\nAI is important.', placement: 'replace_document' } });
    });
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.getByLabel('Write with AI').fill('shorten the essay');
    await page.getByRole('button', { name: 'Generate' }).click();
    const body = page.locator('.ProseMirror');
    await expect(body.locator('h1')).toHaveText('AI essay');
    await expect(body).not.toContainText('very long and wordy');
    await expect(body.locator('h1')).toHaveCount(1);
    expect(sent.selection).toBeUndefined();
    await page.keyboard.press('Control+z');
    await expect(body).toContainText(original);
    await expect(body.locator('h1')).toHaveCount(0);
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('a rewrite chip works without a selection and replaces the document', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `AI chip rewrite ${stamp()}`, 'Teh documnet has typos.');
    const { page } = alice;
    let sent: { action?: string; selection?: string } = {};
    await page.route('**/ai/generate', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { markdown: 'The document has typos.', placement: 'replace_document' } });
    });
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: /Fix spelling & grammar \(whole document\)/ }).click();
    await expect(page.locator('.ProseMirror')).toHaveText('The document has typos.');
    expect(sent.action).toBe('fix_grammar');
    expect(sent.selection).toBeUndefined();
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('an insert result is added after the existing text', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `AI insert ${stamp()}`, 'First paragraph.');
    const { page } = alice;
    await page.route('**/ai/generate', (route) => route.fulfill({ json: { markdown: 'Second paragraph.', placement: 'insert' } }));
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.getByRole('button', { name: 'Continue writing' }).click();
    const body = page.locator('.ProseMirror');
    await expect(body).toContainText('Second paragraph.');
    await expect(body).toContainText('First paragraph.');
    const text = (await body.innerText()).replace(/\s+/g, ' ');
    expect(text.indexOf('First paragraph.')).toBeLessThan(text.indexOf('Second paragraph.'));
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('if the document changes while AI is writing, a replace is refused instead of clobbering', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `AI stale ${stamp()}`, 'Original text.');
    const { page } = alice;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route('**/ai/generate', async (route) => {
      await gate;
      await route.fulfill({ json: { markdown: 'Rewritten.', placement: 'replace_document' } });
    });
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.getByLabel('Write with AI').fill('rewrite this');
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByText('Writing…')).toBeVisible();
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' typed meanwhile');
    release();
    await expect(page.getByText('The document changed while AI was writing. Try again.')).toBeVisible();
    await expect(page.locator('.ProseMirror')).toContainText('Original text. typed meanwhile');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('server errors are shown and the bar recovers', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `AI error ${stamp()}`, 'Text.');
    const { page } = alice;
    let fail = true;
    await page.route('**/ai/generate', (route) =>
      fail
        ? route.fulfill({ status: 502, json: { error: { code: 'ai_failed', message: 'The AI assistant could not respond. Please try again.' } } })
        : route.fulfill({ json: { markdown: 'More text.', placement: 'insert' } }),
    );
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.getByRole('button', { name: 'Continue writing' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'could not respond' })).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Continue writing' }).click();
    await expect(page.locator('.ProseMirror')).toContainText('More text.');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('autocomplete shows ghost text that Tab accepts and Escape dismisses', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `AI auto ${stamp()}`, 'Our goals for the quarter are');
    const { page } = alice;
    await page.route('**/ai/complete', (route) => route.fulfill({ json: { completion: 'to ship the pilot.' } }));
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' clear');
    const ghost = page.locator('.ai-ghost');
    await expect(ghost).toContainText('to ship the pilot.');
    await page.keyboard.press('Escape');
    await expect(ghost).toHaveCount(0);
    await page.keyboard.type(' and');
    await expect(ghost).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('.ProseMirror')).toContainText('clear and to ship the pilot.');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('viewers do not get the AI bar', async ({ browser }) => {
    const carol = await asUser(browser, 'carol');
    await carol.page.goto('/d/00000000-0000-4000-8000-0000000d0c02');
    await expect(carol.page.getByText('Viewing', { exact: true })).toBeVisible();
    await expect(carol.page.getByRole('region', { name: 'AI writing assistant' })).toHaveCount(0);
    await carol.context.close();
  });
});

test.describe('editor File menu import', () => {
  test('Insert file into this document adds the file at the cursor', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Insert ${stamp()}`, 'Existing draft.');
    const { page } = alice;
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'File' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Insert file into this document…' }).click();
    await (await chooser).setFiles({ name: 'extra.md', mimeType: 'text/markdown', buffer: Buffer.from('## Imported section\n\n- point one') });
    const body = page.locator('.ProseMirror');
    await expect(body.locator('h2')).toHaveText('Imported section');
    await expect(body).toContainText('Existing draft.');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('Import file as new document opens it', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Import from editor ${stamp()}`, 'x');
    const { page } = alice;
    await page.goto(`/d/${doc.id}`);
    await page.getByRole('button', { name: 'File' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Import file as new document…' }).click();
    const name = `notes-${stamp()}.txt`;
    await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('hello from a text file') });
    await expect(page.locator('#doc-title')).toHaveValue(name.replace(/\.txt$/, ''));
    await expect(page.locator('.ProseMirror')).toContainText('hello from a text file');
    const newId = page.url().split('/d/')[1]!;
    await deleteDoc(alice.request, newId);
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });
});
