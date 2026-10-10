import { describe, expect, it } from 'vitest';
import { validateValue } from '../src/lib/schemaValidate.ts';
import { createMock, createMockApp, MOCK_LIMITS, OpenApiError } from '../src/mock.ts';
import { petshop, TENANT } from './specs/petshop.ts';

const app = createMockApp(petshop);
const headers = { 'X-Tenant': TENANT };

async function call(path: string, init: RequestInit = {}, target = app) {
  const res = await target.request(path, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON.
  }
  return { res, status: res.status, body: body as any, text };
}

const send = (path: string, method: string, body?: unknown, extra: Record<string, string> = {}) =>
  call(path, {
    method,
    headers: { 'content-type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });

const schemaOf = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const conforms = (schema: unknown, value: unknown) => validateValue(petshop, schema, value);

describe('what a mocked operation answers', () => {
  it('makes a body that matches the response schema, for every request, in every locale it is asked in', async () => {
    for (const locale of ['en-CA', 'ja', 'de', 'global']) {
      for (let id = 1; id <= 15; id++) {
        const { status, body } = await call(`/pets/${id}?locale=${locale}&seed=${id}`);
        expect(status).toBe(200);
        expect(conforms(schemaOf('Pet'), body), JSON.stringify(body)).toEqual([]);
      }
    }
    for (let seed = 1; seed <= 25; seed++) {
      const { body } = await call(`/pets?seed=${seed}&limit=7`, { headers });
      expect(conforms({ type: 'array', items: schemaOf('Pet') }, body)).toEqual([]);
      expect(body).toHaveLength(7);
      const owners = (await call(`/owners?seed=${seed}`)).body;
      expect(conforms(schemaOf('Owner'), owners.data[0])).toEqual([]);
      expect(owners.data).toHaveLength(MOCK_LIMITS.defaultItems);
      expect(owners.data.every((owner: { email: string }) => owner.email.includes('@'))).toBe(true);
    }
  });

  it('repeats a request exactly, and changes with the seed, the address and the operation', async () => {
    const first = await call('/pets/4?seed=9');
    expect((await call('/pets/4?seed=9')).text).toBe(first.text);
    expect((await call('/pets/4?seed=10')).text).not.toBe(first.text);
    expect((await call('/pets/5?seed=9')).body.name).not.toBe(first.body.name);
    expect((await call('/pets/4')).text).toBe((await call('/pets/4?seed=1')).text);
    // The first items of a short list are the first items of a longer one.
    const short = (await call('/pets?limit=3', { headers })).body;
    const long = (await call('/pets?limit=8', { headers })).body;
    expect(long.slice(0, 3)).toEqual(short);
    // A list of another page is another list: parameters other than a count are part of what the answer is for.
    expect((await call('/pets?limit=3&status=sold', { headers })).text).not.toBe(JSON.stringify(short));
  });

  it('puts the path parameter into the answer, and the fields a write sent', async () => {
    expect((await call('/pets/42')).body.id).toBe(42);
    const made = await send('/pets', 'POST', { name: 'Rex', tag: 'good' });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ name: 'Rex', tag: 'good' });
    expect(made.body.id).toEqual(expect.any(Number));
    const replaced = await send('/pets/9', 'PUT', { name: 'Max' });
    expect(replaced.body).toMatchObject({ name: 'Max', id: 9 });
  });

  it('sizes a list by the count parameter the operation declares, and caps it', async () => {
    expect((await call('/pets', { headers })).body).toHaveLength(5); // the declared default
    expect((await call('/pets?limit=1', { headers })).body).toHaveLength(1);
    expect((await call('/pets?limit=50', { headers })).body).toHaveLength(50);
    expect((await call('/owners')).body.data).toHaveLength(MOCK_LIMITS.defaultItems);
    // No declared count means the request's own `limit` is not part of the contract.
    expect((await call('/owners?limit=2')).body.data).toHaveLength(MOCK_LIMITS.defaultItems);
    const capped = createMockApp({
      openapi: '3.0.0',
      paths: {
        '/n': {
          get: {
            parameters: [{ name: 'size', in: 'query', schema: { type: 'integer' } }],
            responses: {
              '200': {
                description: 'x',
                content: { 'application/json': { schema: { type: 'array', items: { type: 'integer' } } } },
              },
            },
          },
        },
      },
    });
    expect((await call('/n?size=100000', {}, capped)).body).toHaveLength(MOCK_LIMITS.items);
    expect((await call('/n?size=0', {}, capped)).body).toEqual([]);
    expect((await call('/n', {}, capped)).body).toHaveLength(MOCK_LIMITS.defaultItems);
    expect((await call('/n?size=', {}, capped)).status).toBe(400);
  });

  it('answers the lowest 2xx, a 2XX range or a default, with the media type the document names', async () => {
    expect((await call('/ranged')).status).toBe(200);
    expect((await call('/ranged')).body.n).toEqual(expect.any(Number));
    const problem = await call('/problem');
    expect(problem.status).toBe(200);
    expect(problem.res.headers.get('content-type')).toBe('application/problem+json; charset=UTF-8');
    expect((await call('/pets/1', { method: 'DELETE' })).status).toBe(204);
    const gone = await call('/pets/1', { method: 'DELETE' });
    expect(gone.text).toBe('');
    expect(gone.res.headers.get('content-type')).toBeNull();
    expect((await call('/ping')).body).toEqual({});
  });

  it('says plainly when a response is not JSON, which it does not make', async () => {
    const report = await call('/report');
    expect(report.status).toBe(501);
    expect(report.body.error).toContain('text/csv');
  });

  it('sets the headers the document lists for a response', async () => {
    const res = (await call('/pets', { headers })).res;
    expect(Number(res.headers.get('x-total-count'))).toBeGreaterThanOrEqual(1);
    expect(res.headers.get('x-mock-operation')).toBe('GET /pets');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('makes safe values on request, and says what it cannot make of a locale', async () => {
    const owners = (await call('/owners?safe=true&limit=20')).body.data as Array<{ email: string }>;
    expect(owners.every((owner) => /@example\.(com|org|net)$/.test(owner.email))).toBe(true);
    const bad = await call('/owners?locale=xx');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('xx');
    const japanese = (await call('/owners?locale=ja&limit=3')).body.data;
    expect(JSON.stringify(japanese)).toMatch(/[぀-ヿ一-鿿]/);
  });

  it('serves one in-process app with the safe default when the mock is made that way', async () => {
    const safe = createMockApp(petshop, { safe: true });
    const owners = (await call('/owners?limit=20', {}, safe)).body.data as Array<{ email: string }>;
    expect(owners.every((owner) => /@example\.(com|org|net)$/.test(owner.email))).toBe(true);
    const unsafe = (await call('/owners?limit=20&safe=false', {}, safe)).body.data as Array<{ email: string }>;
    expect(unsafe.some((owner) => !/@example\.(com|org|net)$/.test(owner.email))).toBe(true);
    expect((await call('/owners?seed=3', {}, createMockApp(petshop, { seed: 3 }))).text).toBe(
      (await call('/owners?seed=3')).text,
    );
  });
});

describe('routing', () => {
  it('matches the most specific path, a base path, a parameter inside a segment and a trailing slash', async () => {
    expect((await call('/pets/mine')).body).toBe('mine');
    expect((await call('/v1/pets/3')).body.id).toBe(3);
    expect((await call('/v1/pets/mine')).body).toBe('mine');
    expect((await call('/pets/3/')).status).toBe(200);
    expect((await call('/files/report.json')).status).toBe(200);
    expect((await call('/files/a%20b.json')).status).toBe(200);
  });

  it('answers 404 for an address the document does not have, and 405 with Allow for a method it does not', async () => {
    const missing = await call('/nothing');
    expect(missing.status).toBe(404);
    expect(missing.body.hint).toContain('/__mock');
    const wrong = await call('/pets', { method: 'PATCH' });
    expect(wrong.status).toBe(405);
    expect(wrong.res.headers.get('allow')).toBe('GET, POST');
    // `mine` is also a petId, so a DELETE reaches that operation and fails its integer check.
    expect((await call('/pets/mine', { method: 'DELETE' })).status).toBe(400);
  });

  it('answers HEAD like GET without a body, and a preflight for any origin', async () => {
    const head = await app.request('/pets/3', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toContain('application/json');
    expect(await head.text()).toBe('');
    const preflight = await app.request('/pets', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.test',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-tenant',
      },
    });
    expect(preflight.status).toBeLessThan(300);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-headers')).toBeTruthy();
  });

  it('lists the operations and serves the document it was given', async () => {
    const listing = (await call('/__mock')).body;
    expect(listing.title).toBe('Pet shop');
    expect(listing.operations).toHaveLength(13);
    expect(
      listing.operations.find((op: { path: string; method: string }) => op.path === '/pets' && op.method === 'POST'),
    ).toMatchObject({
      status: 201,
      statuses: ['201', '422'],
      body: { required: true, json: true },
    });
    expect(listing.controls.delay).toContain('?delay=');
    expect((await call('/__mock/openapi.json')).body.info.title).toBe('Pet shop');
    const docs = await call('/__mock/docs');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('/__mock/openapi.json');
  });
});

describe('checking the request against the document', () => {
  const problems = (body: { errors: unknown[] }) => body.errors;

  it('checks path, query and header parameters, and names each fault', async () => {
    const path = await call('/pets/seven');
    expect(path.status).toBe(400);
    expect(path.body.error).toContain('does not match');
    expect(problems(path.body)).toEqual([{ in: 'path', name: 'petId', message: 'must be an integer, not a string' }]);
    expect(problems((await call('/pets/0')).body)).toEqual([
      { in: 'path', name: 'petId', message: 'must be at least 1' },
    ]);

    const query = await call('/pets?limit=500&status=gone', { headers });
    expect(problems(query.body)).toEqual([
      { in: 'query', name: 'limit', message: 'must be at most 50' },
      { in: 'query', name: 'status', message: 'must be one of "available", "sold"' },
    ]);
    expect(problems((await call('/pets?limit=abc', { headers })).body)).toEqual([
      { in: 'query', name: 'limit', message: 'must be an integer, not a string' },
    ]);

    const noHeader = await call('/pets');
    expect(problems(noHeader.body)).toEqual([{ in: 'header', name: 'X-Tenant', message: 'is required' }]);
    expect(problems((await call('/pets', { headers: { 'x-tenant': 'nope' } })).body)).toEqual([
      { in: 'header', name: 'X-Tenant', message: 'must be a uuid' },
    ]);
    expect((await call('/pets', { headers: { 'x-tenant': TENANT } })).status).toBe(200);
  });

  it('reads a list in a query as repeated names or a comma-separated value, and ignores a name it does not know', async () => {
    expect((await call('/pets?tags=a&tags=b&unknown=1', { headers })).status).toBe(200);
    expect((await call('/pets?tags=a,b', { headers })).status).toBe(200);
  });

  it('checks a JSON body, and lists every fault with its path', async () => {
    expect((await send('/pets', 'POST', { name: 'Rex' })).status).toBe(201);
    const short = await send('/pets', 'POST', { name: 'R', tag: 3 });
    expect(short.status).toBe(422);
    expect(short.body.errors).toEqual([
      { in: 'body', path: '/name', message: 'must be at least 2 characters' },
      { in: 'body', path: '/tag', message: 'must be a string, not an integer' },
    ]);
    expect((await send('/pets', 'POST', {})).body.errors).toEqual([
      { in: 'body', path: '/name', message: 'is required' },
    ]);
    expect((await send('/pets', 'POST', undefined)).body.errors).toEqual([{ in: 'body', message: 'is required' }]);
    expect((await send('/pets', 'POST', '{broken')).status).toBe(400);
    expect((await send('/pets', 'POST', '{broken')).body.error).toContain('not valid JSON');
    const wrongType = await call('/pets', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'name=Rex',
    });
    expect(wrongType.status).toBe(415);
    // Optional body: absent is fine; a readOnly-style field is not demanded.
    expect((await send('/pets/3', 'PUT', undefined)).status).toBe(200);
  });

  it('answers 400, or 422 only when the document lists 422 and not 400', async () => {
    expect((await call('/pets/seven')).status).toBe(400);
    expect((await send('/pets', 'POST', {})).status).toBe(422);
  });

  it('caps what it lists, and refuses a body past 64 KB', async () => {
    const many = await send('/pets', 'POST', { name: 'ok', ...Object.fromEntries([]) });
    expect(many.status).toBe(201);
    const bad = createMockApp({
      openapi: '3.0.0',
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', required: Array.from({ length: 60 }, (_, i) => `f${i}`) },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const listed = await send('/x', 'POST', {}).then(() =>
      call('/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, bad),
    );
    expect(listed.body.errors).toHaveLength(21);
    expect(listed.body.errors.at(-1).message).toBe('and 40 more');
    const huge = await call(
      '/x',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ a: 'x'.repeat(MOCK_LIMITS.body) }),
      },
      bad,
    );
    expect(huge.status).toBe(413);
  });

  it('does not check what it cannot: a body that is not JSON is accepted as it is', async () => {
    const form = createMockApp({
      openapi: '3.0.0',
      paths: {
        '/upload': {
          post: {
            requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object' } } } },
            responses: { '201': { description: 'ok' } },
          },
        },
      },
    });
    const sent = await call(
      '/upload',
      { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: '--x--' },
      form,
    );
    expect(sent.status).toBe(201);
  });
});

