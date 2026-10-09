/**
 * Writes the parts of the API a browser opens directly rather than through the playground's fetch:
 * the OpenAPI document and the reference page, as static files under `dist-pages/api/`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createApp } from 'rest-in-pieces/core';

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
