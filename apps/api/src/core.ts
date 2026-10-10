import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import pkg from '../package.json' with { type: 'json' };
import { FieldError, SchemaError } from './data/generators.ts';
import { requireAuth, TOKEN_KEY } from './lib/auth.ts';
import { simulate } from './lib/controls.ts';
import { CursorError } from './lib/cursor.ts';
import { ExpressionError } from './lib/expression.ts';
import { UnsupportedFormatError } from './lib/format.ts';
import { JsonSchemaError } from './lib/jsonschema.ts';
import { UnsupportedLocaleError } from './lib/locale.ts';
import { ExpandError } from './lib/relations.ts';
import { createSession, type SessionOption } from './lib/session.ts';
import { resources } from './resources.ts';
import { authRoutes } from './routes/auth.ts';
import { collectionRoutes } from './routes/collection.ts';
import { compatRoutes } from './routes/compat.ts';
import { generateRoutes } from './routes/generate.ts';
import { home } from './routes/home.ts';
import { imageRoutes } from './routes/images.ts';
import { meta } from './routes/meta.ts';
import { sessionRoutes } from './routes/session.ts';
import { SqlTableError } from './serialize.ts';

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
   * default limits (2000 records a dataset of 1000, proportionally more for a larger one, 64 changed datasets, 8 MB written); an object changes some of them.
   * The store belongs to this app and lasts as long as it does: nothing is written anywhere else.
   */
  session?: SessionOption | undefined;
  /**
   * Serves safe values unless a request says `safe=false`: emails and URLs on example domains, phone numbers from
   * the ranges kept for fiction, test card numbers, documentation IP addresses and self-hosted avatars. Off by
   * default in 2.x, so existing output does not change; `?safe=true` asks for it on one request.
   */
  safe?: boolean | undefined;
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
  safe = false,
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
  for (const path of ['/avatars', '/images']) app.use(`${path}/*`, etag());
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

  for (const resource of resources) {
    app.route(`/${resource.name}`, collectionRoutes(resource, { session, all: resources, safe }));
  }
  const names = resources.find((r) => r.name === 'names');
  if (names) {
    app.route('/random-names', collectionRoutes(names, { deprecated: true, path: 'random-names', session, safe }));
  }
  app.route('/generate', generateRoutes({ safe }));
  imageRoutes(app);
  compatRoutes(app);
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
        'JSON, CSV, YAML, XML, NDJSON and SQL output; and simulated latency and errors.\n\n' +
        'Orders, posts, comments, todos and reviews are joined to users and products by ids that always resolve: ' +
        "`/users/{id}/orders` lists one user's, and `expand=` embeds related records. `safe=true` writes values " +
        'that cannot reach anybody, and `/avatars` and `/images` draw pictures with no other host.\n\n' +
        'Writes are rehearsals by default, and kept in memory until `POST /reset` with the session on. ' +
        '`POST /auth/login` signs in with fake tokens, and `?auth=` makes any data request a protected route.',
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    tags: [
      { name: 'Datasets', description: 'Seeded fake data. The same seed always returns the same records.' },
      { name: 'Reference data', description: 'Real-world lookup data.' },
      { name: 'Custom data', description: 'Records built from your own field list.' },
      { name: 'Images', description: 'Self-hosted SVG avatars and placeholder images, drawn from the URL alone.' },
      {
        name: 'Compatibility',
        description: 'The same data with another API’s defaults, so its tutorials work by changing the base URL.',
      },
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
      err instanceof ExpressionError ||
      err instanceof JsonSchemaError ||
      err instanceof UnsupportedFormatError ||
      err instanceof UnsupportedLocaleError ||
      err instanceof CursorError ||
      err instanceof ExpandError ||
      err instanceof SqlTableError
    ) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof FieldError) return c.json({ error: err.message, field: err.field }, 422);
    // Malformed JSON (400) and a body that is not JSON (415) come from the request validators.
    if (err instanceof HTTPException && err.status < 500) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Internal Server Error' }, 500);
  });

  return app;
}
