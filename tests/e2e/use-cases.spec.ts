import { expect, test } from '@playwright/test';
import {
  endlessAnimations,
  playAll,
  sidewaysOverflow,
  textsOf,
  USE_CASE_IDS,
  watchErrors,
} from './use-cases.helpers.ts';

// The use cases page against the real API: every animation draws what the API answers, nothing recorded.
test.describe.configure({ timeout: 90_000 });

test('plays all eleven animations from real answers, in English, with no errors and no endless loop', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/?view=use-cases&lang=en');
  await expect(page.getByRole('heading', { level: 1, name: 'What it is for' })).toBeVisible();
  await expect(page.locator('article.uc-card')).toHaveCount(11);
  for (const id of USE_CASE_IDS) await expect(page.getByTestId(`uc-${id}`)).toBeAttached();
  await playAll(page);

  // The first, from /users?seed=7 and /orders/4: five people, then an order with its buyer and products.
  await expect(page.getByTestId('uc-person-row')).toHaveCount(5);
  await expect(page.getByTestId('uc-order')).toContainText('Easton Parisian');
  await expect(page.getByTestId('uc-order')).toContainText('Total');
  // The second: a POST answered 201 with a new id.
  await expect(page.getByTestId('uc-created-status')).toHaveText('201');
  await expect(page.getByTestId('uc-new-id')).toHaveText(/^\d+$/);
  // The third: ten tries, each a real 200 or 500; a 503 with Retry-After; an empty page.
  const dots = await page
    .getByTestId('uc-dots')
    .locator('li')
    .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.status));
  expect(dots).toHaveLength(10);
  for (const status of dots) expect(['200', '500']).toContain(status);
  await expect(page.getByTestId('uc-tally')).toContainText('of 10 requests failed');
  await expect(page.getByTestId('uc-down')).toContainText('503');
  await expect(page.getByTestId('uc-down')).toContainText('Retry-After: 1');
  await expect(page.getByTestId('uc-empty')).toContainText('0 results');
  await expect(page.getByTestId('uc-timing')).toContainText('pieces');
  // The fourth: some values flagged, from the data itself.
  await expect(page.getByTestId('uc-messy-cards').locator('.uc-flag').first()).toBeVisible();
  // The fifth: signed in, used, expired (401), refreshed, used again.
  expect(await textsOf(page, 'uc-log', '.uc-status')).toEqual(['200', '200', '401', '200', '200']);
  await expect(page.getByTestId('uc-log')).toContainText('token_expired');
  // The sixth: the same seed twice is identical, another seed is not.
  await expect(page.getByTestId('uc-same')).toContainText('identical');
  await expect(page.getByTestId('uc-other')).toBeVisible();
  // The seventh to the eleventh.
  await expect(page.getByTestId('uc-terminal-block').first()).toContainText('INSERT INTO "todos"');
  await expect(page.getByTestId('uc-terminal-block').nth(1)).toContainText('"title":');
  await expect(page.getByTestId('uc-generated').locator('tr')).toHaveCount(4);
  await expect(page.getByTestId('uc-locale-row')).toHaveCount(4);
  await expect(page.getByTestId('uc-adds')).toContainText('add up');
  await expect(page.getByTestId('uc-synthetic-tag')).toHaveText('SYNTHETIC');
  await expect(page.getByTestId('uc-invented')).toContainText('Invented data');
  // The eleventh: the G7 as a country select, Canada's provinces in the region select, and Ontario's card.
  await expect(page.getByTestId('uc-places-country').locator('option')).toHaveCount(8);
  await expect(page.getByTestId('uc-places-country')).toHaveValue('CA');
  await expect(page.getByTestId('uc-places-region')).toHaveValue('CA-ON');
  await expect(page.getByTestId('uc-places-card')).toContainText('オンタリオ州');
  await expect(page.getByTestId('uc-places-card')).toContainText('Ontario');

  expect(await endlessAnimations(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('says it in Japanese, with the same real data', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?view=use-cases&lang=ja');
  await expect(page.getByRole('heading', { level: 1, name: '使いどころ' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await playAll(page);
  await expect(page.getByTestId('uc-front-end').getByRole('heading', { level: 2 })).toHaveText(
    'バックエンドができる前にフロントエンドを作る',
  );
  await expect(page.getByTestId('uc-tally')).toContainText('件のリクエストが失敗しました');
  await expect(page.getByTestId('uc-invented')).toContainText('架空のデータです');
  await expect(page.getByTestId('uc-person-row')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('waits for an animation to scroll into view, then plays it', async ({ page }) => {
  await page.goto('/?view=use-cases&lang=en');
  const last = page.getByTestId('uc-stage-healthcare-fintech');
  await expect(last).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId('uc-patient')).toHaveCount(0);
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
  await expect(page.getByTestId('uc-patient')).toBeVisible();
});

test('shows the finished state at once, with no motion, when the reader asks for less', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = watchErrors(page);
  await page.goto('/?view=use-cases&lang=en');
  const started = Date.now();
  await playAll(page);
  // The slowest animation takes about ten seconds in motion; without it nothing waits on a clock but the API's own delay.
  expect(Date.now() - started).toBeLessThan(8_000);
  await expect(page.getByTestId('uc-person-row')).toHaveCount(5);
  await expect(page.getByTestId('uc-order')).toContainText('Easton Parisian');
  await expect(page.getByTestId('uc-dots').locator('li')).toHaveCount(10);
  await expect(page.getByTestId('uc-down')).toContainText('503');
  await expect(page.getByTestId('uc-log')).toContainText('token_expired');
  await expect(page.getByTestId('uc-same')).toContainText('identical');
  await expect(page.getByTestId('uc-adds')).toBeVisible();
  // Nothing moves: no running animation is left on the page, and the travelling dot is not drawn.
  const running = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' && (animation.effect?.getComputedTiming().activeDuration ?? 0) > 1,
        ).length,
  );
  expect(running).toBe(0);
  await expect(page.locator('.uc-wire-dot').first()).toBeHidden();
  expect(errors).toEqual([]);
});

for (const [language, width] of [
  ['en', 390],
  ['ja', 390],
] as const) {
  test(`fits a ${width}px phone in ${language} with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = watchErrors(page);
    await page.goto(`/?view=use-cases&lang=${language}`);
    expect(await sidewaysOverflow(page)).toBe(0);
    await playAll(page);
    expect(await sidewaysOverflow(page)).toBe(0);
    // No card, stage or code box pokes out of the window either, even where its own content scrolls.
    const poking = await page.evaluate((limit) => {
      return [...document.querySelectorAll('.uc-card, .uc-stage, .uc-code, .uc-window, .topbar')]
        .filter((element) => element.getBoundingClientRect().right > limit + 0.5)
        .map((element) => element.className);
    }, width);
    expect(poking).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('replays an animation from its button', async ({ page }) => {
  await page.goto('/?view=use-cases&lang=en');
  await playAll(page);
  const stage = page.getByTestId('uc-stage-repeatable');
  const before = await stage.locator('.uc-run').first().textContent();
  await page.getByTestId('uc-replay-repeatable').scrollIntoViewIfNeeded();
  await page.getByTestId('uc-replay-repeatable').click();
  await expect(stage).toHaveAttribute('data-state', 'running');
  await expect(page.getByTestId('uc-same')).toHaveCount(0);
  await expect(stage).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
  await expect(page.getByTestId('uc-same')).toContainText('identical');
  // The same seed, so the same people again.
  expect(await stage.locator('.uc-run').first().textContent()).toBe(before);
});

test('is usable from the keyboard: jump links, copy and the code boxes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?view=use-cases&lang=en');
  const jump = page
    .getByRole('navigation', { name: 'Jump to a use case' })
    .getByRole('link', { name: /Practise sign-in/ });
  await jump.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#sign-in$/);
  await expect(page.getByTestId('uc-sign-in')).toBeInViewport();

  const copy = page.getByTestId('uc-copy-sign-in-curl');
  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(copy).toContainText('Copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("curl -X POST 'http://localhost:6800/auth/login?expiresIn=4s'");

  // A code box that scrolls can be reached and scrolled with the keyboard.
  const box = page.getByTestId('uc-sign-in').locator('pre').first();
  await box.focus();
  await expect(box).toBeFocused();
});

test('follows the colour scheme, light and dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/?view=use-cases&lang=en');
  const background = () => page.getByTestId('uc-front-end').evaluate((card) => getComputedStyle(card).backgroundColor);
  const light = await background();
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await background();
  expect(light).not.toBe(dark);
});

test('is one click from the playground and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Use cases/ }).click();
  await expect(page).toHaveURL(/\?view=use-cases$/);
  await expect(page.getByRole('heading', { level: 1, name: 'What it is for' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the playground' }).click();
  await expect(page.getByText('LOCAL API')).toBeVisible();
  await expect(page.getByTestId('request-snippet')).toBeVisible();
});

test('opens the playground with the setup a use case describes', async ({ page }) => {
  await page.goto('/?view=use-cases&lang=en');
  await page.getByTestId('uc-international').getByRole('link', { name: 'Open this setup in the playground' }).click();
  await expect(page.getByTestId('request-snippet')).toContainText('/users?limit=4&seed=7&locale=ja');
});
