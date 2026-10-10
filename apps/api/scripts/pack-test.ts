/**
 * Proves the npm package works as a stranger would install it: packs it (which runs `prepack`),
 * installs the tarball into an empty folder, starts the `rest-in-pieces` command from it, and imports
 * the in-process app, the browser entry and their types from the installed copy.
 *
 * PACK_TEST_KEEP=1 keeps the temporary folder for a look afterwards.
 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { version: string };
const work = mkdtempSync(join(tmpdir(), 'rest-in-pieces-pack-'));
const consumer = join(work, 'consumer');
const startedAt = performance.now();

const step = (message: string) => console.log(`[pack:test] ${message}`);
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;
// pnpm passes its own lower-case npm_config_* settings down, which npm warns about; NPM_CONFIG_* and .npmrc still apply.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('npm_config_')));
const run = (command: string, args: string[], cwd: string) =>
  execFileSync(command, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** The first port in the range nobody is listening on. */
async function freePort(from: number, to: number): Promise<number> {
  for (let port = from; port <= to; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer()
        .once('error', () => resolve(false))
        .listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`No free port from ${from} to ${to}.`);
}

async function waitUntilUp(url: string, cli: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (cli.exitCode !== null) throw new Error(`The CLI exited early with code ${cli.exitCode}.`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${url} did not answer within 10 seconds.`);
}

async function checkCli(): Promise<void> {
  // 6830–6839 by default; PACK_TEST_PORT moves the range of ten, e.g. for a second worktree.
  const first = Number(process.env.PACK_TEST_PORT ?? 6830);
  const port = await freePort(first, first + 9);
  const cli = spawn(
    join(consumer, 'node_modules', '.bin', 'rest-in-pieces'),
    ['--port', `${port}`, '--host', '127.0.0.1'],
    {
      cwd: consumer,
      env: { ...env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  let output = '';
  cli.stdout?.on('data', (chunk: Buffer) => {
    output += chunk;
  });
  const exited = new Promise<number | null>((resolve) => cli.once('exit', (code) => resolve(code)));
  try {
    const base = `http://127.0.0.1:${port}`;
    await waitUntilUp(`${base}/health`, cli);
    const health = (await (await fetch(`${base}/health`)).json()) as { status: string; version: string };
    assert(health.status === 'ok' && health.version === version, `/health answered ${JSON.stringify(health)}`);
    const users = (await (await fetch(`${base}/users?limit=1`)).json()) as { results: unknown[] };
    assert(users.results.length === 1, `/users?limit=1 returned ${users.results.length} records`);
    // The family's data packages are dependencies of the install and load on first use.
    const japan = (await (await fetch(`${base}/countries/JP`)).json()) as { name: string; capital: { ja: string } };
    assert(japan.name === 'Japan' && japan.capital.ja === '東京', `/countries/JP answered ${JSON.stringify(japan)}`);
    const soviet = (await (await fetch(`${base}/countries/withdrawn/SU`)).json()) as { code: string };
    assert(soviet.code === 'SUHH', `/countries/withdrawn/SU answered ${JSON.stringify(soviet)}`);
    const tokyo = (await (await fetch(`${base}/subdivisions/JP-13`)).json()) as { names: { ja: string } };
    assert(tokyo.names.ja === '東京都', `/subdivisions/JP-13 answered ${JSON.stringify(tokyo)}`);
    const eu = (await (await fetch(`${base}/groupings/eu`)).json()) as { memberCount: number };
    assert(eu.memberCount === 27, `/groupings/eu answered ${JSON.stringify(eu)}`);
    // Hata is an optional peer dependency and is not in the install, so a flag is a redirect to the CDN, fetched by nobody here.
    const flag = await fetch(`${base}/flags/jp.svg`, { redirect: 'manual' });
    assert(
      flag.status === 302 && (flag.headers.get('location') ?? '').includes('/hata@1/dist/svg/jp.svg'),
      `/flags/jp.svg answered ${flag.status}`,
    );
    const map = await fetch(`${base}/maps/JP.svg`);
    assert(
      map.status === 200 && (await map.text()).includes('data-map="country-jp"'),
      `/maps/JP.svg answered ${map.status}`,
    );
    const home = await (await fetch(`${base}/`)).text();
    assert(home.includes('<div id="root">'), 'The CLI did not serve the packed playground at /.');
    assert(output.includes(`REST in Pieces ${version} is running at ${base}`), `Unexpected start-up line: ${output}`);
    step(
      `CLI on ${base}: /health, /users?limit=1, /countries/JP, /countries/withdrawn/SU, /subdivisions/JP-13, /groupings/eu, a flag redirect, a map and the playground answered`,
    );
  } finally {
    cli.kill('SIGTERM');
  }
  assert((await exited) === 0, 'The CLI did not stop cleanly on SIGTERM.');
}

