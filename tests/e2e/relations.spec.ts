import { expect, test } from '@playwright/test';

const snippet = (page: import('@playwright/test').Page) => page.getByTestId('request-snippet');
const send = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /Send request/ }).click();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('LOCAL API')).toBeVisible();
});

test('lists one user’s orders with the buyer and products embedded', async ({ page }) => {
  await page.getByRole('tab', { name: /Users/ }).click();
  const relations = page.getByTestId('relations');
  await relations.getByRole('combobox', { name: 'List' }).selectOption('orders');
  await relations.getByRole('textbox', { name: 'Record id' }).fill('2');
  await relations.getByRole('button', { name: 'user', exact: true }).click();
  await relations.getByRole('button', { name: 'items.product' }).click();
  await expect(snippet(page)).toContainText('/users/2/orders?');
  await expect(snippet(page)).toContainText('expand=user%2Citems.product');
  await send(page);
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await page.getByRole('tab', { name: /Body/ }).click();
  await expect(page.locator('.response-body')).toContainText('"orderStatus"');
  await expect(page.locator('.response-body')).toContainText('"product": {');
  await expect(page.locator('.response-body')).toContainText('"user": {');
});

test('draws safe avatars in the page, and cards for reviews', async ({ page }) => {
  await page.getByRole('tab', { name: /Users/ }).click();
  await page.getByRole('checkbox', { name: 'Safe values' }).check();
  await send(page);
  await page.getByRole('tab', { name: /UI preview/ }).click();
  const cards = page.getByTestId('ui-cards');
  await expect(cards).toContainText('@example.');
  const avatar = cards.locator('img').first();
  await expect(avatar).toHaveAttribute('src', /^data:image\/svg\+xml/);
  expect(await avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  await page.getByRole('tab', { name: /Reviews/ }).click();
  await send(page);
  await expect(cards.locator('li').first()).toContainText('★');
});

test('generates fields with arguments, weighted choices and blanks, and explains a mistake', async ({ page }) => {
  await page.getByRole('tab', { name: /Generate/ }).click();
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field name').last().fill('age');
  await page.getByLabel('Generator type').last().selectOption('number.int');
  await page.getByLabel('Arguments, choices or blank rate').last().fill('(18,65)?blank=10');
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field name').last().fill('status');
  await page.getByLabel('Generator type').last().selectOption('pick');
  await page.getByLabel('Arguments, choices or blank rate').last().fill('(active,paused|80,20)');
  await expect(snippet(page)).toContainText('age%3Anumber.int%2818%2C65%29%3Fblank%3D10');
  await send(page);
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await expect(page.getByRole('columnheader', { name: 'status' })).toBeVisible();

  await page.getByLabel('Arguments, choices or blank rate').last().fill('(active,paused|80)');
  await send(page);
  await expect(page.getByTestId('response-status')).toHaveText(/422/);
  await page.getByRole('tab', { name: /Body/ }).click();
  await expect(page.locator('.response-body')).toContainText('2 choices and 1 weights');
});

test('answers as SQL into a named table, and downloads NDJSON', async ({ page }) => {
  await page.getByRole('tab', { name: /Todos/ }).click();
  await page.getByRole('button', { name: 'SQL', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'SQL table' }).fill('tasks');
  await send(page);
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await expect(page.locator('.response-body')).toContainText('INSERT INTO "tasks"');

  await page.getByRole('button', { name: 'JSON', exact: true }).first().click();
  await send(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'NDJSON', exact: true }).last().click();
  expect((await download).suggestedFilename()).toBe('todos.ndjson');
});
