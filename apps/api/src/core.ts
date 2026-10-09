import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import pkg from '../package.json' with { type: 'json' };
import { SchemaError } from './data/generators.ts';
import { requireAuth, TOKEN_KEY } from './lib/auth.ts';
import { simulate } from './lib/controls.ts';
import { CursorError } from './lib/cursor.ts';
import { UnsupportedFormatError } from './lib/format.ts';
import { UnsupportedLocaleError } from './lib/locale.ts';
import { createSession, type SessionOption } from './lib/session.ts';
import { resources } from './resources.ts';
import { authRoutes } from './routes/auth.ts';
import { collectionRoutes } from './routes/collection.ts';
import { generate } from './routes/generate.ts';
import { home } from './routes/home.ts';
import { meta } from './routes/meta.ts';
import { sessionRoutes } from './routes/session.ts';

export type { SessionLimits, SessionOption } from './lib/session.ts';

export interface AppOptions {
  /** Log each request. */
  log?: boolean;
  /** Where the OpenAPI document is served from, as the docs page should fetch it. */
  specUrl?: string;
  /** Registers routes, such as the built playground, ahead of the landing page. */
  mount?: ((app: OpenAPIHono) => void) | undefined;
  /**
   * Keeps writes in memory, so later reads see them until `POST /reset`. Off by default. `true` uses the
   * default limits (2000 records a dataset, 16 changed datasets, 8 MB written); an object changes some of them.
   * The store belongs to this app and lasts as long as it does: nothing is written anywhere else.
   */
  session?: SessionOption | undefined;
}

/**
 * Builds the whole API. It uses nothing but web standards, so the same app runs on Node,
 * behind any fetch-style host, and inside a browser tab.
 */
export function createApp({
  log = false,
  specUrl = '/openapi.json',
  mount,
  session: option,
}: AppOptions = {}): OpenAPIHono {
  const app = new OpenAPIHono();
  const session = createSession(option);

  if (log) app.use(logger());
  app.use(secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
  app.use(
    cors({
      origin: '*',
      exposeHeaders: ['X-Total-Count', 'Link', 'ETag', 'X-Simulated', 'Retry-After', 'Location', 'WWW-Authenticate'],
    }),
  );

  // Simulation and caching apply to data endpoints only, never to docs or health checks.
  const dataPaths = [...resources.map((r) => `/${r.name}`), '/random-names', '/generate'];
  // `/names/*` also matches `/names` itself, so one registration covers lists and items.
  for (const path of dataPaths) app.use(`${path}/*`, simulate(), etag());
  // A slow or failing sign-in is worth rehearsing too.
  app.use('/auth/*', simulate());

  // Writes and `POST /generate` take a JSON body; none needs more than this.
  const limit = bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) => c.json({ error: 'Request body is larger than 64 KB.' }, 413),
  });
  for (const path of [...dataPaths, '/auth']) app.use(`${path}/*`, limit);
  // `?auth=` turns any data request into a protected route, after the simulation has had its say.
  for (const path of dataPaths) app.use(`${path}/*`, requireAuth());

  for (const resource of resources) app.route(`/${resource.name}`, collectionRoutes(resource, { session }));
  const names = resources.find((r) => r.name === 'names');
  if (names) app.route('/random-names', collectionRoutes(names, { deprecated: true, path: 'random-names', session }));
  app.route('/generate', generate);
  const users = resources.find((r) => r.name === 'users');
  if (users) app.route('/auth', authRoutes(users, session));
  app.route('/', sessionRoutes(session));
  app.route('/', meta);

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: `An access token from \`POST /auth/login\`. Fake: HS256, signed with the published key \`${TOKEN_KEY}\`. Not security.`,
  });

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'REST in Pieces',
      version: pkg.version,
      description:
        'Realistic, repeatable fake data for building and testing client applications.\n\n' +
        'Every collection supports paging, sorting, filtering and text search; seeds for repeatable data; ' +
        'JSON, CSV, YAML and XML output; and simulated latency and errors.\n\n' +
        'Writes are rehearsals by default, and kept in memory until `POST /reset` with the session on. ' +
        '`POST /auth/login` signs in with fake tokens, and `?auth=` makes any data request a protected route.',
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    tags: [
      { name: 'Datasets', description: 'Seeded fake data. The same seed always returns the same records.' },
      { name: 'Reference data', description: 'Real-world lookup data.' },
      { name: 'Custom data', description: 'Records built from your own field list.' },
      {
        name: 'Auth',
        description:
          'Fake sign-in for rehearsing login forms, protected routes, roles and expired tokens. Not security: every password is `password`.',
      },
      {
        name: 'Session',
        description: 'The opt-in in-memory store that keeps writes until `POST /reset`. Off by default.',
      },
      { name: 'Service', description: 'Discovery and health.' },
    ],
  });
  app.get('/docs', Scalar({ url: specUrl, pageTitle: 'REST in Pieces API', theme: 'default' }));

  mount?.(app);
  app.route('/', home);

  app.notFound((c) => c.json({ error: 'Not Found' }, 404));
  app.onError((err, c) => {
    if (
      err instanceof SchemaError ||
      err instanceof UnsupportedFormatError ||
      err instanceof UnsupportedLocaleError ||
      err instanceof CursorError
    ) {
      return c.json({ error: err.message }, 400);
    }
    // Malformed JSON (400) and a body that is not JSON (415) come from the request validators.
    if (err instanceof HTTPException && err.status < 500) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  return app;
}