describe('the controls', () => {
  it('waits for delay, and a range picks the same wait for the same request', async () => {
    const started = performance.now();
    expect((await call('/pets/1?delay=120')).status).toBe(200);
    expect(performance.now() - started).toBeGreaterThanOrEqual(110);
    const ranged = async () => {
      const at = performance.now();
      await call('/pets/1?delay=40-80');
      return performance.now() - at;
    };
    const [a, b] = [await ranged(), await ranged()];
    expect(a).toBeGreaterThanOrEqual(35);
    expect(Math.abs(a - b)).toBeLessThan(30);
    expect((await call('/pets/1?delay=abc')).status).toBe(200);
  });

  it('answers a status the document lists with the body it gives that status', async () => {
    const missing = await call('/pets/1?status=404');
    expect(missing.status).toBe(404);
    expect(missing.res.headers.get('x-simulated')).toBe('true');
    expect(conforms(schemaOf('Error'), missing.body)).toEqual([]);
    // A status it lists with no body, one it does not list, a retry hint, and a success status.
    const down = await call('/pets/1?status=503');
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ error: 'Service Unavailable', status: 503, simulated: true });
    expect(down.res.headers.get('retry-after')).toBe('1');
    const teapot = await call('/pets/1?status=418');
    expect(teapot.status).toBe(418);
    expect(teapot.body.simulated).toBe(true);
    const tooMany = await call('/pets/1?status=429');
    expect(tooMany.res.headers.get('retry-after')).toBe('1');
    const made = await call('/pets/1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"Max"}',
    });
    expect(made.status).toBe(200);
    const created = await call('/pets/1?status=201', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"Max"}',
    });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ made: true });
    expect((await call('/pets/1?status=204')).status).toBe(204);
    expect((await call('/pets/1?status=204')).text).toBe('');
  });

  it("fails every request with fail=true, with the document's 500 or the project's own body", async () => {
    const failed = await call('/pets/1?fail=true');
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: 'Internal Server Error', status: 500, simulated: true });
    const mixed = await Promise.all(Array.from({ length: 40 }, () => call('/pets/1?fail=0.5')));
    const failures = mixed.filter((answer) => answer.status === 500).length;
    expect(failures).toBeGreaterThan(5);
    expect(failures).toBeLessThan(35);
    expect((await call('/pets/1?fail=0')).status).toBe(200);
  });

  it('sends the body in pieces with trickle, and the same body', async () => {
    const whole = await call('/owners?limit=20');
    const started = performance.now();
    const pieces = await call('/owners?limit=20&trickle=30');
    expect(pieces.text).toBe(whole.text);
    expect(performance.now() - started).toBeGreaterThanOrEqual(25);
  });

  it('applies a failure before checking the request, as the built-in datasets do', async () => {
    expect((await call('/pets/seven?status=503')).status).toBe(503);
  });

  it('keeps a name the operation declares for the operation, and takes the control as _name', async () => {
    // /search declares `status` and `delay` itself: they are filters, and the controls are _status and _delay.
    const filtered = await call('/search?status=sold&delay=5');
    expect(filtered.status).toBe(200);
    expect(filtered.res.headers.get('x-simulated')).toBeNull();
    expect((await call('/search?_status=503')).status).toBe(503);
    const started = performance.now();
    await call('/search?_delay=100');
    expect(performance.now() - started).toBeGreaterThanOrEqual(90);
    // Everywhere else the underscore form works as well.
    expect((await call('/pets/1?_status=404')).status).toBe(404);
    expect((await call('/pets/1?_seed=3')).text).toBe((await call('/pets/1?seed=3')).text);
  });
});

