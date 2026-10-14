const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { chromium, expect } = require(root + '/node_modules/@playwright/test');
const out =
  process.env.RIP_DOCS_PICTURES_OUT || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rest-docs-pictures-'));
const images = root + '/docs/images',
  base = process.env.RIP_PICTURES_BASE || 'http://127.0.0.1:6843/rest-in-pieces/';
async function fit(page) {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  if (m.scroll > m.width) throw Error('Horizontal overflow ' + JSON.stringify(m));
}
(async () => {
  fs.mkdirSync(images, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const scheme of ['light', 'dark']) {
      for (const [subject, view] of [
        ['hero', 'desk'],
        ['hero', 'phone'],
        ['requests', 'desk'],
        ['errors', 'desk'],
        ['reference', 'desk'],
        ['embed', 'desk'],
      ]) {
        const context = await browser.newContext({
          viewport: { width: view === 'phone' ? 390 : 1200, height: view === 'phone' ? 844 : 900 },
          colorScheme: scheme,
          reducedMotion: 'reduce',
        });
        await context.addInitScript((scheme) => {
          localStorage.setItem('rest-in-pieces:theme', scheme);
          localStorage.setItem('rest-in-pieces:ui-locale', 'en');
        }, scheme);
        const page = await context.newPage();
        if (subject === 'embed') {
          await page.goto(base + 'builder.html');
          await page.locator('rest-in-pieces-table').waitFor({ state: 'visible' });
          await expect(page.locator('rest-in-pieces-table').getByRole('table')).toBeVisible();
        } else {
          await page.goto(base);
          await expect(page.getByText('IN-BROWSER API', { exact: true })).toBeVisible();
          if (subject === 'reference') await page.getByRole('tab', { name: 'Countries', exact: true }).click();
          if (subject === 'requests') await page.getByRole('combobox', { name: 'Sort field' }).selectOption('name');
          if (subject === 'errors') await page.getByRole('button', { name: /503 error/ }).click();
          await page.getByRole('button', { name: /Send request/ }).click();
          await expect(page.getByTestId('response-status')).toHaveText(subject === 'errors' ? /503/ : /200/);
        }
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, 0));
        await fit(page);
        const png = '/tmp/rest-photo-' + subject + '-' + view + '-' + scheme + '.png';
        await page.screenshot({ path: png });
        execFileSync('/opt/homebrew/bin/cwebp', [
          '-quiet',
          '-q',
          '78',
          png,
          '-o',
          path.join(images, `${subject}-${view}-${scheme}.webp`),
        ]);
        if (subject === 'hero' && view === 'desk' && scheme === 'light')
          fs.copyFileSync(png, root + '/docs/art/playground.png');
        console.log('Captured ' + subject + ' ' + view + ' ' + scheme);
        await context.close();
      }
    }
    for (const width of [1200, 390])
      for (const lang of ['en', 'ja'])
        for (const scheme of ['light', 'dark']) {
          const context = await browser.newContext({
              viewport: { width, height: 900 },
              colorScheme: scheme,
              reducedMotion: 'reduce',
            }),
            page = await context.newPage();
          await page.goto(base + 'docs/' + (lang === 'ja' ? 'ja/' : '') + 'index.html');
          await expect(page.locator('h1')).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(() => window.scrollTo(0, 0));
          await fit(page);
          await page.screenshot({ path: path.join(out, `03-rest-in-pieces-docs-${width}-${lang}-${scheme}.png`) });
          console.log('Docs ' + width + ' ' + lang + ' ' + scheme);
          await context.close();
        }
    const files = fs.readdirSync(images).filter((n) => n.endsWith('.webp'));
    let total = 0;
    for (const name of files) {
      const size = fs.statSync(path.join(images, name)).size;
      total += size;
      if (size > (name.includes('-desk-') ? 200 : 120) * 1024) throw Error('Picture budget ' + name + ' ' + size);
    }
    if (total > 2 * 1024 * 1024) throw Error('Total picture budget ' + total);
    console.log(files.length + ' pictures, ' + total + ' bytes.');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
