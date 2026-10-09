import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

// The second API the config starts, which keeps writes until POST /reset.
const SESSION_API = `http://127.0.0.1:${process.env.E2E_SESSION_PORT ?? '6822'}`;

const snippet = (page: Page) => page.getByTestId('request-snippet');
const send = (page: Page) => page.getByRole('button', { name: /Send request/ }).click();
const status = (page: Page) => page.getByTestId('response-status');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('LOCAL API')).toBeVisible();
});

test.describe('sign-in rehearsal', () => {
  test('a protected request answers 401 until signed in, and the preview offers the sign-in', async ({ page }) => {
    await page.locator('[data-testid=sign-in-panel] > summary').click();
    await page.getByRole('combobox', { name: 'Protect this request' }).selectOption('required');
    await expect(snippet(page)).toContainText('auth=required');
    await send(page);
    await expect(status(page)).toHaveText(/401/);
    await page.getByRole('tab', { name: 'UI preview' }).click();
    await expect(page.getByTestId('ui-preview')).toContainText('Sign in to see this');

    await page.getByRole('button', { name: 'Sign in as a viewer and retry' }).click();
    await expect(status(page)).toHaveText(/200/);
    await expect(page.getByTestId('ui-cards').locator('li')).toHaveCount(6);
    await expect(page.getByTestId('signed-in')).toContainText('viewer');
    await expect(page.getByTestId('token-clock')).toContainText(/Token expires in 1[45]:/);

    await page.getByRole('tab', { name: 'curl' }).click();
    await expect(snippet(page)).toContainText('jq -r .accessToken');
    await expect(snippet(page)).toContainText('-H "Authorization: Bearer $TOKEN"');
  });

  test('a role that is not enough answers 403, and an expired token 401 token_expired', async ({ page }) => {
    await page.locator('[data-testid=sign-in-panel] > summary').click();
    await page.getByRole('combobox', { name: 'Protect this request' }).selectOption('admin');
    await page.getByRole('combobox', { name: 'Account' }).selectOption('editor');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByTestId('auth-answer')).toContainText('POST /auth/login 200');
    await send(page);
    await expect(status(page)).toHaveText(/403/);
    await expect(page.locator('.response-body')).toContainText('"code": "insufficient_role"');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('combobox', { name: 'Token lasts' }).selectOption('0');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByTestId('token-clock')).toContainText('Token expired');
    await page.getByRole('button', { name: 'Check /auth/me' }).click();
    await expect(page.getByTestId('auth-answer')).toContainText('GET /auth/me 401');
    await expect(page.getByTestId('auth-answer')).toContainText('token_expired');
    await page.getByRole('button', { name: 'Refresh token' }).click();
    await expect(page.getByTestId('auth-answer')).toContainText('POST /auth/refresh 200');
  });

  test('a wrong password and a disabled account are refused', async ({ page }) => {
    await page.locator('[data-testid=sign-in-panel] > summary').click();
    await page.getByRole('combobox', { name: 'Account' }).selectOption('wrong');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByTestId('auth-answer')).toContainText('401');
    await expect(page.getByTestId('auth-answer')).toContainText('invalid_credentials');
    await page.getByRole('combobox', { name: 'Account' }).selectOption('disabled');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByTestId('auth-answer')).toContainText('403');
    await expect(page.getByTestId('auth-answer')).toContainText('account_disabled');
  });
});

