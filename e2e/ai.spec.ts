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
      route.fulfill({ json: { markdown: '## Meeting notes\n\n- **Owner:** Bob\n- Ship the pilot' } }),
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
      await route.fulfill({ json: { markdown: 'The quick brown fox' } });
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
