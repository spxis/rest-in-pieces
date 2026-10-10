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

test('generates derived fields, a distribution and constrained numbers', async ({ page }) => {
  await page.getByRole('tab', { name: /Generate/ }).click();
  const add = async (name: string, type: string, args?: string) => {
    await page.getByRole('button', { name: 'Add field' }).click();
    await page.getByLabel('Field name').last().fill(name);
    await page.getByLabel('Generator type').last().selectOption(type);
    if (args !== undefined)
      await page
        .getByLabel(type === '=' ? 'Expression' : /Arguments/)
        .last()
        .fill(args);
  };
  await add('low', 'number.int', '(1,100)');
  await add('high', 'number.int', '(1,100)');
  await add('score', 'number.normal', '(70,10,0,100,0)');
  await add('next', '=');
  await expect(page.getByLabel('Expression').last()).toHaveValue('index + 1');
  await page.getByLabel('Expression').last().fill('high - low');
  await page.getByLabel('Constraints').fill('high>low');
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await expect(page.getByRole('columnheader', { name: 'next' })).toBeVisible();
  await expect(snippet(page)).toContainText('constraints=high%3Elow');
  await expect(snippet(page)).toContainText('next%3A%3Dhigh+-+low');
  const headers = await page.locator('.data-table thead th').allTextContents();
  const column = (name: string) => headers.findIndex((text) => text.includes(name)) + 1;
  const read = async (name: string) =>
    (await page.locator(`.data-table tbody tr td:nth-child(${column(name)})`).allTextContents()).map(Number);
  const [low, high, next] = [await read('low'), await read('high'), await read('next')];
  expect(low).toHaveLength(10);
  for (const [i, value] of low.entries()) {
    expect(high[i]).toBeGreaterThan(value as number);
    expect(next[i]).toBe((high[i] as number) - (value as number));
  }
});

test('lists a bundled domain whose records agree with themselves', async ({ page }) => {
  await page.getByRole('tab', { name: /Invoices/ }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await page.getByRole('tab', { name: /Table/ }).click();
  await expect(page.getByRole('cell', { name: 'INV-2025-00001' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'invoiceStatus' })).toBeVisible();
  await page.getByRole('tab', { name: /Places/ }).click();
  await page.getByRole('combobox', { name: 'Sort field' }).selectOption('distanceKm');
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(snippet(page)).toContainText('sortBy=distanceKm');
  await expect(page.getByRole('columnheader', { name: 'geometry' })).toBeVisible();
});

test('generates records from a JSON Schema, and refuses what is not JSON', async ({ page }) => {
  await page.getByRole('tab', { name: /Generate/ }).click();
  await page.getByRole('button', { name: 'JSON Schema', exact: true }).click();
  await expect(page.getByLabel('JSON Schema or OpenAPI document')).toHaveValue(/"format": "email"/);
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await page.getByRole('tab', { name: /Table/ }).click();
  await expect(page.getByRole('columnheader', { name: 'email' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'sku' })).toBeVisible();
  const skus = await page.locator('.data-table tbody tr td:nth-child(6)').allTextContents();
  for (const sku of skus.filter(Boolean)) expect(sku).toMatch(/^[A-Z]{3}-\d{4}$/);
  await expect(snippet(page)).toContainText('POST');

  await page
    .getByLabel('JSON Schema or OpenAPI document')
    .fill('{ "type": "object", "properties": { "a": { "not": {} } } }');
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/400/);
  await expect(page.locator('.response-body')).toContainText('the keyword \\"not\\" is not supported');

  await page.getByLabel('JSON Schema or OpenAPI document').fill('{ nope');
  await expect(page.getByRole('alert')).toContainText('not a JSON object');
  await expect(page.getByRole('button', { name: /Send request/ })).toBeDisabled();

  await page.getByLabel('JSON Schema or OpenAPI document').fill(
    JSON.stringify({
      openapi: '3.0.3',
      components: { schemas: { Pet: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } } },
    }),
  );
  await page.getByLabel(/Schema to use in the OpenAPI document/).fill('Pet');
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
});

test('offers the offline command beside the request snippets, for generated records only', async ({ page }) => {
  await expect(page.getByRole('tab', { name: 'CLI', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /Generate/ }).click();
  await page.getByRole('tab', { name: 'CLI', exact: true }).click();
  await expect(snippet(page)).toContainText("--fields 'name:person.fullName,email:internet.email'");
  await expect(snippet(page)).toContainText('--count 1000');
  await expect(snippet(page)).toContainText('--format json');
  await page.getByRole('button', { name: 'JSON Schema', exact: true }).click();
  await expect(snippet(page)).toContainText('--schema schema.json');
  await page.getByRole('tab', { name: /Users/ }).click();
  await expect(page.getByRole('tab', { name: 'CLI', exact: true })).toHaveCount(0);
});

test('shows the synthetic patients with their disclaimer beside them', async ({ page }) => {
  await page.getByRole('tab', { name: /Patients/ }).click();
  await expect(page.locator('.endpoint-description')).toContainText('Synthetic: every record is invented');
  await expect(page.locator('.endpoint-description')).toContainText('not SNOMED CT, LOINC, ICD or CPT');
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await page.getByRole('tab', { name: /Table/ }).click();
  await expect(page.getByRole('columnheader', { name: 'resourceType' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Patient', exact: true }).first()).toBeVisible();
});

test('rehearses a create, a validation error and a delete', async ({ page }) => {
  await page.getByRole('tab', { name: /Users/ }).click();
  await page.getByRole('button', { name: 'POST', exact: true }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/201/);
  await expect(page.getByRole('cell', { name: '1001', exact: true })).toBeVisible();

  const body = page.getByRole('textbox', { name: 'JSON body' });
  await body.fill(((await body.inputValue()) ?? '').replace('ada@example.com', 'not-an-email'));
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/422/);
  await expect(page.locator('.response-body')).toContainText('"email": "Invalid email"');

  await page.getByRole('button', { name: 'DELETE', exact: true }).click();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/204/);
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

test('links to the API reference, the fixtures, the static API, npm and the repository', async ({ page }) => {
  await expect(page).toHaveTitle(/fake REST API/);
  const links = page.getByRole('navigation', { name: 'Project links' });
  await expect(links.getByRole('link', { name: 'API docs' })).toHaveAttribute('href', /\/docs$/);
  await expect(links.getByRole('link', { name: 'Fixtures' })).toHaveAttribute('href', /\/fixtures\/index\.json$/);
  await expect(links.getByRole('link', { name: 'Static API' })).toHaveAttribute('href', /\/api\/index\.json$/);
  await expect(links.getByRole('link', { name: 'npm' })).toHaveAttribute(
    'href',
    'https://www.npmjs.com/package/@johnmorrisdotca/rest-in-pieces',
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
