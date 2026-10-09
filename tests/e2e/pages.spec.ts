import { expect, test } from '@playwright/test';

// The published demo: the API runs inside the page, stateless until the session panel says otherwise.
test('keeps writes in the tab only when asked, and resets them', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('IN-BROWSER API')).toBeVisible();
  await page.locator('[data-testid=session-panel] > summary').click();
  await expect(page.getByTestId('session-panel')).toContainText('nothing is stored, as on every hosted copy');

  await page.getByRole('tab', { name: /Users/ }).click();
  await page.getByRole('button', { name: 'DELETE', exact: true }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/204/);
  await page.getByRole('button', { name: 'GET', exact: true }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.locator('.response-metrics')).toContainText('1,000 total');

  await page.getByRole('checkbox', { name: 'Keep writes in this tab' }).check();
  await expect(page.getByTestId('session-panel')).toContainText('Writes are kept in this tab');
  await page.getByRole('button', { name: 'DELETE', exact: true }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('session-list')).toContainText('/users');
  await page.getByRole('button', { name: 'GET', exact: true }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.locator('.response-metrics')).toContainText('999 total');

  await page.getByRole('button', { name: 'Reset to the seed' }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.locator('.response-metrics')).toContainText('1,000 total');
});

test('signs in against the API inside the tab', async ({ page }) => {
  await page.goto('./');
  await page.locator('[data-testid=sign-in-panel] > summary').click();
  await page.getByRole('combobox', { name: 'Protect this request' }).selectOption('admin');
  await page.getByRole('combobox', { name: 'Account' }).selectOption('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('signed-in')).toContainText('admin');
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
});
