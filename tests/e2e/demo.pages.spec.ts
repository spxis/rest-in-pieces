import { expect, test } from '@playwright/test';

// The demo pages (demo/), as GitHub Pages serves them: the setup builder and the live reader of the static API.

test('the demo index links the pages and reads the public static API', async ({ page }) => {
  await page.goto('demo/index.html');
  await expect(page.getByTestId('title')).toHaveText('Demo pages');
  await expect(page.getByTestId('card-builder')).toHaveAttribute('href', 'builder.html');
  // Wait for a row of data before asserting anything about the table.
  await expect(page.getByTestId('ex-table').getByRole('row')).toHaveCount(11);
  await expect(page.getByTestId('ex-status')).toHaveText('Records 1 to 10 of 100');
  await expect(page.getByTestId('ex-address')).toHaveText('https://spxis.github.io/rest-in-pieces/api/users.json');
  await page.getByTestId('ex-next').click();
  await expect(page.getByTestId('ex-status')).toHaveText('Records 11 to 20 of 100');
  await expect(page.getByTestId('ex-address')).toHaveText(
    'https://spxis.github.io/rest-in-pieces/api/users/page/2.json',
  );
  await page.getByTestId('ex-locale').selectOption('ja');
  await expect(page.getByTestId('ex-status')).toHaveText('Records 1 to 10 of 100');
  await expect(page.getByTestId('ex-address')).toHaveText('https://spxis.github.io/rest-in-pieces/api/ja/users.json');
});

test('the setup builder writes a command, follows the options and keeps the setup in the link', async ({ page }) => {
  await page.goto('demo/builder.html');
  await expect(page.getByTestId('title')).toHaveText('Setup builder');
  const run = page.getByTestId('code-stepRun');
  await expect(run).toHaveText('npx @johnmorrisdotca/rest-in-pieces');
  await page.getByTestId('opt-port').fill('6900');
  await page.getByTestId('opt-session').check();
  await page.getByTestId('opt-safe').uncheck();
  await expect(run).toHaveText('npx @johnmorrisdotca/rest-in-pieces --port 6900 --session --no-safe');
  expect(new URL(page.url()).searchParams.get('port')).toBe('6900');
  // A mocked API does not keep writes, so a file and a session together are a fault, and nothing is built.
  await page.getByTestId('opt-openapi').fill('openapi.yaml');
  await expect(page.getByTestId('problems')).toBeVisible();
  await expect(page.getByTestId('problems')).toContainText('session is off');
  await expect(run).toHaveCount(0);
  await page.getByTestId('opt-session').uncheck();
  await expect(page.getByTestId('problems')).toBeHidden();
  await expect(run).toHaveText(
    'npx @johnmorrisdotca/rest-in-pieces serve --port 6900 --no-safe --openapi openapi.yaml',
  );
  await page.getByTestId('again').click();
  await expect(run).toHaveText('npx @johnmorrisdotca/rest-in-pieces');
});

test('the setup builder follows the way of running it, and a link rebuilds the setup in Japanese', async ({ page }) => {
  await page.goto('demo/builder.html?target=mswNode&session=true');
  await expect(page.getByTestId('code-stepCode')).toContainText("base: 'http://localhost/api', app: { session: true }");
  await expect(page.getByTestId('opt-network')).toBeHidden();
  await page.getByLabel('Theme').selectOption('dark');
  await page.getByText('Docker', { exact: true }).click();
  await expect(page.getByTestId('code-stepRun')).toContainText('-e REST_IN_PIECES_SESSION=true');
  await page.getByText('Offline files', { exact: true }).click();
  await page.getByTestId('opt-format').selectOption('sql');
  await page.getByTestId('opt-table').fill('people');
  await expect(page.getByTestId('code-stepRun')).toContainText('--format sql --table people');
  await expect(page.getByTestId('code-stepRun')).toContainText('> records.sql');
  await page.getByLabel('Language').selectOption('ja');
  await expect(page.getByTestId('title')).toHaveText('セットアップビルダー');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await page.getByTestId('opt-count').fill('0');
  await expect(page.getByTestId('problems')).toContainText('レコード数は1〜10,000,000の整数');
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(width[0]).toBeLessThanOrEqual(width[1]);
});

test('the setup builder fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('demo/builder.html?target=offline');
  await expect(page.getByTestId('code-stepRun')).toBeVisible();
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(width[0]).toBeLessThanOrEqual(width[1]);
});
