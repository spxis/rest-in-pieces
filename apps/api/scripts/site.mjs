// Build the native Pages playground into the SDK's local documentation test directory.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(api, '../..');
execFileSync('pnpm', ['--filter', '@rest-in-pieces/web', 'build:pages'], {
  cwd: repository,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
rmSync(resolve(api, 'site'), { recursive: true, force: true });
cpSync(resolve(repository, 'apps/web/dist-pages'), resolve(api, 'site'), { recursive: true });
mkdirSync(resolve(api, 'demo'), { recursive: true });
cpSync(resolve(repository, 'apps/web/public/family.css'), resolve(api, 'demo/family.css'));
