import { test, expect } from '@playwright/test';

test('profile field announces validation, preserves help and retains input after server failure', async ({ page }) => {
  let submissions = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/profile', async route => {
    submissions++;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporarily unavailable. Please retry.' } }) });
  });
  await page.goto('/ui-fixtures/forms');
  const name = page.getByRole('textbox', { name: 'Display name (required)' });
  const save = page.getByRole('button', { name: 'Save and continue' });
  await save.click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toHaveAttribute('aria-describedby', 'displayName-help displayName-error');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Enter 1–80 characters.');
  expect(submissions).toBe(0);
  await name.fill('☕'.repeat(81));
  await save.click();
  expect(submissions).toBe(0);
  await name.fill('Test customer');
  await save.click();
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await expect(name).toBeDisabled();
  await expect.poll(() => Boolean(release)).toBe(true);
  release!();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Temporarily unavailable. Please retry.');
  await expect(name).toHaveValue('Test customer');
  await expect(save).toBeEnabled();
  await expect(name).toHaveAttribute('aria-describedby', 'displayName-help');
  expect(submissions).toBe(1);
  await page.screenshot({ path: test.info().outputPath('form-error.png'), fullPage: true });
});
