import { expect, test } from '@playwright/test';
import { asUser, createDoc, deleteDoc, makeDocx, share, signInUI, waitSaved } from './helpers';

const SEED_DOC_IDS = new Set(['00000000-0000-4000-8000-0000000d0c01', '00000000-0000-4000-8000-0000000d0c02']);
const runStart = new Date(Date.now() - 5_000).toISOString();

// Safety net: delete anything this run created that a failing test left behind (all test docs are Alice's).
test.afterAll(async ({ browser }) => {
  const alice = await asUser(browser, 'alice');
  const { owned } = (await (await alice.request.get('/api/documents')).json()) as { owned: { id: string; updatedAt: string }[] };
  for (const d of owned) if (!SEED_DOC_IDS.has(d.id) && d.updatedAt >= runStart) await deleteDoc(alice.request, d.id);
  await alice.context.close();
});

const stamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

test.describe('sign-in', () => {
  test('unauthenticated deep link goes to login and returns to the document', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Deep link ${stamp()}`);
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto(`/d/${doc.id}`);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: /Alice Chen/ }).click();
    await expect(page).toHaveURL(new RegExp(`/d/${doc.id}$`));
    await expect(page.locator('#doc-title')).toHaveValue(doc.title);
    await deleteDoc(alice.request, doc.id);
    await anon.close();
    await alice.context.close();
  });

  test('switch account from the avatar menu', async ({ page }) => {
    await signInUI(page, 'alice');
    await page.getByRole('button', { name: /Account: Alice Chen/ }).click();
    await page.getByRole('menuitem', { name: 'Switch account' }).click();
    await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
    await page.getByRole('button', { name: /Bob Patel/ }).click();
    await expect(page.getByRole('heading', { name: /Shared with me/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Welcome to Ajaia Docs/ })).toBeVisible();
  });
});

test.describe('editing', () => {
  test('formatting survives a reload', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Format ${stamp()}`, 'start');
    const { page } = alice;
    await page.goto(`/d/${doc.id}`);
    const body = page.locator('.ProseMirror');
    await body.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.getByRole('combobox', { name: 'Text style' }).selectOption('h2');
    await page.keyboard.type('Section heading');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.type('bold words');
    await page.getByRole('button', { name: 'Bold' }).click();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Numbered list' }).click();
    await page.keyboard.type('first item');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second item');
    await page.keyboard.press('Control+u');
    await page.keyboard.type(' underlined');
    await waitSaved(page);

    await page.reload();
    await expect(body.locator('h2')).toHaveText('Section heading');
    await expect(body.locator('strong')).toHaveText('bold words');
    await expect(body.locator('ol > li')).toHaveCount(2);
    await expect(body.locator('u')).toHaveText(' underlined');
    // outline tracks headings
    await expect(page.getByRole('navigation', { name: 'Document outline' }).getByText('Section heading')).toBeVisible();
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('rename persists; blank title reverts instead of saving', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Rename ${stamp()}`);
    const { page } = alice;
    await page.goto(`/d/${doc.id}`);
    const title = page.locator('#doc-title');
    await title.fill('Renamed by e2e');
    await title.press('Enter');
    await waitSaved(page);
    await page.reload();
    await expect(title).toHaveValue('Renamed by e2e');

    await title.fill('   ');
    await title.blur();
    await expect(title).toHaveValue('Renamed by e2e');
    await page.reload();
    await expect(title).toHaveValue('Renamed by e2e');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('typing over a slow network never produces a false conflict', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Slow ${stamp()}`, '');
    const { page } = alice;
    await page.route('**/api/documents/*', async (route) => {
      if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.type(`burst ${i} `);
      await page.waitForTimeout(1200); // each burst lands while the previous save is in flight
    }
    await waitSaved(page);
    await expect(page.getByText(/changed somewhere else/)).toHaveCount(0);
    const saved = await (await alice.request.get(`/api/documents/${doc.id}`)).json();
    expect(JSON.stringify(saved.content)).toContain('burst 4');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('leaving the editor right after typing still saves', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Leave ${stamp()}`, '');
    const { page } = alice;
    await page.goto(`/d/${doc.id}`);
    await page.locator('.ProseMirror').click();
    await page.keyboard.type('typed then left immediately');
    await page.getByRole('link', { name: 'Back to documents' }).click();
    await expect(page.getByRole('heading', { name: /My documents/ })).toBeVisible();
    const saved = await (await alice.request.get(`/api/documents/${doc.id}`)).json();
    expect(JSON.stringify(saved.content)).toContain('typed then left immediately');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('two tabs editing the same document: the stale tab is told to reload', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Conflict ${stamp()}`, 'base');
    const tab1 = alice.page;
    const tab2 = await alice.context.newPage();
    await tab1.goto(`/d/${doc.id}`);
    await tab2.goto(`/d/${doc.id}`);
    await tab1.locator('.ProseMirror').click();
    await tab1.keyboard.type(' from tab one');
    await waitSaved(tab1);
    await tab2.locator('.ProseMirror').click();
    await tab2.keyboard.type(' from tab two');
    await expect(tab2.getByText(/changed somewhere else/)).toBeVisible();
    await expect(tab2.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
    await tab2.getByRole('button', { name: 'Reload' }).click();
    await expect(tab2.locator('.ProseMirror')).toContainText('from tab one');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('a title containing HTML is shown as text, not executed', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const evil = `<img src=x onerror="window.__pwned=1"> ${stamp()}`;
    const doc = await createDoc(alice.request, evil);
    const { page } = alice;
    await page.goto('/');
    await expect(page.getByRole('link', { name: evil })).toBeVisible();
    await page.goto(`/d/${doc.id}`);
    await expect(page.locator('#doc-title')).toHaveValue(evil);
    expect(await page.evaluate(() => (globalThis as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });
});

test.describe('import', () => {
  test('markdown import becomes a formatted document', async ({ page }) => {
    await signInUI(page, 'alice');
    const name = `notes-${stamp()}.md`;
    await page.locator('input[type=file]').setInputFiles({
      name,
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Imported heading\n\nSome **bold** text.\n\n- one\n- two\n\n<script>window.__pwned=1</script>'),
    });
    await expect(page).toHaveURL(/\/d\//);
    const body = page.locator('.ProseMirror');
    await expect(body.locator('h1')).toHaveText('Imported heading');
    await expect(body.locator('strong')).toHaveText('bold');
    await expect(body.locator('ul > li')).toHaveCount(2);
    await expect(page.locator('#doc-title')).toHaveValue(name.replace(/\.md$/, ''));
    expect(await page.evaluate(() => (globalThis as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    const id = page.url().split('/d/')[1]!;
    await deleteDoc(page.request, id);
  });

  test('docx import keeps headings and bold', async ({ page }) => {
    await signInUI(page, 'alice');
    const buffer = await makeDocx([
      { text: 'Quarterly report', style: 'Heading1' },
      { text: 'Revenue grew', bold: true },
      { text: 'Plain paragraph.' },
    ]);
    await page.locator('input[type=file]').setInputFiles({
      name: `report-${stamp()}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
    });
    await expect(page).toHaveURL(/\/d\//);
    const body = page.locator('.ProseMirror');
    await expect(body.locator('h1')).toHaveText('Quarterly report');
    await expect(body.locator('strong')).toHaveText('Revenue grew');
    const id = page.url().split('/d/')[1]!;
    await deleteDoc(page.request, id);
  });

  test('unsupported, empty and corrupt files show a clear error and create nothing', async ({ page }) => {
    await signInUI(page, 'alice');
    const before = (await (await page.request.get('/api/documents')).json()).owned.length;
    const input = page.locator('input[type=file]');
    await input.setInputFiles({ name: 'slides.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
    await expect(page.getByRole('alert')).toContainText('Only .txt, .md and .docx files are supported.');
    await input.setInputFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.from('') });
    await expect(page.getByRole('alert')).toContainText('This file is empty.');
    await input.setInputFiles({ name: 'broken.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip') });
    await expect(page.getByRole('alert')).toContainText("Couldn't read this .docx file");
    await input.setInputFiles({ name: 'huge.txt', mimeType: 'text/plain', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 97) });
    await expect(page.getByRole('alert')).toContainText('File is larger than 2 MB.');
    const after = (await (await page.request.get('/api/documents')).json()).owned.length;
    expect(after).toBe(before);
  });
});

test.describe('sharing', () => {
  test('owner shares as viewer; viewer sees it under Shared with me and cannot edit', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Share ${stamp()}`, 'read me');
    await alice.page.goto(`/d/${doc.id}`);
    await alice.page.getByRole('button', { name: 'Share' }).click();
    const dialog = alice.page.getByRole('dialog');
    await dialog.getByPlaceholder('Add people by email').fill('CAROL@ajaia.test');
    await dialog.getByRole('combobox', { name: 'Role for new person' }).selectOption('viewer');
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dialog.getByText('Carol Ruiz can now view this document.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();

    const carol = await asUser(browser, 'carol');
    await carol.page.goto('/');
    const row = carol.page.getByRole('listitem').filter({ hasText: doc.title });
    await expect(row).toContainText('Viewer');
    await expect(row).toContainText('Alice Chen');
    await row.getByRole('link').click();
    await expect(carol.page.getByText(/You can view this document but not edit it/)).toBeVisible();
    await expect(carol.page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
    await expect(carol.page.getByRole('button', { name: 'Bold' })).toHaveCount(0);
    await expect(carol.page.locator('#doc-title')).toHaveAttribute('readonly', '');
    // and the server refuses a direct write
    const res = await carol.request.patch(`/api/documents/${doc.id}`, { data: { version: 1, title: 'hacked' } });
    expect(res.status()).toBe(403);

    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
    await carol.context.close();
  });

  test('sharing with an unknown email or yourself shows a helpful error', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `ShareErr ${stamp()}`);
    await alice.page.goto(`/d/${doc.id}`);
    await alice.page.getByRole('button', { name: 'Share' }).click();
    const dialog = alice.page.getByRole('dialog');
    const email = dialog.getByPlaceholder('Add people by email');
    await email.fill('nobody@ajaia.test');
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('No Ajaia user with that email');
    await email.fill('alice@ajaia.test');
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('You already own this document.');
    await email.fill('');
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Enter an email address');
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
  });

  test('editor can edit; revoking access mid-session locks the editor', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Revoke ${stamp()}`, 'shared text');
    await share(alice.request, doc.id, 'bob', 'editor');
    const bob = await asUser(browser, 'bob');
    await bob.page.goto(`/d/${doc.id}`);
    await bob.page.locator('.ProseMirror').click();
    await bob.page.keyboard.type(' bob was here');
    await waitSaved(bob.page);

    // owner removes Bob through the UI
    await alice.page.goto(`/d/${doc.id}`);
    await alice.page.getByRole('button', { name: 'Share' }).click();
    await alice.page.getByRole('combobox', { name: 'Access for Bob Patel' }).selectOption('remove');
    await expect(alice.page.getByText('Removed Bob Patel’s access.')).toBeVisible();

    await bob.page.keyboard.type(' after revoke');
    await expect(bob.page.getByText('You no longer have access to this document.')).toBeVisible();
    await bob.page.goto('/');
    await expect(bob.page.getByRole('link', { name: doc.title })).toHaveCount(0);

    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
    await bob.context.close();
  });

  test('only the owner can delete; deleted docs are unavailable to collaborators', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Delete ${stamp()}`);
    await share(alice.request, doc.id, 'bob', 'editor');
    const bob = await asUser(browser, 'bob');
    expect((await bob.request.delete(`/api/documents/${doc.id}`)).status()).toBe(403);
    await bob.page.goto('/');
    const bobRow = bob.page.getByRole('listitem').filter({ hasText: doc.title });
    await expect(bobRow.getByRole('button', { name: /More actions/ })).toHaveCount(0);

    await alice.page.goto('/');
    const row = alice.page.getByRole('listitem').filter({ hasText: doc.title });
    await row.getByRole('button', { name: /More actions/ }).click();
    await alice.page.getByRole('menuitem', { name: 'Delete' }).click();
    await alice.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(alice.page.getByRole('link', { name: doc.title })).toHaveCount(0);

    await bob.page.goto(`/d/${doc.id}`);
    await expect(bob.page.getByText('This document isn’t available')).toBeVisible();
    await alice.context.close();
    await bob.context.close();
  });

  test('a stranger cannot open a document by URL', async ({ browser }) => {
    const alice = await asUser(browser, 'alice');
    const doc = await createDoc(alice.request, `Private ${stamp()}`);
    const carol = await asUser(browser, 'carol');
    await carol.page.goto(`/d/${doc.id}`);
    await expect(carol.page.getByText('This document isn’t available')).toBeVisible();
    await carol.page.goto('/d/not-a-real-id');
    await expect(carol.page.getByText('This document isn’t available')).toBeVisible();
    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
    await carol.context.close();
  });
});