describe('a document that cannot be mocked', () => {
  const only = (schema: unknown, extra: Record<string, unknown> = {}) => ({
    openapi: '3.1.0',
    info: { title: 'T', version: '1' },
    paths: {
      '/a': {
        get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema } } }, ...extra } },
      },
    },
    components: {
      schemas: {
        Loop: { type: 'object', required: ['next'], properties: { next: { $ref: '#/components/schemas/Loop' } } },
      },
    },
  });
  const refuses = (document: unknown) => {
    try {
      createMock(document);
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiError);
      return (error as Error).message;
    }
    throw new Error('accepted');
  };

  it('refuses a keyword it cannot honour, naming the operation, the response and the keyword', () => {
    const message = refuses(only({ type: 'object', properties: { x: { not: { type: 'string' } } } }));
    expect(message).toContain('GET /a');
    expect(message).toContain('200 response');
    expect(message).toContain('"not"');
    expect(refuses(only({ if: {}, then: {} }))).toContain('"if"');
  });

  it('refuses a schema reference that is not in the document, and one that points outside it', () => {
    expect(refuses(only({ $ref: '#/components/schemas/Missing' }))).toContain('does not point at anything');
    expect(refuses(only({ $ref: 'https://example.com/a.json' }))).toContain('points outside the document');
  });

  it('refuses a required loop, which could never be made, and a pattern it cannot read', () => {
    expect(refuses(only({ $ref: '#/components/schemas/Loop' }))).toContain('refers back to itself');
    expect(refuses(only({ type: 'string', pattern: '(?=a)b' }))).toContain('lookahead');
  });

  it('lists every response that is wrong, not only the first', () => {
    const message = refuses(
      only({ not: {} }, { '404': { description: 'x', content: { 'application/json': { schema: { if: {} } } } } }),
    );
    expect(message.split('\n')).toHaveLength(2);
    expect(message).toContain('404 response');
  });

  it('answers with a clear 500 when a list asked for is more than a response may hold, and refuses a schema too big at start-up', async () => {
    const wide = {
      type: 'object',
      required: Array.from({ length: 90 }, (_, i) => `p${i}`),
      properties: Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`p${i}`, { type: 'string' }])),
    };
    const sized = (items: unknown) => ({
      openapi: '3.1.0',
      paths: {
        '/a': {
          get: {
            parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
            responses: {
              '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items } } } },
            },
          },
        },
      },
    });
    const app = createMockApp(sized(wide));
    expect((await call('/a?limit=10', {}, app)).status).toBe(200);
    const { status, body } = await call('/a?limit=100', {}, app);
    expect(status).toBe(500);
    expect(body.error).toContain('more than 5000 values');
    expect(body.operation).toBe('GET /a');
    // A record that is too big by itself is found when the mock starts, not on the first request.
    const huge = {
      ...wide,
      required: [...wide.required, 'list'],
      properties: { ...wide.properties, list: { type: 'array', minItems: 20, items: wide } },
    };
    expect(refuses(sized(huge))).toContain('more than 5000 values');
  });

  it('keeps a recursive schema finite: an optional loop is cut where it would go too deep', async () => {
    const recursive = createMockApp({
      openapi: '3.0.0',
      paths: {
        '/t': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Tree' } } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Tree: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              children: { type: 'array', items: { $ref: '#/components/schemas/Tree' } },
            },
          },
        },
      },
    });
    const { status, body } = await call('/t', {}, recursive);
    expect(status).toBe(200);
    expect(body.name).toEqual(expect.any(String));
  });
});
