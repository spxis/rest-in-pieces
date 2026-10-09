import { expect, test } from '@playwright/test';

const snippet = (page: import('@playwright/test').Page) => page.getByTestId('request-snippet');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('LOCAL API')).toBeVisible();
});

test('fetches the seeded dataset and shows it as a table', async ({ page }) => {
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  // Seed 1 always starts with the same person, on every machine.
  await expect(page.getByRole('cell', { name: 'Aaliyah Corkery' })).toBeVisible();
  await expect(page.getByText('Page 1 of 100')).toBeVisible();

  await page.getByRole('button', { name: 'Next results page' }).click();
  await expect(page.getByText('Page 2 of 100')).toBeVisible();
  await expect(snippet(page)).toContainText('offset=10');
});

test('filters, searches and sorts', async ({ page }) => {
  await page.getByPlaceholder('Search every field…').fill('ontario');
  await page.getByRole('button', { name: 'Add filter' }).click();
  await page.getByLabel('Filter field').selectOption('gender');
  await page.getByLabel('Filter value').fill('female');
  await page.getByRole('combobox', { name: 'Sort field' }).selectOption('age');
  await page.keyboard.press('ControlOrMeta+Enter');

  await expect(snippet(page)).toContainText('q=ontario');
  await expect(snippet(page)).toContainText('gender=female');
  const genders = page.locator('.data-table tbody tr td:nth-child(9)');
  await expect(genders.first()).toHaveText('female');
  for (const text of await genders.allTextContents()) expect(text).toBe('female');
});

test('rehearses failure scenarios', async ({ page }) => {
  await page.getByRole('button', { name: /503 error/ }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/503/);
  await expect(page.locator('.response-body')).toContainText('"simulated": true');
});

test('generates custom records', async ({ page }) => {
  await page.getByRole('tab', { name: /Generate/ }).click();
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field name').last().fill('price');
  await page.getByLabel('Generator type').last().selectOption('commerce.price');
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByRole('columnheader', { name: 'price' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'email' })).toBeVisible();
});

test('returns CSV and shows the raw body', async ({ page }) => {
  await page.getByRole('button', { name: 'CSV' }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.locator('.response-body')).toContainText('index,name,age,address');
});

test('shares a setup that restores the same request', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('tab', { name: /Users/ }).click();
  await page.getByRole('button', { name: /Next page/ }).click();
  const expected = await snippet(page).textContent();
  await page.getByRole('button', { name: 'Share setup' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());

  await page.goto(link);
  await expect(snippet(page)).toHaveText(expected ?? '');
});

test('offers a scenario as a share link first', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: /Slow response/ }).click();
  const expected = await snippet(page).textContent();
  await page.getByRole('button', { name: 'Share this scenario' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());

  await page.goto(link);
  await expect(snippet(page)).toHaveText(expected ?? '');
  await expect(snippet(page)).toContainText('delay=1500');
});

test('links to the API reference, the fixtures, npm and the repository', async ({ page }) => {
  await expect(page).toHaveTitle(/fake REST API/);
  const links = page.getByRole('navigation', { name: 'Project links' });
  await expect(links.getByRole('link', { name: 'API docs' })).toHaveAttribute('href', /\/docs$/);
  await expect(links.getByRole('link', { name: 'Fixtures' })).toHaveAttribute('href', /\/fixtures\/index\.json$/);
  await expect(links.getByRole('link', { name: 'npm' })).toHaveAttribute(
    'href',
    'https://www.npmjs.com/package/rest-in-pieces',
  );
  await expect(links.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/spxis/rest-in-pieces',
  );
});

test('switches to Japanese and fetches Japanese data', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '日本語' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('API プレイグラウンド');
  await page.getByRole('combobox', { name: 'データのロケール' }).selectOption('ja');
  await expect(page.getByTestId('request-snippet')).toContainText('locale=ja');
  await page.getByRole('button', { name: /リクエストを送信/ }).click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  await expect(page.getByRole('columnheader', { name: 'nameKana' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: '日本語' })).toHaveAttribute('aria-pressed', 'true');
});
