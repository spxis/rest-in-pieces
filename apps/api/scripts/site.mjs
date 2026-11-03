// Build the native Pages playground into the SDK's local documentation test directory.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishThumbnails, thumbnailHead } from './family-thumbnail.mjs';

/** What the family's card shows, for a reader who cannot see it (the README's top picture says the same). */
const ALT =
  'REST in Pieces: six seeded users, each with the SVG avatar the package draws, as the playground previews them.';

const api = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(api, '../..');
execFileSync('pnpm', ['--filter', '@rest-in-pieces/web', 'build:pages'], {
  cwd: repository,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
// The family's card, dark card and icon: their tags in the playground's head, and the files beside it (the Pages workflow publishes
// apps/web/dist-pages, so they are put there before the copy below).
const pages = resolve(repository, 'apps/web/dist-pages');
const index = resolve(pages, 'index.html');
const head = thumbnailHead(JSON.parse(readFileSync(resolve(api, 'package.json'), 'utf8')), { alt: ALT });
writeFileSync(
  index,
  readFileSync(index, 'utf8').replace('</head>', () => `  ${head}\n  </head>`),
);
publishThumbnails(api, pages);
rmSync(resolve(api, 'site'), { recursive: true, force: true });
cpSync(pages, resolve(api, 'site'), { recursive: true });
mkdirSync(resolve(api, 'demo'), { recursive: true });
cpSync(resolve(repository, 'apps/web/public/family.css'), resolve(api, 'demo/family.css'));
