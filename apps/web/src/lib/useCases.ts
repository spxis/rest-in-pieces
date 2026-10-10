import type { PhraseKey } from '../i18n/phrases.ts';
import type { PlaygroundConfig } from './config.ts';
import type { UseCaseRequest } from './useCaseApi.ts';

/** Where the snippets point: the address `npx @johnmorrisdotca/rest-in-pieces` serves on. */
export const DISPLAY_BASE = 'http://localhost:6800';

/** A JSON Schema for use case 8: four properties, each one a different kind of constraint. */
export const PRODUCT_SCHEMA = {
  type: 'object',
  required: ['sku', 'status', 'price', 'contact'],
  properties: {
    sku: { type: 'string', pattern: '^[A-Z]{3}-[0-9]{4}$' },
    status: { enum: ['draft', 'live', 'retired'] },
    price: { type: 'number', minimum: 5, maximum: 500 },
    contact: { type: 'string', format: 'email' },
  },
} as const;

const LOCALES = ['en-CA', 'ja', 'fr-CA', 'global'] as const;
export type LocaleChoice = (typeof LOCALES)[number];

/**
 * Every request an illustration sends. The snippets below are written from these same strings, so what the
 * animation fetches is what a reader copies, and `useCases.test.ts` holds the two together.
 */
export const R = {
  people: { path: '/users?limit=5&seed=7&safe=true' },
  order: { path: '/orders/4?expand=user,items.product&safe=true' },
  post: { path: '/jsonplaceholder/posts/1' },
  newPost: { method: 'POST', path: '/jsonplaceholder/posts', body: { title: 'foo', body: 'bar', userId: 1 } },
  slow: { path: '/users?limit=3&seed=1&safe=true&delay=600&trickle=200' },
  flaky: { path: '/users?limit=1&seed=1&safe=true&fail=0.3' },
  down: { path: '/users?limit=1&status=503' },
  empty: { path: '/users?limit=3&q=zzzz' },
  clean: { path: '/users?limit=4&seed=9' },
  messy: { path: '/users?limit=4&seed=9&messy=0.3' },
  login: { method: 'POST', path: '/auth/login?expiresIn=4s', body: { username: 'admin', password: 'password' } },
  protectedRoute: { path: '/users?auth=admin&limit=1' },
  refresh: { method: 'POST', path: '/auth/refresh?expiresIn=4s' },
  seedA: { path: '/names?limit=4&seed=42' },
  seedB: { path: '/names?limit=4&seed=43' },
  sql: { path: '/todos?limit=3&seed=1&format=sql&table=todos' },
  ndjson: { path: '/todos?limit=3&seed=1&format=ndjson' },
  generate: { method: 'POST', path: '/generate?limit=4', body: { seed: 4, schema: PRODUCT_SCHEMA } },
  locale: (locale: LocaleChoice): UseCaseRequest => ({ path: `/users?limit=4&seed=7&locale=${locale}` }),
  patient: { path: '/patients?limit=1&seed=1' },
  invoice: { path: '/invoices?limit=1&seed=2' },
  transactions: { path: '/transactions?limit=4&seed=2' },
  g7: { path: '/groupings/g7/countries?limit=7' },
  regions: (code: string): UseCaseRequest => ({ path: `/countries/${code}/subdivisions?limit=10&sortBy=code` }),
  region: (code: string): UseCaseRequest => ({ path: `/subdivisions/${code}` }),
  map: (code: string): UseCaseRequest => ({ path: `/maps/${code}.svg?color=2f6b4f` }),
  province: { path: '/names?limit=2&seed=1&expand=subdivision' },
} satisfies Record<string, UseCaseRequest | ((arg: never) => UseCaseRequest)>;

export { LOCALES };

export interface Snippet {
  /** Technical, so it stays in Roman letters in every language. */
  label: string;
  code: string;
}

export interface UseCase {
  /** The anchor of the card, and the name its test ids use. */
  id: string;
  title: PhraseKey;
  problem: PhraseKey;
  how: PhraseKey;
  snippets: Snippet[];
  /** A setup the playground can open for this use case, when one setup says it. */
  playground?: Partial<PlaygroundConfig>;
}

const url = (path: string) => `${DISPLAY_BASE}${path}`;
const json = (value: unknown) => JSON.stringify(value);
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

