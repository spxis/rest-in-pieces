/**
 * Builds what the npm package runs: JavaScript and type declarations in `dist/`, the built
 * playground in `web/`, and the repository's README and licence beside them.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';

const at = (path: string) => new URL(path, new URL('../', import.meta.url));

for (const dir of ['dist', 'web']) rmSync(at(dir), { recursive: true, force: true });
execFileSync('tsc', ['-p', 'tsconfig.build.json'], {
  cwd: at('.'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const playground = at('../web/dist/');
if (existsSync(new URL('index.html', playground))) {
  cpSync(playground, at('web'), { recursive: true, filter: (source) => !source.endsWith('.map') });
} else {
  console.warn('No playground build in apps/web/dist; the package will serve the API without it.');
}
for (const file of ['README.md', 'LICENSE']) cpSync(at(`../../${file}`), at(file));
