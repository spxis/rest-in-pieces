import { expect, type Page } from '@playwright/test';

export const USE_CASE_IDS = [
  'front-end',
  'tutorial-api',
  'unhappy-paths',
  'messy-data',
  'sign-in',
  'repeatable',
  'seed-database',
  'from-schema',
  'international',
  'healthcare-fintech',
  'places-pickers',
] as const;

/** What the browser logs for the answers some examples ask for on purpose: a 500, a 503 and a 401. */
const INTENDED = /^Failed to load resource: the server responded with a status of (500|503|401)\b/;

/** Collects what a page logs as an error, apart from the failing answers the examples ask for. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !INTENDED.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

/** Scrolls every illustration into view, as a reader would, and waits for each to play to its end. */
export async function playAll(page: Page) {
  // The page is a lazy chunk: wait for all the stages to exist before asking which are done.
  await expect(page.locator('[data-testid^=uc-stage-]')).toHaveCount(USE_CASE_IDS.length);
  for (const stage of await page.locator('[data-testid^=uc-stage-]').all()) {
    await stage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
  }
  await expect(page.locator('[data-testid^=uc-stage-]:not([data-state=done])')).toHaveCount(0, { timeout: 40_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** Whether the page is wider than the window, the sideways scroll a phone must never show. */
export const sidewaysOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Animations that would never stop: an infinite one is a loop burning CPU for as long as the page is open. */
export const endlessAnimations = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY)
      .map((animation) => (animation as CSSAnimation).animationName ?? animation.id),
  );

/** The statuses an illustration of dots, or a log, ended on. */
export const textsOf = (page: Page, testId: string, selector: string) =>
  page.getByTestId(testId).locator(selector).allTextContents();
