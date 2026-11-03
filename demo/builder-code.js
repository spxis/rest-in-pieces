// The setup builder's logic, apart from the page: the choices go in, the command or code and any faults come out.
// It imports nothing and touches no page, so the browser and scripts/demo.test.mjs run the same file. Every option it
// writes is one the package reads; scripts/demo.test.mjs parses the commands with the real command-line parser and runs
// the in-process options through the real createApp.

export const PACKAGE = '@johnmorrisdotca/rest-in-pieces';
export const IMAGE = 'ghcr.io/spxis/rest-in-pieces';

/** The ways to run it, in the order the page lists them. */
export const TARGETS = ['cli', 'docker', 'tests', 'tab', 'vite', 'mswBrowser', 'mswNode', 'offline'];

/** The data locales `GET /locales` lists. */
export const LOCALES = [
  ['en-CA', 'English (Canada)'],
  ['en-US', 'English (United States)'],
  ['en-GB', 'English (United Kingdom)'],
  ['en-IN', 'English (India)'],
  ['fr', 'Français (France)'],
  ['fr-CA', 'Français (Canada)'],
  ['de', 'Deutsch'],
  ['es-MX', 'Español (México)'],
  ['pt-BR', 'Português (Brasil)'],
  ['ru', 'Русский'],
  ['id', 'Indonesia'],
  ['vi', 'Tiếng Việt'],
  ['ko', '한국어'],
  ['zh-CN', '中文 (中国)'],
  ['ja', '日本語'],
  ['global', 'Global mix'],
];

export const FORMATS = ['ndjson', 'json', 'csv', 'sql'];
export const MAX_RECORDS = 10_000_000;
export const MAX_SEED = 2 ** 32 - 1;

export const DEFAULTS = {
  target: 'cli',
  port: 6800,
  network: false,
  session: false,
  safe: true,
  streams: true,
  flags: 'auto',
  base: '/api',
  openapi: '',
  source: 'fields',
  fields: 'name:person.fullName,age:number.int(18,65),status:pick(active,paused,closed|70,20,10)',
  constraints: '',
  schema: '',
  count: 1000,
  seed: 1,
  format: 'ndjson',
  table: 'records',
  batch: 1,
  transaction: false,
  bom: false,
  locale: 'en-CA',
  output: '',
};

/** Which choices each way of running reads. The page shows only these; the rest are ignored. */
export const APPLIES = {
  cli: ['port', 'network', 'session', 'safe', 'streams', 'flags', 'openapi'],
  docker: ['port', 'session', 'safe', 'streams', 'flags'],
  tests: ['session', 'safe', 'streams', 'flags'],
  tab: ['base', 'session', 'safe', 'streams', 'flags'],
  vite: ['base', 'session', 'safe', 'streams', 'flags'],
  mswBrowser: ['base', 'session', 'safe', 'streams', 'flags'],
  mswNode: ['base', 'session', 'safe', 'streams', 'flags'],
  offline: [
    'source',
    'fields',
    'constraints',
    'schema',
    'count',
    'seed',
    'format',
    'table',
    'batch',
    'transaction',
    'bom',
    'locale',
    'safe',
    'output',
  ],
};

/** Where to read more, per way of running: [words key, address]. */
export const DOCS = {
  cli: [
    ['readmeRun', 'https://github.com/spxis/rest-in-pieces#run-it'],
    ['guideStart', 'https://spxis.github.io/rest-in-pieces/docs/guides/getting-started.html'],
    ['guideOpenapi', 'https://spxis.github.io/rest-in-pieces/docs/guides/openapi-mocks.html'],
  ],
  docker: [
    ['readmeRun', 'https://github.com/spxis/rest-in-pieces#run-it'],
    ['guideSessions', 'https://spxis.github.io/rest-in-pieces/docs/guides/sessions-and-auth.html'],
  ],
  tests: [
    ['useWithTests', 'https://github.com/spxis/rest-in-pieces/blob/main/docs/use-with.md#playwright'],
    ['guideSessions', 'https://spxis.github.io/rest-in-pieces/docs/guides/sessions-and-auth.html'],
  ],
  tab: [['guideBrowser', 'https://spxis.github.io/rest-in-pieces/docs/guides/browser-and-frameworks.html']],
  vite: [['useWithVite', 'https://github.com/spxis/rest-in-pieces/blob/main/docs/use-with.md#vite']],
  mswBrowser: [
    ['useWithMsw', 'https://github.com/spxis/rest-in-pieces/blob/main/docs/use-with.md#mock-service-worker'],
  ],
  mswNode: [['useWithMsw', 'https://github.com/spxis/rest-in-pieces/blob/main/docs/use-with.md#mock-service-worker']],
  offline: [
    ['offlineDoc', 'https://github.com/spxis/rest-in-pieces/blob/main/docs/offline-generator.md'],
    ['guideFormats', 'https://spxis.github.io/rest-in-pieces/docs/guides/formats-and-sql.html'],
  ],
};