/** Runs the installed `generate` command, which needs no port and no server, and checks what it writes. */
function checkGenerate(): void {
  const bin = join(consumer, 'node_modules', '.bin', 'rest-in-pieces');
  const schemaFile = join(work, 'schema.json');
  writeFileSync(
    schemaFile,
    JSON.stringify({
      type: 'object',
      required: ['id', 'email'],
      properties: { id: { type: 'integer', minimum: 1 }, email: { type: 'string', format: 'email' } },
    }),
  );
  const generate = (...args: string[]) => run(bin, ['generate', ...args], consumer);
  const lines = generate('--schema', schemaFile, '--count', '25', '--seed', '4').trimEnd().split('\n');
  assert(lines.length === 25, `generate wrote ${lines.length} lines, not 25.`);
  const first = JSON.parse(lines[0] as string) as { index: number; id: number; email: string };
  assert(first.index === 0 && Number.isInteger(first.id) && first.email.includes('@'), `generate wrote ${lines[0]}`);
  assert(
    generate('--schema', schemaFile, '--count', '25', '--seed', '4').trimEnd() === lines.join('\n'),
    'generate is not repeatable.',
  );
  const sql = generate(
    '--fields',
    'name:person.fullName,age:number.int(18,65)',
    '--count',
    '3',
    '--format',
    'sql',
    '--table',
    'people',
  );
  assert(
    sql
      .split('\n')
      .filter(Boolean)
      .every((line) => line.startsWith('INSERT INTO "people" ("index", "name", "age") VALUES (')),
    `generate wrote ${sql}`,
  );
  const csv = generate('--schema', schemaFile, '--count', '2', '--format', 'csv');
  assert(csv.startsWith('index,id,email\r\n'), `generate wrote ${csv}`);
  step('generate wrote 25 repeatable records, and SQL and CSV, with no server');
}

