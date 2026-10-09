/**
 * The current request written out for the tools a frontend developer reaches for: curl, fetch, axios,
 * openapi-fetch with the package's own types, Mock Service Worker and the Vite plugin. Every snippet
 * makes the same request the playground sends, so what works here works pasted.
 */
import { type OutputFormat, takesBody, takesId } from './config.ts';
import { acceptFor, BEARER_HEADER, curlCommand, fetchSnippet, type SendOptions, trimBase } from './request.ts';

export type SnippetKind = 'url' | 'curl' | 'fetch' | 'axios' | 'openapi-fetch' | 'msw' | 'vite';
export const SNIPPET_KINDS: readonly SnippetKind[] = ['url', 'curl', 'fetch', 'axios', 'openapi-fetch', 'msw', 'vite'];

/** What a tab shows on its label. */
export const SNIPPET_LABELS: Record<Exclude<SnippetKind, 'url'>, string> = {
  curl: 'curl',
  fetch: 'fetch',
  axios: 'axios',
  'openapi-fetch': 'openapi-fetch',
  msw: 'MSW',
  vite: 'Vite',
};

export interface SnippetRequest extends SendOptions {
  url: string;
  /** The API base the URL starts with, so the integrations can say the path under their own `/api`. */
  apiBase: string;
  format: OutputFormat;
  /** Whether the API keeps writes, so the integrations turn the session on too. */
  session?: boolean;
  /** The username signed in with, when the request carries a token: the snippet signs in the same way first. */
  account?: string;
}

const PACKAGE = '@johnmorrisdotca/rest-in-pieces';

/** The path and query under the API base: `/users?limit=10`. */
export function relativePath(url: string, apiBase: string): string {
  const base = trimBase(apiBase);
  if (base && url.startsWith(base)) return url.slice(base.length) || '/';
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

const quote = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/** The headers object a snippet passes, as source. */
function headersSource(format: OutputFormat, { method, bearer }: SendOptions): string {
  const parts = [`Accept: ${quote(acceptFor(format, method))}`];
  if (takesBody(method)) parts.push(`'Content-Type': 'application/json'`);
  if (bearer) parts.push(BEARER_HEADER);
  return `{ ${parts.join(', ')} }`;
}

export function axiosSnippet({ url, format, method, body, bearer }: SnippetRequest): string {
  const verb = method.toLowerCase();
  const options = [`headers: ${headersSource(format, { method, ...(bearer ? { bearer } : {}) })}`];
  if (method === 'GET' && format !== 'json') options.push(`responseType: 'text'`);
  const args = [quote(url), ...(takesBody(method) ? [body?.trim() ? bodyLiteral(body) : '{}'] : [])];
  return [
    "import axios from 'axios';",
    '',
    '// axios rejects on 4xx and 5xx: error.response.status and error.response.data say what the API answered.',
    `const { data, status, headers } = await axios.${verb}(${args.join(', ')}, {`,
    ...options.map((option) => `  ${option},`),
    '});',
  ].join('\n');
}

/** A body as an object literal when it parses, so axios sends it as JSON; the typed text otherwise. */
function bodyLiteral(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2).replace(/\n/g, '\n  ');
  } catch {
    return JSON.stringify(body);
  }
}

/** The query as openapi-fetch takes it: strings, and an array for a name given twice. */
function queryObject(search: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of search) {
    const existing = query[key];
    query[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return query;
}

const objectSource = (value: Record<string, unknown>) =>
  `{ ${Object.entries(value)
    .map(
      ([key, v]) =>
        `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : quote(key)}: ${typeof v === 'string' ? quote(v) : JSON.stringify(v).replaceAll('"', "'")}`,
    )
    .join(', ')} }`;

