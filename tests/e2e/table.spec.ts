import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { createApp } from '../../apps/api/src/core.ts';

async function serve(page: import('@playwright/test').Page) {
  await page.route('http://table.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = resolve('apps/web/dist', path.replace(/^\//, '').replace(/\/$/, '/index.html'));
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({
      body: readFileSync(file),
      contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
    });
  });
}
test('native seeded rows, copied frame and unchanged global fetch', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await serve(page);
  await page.goto('http://table.test/embed/?resource=names&rows=3&seed=7&lang=ja');
  await expect(page.locator('rest-in-pieces-table tbody tr')).toHaveCount(3);
  const found = await page.locator('rest-in-pieces-table').evaluate((table) => ({
    records: (table as unknown as { records: object[] }).records,
    fetch: window.fetch.toString(),
  }));
  const response = await createApp().request('https://table.invalid/names?limit=3&seed=7&format=json&safe=true');
  const native = (await response.json()) as { results: object[] };
  expect(found.records).toEqual(native.results);
  expect(found.fetch).toContain('[native code]');
  expect(errors).toEqual([]);
});
test('builder covers native options and all host formats', async ({ page }) => {
  await serve(page);
  await page.goto('http://table.test/builder.html?lang=ja');
  await expect(page.locator('#bld-stage tbody tr')).toHaveCount(5);
  await expect(page.locator('#bld-preview-title')).toHaveText('プレビュー');
  for (const format of ['element', 'iframe', 'module', 'react', 'vue', 'svelte', 'angular', 'html', 'url']) {
    await page.locator(`#bld-formats [data-format="${format}"]`).click();
    await expect(page.locator('#bld-code')).not.toHaveText('');
  }
});
test('frame validates input, stores nothing and captions remain text', async ({ page }) => {
  await serve(page);
  await page.goto(
    'http://table.test/embed/?resource=invalid&rows=99&seed=-1&locale=bad&width=Infinity&label=%3Cimg%3E',
  );
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.locator('caption')).toHaveText('<img>');
  const table = page.locator('rest-in-pieces-table');
  for (const name of ['resource', 'rows', 'seed', 'locale', 'width'])
    await expect(table).not.toHaveAttribute(name, /.*/);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('presentation changes preserve native records and custom host data stays local', async ({ page }) => {
  await serve(page);
  await page.goto('http://table.test/embed/?rows=2&seed=7');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const found = await page.locator('rest-in-pieces-table').evaluate(async (node) => {
    const table = node as unknown as {
      records: readonly object[];
      theme: string;
      columns: string;
      label: string;
      refresh(): Promise<void>;
    };
    const records = table.records;
    table.theme = 'dark';
    table.columns = 'firstName,lastName';
    table.label = 'People';
    await table.refresh();
    return {
      same: table.records === records,
      columns: [...node.shadowRoot!.querySelectorAll('th')].map((cell) => cell.textContent),
      background: getComputedStyle(node.shadowRoot!.querySelector('.table')!).backgroundColor,
    };
  });
  expect(found).toEqual({ same: true, columns: ['firstName', 'lastName'], background: 'rgb(29, 32, 30)' });
});

test('copied frame reports metadata without record payloads or storage', async ({ page }) => {
  await serve(page);
  await page.goto('http://table.test/builder.html?lang=en');
  await expect(page.locator('#bld-stage tbody tr')).toHaveCount(5);
  await page.locator('#bld-formats [data-format="iframe"]').click();
  const code = (await page.locator('#bld-code').textContent())!
    .replaceAll('https://spxis.github.io/rest-in-pieces/', 'http://table.test/')
    .replace('loading="lazy"', '');
  await page.route('http://article.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script>window.messages=[];addEventListener('message',event=>messages.push(event.data));</script>${code}`,
    }),
  );
  await page.goto('http://article.test/');
  await expect(page.frameLocator('iframe').locator('tbody tr')).toHaveCount(5);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { messages: { type: string }[] }).messages.some(
          (message) => message.type === 'rest-in-pieces-load',
        ),
      ),
    )
    .toBe(true);
  const messages = await page.evaluate(() => (window as unknown as { messages: { detail: object }[] }).messages);
  expect(Object.keys(messages[0]!.detail).sort()).toEqual(['count', 'dataset', 'seed']);
});