test.describe('session', () => {
  test('a server without --session says it keeps nothing', async ({ page }) => {
    await page.locator('[data-testid=session-panel] > summary').click();
    await expect(page.getByTestId('session-panel')).toContainText('This API does not keep writes');
  });

  test('a server with --session keeps a delete until the reset', async ({ page }) => {
    await page.getByLabel('API BASE URL').fill(SESSION_API);
    await expect(page.getByTestId('session-panel')).toContainText('Keeping writes');
    await page.getByRole('button', { name: 'Reset to the seed' }).click();
    await expect(page.getByTestId('session-panel')).toContainText('No writes yet');

    await page.getByRole('tab', { name: /Users/ }).click();
    await page.getByLabel('Seed').fill('4242');
    await page.getByRole('button', { name: 'DELETE', exact: true }).click();
    await send(page);
    await expect(status(page)).toHaveText(/204/);
    await expect(page.getByTestId('session-list')).toContainText('/users seed=4242');
    await expect(page.getByTestId('session-list')).toContainText('999 records');
    await expect(page.getByText('The API keeps this write')).toBeVisible();

    await page.getByRole('button', { name: 'GET', exact: true }).click();
    await send(page);
    await expect(page.locator('.response-metrics')).toContainText('999 total');

    await page.getByRole('button', { name: 'Reset to the seed' }).click();
    await expect(page.getByTestId('session-panel')).toContainText('No writes yet');
    await send(page);
    await expect(page.locator('.response-metrics')).toContainText('1,000 total');
  });
});

test.describe('UI preview', () => {
  test('draws loading, errors and empty results the way an app would', async ({ page }) => {
    await send(page);
    await expect(status(page)).toHaveText(/200/);
    await page.getByRole('tab', { name: 'UI preview' }).click();
    await expect(page.getByTestId('ui-cards')).toBeVisible();

    await page.getByRole('button', { name: /Slow response/ }).click();
    await send(page);
    await expect(page.getByTestId('ui-loading')).toBeVisible();
    await expect(page.getByTestId('ui-cards')).toBeVisible();

    await page.getByRole('button', { name: /503 error/ }).click();
    await send(page);
    await expect(page.getByTestId('ui-preview')).toContainText('Something went wrong on our side');

    await page.getByRole('button', { name: /Empty result/ }).click();
    await send(page);
    await expect(page.getByTestId('ui-preview')).toContainText('Nothing here yet');
  });
});

test('downloads the response as JSON, CSV and TXT', async ({ page }) => {
  await send(page);
  await expect(status(page)).toHaveText(/200/);
  const expected = { JSON: '"name": "Aaliyah Corkery"', CSV: 'index,name,age', TXT: 'Aaliyah Corkery' };
  for (const [format, text] of Object.entries(expected)) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.download-group').getByRole('button', { name: format, exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`names.${format.toLowerCase()}`);
    expect(readFileSync(await download.path(), 'utf8')).toContain(text);
  }
});

test('copies the request as axios, openapi-fetch, MSW and Vite', async ({ page }) => {
  await page.getByRole('tab', { name: /Users/ }).click();
  const expected = {
    axios: "axios.get('http://127.0.0.1:6820/users?limit=10'",
    'openapi-fetch': "api.GET('/users'",
    MSW: 'restInPiecesHandlers({ http })',
    Vite: 'plugins: [restInPieces()]',
  };
  for (const [tab, text] of Object.entries(expected)) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(snippet(page)).toContainText(text.replace('6820', process.env.E2E_API_PORT ?? '6820'));
  }
});

test('switches between the system, light and dark colours, and remembers', async ({ page }) => {
  const html = page.locator('html');
  const theme = page.locator('.theme-switch');
  await expect(html).not.toHaveAttribute('data-theme');
  await theme.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await theme.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 19, 16)');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await theme.click();
  await expect(html).not.toHaveAttribute('data-theme');
});

test('the new panels speak Japanese', async ({ page }) => {
  await page.getByRole('button', { name: '日本語' }).click();
  await expect(page.getByTestId('sign-in-panel')).toContainText('サインイン（模擬認証）');
  await expect(page.getByTestId('session-panel')).toContainText('セッション');
  await page.getByRole('button', { name: /リクエストを送信/ }).click();
  await expect(page.getByRole('tab', { name: 'UI プレビュー' })).toBeVisible();
});

test('nothing on a phone scrolls the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-testid=sign-in-panel] > summary').click();
  await page.locator('[data-testid=session-panel] > summary').click();
  await page.getByRole('tab', { name: 'openapi-fetch' }).click();
  await send(page);
  await page.getByRole('tab', { name: 'UI preview' }).click();
  await expect(page.getByTestId('ui-cards')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
});
