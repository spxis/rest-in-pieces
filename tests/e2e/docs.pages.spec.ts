import { expect, test } from '@playwright/test';

for (const width of [1200, 390]) {
  for (const language of ['en', 'ja'] as const) {
    test(`native Docs to generated types and back at ${width}px in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./');
      await expect(page.getByText('IN-BROWSER API', { exact: true })).toBeVisible();
      if (language === 'ja') await page.getByRole('button', { name: '日本語', exact: true }).click();
      const docs = page.getByRole('link', { name: language === 'ja' ? 'ドキュメント' : 'Docs', exact: true });
      await expect(docs).toHaveAttribute('href', `/rest-in-pieces/docs/${language === 'ja' ? 'ja/' : ''}index.html`);
      const dimensions = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      expect(dimensions[0]).toBeLessThanOrEqual(dimensions[1]);
      await docs.click();
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await page
        .locator('.docs-content')
        .getByRole('link', { name: '@johnmorrisdotca/rest-in-pieces/types', exact: true })
        .click();
      await page.locator('.docs-content').getByRole('link', { name: 'paths', exact: true }).click();
      await expect(page.locator('h1')).toHaveText(language === 'ja' ? 'paths型' : 'pathstype');
      await expect(
        page.locator('a[href="https://github.com/spxis/rest-in-pieces/blob/main/apps/api/scripts/docs-openapi.ts"]'),
      ).toBeVisible();
      await page
        .locator('header')
        .getByRole('link', { name: language === 'ja' ? 'デモ' : 'Demo', exact: true })
        .click();
      await expect(
        page.getByText(language === 'ja' ? 'ブラウザー内 API' : 'IN-BROWSER API', { exact: true }),
      ).toBeVisible();
    });
  }
}

test('the builder Docs link follows initial and live language', async ({ page }) => {
  await page.goto('./builder.html?lang=ja');
  const docs = page.locator('[data-say="pageDocs"]');
  await expect(docs).toHaveText('ドキュメント');
  await expect(docs).toHaveAttribute('href', 'docs/ja/index.html');
  await page.locator('button[data-lang="en"]').click();
  await expect(docs).toHaveAttribute('href', 'docs/index.html');
  await page.locator('button[data-lang="ja"]').click();
  await docs.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
});
