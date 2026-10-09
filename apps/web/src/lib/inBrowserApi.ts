import { installInBrowserApi as install } from '@johnmorrisdotca/rest-in-pieces/browser';

/**
 * The GitHub Pages build has no server, so the whole API runs inside the page instead: requests to
 * the in-browser base URL are answered by the same app the Node server runs, loaded on first use.
 */
export const IN_BROWSER = import.meta.env.MODE === 'pages';

/** Where the in-browser API appears to live: `api/` beside the playground. */
export function inBrowserBase(): string {
  return new URL(`${import.meta.env.BASE_URL}api`, window.location.href).href;
}

export function isInBrowserApi(base: string): boolean {
  return IN_BROWSER && base.trim().replace(/\/+$/, '') === inBrowserBase();
}

/** Whether a request URL is answered by the in-browser API. */
export function isInBrowserUrl(url: string): boolean {
  return IN_BROWSER && url.startsWith(`${inBrowserBase()}/`);
}

export function installInBrowserApi(): void {
  install({ base: inBrowserBase() });
}