/** Starts the installed `serve --openapi` on a small document and calls it, then stops it. */
async function checkMock(): Promise<void> {
  const first = Number(process.env.PACK_TEST_PORT ?? 6830);
  const port = await freePort(first, first + 9);
  const document = join(work, 'pets.yaml');
  writeFileSync(
    document,
    `openapi: 3.0.3
info: { title: Pets, version: '1.0' }
paths:
  /pets/{petId}:
    get:
      parameters:
        - { name: petId, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { description: ok, content: { application/json: { schema: { $ref: '#/components/schemas/Pet' } } } }
        '404': { description: gone, content: { application/json: { schema: { type: object, required: [message], properties: { message: { type: string } } } } } }
components:
  schemas:
    Pet: { type: object, required: [id, name], properties: { id: { type: integer }, name: { type: string } } }
`,
  );
  const cli = spawn(
    join(consumer, 'node_modules', '.bin', 'rest-in-pieces'),
    ['serve', '--openapi', document, '--port', `${port}`, '--host', '127.0.0.1'],
    { cwd: consumer, env: { ...env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  let output = '';
  cli.stdout?.on('data', (chunk: Buffer) => {
    output += chunk;
  });
  const exited = new Promise<number | null>((resolve) => cli.once('exit', (code) => resolve(code)));
  try {
    const base = `http://127.0.0.1:${port}`;
    await waitUntilUp(`${base}/__mock`, cli);
    const pet = (await (await fetch(`${base}/pets/7`)).json()) as { id: number; name: string };
    assert(pet.id === 7 && typeof pet.name === 'string', `/pets/7 answered ${JSON.stringify(pet)}`);
    const again = (await (await fetch(`${base}/pets/7`)).json()) as { name: string };
    assert(again.name === pet.name, 'The mock is not repeatable.');
    assert((await fetch(`${base}/pets/seven`)).status === 400, 'The mock did not check the path parameter.');
    const missing = await fetch(`${base}/pets/7?status=404`);
    assert(
      missing.status === 404 && typeof ((await missing.json()) as { message: string }).message === 'string',
      'status=404 did not use the document.',
    );
    assert(output.includes('Mocking Pets 1.0') && output.includes('GET'), `Unexpected start-up text: ${output}`);
    step(`serve --openapi on ${base}: an item, its repeat, a bad path parameter and the document's own 404 answered`);
  } finally {
    cli.kill('SIGTERM');
  }
  assert((await exited) === 0, 'serve --openapi did not stop cleanly on SIGTERM.');
}

try {
  // `npm pack` runs prepack, which builds the playground and dist/ first; its log shares stdout,
  // so the JSON report is the array at the end.
  const packed = run('npm', ['pack', '--json', '--pack-destination', work], packageDir);
  const [report] = JSON.parse(packed.slice(packed.lastIndexOf('\n[') + 1)) as Array<{
    filename: string;
    size: number;
    unpackedSize: number;
    entryCount: number;
    files: Array<{ path: string }>;
  }>;
  assert(report, 'npm pack printed no report.');
  const files = report.files.map((file) => file.path);
  for (const required of [
    'bin/rest-in-pieces.js',
    'dist/index.d.ts',
    'dist/browser.js',
    'dist/msw.js',
    'dist/msw.d.ts',
    'dist/mock.js',
    'dist/mock.d.ts',
    'dist/vite.js',
    'dist/images.js',
    'dist/serialize.js',
    'dist/vite.d.ts',
    'dist/types.d.ts',
    'dist/openapi.json',
    'web/index.html',
  ]) {
    assert(files.includes(required), `The tarball is missing ${required}.`);
  }
  const stray = files.filter((path) => /^(src|test|scripts)\/|\.map$|\.test\./.test(path));
  assert(stray.length === 0, `The tarball carries files that do not run: ${stray.join(', ')}`);
  step(
    `${report.filename}: ${kb(report.size)} packed, ${kb(report.unpackedSize)} unpacked, ${report.entryCount} files`,
  );

  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  run('npm', ['install', join(work, report.filename), '--no-audit', '--no-fund', '--prefer-offline'], consumer);
  step('installed the tarball into an empty folder');

  await checkCli();
  await checkMock();
  checkGenerate();

  writeFileSync(
    join(consumer, 'check.ts'),
    `import pkg from '@johnmorrisdotca/rest-in-pieces/package.json' with { type: 'json' };
import defaultApp, { app, createApp } from '@johnmorrisdotca/rest-in-pieces';
import { type InBrowserApiOptions, installInBrowserApi } from '@johnmorrisdotca/rest-in-pieces/browser';
import { createApp as createCoreApp } from '@johnmorrisdotca/rest-in-pieces/core';
import { avatarSvg, placeholderSvg } from '@johnmorrisdotca/rest-in-pieces/images';
import { restInPiecesHandlers } from '@johnmorrisdotca/rest-in-pieces/msw';
import spec from '@johnmorrisdotca/rest-in-pieces/openapi.json' with { type: 'json' };
import type { components, paths } from '@johnmorrisdotca/rest-in-pieces/types';
import { toNdjson, toSql } from '@johnmorrisdotca/rest-in-pieces/serialize';
import { restInPieces } from '@johnmorrisdotca/rest-in-pieces/vite';
import { createMockApp, OpenApiError } from '@johnmorrisdotca/rest-in-pieces/mock';

const fail = (message: string): never => {
  throw new Error(message);
};
const results = async (response: Response) => ((await response.json()) as { results: unknown[] }).results;

if (defaultApp !== app) fail('The default export is not the app.');
if ((await results(await createApp().request('/users?limit=5'))).length !== 5) fail('createApp() did not answer in-process.');
if ((await results(await createCoreApp().request('/names?limit=2'))).length !== 2) fail('@johnmorrisdotca/rest-in-pieces/core did not answer.');

// The session keeps writes until /reset, and sign-in answers a token that opens a protected route.
const kept = createApp({ session: true });
if ((await kept.request('/users/1', { method: 'DELETE' })).status !== 204) fail('The session did not take a delete.');
if ((await kept.request('/users/1')).status !== 404) fail('The session did not keep the delete.');
await kept.request('/reset', { method: 'POST' });
if ((await kept.request('/users/1')).status !== 200) fail('/reset did not put the seed back.');
const login = await kept.request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'password' }) });
const { accessToken } = (await login.json()) as components['schemas']['AuthTokens'];
if ((await kept.request('/users?auth=admin')).status !== 401) fail('?auth=admin let a request without a token through.');
if ((await kept.request('/users?auth=admin', { headers: { Authorization: 'Bearer ' + accessToken } })).status !== 200) fail('The admin token was refused.');

// Relations, safe values and the self-hosted pictures, from the installed package.
const orders = await (await createApp({ safe: true }).request('/users/2/orders?expand=user,items.product')).json() as { results: Array<{ user: { email: string } }> };
if (!orders.results.every((order) => /@example\\.(com|org|net)$/.test(order.user.email))) fail('Safe values did not reach an embedded user.');
if (!avatarSvg('ada', 'Ada Lovelace').includes('>AL<') || !placeholderSvg(64, 32).includes('64×32')) fail('The images entry did not draw.');
if (toNdjson([{ a: 1 }]) !== '{"a":1}\\n' || !toSql([{ a: "it's" }], 't').includes("'it''s'")) fail('The serialize entry did not write.');

const options: InBrowserApiOptions = { base: 'https://in-tab.test/api' };
const uninstall: () => void = installInBrowserApi(options);
if ((await results(await fetch('https://in-tab.test/api/users?limit=3'))).length !== 3) fail('The browser entry did not answer.');
uninstall();

// MSW's \`http.all\` stands in for MSW itself, which the package only names as an optional peer.
type Resolver = (info: { request: Request }) => Promise<Response>;
const [handler] = restInPiecesHandlers({
  base: 'https://msw.test/api',
  http: { all: (path: string, resolver: Resolver) => ({ path, resolver }) },
});
if (!handler) throw new Error('The MSW entry returned no handler.');
if (handler.path !== 'https://msw.test/api/*') fail(\`The MSW handler matches \${handler.path}.\`);
if ((await results(await handler.resolver({ request: new Request('https://msw.test/api/users?limit=2') }))).length !== 2) fail('The MSW entry did not answer.');

// Vite is an optional peer and is not installed here; the plugin still loads without it.
const plugin = restInPieces({ base: '/mock' });
if (plugin.name !== 'rest-in-pieces' || plugin.apply !== 'serve' || typeof plugin.configureServer !== 'function') fail('The Vite entry did not return the plugin.');

// The generated types describe the API: a person's postal code is a string, and /users is a path.
type Person = components['schemas']['Person'];
const postalIsString: [Person['postal']] extends [string] ? ([string] extends [Person['postal']] ? true : false) : false = true;
const usersPath: keyof paths = '/users';
if (!postalIsString || !usersPath) fail('The generated types are wrong.');
if (spec.info.version !== pkg.version || !('/users' in spec.paths)) fail('openapi.json is not the API document.');

// A mock made from a document of the caller's own, in process.
const mocked = createMockApp({ openapi: '3.0.0', paths: { '/n': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } } } } } } } } } });
if (typeof ((await (await mocked.request('/n')).json()) as { n: number }).n !== 'number') fail('The mock entry did not answer.');
try {
  createMockApp({});
  fail('The mock entry accepted a document that is not OpenAPI.');
} catch (error) {
  if (!(error instanceof OpenApiError)) throw error;
}

// @ts-expect-error The options are typed, so a wrong one fails the type check.
createApp({ log: 'yes' });
console.log(pkg.version);
`,
  );
  writeFileSync(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'es2024',
        lib: ['es2024', 'dom'],
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        types: [],
      },
      files: ['check.ts'],
    }),
  );
  run('tsc', ['-p', consumer], consumer);
  step('the installed types resolve and are checked');

  // The same check as JavaScript, with the types stripped by the compiler rather than by Node.
  run('tsc', ['-p', consumer, '--noEmit', 'false', '--outDir', join(consumer, 'out')], consumer);
  const printed = run('node', [join(consumer, 'out', 'check.js')], consumer).trim();
  assert(printed === version, `The in-process check printed ${printed}.`);
  step(
    'imported the in-process app, @johnmorrisdotca/rest-in-pieces/core, /browser, /mock, /msw, /vite, /images, /serialize, /types and /openapi.json from the install, kept, reset and signed in, and served safe values through a relation',
  );

  step(`passed in ${((performance.now() - startedAt) / 1000).toFixed(1)} s`);
} finally {
  if (process.env.PACK_TEST_KEEP) step(`kept ${work}`);
  else rmSync(work, { recursive: true, force: true });
}
