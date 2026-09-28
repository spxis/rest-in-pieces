import { existsSync } from 'node:fs';
import { serveStatic } from '@hono/node-server/serve-static';
import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import pkg from '../package.json' with { type: 'json' };
import { SchemaError } from './data/generators.ts';
import { simulate } from './lib/controls.ts';
import { UnsupportedFormatError } from './lib/format.ts';
import { UnsupportedLocaleError } from './lib/locale.ts';
import { resources } from './resources.ts';
import { collectionRoutes } from './routes/collection.ts';
import { generate } from './routes/generate.ts';
import { home } from './routes/home.ts';
import { meta } from './routes/meta.ts';

export const app = new OpenAPIHono();

if (process.env.NODE_ENV !== 'test') app.use(logger());
app.use(secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
app.use(cors({ origin: '*', exposeHeaders: ['X-Total-Count', 'Link', 'ETag', 'X-Simulated', 'Retry-After'] }));

// Simulation and caching apply to data endpoints only, never to docs or health checks.
const dataPaths = [...resources.map((r) => `/${r.name}`), '/random-names', '/generate'];
// `/names/*` also matches `/names` itself, so one registration covers lists and items.
for (const path of dataPaths) app.use(`${path}/*`, simulate(), etag());

app.use(
  '/generate/*',
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'Request body is larger than 64 KB.' }, 413) }),
);

for (const resource of resources) app.route(`/${resource.name}`, collectionRoutes(resource));
const names = resources.find((r) => r.name === 'names');
if (names) app.route('/random-names', collectionRoutes(names, { deprecated: true, path: 'random-names' }));
app.route('/generate', generate);
app.route('/', meta);

app.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'REST in Pieces',
    version: pkg.version,
    description:
      'Realistic, repeatable fake data for building and testing client applications.\n\n' +
      'Every collection supports paging, sorting, filtering and text search; seeds for repeatable data; ' +
      'JSON, CSV, YAML and XML output; and simulated latency and errors.',
    license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  },
  tags: [
    { name: 'Datasets', description: 'Seeded fake data. The same seed always returns the same records.' },
    { name: 'Reference data', description: 'Real-world lookup data.' },
    { name: 'Custom data', description: 'Records built from your own field list.' },
    { name: 'Service', description: 'Discovery and health.' },
  ],
});
app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'REST in Pieces API', theme: 'default' }));

// The playground is served from the same origin when it has been built alongside the API.
const webRoot = process.env.WEB_ROOT ?? new URL('../../web/dist', import.meta.url).pathname;
if (process.env.SERVE_WEB !== 'false' && process.env.NODE_ENV !== 'test' && existsSync(`${webRoot}/index.html`)) {
  app.use('/assets/*', serveStatic({ root: webRoot }));
  app.get('/', serveStatic({ root: webRoot, path: 'index.html' }));
  app.get('/favicon.svg', serveStatic({ root: webRoot, path: 'favicon.svg' }));
}
app.route('/', home);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));
app.onError((err, c) => {
  if (err instanceof SchemaError || err instanceof UnsupportedFormatError || err instanceof UnsupportedLocaleError) {
    return c.json({ error: err.message }, 400);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
