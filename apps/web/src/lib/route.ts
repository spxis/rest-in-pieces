/** The pages the one-page app draws: the playground, and the use cases beside it. */
export type View = 'playground' | 'use-cases';

/** The query that opens the use cases anywhere the app is served from `/`, such as the npm package and Docker. */
export const VIEW_PARAM = 'view';
const USE_CASES = 'use-cases';

/**
 * Which page an address asks for: `…/use-cases/` (the GitHub Pages copy) or `?view=use-cases`
 * (everywhere else, since the API serves the app at `/` alone). Anything else is the playground.
 */
export function viewFor(pathname: string, search: string): View {
  if (new URLSearchParams(search).get(VIEW_PARAM) === USE_CASES) return 'use-cases';
  const last = pathname.split('/').filter(Boolean).pop();
  return last === USE_CASES ? 'use-cases' : 'playground';
}

/** Where the use cases live: a folder of their own on GitHub Pages, a query on the app's own address elsewhere. */
export function casesPageHref(onPages: boolean, pageBase: string): string {
  return onPages ? `${pageBase}${USE_CASES}/` : `${pageBase}?${VIEW_PARAM}=${USE_CASES}`;
}

/** The playground's own address, from the use cases page. */
export const playgroundHref = (pageBase: string): string => pageBase;
