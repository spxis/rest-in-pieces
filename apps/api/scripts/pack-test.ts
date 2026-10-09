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
  const port = await freePort(6830, 6839);
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
    const home = await (await fetch(`${base}/`)).text();
    assert(home.includes('<div id="root">'), 'The CLI did not serve the packed playground at /.');
    assert(output.includes(`REST in Pieces ${version} is running at ${base}`), `Unexpected start-up line: ${output}`);
    step(`CLI on ${base}: /health, /users?limit=1 and the playground answered`);
  } finally {
    cli.kill('SIGTERM');
  }
  assert((await exited) === 0, 'The CLI did not stop cleanly on SIGTERM.');
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

  writeFileSync(
    join(consumer, 'check.ts'),
    `import pkg from '@johnmorrisdotca/rest-in-pieces/package.json' with { type: 'json' };
import defaultApp, { app, createApp } from '@johnmorrisdotca/rest-in-pieces';
import { type InBrowserApiOptions, installInBrowserApi } from '@johnmorrisdotca/rest-in-pieces/browser';
import { createApp as createCoreApp } from '@johnmorrisdotca/rest-in-pieces/core';
import { restInPiecesHandlers } from '@johnmorrisdotca/rest-in-pieces/msw';

const fail = (message: string): never => {
  throw new Error(message);
};
const results = async (response: Response) => ((await response.json()) as { results: unknown[] }).results;

if (defaultApp !== app) fail('The default export is not the app.');
if ((await results(await createApp().request('/users?limit=5'))).length !== 5) fail('createApp() did not answer in-process.');
if ((await results(await createCoreApp().request('/names?limit=2'))).length !== 2) fail('@johnmorrisdotca/rest-in-pieces/core did not answer.');

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
  step('imported the in-process app, @johnmorrisdotca/rest-in-pieces/core, /browser and /msw from the install');

  step(`passed in ${((performance.now() - startedAt) / 1000).toFixed(1)} s`);
} finally {
  if (process.env.PACK_TEST_KEEP) step(`kept ${work}`);
  else rmSync(work, { recursive: true, force: true });
}
