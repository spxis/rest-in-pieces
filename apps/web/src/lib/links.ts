import { trimBase } from './request.ts';

/** Where the project lives outside this page. */
export const REPO_URL = 'https://github.com/spxis/rest-in-pieces';
export const NPM_URL = 'https://www.npmjs.com/package/@johnmorrisdotca/rest-in-pieces';
/** The live demo on GitHub Pages, which also serves the static fixtures. */
export const PAGES_URL = 'https://spxis.github.io/rest-in-pieces/';

/**
 * The interactive API reference. A real server serves it at `/docs`; the in-browser API only answers
 * `fetch`, so on GitHub Pages the reference is the static copy at `api/docs/` beside the playground.
 */
export function docsUrl(apiBase: string, inBrowser: boolean, pageBase: string): string {
  return inBrowser ? `${pageBase}api/docs/` : `${trimBase(apiBase)}/docs`;
}

/**
 * The pre-generated responses and the index that lists them. They exist only on GitHub Pages, so every
 * other build points at the live copy there; `index.json` is linked because Pages lists no folders.
 */
export function fixturesUrl(onPages: boolean, pageBase: string): string {
  return `${onPages ? pageBase : PAGES_URL}fixtures/index.json`;
}

/** The static API's index, which lists the datasets, the page paths and the JSONPlaceholder-shaped tree. */
export function staticApiUrl(onPages: boolean, pageBase: string): string {
  return `${onPages ? pageBase : PAGES_URL}api/index.json`;
}
