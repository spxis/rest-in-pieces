import { type OpenAPIHono, z } from '@hono/zod-openapi';

/** Where the JSONPlaceholder-compatible answers live: change a tutorial's base URL to this and nothing else. */
export const JSONPLACEHOLDER_BASE = '/jsonplaceholder';

const RESOURCES = ['posts', 'comments', 'todos', 'users'] as const;

/** How many records a list holds by default: as many as JSONPlaceholder's do. */
export const PLACEHOLDER_SIZES: Record<(typeof RESOURCES)[number], number> = {
  posts: 100,
  comments: 500,
  todos: 200,
  users: 10,
};

type Fields = Record<string, unknown>;

/**
 * A user in JSONPlaceholder's shape: `name`, `address` and `company` as objects, and `website`, beside the fields
 * REST in Pieces already has. Only what the record knows is filled in: `address` has the city and country,
 * `company` the name, and `website` is on an example domain.
 */
export function placeholderUser(user: Fields): Fields {
  if (!user || typeof user !== 'object' || !('username' in user)) return user;
  const japanese = user.country === 'JP';
  const name = japanese
    ? `${user.lastName ?? ''} ${user.firstName ?? ''}`
    : `${user.firstName ?? ''} ${user.lastName ?? ''}`;
  const site = String(user.username ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return {
    ...user,
    name: name.trim(),
    address: { city: user.city ?? null, country: user.country ?? null },
    website: site ? `${site}.example.org` : 'example.org',
    company: { name: user.company ?? null },
  };
}

/**
 * `/jsonplaceholder/*`: the same API, with JSONPlaceholder's defaults. Lists are bare arrays as long as
 * JSONPlaceholder's (100 posts, 500 comments, 200 todos, 10 users), or every match up to 1,000 when filtered or
 * nested, unless the request pages itself; and users carry `name`, `address`, `website` and `company` the way
 * JSONPlaceholder's do. Everything else, writes included, is the ordinary route answering.
 */
export function compatRoutes(app: OpenAPIHono): void {
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: `${JSONPLACEHOLDER_BASE}/{resource}`,
    tags: ['Compatibility'],
    operationId: 'jsonplaceholder',
    summary: 'JSONPlaceholder-compatible answers',
    description:
      "Change a JSONPlaceholder tutorial's base URL from `https://jsonplaceholder.typicode.com` to `…/jsonplaceholder` and it keeps working: `/posts`, `/posts/1`, `/posts?userId=1`, `/posts/1/comments`, `/comments?postId=1`, `/todos`, `/users`, `/users/1/posts` and `/users/1/todos`, and the writes. Lists default to a bare array: as many records as JSONPlaceholder's (100 posts, 500 comments, 200 todos, 10 users), and every match, up to 1,000, for a filtered or nested list. Users carry `name`, `address`, `website` and `company` as JSONPlaceholder's do. Any other parameter of the ordinary route works here too. JSONPlaceholder's `/albums` and `/photos` have no counterpart.",
    request: {
      params: z.object({
        resource: z.enum(RESOURCES).openapi({ description: 'Also with `/{id}` and a nested list after it.' }),
      }),
    },
    responses: {
      200: { description: 'What the ordinary route answers, with JSONPlaceholder defaults.' },
      404: { description: 'No such dataset or record.' },
    },
  });

  app.all(`${JSONPLACEHOLDER_BASE}/*`, async (c) => {
    const url = new URL(c.req.url);
    const path = url.pathname.slice(JSONPLACEHOLDER_BASE.length) || '/';
    const top = path.split('/')[1] ?? '';
    if (!(RESOURCES as readonly string[]).includes(top)) return c.json({ error: 'Not Found' }, 404);
    if (c.req.method === 'GET' && !url.searchParams.has('metadata')) url.searchParams.set('metadata', 'false');
    const paged = ['limit', 'size', 'length', 'pageSize', 'page', 'cursor'].some((name) => url.searchParams.has(name));
    if (c.req.method === 'GET' && !paged) url.searchParams.set('limit', '1000');
    // A top-level list is as long as JSONPlaceholder's; a nested one or a filtered one is every match.
    const filtered = [...url.searchParams.keys()].some(
      (name) => !['metadata', 'limit', 'seed', 'locale', 'safe'].includes(name),
    );
    if (c.req.method === 'GET' && !paged && path === `/${top}` && !filtered) {
      url.searchParams.set('limit', String(PLACEHOLDER_SIZES[top as keyof typeof PLACEHOLDER_SIZES]));
    }
    const body = ['GET', 'HEAD'].includes(c.req.method) ? null : await c.req.arrayBuffer();
    const headers = new Headers(c.req.raw.headers);
    const prefix = c.req.header('x-forwarded-prefix') ?? '';
    headers.set('X-Forwarded-Prefix', `${prefix}${JSONPLACEHOLDER_BASE}`);
    const response = await app.fetch(
      new Request(new URL(`${path}${url.search}`, url.origin), { method: c.req.method, headers, body }),
    );
    const isUsers = top === 'users' && /^\/users(\/[^/]+)?\/?$/.test(path);
    if (
      !isUsers ||
      !(response.headers.get('content-type') ?? '').startsWith('application/json') ||
      response.status !== 200
    ) {
      return response;
    }
    const data = (await response.json()) as unknown;
    const reshaped = Array.isArray(data)
      ? data.map((user) => placeholderUser(user as Fields))
      : data && typeof data === 'object' && 'results' in data
        ? { ...(data as Fields), results: ((data as { results: Fields[] }).results ?? []).map(placeholderUser) }
        : placeholderUser(data as Fields);
    const out = new Headers(response.headers);
    out.delete('content-length');
    out.delete('etag');
    return new Response(JSON.stringify(reshaped), { status: response.status, headers: out });
  });
}
