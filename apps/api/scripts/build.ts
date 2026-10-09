/**
 * Builds what the npm package runs: JavaScript and type declarations in `dist/`, the OpenAPI
 * document and the types generated from it beside them, the built playground in `web/`, and the
 * repository's README and licence.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import openapiTS, { astToString } from 'openapi-typescript';
import { createApp } from '../src/core.ts';

const at = (path: string) => new URL(path, new URL('../', import.meta.url));

for (const dir of ['dist', 'web']) rmSync(at(dir), { recursive: true, force: true });
execFileSync('tsc', ['-p', 'tsconfig.build.json'], {
  cwd: at('.'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// The document the API serves, and TypeScript types for every path and schema in it, so a client
// can type its requests from the package with nothing running. A failure here fails the build.
const spec = (await (await createApp().request('/openapi.json')).json()) as Parameters<typeof openapiTS>[0];
writeFileSync(at('dist/openapi.json'), `${JSON.stringify(spec)}\n`);
const types = astToString(await openapiTS(spec));
for (const expected of ['export interface paths', 'export interface components', 'Person: {']) {
  if (!types.includes(expected)) throw new Error(`The generated types have no \`${expected}\`.`);
}
writeFileSync(
  at('dist/types.d.ts'),
  `/** Types for every path and schema of the REST in Pieces API, generated from its OpenAPI document by openapi-typescript. */\n\n${types}`,
);

const playground = at('../web/dist/');
if (existsSync(new URL('index.html', playground))) {
  cpSync(playground, at('web'), { recursive: true, filter: (source) => !source.endsWith('.map') });
} else {
  console.warn('No playground build in apps/web/dist; the package will serve the API without it.');
}
for (const file of ['README.md', 'LICENSE']) cpSync(at(`../../${file}`), at(file));
