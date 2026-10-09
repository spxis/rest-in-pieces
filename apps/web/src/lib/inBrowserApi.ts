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

let uninstall: (() => void) | null = null;
let keeping = false;

/**
 * Puts the API inside this tab. Writes are kept only when `session` asks: the demo starts stateless, as
 * every hosted copy does, and the session panel can turn keeping on for this tab alone.
 */
export function installInBrowserApi(session = false): void {
  uninstall?.();
  keeping = session;
  uninstall = install({ base: inBrowserBase(), app: { session } });
}

/** Whether the API inside this tab keeps writes. */
export const inBrowserSession = () => keeping;

/** Starts a fresh API inside this tab, keeping writes or not. Whatever the old one kept is gone. */
export function setInBrowserSession(on: boolean): void {
  if (IN_BROWSER) installInBrowserApi(on);
}
