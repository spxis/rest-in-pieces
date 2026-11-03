const fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { chromium, expect } = require(root + '/node_modules/@playwright/test');
const out =
  process.env.RIP_DOCS_PICTURES_OUT || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rest-docs-pictures-'));
const images = root + '/docs/images',
  base = process.env.RIP_PICTURES_BASE || 'http://127.0.0.1:6843/rest-in-pieces/',
  only = process.env.RIP_PICTURES_ONLY ? process.env.RIP_PICTURES_ONLY.split(',') : null;
async function fit(page) {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  if (m.scroll > m.width) throw Error('Horizontal overflow ' + JSON.stringify(m));
}
// The family's thumbnail, dark thumbnail and icon (apps/api/scripts/family-thumbnail.mjs), into docs/images: the playground's UI preview of
// seeded users, each with the SVG avatar the package draws, taken off the page in each scheme; the icon is four avatars the package draws
// from a seed alone (the five-by-five pattern, no initials), two by two. `--thumbnail` takes only these three.
async function thumbnail(browser) {
  const { pathToFileURL } = require('node:url');
  const { captureDrawing, composeThumbnails } = await import(
    pathToFileURL(`${root}/apps/api/scripts/family-thumbnail.mjs`).href
  );
  const { avatarSvg } = await import(pathToFileURL(`${root}/apps/api/dist/images.js`).href);
  // Four seeds whose avatars come out in four different colours.
  const avatars = ['4', '14', '12', '10'].map((seed) => avatarSvg(`thumbnail-${seed}`));
  const taken = {};
  for (const [kind, scheme] of [
    ['light', 'light'],
    ['dark', 'dark'],
    ['icon', 'light'],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
      reducedMotion: 'reduce',
    });
    await context.addInitScript((scheme) => {
      localStorage.setItem('rest-in-pieces:theme', scheme);
      localStorage.setItem('rest-in-pieces:ui-locale', 'en');
    }, scheme);
    const page = await context.newPage();
    await page.goto(base);
    await expect(page.getByText('IN-BROWSER API', { exact: true })).toBeVisible();
    if (kind === 'icon') {
      await page.evaluate((avatars) => {
        const tile = (svg) =>
          svg.replace('<svg ', '<svg style="width:220px;height:220px;display:block;border-radius:36px" ');
        document.body.replaceChildren();
        document.body.insertAdjacentHTML(
          'beforeend',
          `<div id="thumbnail-icon" style="display:grid;grid-template-columns:auto auto;gap:24px;padding:8px;width:max-content">${avatars.map(tile).join('')}</div>`,
        );
      }, avatars);
    } else {
      await page.getByRole('tab', { name: 'Users', exact: true }).click();
      await page.getByRole('button', { name: /Send request/ }).click();
      await expect(page.getByTestId('response-status')).toHaveText(/200/);
      await page.getByRole('tab', { name: /UI preview/ }).click();
    }
    const drawing = kind === 'icon' ? '#thumbnail-icon' : '.ui-preview-body ul';
    await page.locator(drawing).waitFor();
    // The panels round the preview draw their edges as borders, which would frame the drawing: they are taken off.
    await page.locator(drawing).evaluate((element) => {
      for (let node = element.parentElement; node; node = node.parentElement)
        node.style.setProperty('border-color', 'transparent', 'important');
    });
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    taken[kind] = await captureDrawing(page, drawing);
    if (kind === 'icon')
      for (const picture of await composeThumbnails({
        page,
        root: `${root}/apps/api`,
        light: taken.light,
        dark: taken.dark,
        icon: taken.icon,
        label: 'REST in Pieces',
      }))
        console.log(`Captured ${picture.file} ${picture.bytes} bytes`);
    await context.close();
  }
}
(async () => {
  fs.mkdirSync(images, { recursive: true });
  const browser = await chromium.launch();
  try {
    await thumbnail(browser);
    if (process.argv.includes('--thumbnail')) return;
    for (const scheme of ['light', 'dark']) {
      for (const [subject, view] of [
        ['hero', 'desk'],
        ['hero', 'phone'],
        ['requests', 'desk'],
        ['errors', 'desk'],
        ['reference', 'desk'],
        ['embed', 'desk'],
        ['builder', 'desk'],
        ['docs', 'desk'],
      ]) {
        // RIP_PICTURES_ONLY=builder,docs retakes only those subjects and leaves every other picture as it is.
        if (only && !only.includes(subject)) continue;
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
        if (subject === 'builder') {
          await page.goto(base + 'demo/builder.html?target=vite&base=%2Fmock&session=true');
          await expect(page.getByTestId('code-stepConfig')).toContainText("restInPieces({ base: '/mock'");
        } else if (subject === 'docs') {
          await page.goto(base + 'docs/index.html');
          await expect(page.locator('h1')).toBeVisible();
        } else if (subject === 'embed') {
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
    for (const width of only ? [] : [1200, 390])
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
