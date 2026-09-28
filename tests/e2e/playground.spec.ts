import { expect, test } from '@playwright/test';

test('a repeatable scenario can be shared, restored, and inspected', async ({ page, context }) => {
  const requestUrls: URL[] = [];
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('http://localhost:6800/**', async (route) => {
    requestUrls.push(new URL(route.request().url()));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [{ index: 10, name: 'Sample Person' }] }),
    });
  });

  await page.goto('/');
  await expect(page.getByText('LOCAL API')).toBeVisible();
  await page.locator('#api-base').fill('https://api.example.test');
  await expect(page.getByText('REMOTE API')).toBeVisible();
  await page.locator('#api-base').fill('http://localhost:6800');

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('.request-preview > code')).toContainText('offset=10');
  await page.getByRole('button', { name: 'Share setup' }).click();
  const setupUrl = await page.evaluate(() => navigator.clipboard.readText());

  await page.goto(setupUrl);
  await expect(page.locator('#api-base')).toHaveValue('http://localhost:6800');
  await expect(page.locator('.request-preview > code')).toContainText('offset=10');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.locator('.response-body')).toContainText('Sample Person');
  expect(requestUrls).toHaveLength(1);
  expect(requestUrls[0]?.searchParams.get('offset')).toBe('10');
});
