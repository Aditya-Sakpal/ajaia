import { expect, test, type Page } from '@playwright/test';
import { asUser, deleteDoc, share, waitSaved } from './helpers';

const stamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const para = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });

async function deleteParagraph(page: Page, text: string) {
  await page.locator('.ProseMirror p', { hasText: text }).click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
}

test.describe('live collaboration', () => {
  test('two people deleting different paragraphs at the same time both win, and both tabs converge', async ({ browser }) => {
    test.slow();
    const alice = await asUser(browser, 'alice');
    const res = await alice.request.post('/api/documents', {
      data: {
        title: `Collab ${stamp()}`,
        content: { type: 'doc', content: [para('Alpha paragraph'), para('Bravo paragraph'), para('Charlie paragraph'), para('Delta paragraph')] },
      },
    });
    const doc = (await res.json()) as { id: string };
    await share(alice.request, doc.id, 'bob', 'editor');
    const bob = await asUser(browser, 'bob');
    await alice.page.goto(`/d/${doc.id}`);
    await bob.page.goto(`/d/${doc.id}`);

    // presence: each sees the other
    await expect(alice.page.getByTestId('presence').getByTitle('Bob Patel is viewing now')).toBeVisible({ timeout: 15_000 });
    await expect(bob.page.getByTestId('presence').getByTitle('Alice Chen is viewing now')).toBeVisible({ timeout: 15_000 });

    await deleteParagraph(bob.page, 'Bravo paragraph');
    await deleteParagraph(alice.page, 'Delta paragraph');
    await waitSaved(bob.page);
    await waitSaved(alice.page);

    for (const page of [alice.page, bob.page]) {
      const body = page.locator('.ProseMirror');
      await expect(body).not.toContainText('Bravo', { timeout: 15_000 });
      await expect(body).not.toContainText('Delta', { timeout: 15_000 });
      await expect(body).toContainText('Alpha paragraph');
      await expect(body).toContainText('Charlie paragraph');
    }
    await expect(alice.page.getByText(/changed somewhere else/)).toHaveCount(0);
    const server = await (await alice.request.get(`/api/documents/${doc.id}`)).json();
    expect(JSON.stringify(server.content)).not.toMatch(/Bravo|Delta/);

    await deleteDoc(alice.request, doc.id);
    await alice.context.close();
    await bob.context.close();
  });
});