export const USE_CASES: readonly UseCase[] = [
  {
    id: 'front-end',
    title: 'uc.front-end.title',
    problem: 'uc.front-end.problem',
    how: 'uc.front-end.how',
    playground: { endpoint: 'users', limit: 5, seed: 7 },
    snippets: [
      {
        label: 'fetch',
        code: `const BASE = '${DISPLAY_BASE}'; // later: your real backend's address

const { results: people } = await (await fetch(\`\${BASE}${R.people.path}\`)).json();
const order = await (await fetch(\`\${BASE}${R.order.path}\`)).json();
// order.user is the buyer, order.items[0].product the product`,
      },
      { label: 'curl', code: `curl '${url(R.people.path)}'\ncurl '${url(R.order.path)}'` },
    ],
  },
  {
    id: 'tutorial-api',
    title: 'uc.tutorial-api.title',
    problem: 'uc.tutorial-api.problem',
    how: 'uc.tutorial-api.how',
    snippets: [
      {
        label: 'fetch',
        code: `const BASE = '${DISPLAY_BASE}/jsonplaceholder'; // was https://jsonplaceholder.typicode.com

const post = await (await fetch(\`\${BASE}/posts/1\`)).json();
const created = await fetch(\`\${BASE}/posts\`, {
  method: 'POST',
  body: JSON.stringify({ title: 'foo', body: 'bar', userId: 1 }),
  headers: { 'Content-type': 'application/json; charset=UTF-8' },
}); // 201, with the post and its new id`,
      },
      {
        label: 'curl',
        code: `curl -X POST '${url(R.newPost.path)}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${json(R.newPost.body)}'`,
      },
      {
        label: 'CLI',
        code: 'npx @johnmorrisdotca/rest-in-pieces --session   # keep writes, so a later GET sees the post',
      },
    ],
  },
  {
    id: 'unhappy-paths',
    title: 'uc.unhappy-paths.title',
    problem: 'uc.unhappy-paths.problem',
    how: 'uc.unhappy-paths.how',
    playground: { endpoint: 'users', limit: 3, seed: 1, delay: '600', trickle: 200 },
    snippets: [
      {
        label: 'curl',
        code: `# slow, then a body that arrives in pieces 200 ms apart
curl -N '${url(R.slow.path)}'

# flaky: about three in ten requests fail with a 500
curl -i '${url(R.flaky.path)}'

# down: always 503, with Retry-After
curl -i '${url(R.down.path)}'

# empty: a search that matches nothing
curl '${url(R.empty.path)}'`,
      },
    ],
  },
  {
    id: 'messy-data',
    title: 'uc.messy-data.title',
    problem: 'uc.messy-data.problem',
    how: 'uc.messy-data.how',
    playground: { endpoint: 'users', limit: 4, seed: 9, messy: 0.3 },
    snippets: [
      {
        label: 'fetch',
        code: `// the same seed, tidy and then messy
const tidy = await (await fetch('${url(R.clean.path)}')).json();
const messy = await (await fetch('${url(R.messy.path)}')).json();`,
      },
      { label: 'curl', code: `curl '${url(R.messy.path)}'` },
    ],
  },
  {
    id: 'sign-in',
    title: 'uc.sign-in.title',
    problem: 'uc.sign-in.problem',
    how: 'uc.sign-in.how',
    snippets: [
      {
        label: 'fetch',
        code: `const login = await (await fetch('${url(R.login.path)}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'password' }),
})).json();

const headers = { Authorization: \`Bearer \${login.accessToken}\` };
await fetch('${url(R.protectedRoute.path)}', { headers }); // 200 now, 401 token_expired after 4 s

await fetch('${url(R.refresh.path)}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken: login.refreshToken }),
});`,
      },
      {
        label: 'curl',
        code: `curl -X POST '${url(R.login.path)}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${json(R.login.body)}'\ncurl -i '${url(R.protectedRoute.path)}' -H 'Authorization: Bearer <accessToken>'`,
      },
    ],
  },
  {
    id: 'repeatable',
    title: 'uc.repeatable.title',
    problem: 'uc.repeatable.problem',
    how: 'uc.repeatable.how',
    playground: { endpoint: 'names', limit: 4, seed: 42 },
    snippets: [
      {
        label: 'Playwright',
        code: `import { createApp } from '@johnmorrisdotca/rest-in-pieces';
import { expect, test } from '@playwright/test';

const app = createApp();

test('the people table matches its snapshot', async ({ page }) => {
  await page.route('**/api/names**', (route) => app.request('${R.seedA.path}').then(async (res) =>
    route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() })));
  await page.goto('/people');
  await expect(page.getByRole('table')).toHaveScreenshot();
});`,
      },
      {
        label: 'curl',
        code: `curl '${url(R.seedA.path)}'   # the same four people on every machine\ncurl '${url(R.seedB.path)}'   # a different four`,
      },
    ],
  },
  {
    id: 'seed-database',
    title: 'uc.seed-database.title',
    problem: 'uc.seed-database.problem',
    how: 'uc.seed-database.how',
    playground: { endpoint: 'todos', limit: 3, seed: 1, format: 'sql', table: 'todos' },
    snippets: [
      {
        label: 'CLI',
        code: `npx @johnmorrisdotca/rest-in-pieces generate \\
  --fields 'id:string.uuid,name:person.fullName,email:internet.email' \\
  --count 1000 --seed 1 --format sql --table people > people.sql`,
      },
      {
        label: 'curl',
        code: `curl '${url(R.sql.path)}' > todos.sql\ncurl '${url(R.ndjson.path)}' > todos.ndjson`,
      },
    ],
  },
  {
    id: 'from-schema',
    title: 'uc.from-schema.title',
    problem: 'uc.from-schema.problem',
    how: 'uc.from-schema.how',
    snippets: [
      {
        label: 'curl',
        code: `curl -X POST '${url(R.generate.path)}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${json(R.generate.body)}'`,
      },
      { label: 'JSON Schema', code: pretty(PRODUCT_SCHEMA) },
      {
        label: 'CLI',
        code: 'npx @johnmorrisdotca/rest-in-pieces generate --schema openapi.yaml --component Pet --count 1000 --format ndjson',
      },
    ],
  },
  {
    id: 'international',
    title: 'uc.international.title',
    problem: 'uc.international.problem',
    how: 'uc.international.how',
    playground: { endpoint: 'users', limit: 4, seed: 7, locale: 'ja' },
    snippets: [
      {
        label: 'curl',
        code: LOCALES.map((locale) => `curl '${url(R.locale(locale).path)}'`).join('\n'),
      },
    ],
  },
  {
    id: 'healthcare-fintech',
    title: 'uc.healthcare-fintech.title',
    problem: 'uc.healthcare-fintech.problem',
    how: 'uc.healthcare-fintech.how',
    playground: { endpoint: 'patients', limit: 1, seed: 1 },
    snippets: [
      {
        label: 'curl',
        code: `curl '${url(R.patient.path)}'\ncurl '${url(R.invoice.path)}'\ncurl '${url(R.transactions.path)}'`,
      },
    ],
  },
  {
    id: 'places-pickers',
    title: 'uc.places-pickers.title',
    problem: 'uc.places-pickers.problem',
    how: 'uc.places-pickers.how',
    playground: { endpoint: 'subdivisions', limit: 8, seed: 1 },
    snippets: [
      {
        label: 'fetch',
        code: `const BASE = '${DISPLAY_BASE}';

// the country select: real countries, with a flag emoji and a name in either language
const countries = await (await fetch(\`\${BASE}${R.g7.path}\`)).json();

// when one is chosen, the region select: its states, provinces or prefectures
const { results: regions } = await (await fetch(\`\${BASE}${R.regions('CA').path}\`)).json();

// and the place itself: its name in both languages, capital, population and the address of its flag
const ontario = await (await fetch(\`\${BASE}${R.region('CA-ON').path}\`)).json();
img.src = ontario.flag;                     // the flag on the CDN
map.src = \`\${BASE}${R.map('CA-ON').path}\`; // a map, drawn by the API`,
      },
      {
        label: 'curl',
        code: `curl '${url(R.g7.path)}'\ncurl '${url(R.regions('CA').path)}'\ncurl '${url(R.region('CA-ON').path)}'\ncurl '${url(R.map('CA-ON').path)}' > ontario.svg\n# a person's province, as its ISO 3166-2 record\ncurl '${url(R.province.path)}'`,
      },
    ],
  },
];
