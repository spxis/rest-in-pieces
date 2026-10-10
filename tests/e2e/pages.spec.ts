import { expect, test } from '@playwright/test';
import { playAll, sidewaysOverflow, USE_CASE_IDS, watchErrors } from './use-cases.helpers.ts';

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

// Relations, safe values and pictures need no server either: the avatars are drawn in the page.
test('answers nested lists and safe values in the tab, with avatars drawn in the page', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('IN-BROWSER API')).toBeVisible();
  await page.getByRole('tab', { name: /Posts/ }).click();
  const relations = page.getByTestId('relations');
  await relations.getByRole('button', { name: 'user', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Safe values' }).check();
  await page.getByRole('button', { name: /Send request/ }).click();
  await expect(page.getByTestId('response-status')).toHaveText(/200/);
  await page.getByRole('tab', { name: 'UI preview' }).click();
  const avatar = page.getByTestId('ui-cards').locator('img').first();
  await expect(avatar).toHaveAttribute('src', /^data:image\/svg\+xml/);
  expect(await avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.getByRole('tab', { name: /Body/ }).click();
  await expect(page.locator('.response-body')).toContainText('/rest-in-pieces/api/avatars/');
});

// The use cases on the published demo: the API inside the page answers every animation, so nothing leaves it,
// and the browser has no failing request to log for the 500, 503 and 401 the examples ask for.
test('plays the use cases from the API inside the tab, with nothing logged', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(String(error)));
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));

  await page.goto('./');
  await page.getByRole('link', { name: /Use cases/ }).click();
  await expect(page).toHaveURL(/\/rest-in-pieces\/use-cases\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'What it is for' })).toBeVisible();
  await expect(page.getByTestId('uc-where')).toContainText('inside this page');
  for (const id of USE_CASE_IDS) await expect(page.getByTestId(`uc-${id}`)).toBeAttached();
  await playAll(page);
  await expect(page.getByTestId('uc-person-row')).toHaveCount(5);
  await expect(page.getByTestId('uc-down')).toContainText('503');
  await expect(page.getByTestId('uc-log')).toContainText('token_expired');
  await expect(page.getByTestId('uc-synthetic-tag')).toHaveText('SYNTHETIC');
  expect(errors).toEqual([]);
  // The in-tab API answered: not one request went out under the API's address.
  expect(requests.filter((path) => path.startsWith('/rest-in-pieces/api/'))).toEqual([]);
});

test('opens the use cases from its own address, in Japanese, on a phone', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = watchErrors(page);
  await page.goto('use-cases/?lang=ja');
  await expect(page.getByRole('heading', { level: 1, name: '使いどころ' })).toBeVisible();
  await playAll(page);
  expect(await sidewaysOverflow(page)).toBe(0);
  expect(errors).toEqual([]);

// The static API: plain files with the page number in the path, so any client can fetch them with no server.
test('serves the static API as plain JSON files that link to each other', async ({ request }) => {
  const index = await request.get('./api/index.json');
  expect(index.ok()).toBe(true);
  const { base, files } = (await index.json()) as { base: string; files: number };
  expect(files).toBeGreaterThan(1000);
  expect(base).toMatch(/\/api\/$/);

  const second = await request.get('./api/users/page/2.json');
  expect(second.headers()['content-type']).toContain('application/json');
  const { metadata, results } = (await second.json()) as {
    metadata: { links: { next: string; prev: string } };
    results: { id: number }[];
  };
  expect(results.map((user) => user.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  // A link is an address on the site, so the page after this one is a file that exists. Its host is the one the
  // site is built for, so the test follows the path under it.
  const path = (link: string) => `./api/${link.slice(link.indexOf('/api/') + 5)}`;
  const next = await request.get(path(metadata.links.next));
  expect(((await next.json()) as { results: { id: number }[] }).results[0]?.id).toBe(21);

  // CORS is Pages' to send (checked on the live site), so what is checked here is the paths.
  const record = await request.get('./api/users/1.json');
  expect(((await record.json()) as { id: number }).id).toBe(1);
  expect((await request.get('./api/jsonplaceholder/posts/1/comments.json')).ok()).toBe(true);
  // There is no eleventh page. Pages answers 404; the preview server falls back to the playground's page. Neither is JSON.
  const beyond = await request.get('./api/users/page/11.json');
  expect(beyond.headers()['content-type']).not.toContain('json');
});