export function openapiFetchSnippet({ url, apiBase, format, method, body, bearer }: SnippetRequest): string {
  const relative = new URL(relativePath(url, apiBase), 'http://base.invalid');
  const segments = relative.pathname.split('/').filter(Boolean);
  const named = takesId(method) || (method === 'GET' && segments.length > 1);
  // `/users/7/orders` is the path `/users/{id}/orders` with id 7.
  const tail = method === 'GET' && segments[2] ? `/${segments[2]}` : '';
  const template = named ? `/${segments[0]}/{id}${tail}` : `/${segments[0] ?? ''}`;
  const query = queryObject(relative.searchParams);
  const params: string[] = [];
  if (named) params.push(`path: { id: ${quote(decodeURIComponent(segments[1] ?? ''))} }`);
  if (Object.keys(query).length > 0) params.push(`query: ${objectSource(query)}`);
  const init: string[] = [];
  if (params.length > 0) init.push(`params: { ${params.join(', ')} }`);
  if (takesBody(method)) init.push(`body: ${body?.trim() ? bodyLiteral(body) : '{}'}`);
  if (bearer) init.push(`headers: { ${BEARER_HEADER} }`);
  if (method === 'GET' && format !== 'json') init.push(`parseAs: 'text'`);
  return [
    "import createClient from 'openapi-fetch';",
    `import type { paths } from '${PACKAGE}/types';`,
    '',
    `const api = createClient<paths>({ baseUrl: ${quote(trimBase(apiBase))} });`,
    `const { data, error, response } = await api.${method}(${quote(template)}${init.length > 0 ? ', {' : ');'}`,
    ...(init.length > 0 ? [...init.map((line) => `  ${line},`), '});'] : []),
  ].join('\n');
}

/** A fetch of the same request under `/api`, the base the integrations use by default. */
function underApi(request: SnippetRequest): string {
  const { format, ...options } = request;
  return fetchSnippet(`/api${relativePath(request.url, request.apiBase)}`, format, options);
}

const appOption = (session?: boolean) => (session ? ', app: { session: true }' : '');

export function mswSnippet(request: SnippetRequest): string {
  return [
    "import { http } from 'msw';",
    "import { setupWorker } from 'msw/browser';",
    `import { restInPiecesHandlers } from '${PACKAGE}/msw';`,
    '',
    '// Once, at start-up, with the worker script in place (npx msw init public).',
    `await setupWorker(...restInPiecesHandlers({ http${appOption(request.session)} })).start({ onUnhandledRequest: 'bypass' });`,
    '',
    underApi(request),
  ].join('\n');
}

export function viteSnippet(request: SnippetRequest): string {
  const options = request.session ? '{ app: { session: true } }' : '';
  return [
    '// vite.config.ts',
    "import { defineConfig } from 'vite';",
    `import { restInPieces } from '${PACKAGE}/vite';`,
    '',
    `export default defineConfig({ plugins: [restInPieces(${options})] });`,
    '',
    '// In the app: the dev server answers /api on its own origin.',
    underApi(request),
  ].join('\n');
}

/** How a snippet gets its token: the same sign-in the playground made, so it runs as pasted. */
function signIn(kind: SnippetKind, { apiBase, account }: SnippetRequest): string[] {
  if (!account) return [];
  const login = JSON.stringify({ username: account, password: 'password' });
  const loginUrl = `${trimBase(apiBase)}/auth/login`;
  if (kind === 'curl') {
    return [
      `TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' -d '${login}' '${loginUrl}' | jq -r .accessToken)`,
    ];
  }
  if (kind === 'fetch') {
    return [
      `const login = await fetch(${quote(loginUrl)}, {`,
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      `  body: JSON.stringify({ username: ${quote(account)}, password: 'password' }),`,
      '});',
      'const { accessToken: token } = await login.json();',
      '',
    ];
  }
  return [`// token: the accessToken from POST /auth/login (username ${quote(account)}, password 'password').`];
}

/** The text a tab shows and its copy button copies. */
export function snippetFor(kind: SnippetKind, input: SnippetRequest): string {
  const request = { ...input, bearer: input.account !== undefined };
  const { url, format, method } = request;
  const code = (() => {
    switch (kind) {
      case 'url':
        return method === 'GET' ? url : `${method} ${url}`;
      case 'curl':
        return curlCommand(url, format, request);
      case 'fetch':
        return fetchSnippet(url, format, request);
      case 'axios':
        return axiosSnippet(request);
      case 'openapi-fetch':
        return openapiFetchSnippet(request);
      case 'msw':
        return mswSnippet(request);
      case 'vite':
        return viteSnippet(request);
    }
  })();
  return kind === 'url' ? code : [...signIn(kind, request), code].join('\n');
}
