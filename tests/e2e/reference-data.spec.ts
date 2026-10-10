import { expect, test } from '@playwright/test';

const snippet = (page: import('@playwright/test').Page) => page.getByTestId('request-snippet');
const send = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /Send request/ }).click();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('LOCAL API')).toBeVisible();
});

test('lists a country, its subdivisions and the countries a withdrawn one led to', async ({ page }) => {
  await page.getByRole('tab', { name: /Countries/ }).click();
  const relations = page.getByTestId('relations');
  await relations.getByRole('combobox', { name: 'List' }).selectOption('subdivisions');
  // A dataset keyed by code starts on a record that exists, not on id 1.
  await expect(relations.getByRole('textbox', { name: 'Record id' })).toHaveValue('JP');
  await expect(snippet(page)).toContainText('/countries/JP/subdivisions?');
  await send(page);
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await expect(page.getByRole('cell', { name: 'JP-01', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /Withdrawn/ }).click();
  await send(page);
  await expect(page.getByRole('cell', { name: 'AIDJ', exact: true })).toBeVisible();
  await expect(snippet(page)).toContainText('/countries/withdrawn?');
});

test('links a person’s province to its subdivision, and lists a grouping’s countries', async ({ page }) => {
  await page.getByRole('tab', { name: /Names/ }).click();
  await page.getByTestId('relations').getByRole('button', { name: 'subdivision', exact: true }).click();
  await expect(snippet(page)).toContainText('expand=subdivision');
  await send(page);
  await page.getByRole('tab', { name: /Body/ }).click();
  await expect(page.locator('.response-body')).toContainText('"subdivision": {');

  await page.getByRole('tab', { name: /Groupings/ }).click();
  await page.getByTestId('relations').getByRole('combobox', { name: 'List' }).selectOption('countries');
  await page.getByTestId('relations').getByRole('textbox', { name: 'Record id' }).fill('g7');
  await send(page);
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await page.getByRole('tab', { name: /Body/ }).click();
  await expect(page.locator('.response-body')).toContainText('"alpha2": "JP"');
});

test('shows a country with its flag and its map in the UI preview', async ({ page }) => {
  await page.getByRole('tab', { name: /Countries/ }).click();
  await send(page);
  await page.getByRole('tab', { name: /UI preview/ }).click();
  const cards = page.getByTestId('ui-cards');
  await expect(cards).toContainText('Andorra');
  await expect(cards.locator('img[src*="/hata@1/dist/svg/ad.svg"]')).toHaveCount(1);
  // The map is drawn by the API (Chizu), so it loads from there, not from the CDN.
  const map = cards.locator('img.preview-map').first();
  await expect(map).toHaveAttribute('src', /\/maps\/AD\.svg$/);
  await expect.poll(() => map.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('lists addresses as an envelope shows them, in the seven countries', async ({ page }) => {
  await page.getByRole('tab', { name: /Addresses/ }).click();
  await page.getByRole('combobox', { name: 'Sort field' }).selectOption('country');
  await page.getByTestId('relations').getByRole('button', { name: 'subdivision', exact: true }).click();
  await send(page);
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await page.getByRole('tab', { name: /UI preview/ }).click();
  const cards = page.getByTestId('ui-cards');
  await expect(cards.locator('li').first()).toContainText('AU');
  await page.getByRole('tab', { name: /Body/ }).click();
  await expect(page.locator('.response-body')).toContainText('"regionCode": "AU-');
  await expect(page.locator('.response-body')).toContainText('"subdivision": {');
});

test('lists the named seas, lakes, rivers and peaks, each with a map that lights it', async ({ page }) => {
  await page.getByRole('tab', { name: /Features/ }).click();
  await send(page);
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await expect(snippet(page)).toContainText('/geo/features?');
  await page.getByRole('tab', { name: /UI preview/ }).click();
  const cards = page.getByTestId('ui-cards');
  await expect(cards).toContainText('Arctic Ocean');
  await expect(cards).toContainText('ocean');
  // The map is the country's, drawn by the API with the feature lit, so it loads from there.
  const map = cards.locator('img.preview-map').first();
  await expect(map).toHaveAttribute('src', /\/maps\/[A-Z]{2}\.svg\?features=all&feature=Q788$/);
  await expect.poll(() => map.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.getByRole('tab', { name: /Body/ }).click();
  await expect(page.locator('.response-body')).toContainText('"names": {');
  await expect(page.locator('.response-body')).toContainText('"wikidata": "Q788"');
});