const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;
const TABLE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** A shell word: as it is when nothing in it needs quoting, otherwise in single quotes. */
export const shellQuote = (text) => (SAFE_WORD.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`);

const whole = (value, min, max) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** The choices with the defaults under them; a value of the wrong kind falls back to its default. */
export function normalise(input = {}) {
  const out = { ...DEFAULTS };
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof fallback === 'boolean') out[key] = value === true || value === 'true' || value === '1';
    else if (typeof fallback === 'number')
      out[key] = typeof value === 'number' ? value : value === '' ? Number.NaN : Number(value);
    else out[key] = String(value);
  }
  if (!TARGETS.includes(out.target)) out.target = DEFAULTS.target;
  if (!['fields', 'schema'].includes(out.source)) out.source = DEFAULTS.source;
  if (!['auto', 'cdn'].includes(out.flags)) out.flags = DEFAULTS.flags;
  if (!FORMATS.includes(out.format)) out.format = DEFAULTS.format;
  return out;
}

/** The choices that differ from the defaults, for a link that rebuilds the same setup. */
export function changed(state) {
  const now = normalise(state);
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key !== 'target' && !APPLIES[now.target].includes(key)) continue;
    if (now[key] !== DEFAULTS[key] || key === 'target') out[key] = now[key];
  }
  return out;
}

/** The options `createApp` takes, as an object holding only what differs from its defaults. */
export function appOptions(state) {
  const now = normalise(state);
  const out = {};
  if (now.session) out.session = true;
  if (!now.safe) out.safe = false;
  if (!now.streams) out.streams = false;
  if (now.flags === 'cdn') out.flags = 'cdn';
  return out;
}

const literal = (options) => {
  const parts = Object.entries(options).map(
    ([key, value]) => `${key}: ${typeof value === 'string' ? `'${value}'` : value}`,
  );
  return parts.length ? `{ ${parts.join(', ')} }` : '';
};

/** The environment a served API reads for the choices the command line has no flag for. */
export function serveEnvironment(state) {
  const now = normalise(state);
  const out = [];
  if (!now.streams) out.push(['REST_IN_PIECES_STREAMS', 'false']);
  if (now.flags === 'cdn') out.push(['REST_IN_PIECES_FLAGS', 'cdn']);
  return out;
}

/** The arguments after `rest-in-pieces` for the command-line target. */
export function serveArguments(state) {
  const now = normalise(state);
  const args = [];
  if (now.openapi.trim() !== '') args.push('serve');
  if (now.port !== DEFAULTS.port) args.push('--port', String(now.port));
  if (now.network) args.push('--host', '0.0.0.0');
  if (now.session && now.openapi.trim() === '') args.push('--session');
  if (!now.safe) args.push('--no-safe');
  if (now.openapi.trim() !== '') args.push('--openapi', now.openapi.trim());
  return args;
}

/** The arguments after `rest-in-pieces` for the offline target. */
export function generateArguments(state) {
  const now = normalise(state);
  const args = ['generate'];
  if (now.source === 'fields') {
    args.push('--fields', now.fields.trim());
    if (now.constraints.trim() !== '') args.push('--constraints', now.constraints.trim());
  } else args.push('--schema', now.schema.trim());
  if (now.count !== DEFAULTS.count) args.push('--count', String(now.count));
  if (now.seed !== DEFAULTS.seed) args.push('--seed', String(now.seed));
  if (now.format !== DEFAULTS.format) args.push('--format', now.format);
  if (now.format === 'sql') {
    if (now.table !== DEFAULTS.table) args.push('--table', now.table);
    if (now.batch !== DEFAULTS.batch) args.push('--batch', String(now.batch));
    if (now.transaction) args.push('--transaction');
  }
  if (now.format === 'csv' && now.bom) args.push('--bom');
  if (now.locale !== DEFAULTS.locale) args.push('--locale', now.locale);
  if (!now.safe) args.push('--no-safe');
  if (now.output.trim() !== '') args.push('--output', now.output.trim());
  return args;
}

/** Faults in the choices: [key of the choice, key of the sentence, values for it]. Nothing is built while there are any. */
export function problems(state) {
  const now = normalise(state);
  const found = [];
  const reads = (key) => APPLIES[now.target].includes(key);
  if (reads('port') && !whole(now.port, 0, 65535)) found.push(['port', 'faultPort', {}]);
  if (reads('base')) {
    if (now.target === 'mswNode') {
      if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(nodeBase(now.base))) found.push(['base', 'faultBaseAbsolute', {}]);
    } else if (!/^\/[^\s?#]*$/.test(now.base)) found.push(['base', 'faultBasePath', {}]);
  }
  if (now.target === 'cli' && now.openapi.trim() !== '' && now.session)
    found.push(['session', 'faultOpenapiSession', {}]);
  if (now.target === 'offline') {
    if (now.source === 'fields' && now.fields.trim() === '') found.push(['fields', 'faultFields', {}]);
    if (now.source === 'schema' && now.schema.trim() === '') found.push(['schema', 'faultSchema', {}]);
    if (!whole(now.count, 1, MAX_RECORDS)) found.push(['count', 'faultCount', { max: MAX_RECORDS }]);
    if (!whole(now.seed, 0, MAX_SEED)) found.push(['seed', 'faultSeed', { max: MAX_SEED }]);
    if (now.format === 'sql') {
      if (!TABLE.test(now.table)) found.push(['table', 'faultTable', {}]);
      if (!whole(now.batch, 1, 1000)) found.push(['batch', 'faultBatch', {}]);
    }
  }
  return found;
}

/** MSW in Node matches absolute addresses only, so its base defaults to one. */
const nodeBase = (base) => (base === DEFAULTS.base ? 'http://localhost/api' : base);

const install = (...more) => ['npm install --save-dev', PACKAGE, ...more].join(' ');

/**
 * Everything the page shows: the faults, or the steps (each a label key, a language and the code) and the places to read more.
 * `summary` is the key of the sentence that says what the setup gives you.
 */
export function buildSetup(state) {
  const now = normalise(state);
  const found = problems(now);
  const docs = DOCS[now.target];
  if (found.length) return { target: now.target, problems: found, steps: [], docs, summary: `${now.target}Says` };
  const options = appOptions(now);
  const object = literal(options);
  const steps = [];
  const base = now.target === 'mswNode' ? nodeBase(now.base) : now.base;
  switch (now.target) {
    case 'cli': {
      const env = serveEnvironment(now).map(([name, value]) => `${name}=${value}`);
      const command = [...env, 'npx', PACKAGE, ...serveArguments(now).map(shellQuote)].join(' ');
      steps.push({ label: 'stepRun', lang: 'sh', code: command });
      break;
    }
    case 'docker': {
      const flags = [`-p ${now.port}:6800`];
      if (now.session) flags.push('-e REST_IN_PIECES_SESSION=true');
      if (!now.safe) flags.push('-e REST_IN_PIECES_SAFE=false');
      for (const [name, value] of serveEnvironment(now)) flags.push(`-e ${name}=${value}`);
      const lines = ['docker run --rm', ...flags, IMAGE];
      steps.push({ label: 'stepRun', lang: 'sh', code: lines.length > 4 ? lines.join(' \\\n  ') : lines.join(' ') });
      break;
    }
    case 'tests': {
      const imports = now.session ? 'beforeEach, expect, test' : 'expect, test';
      const reset = now.session
        ? "\nbeforeEach(() => api.request('/reset', { method: 'POST' })); // put the seeded data back before each test\n"
        : '';
      steps.push({ label: 'stepInstall', lang: 'sh', code: install('vitest') });
      steps.push({
        label: 'stepCode',
        lang: 'ts',
        code: `import { createApp } from '${PACKAGE}/core';
import { ${imports} } from 'vitest';

const api = createApp(${object});
${reset}
test('lists five users', async () => {
  const res = await api.request('/users?limit=5&seed=42');
  expect(res.status).toBe(200);
  expect(await res.json()).toHaveProperty('results.length', 5);
});
`,
      });
      break;
    }
    case 'tab': {
      const call =
        object || base !== DEFAULTS.base
          ? `{ ${[base !== DEFAULTS.base ? `base: '${base}'` : '', object ? `app: ${object}` : ''].filter(Boolean).join(', ')} }`
          : '';
      steps.push({ label: 'stepInstall', lang: 'sh', code: install() });
      steps.push({
        label: 'stepCode',
        lang: 'ts',
        code: `import { installInBrowserApi } from '${PACKAGE}/browser';

installInBrowserApi(${call}); // answers fetch('${base}/...') in this tab; every other request goes to the network

const { results } = await (await fetch('${base}/users?limit=10&seed=7')).json();
`,
      });
      break;
    }
    case 'vite': {
      const call =
        base !== DEFAULTS.base || object
          ? `{ ${[base !== DEFAULTS.base ? `base: '${base}'` : '', object ? `app: ${object}` : ''].filter(Boolean).join(', ')} }`
          : '';
      steps.push({ label: 'stepInstall', lang: 'sh', code: install('vite') });
      steps.push({
        label: 'stepConfig',
        lang: 'ts',
        code: `// vite.config.ts
import { defineConfig } from 'vite';
import { restInPieces } from '${PACKAGE}/vite';

export default defineConfig({ plugins: [restInPieces(${call})] }); // fetch('${base}/users?limit=10') in the app
`,
      });
      break;
    }
    case 'mswBrowser': {
      const extra = [base !== DEFAULTS.base ? `base: '${base}'` : '', object ? `app: ${object}` : ''].filter(Boolean);
      steps.push({ label: 'stepInstall', lang: 'sh', code: `${install('msw')}\nnpx msw init public` });
      steps.push({
        label: 'stepCode',
        lang: 'ts',
        code: `import { http } from 'msw';
import { setupWorker } from 'msw/browser';
import { restInPiecesHandlers } from '${PACKAGE}/msw';

await setupWorker(...restInPiecesHandlers({ http${extra.length ? `, ${extra.join(', ')}` : ''} })).start({ onUnhandledRequest: 'bypass' });
`,
      });
      break;
    }
    case 'mswNode': {
      const extra = [`base: '${base}'`, object ? `app: ${object}` : ''].filter(Boolean);
      steps.push({ label: 'stepInstall', lang: 'sh', code: install('msw') });
      steps.push({
        label: 'stepCode',
        lang: 'ts',
        code: `import { http } from 'msw';
import { setupServer } from 'msw/node';
import { restInPiecesHandlers } from '${PACKAGE}/msw';

export const server = setupServer(...restInPiecesHandlers({ http, ${extra.join(', ')} }));
// beforeAll(() => server.listen()); afterEach(() => server.resetHandlers()); afterAll(() => server.close());
`,
      });
      break;
    }
    case 'offline': {
      const command = ['npx', PACKAGE, ...generateArguments(now).map(shellQuote)].join(' ');
      steps.push({
        label: 'stepRun',
        lang: 'sh',
        code:
          now.output.trim() === ''
            ? `${command} > ${now.format === 'sql' ? 'records.sql' : `records.${now.format}`}`
            : command,
      });
      break;
    }
  }
  return { target: now.target, problems: [], steps, docs, summary: `${now.target}Says` };
}
