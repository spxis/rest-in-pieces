/**
 * Writes the parts of the API a browser opens directly rather than through the playground's fetch: the OpenAPI
 * document and the reference page under `dist-pages/api/`, and the static fixtures under `dist-pages/fixtures/`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';
import apiPackage from '../../api/package.json' with { type: 'json' };
import { checkFixtures, folderBytes, writeFixtures } from './fixtures.ts';

const out = new URL('../dist-pages/api/', import.meta.url);
// The reference page lives at api/docs/, so the document is one folder up.
const app = createApp({ specUrl: '../openapi.json' });

for (const [path, file] of [
  ['/openapi.json', 'openapi.json'],
  ['/docs', 'docs/index.html'],
] as const) {
  const response = await app.request(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  const target = new URL(file, out);
  mkdirSync(new URL('.', target), { recursive: true });
  writeFileSync(target, await response.text());
  console.log(`Wrote ${target.pathname}`);
}

// The site's full address, which the Pages workflow passes from actions/configure-pages; the package's homepage
// otherwise. index.json lists every file at it. configure-pages answers with http://, though GitHub Pages serves
// every github.io site over HTTPS, so the scheme is upgraded rather than handing out links that redirect.
const site = (process.env.PAGES_URL || apiPackage.homepage).replace(/^http:\/\//, 'https://').replace(/\/*$/, '/');
const fixtures = fileURLToPath(new URL('../dist-pages/fixtures/', import.meta.url));
const index = await writeFixtures(app, fixtures, `${site}fixtures/`);
const problems = checkFixtures(fixtures);
if (problems.length > 0) throw new Error(`The fixtures disagree with index.json:\n${problems.join('\n')}`);
const megabytes = (folderBytes(fixtures) / 1024 / 1024).toFixed(1);
console.log(`Wrote ${index.files.length} fixtures and index.json to ${fixtures} (${megabytes} MB)`);
