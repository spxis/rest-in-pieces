import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpResponse, http } from 'msw/http';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/core.ts';
import { restInPiecesHandlers } from '../src/msw.ts';

// MSW in Node matches absolute URLs only, so the base is one.
const BASE = 'http://rest-in-pieces.test/api';
const server = setupServer(...restInPiecesHandlers({ base: BASE, http }));

beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('restInPiecesHandlers', () => {
  it('answers a request under the base with the body app.request gives', async () => {
    const response = await fetch(`${BASE}/users?limit=2&seed=1&safe=false`);
    const direct = await createApp().request('/users?limit=2&seed=1&safe=false');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-total-count')).toBe(direct.headers.get('x-total-count'));
    const { metadata: _a, ...through } = (await response.json()) as Record<string, unknown>;
    const { metadata: _b, ...expected } = (await direct.json()) as Record<string, unknown>;
    expect(through).toEqual(expected);
    expect((through.results as unknown[]).length).toBe(2);
  });

  it('lets a request outside the base pass through to the network', async () => {
    const real = createServer((_req, res) => res.end('real'));
    await new Promise<void>((resolve) => real.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(real.address() as AddressInfo).port}`;
    try {
      server.use(...restInPiecesHandlers({ base: `${origin}/api`, http }));
      expect((await fetch(`${origin}/api/users?limit=1`)).headers.get('content-type')).toContain('json');
      for (const path of ['/not-api', '/apiary', '/'])
        expect(await (await fetch(`${origin}${path}`)).text()).toBe('real');
    } finally {
      await new Promise((resolve) => real.close(resolve));
    }
  });

  it('carries a POST body to the API', async () => {
    const response = await fetch(`${BASE}/generate?limit=3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { name: 'person.lastName' }, seed: 4 }),
    });
    const body = (await response.json()) as { results: Array<{ name: string }> };
    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(3);
    expect(typeof body.results[0]?.name).toBe('string');
  });

  it('gives way to a handler placed before it', async () => {
    server.use(http.get(`${BASE}/users`, () => HttpResponse.json({ results: [], overridden: true })));
    expect(await (await fetch(`${BASE}/users?limit=2`)).json()).toEqual({ results: [], overridden: true });
    // Everything the override does not match still reaches the API.
    expect((await fetch(`${BASE}/products?limit=1`)).status).toBe(200);
  });

  it('answers the default base, and a base given with a trailing slash, at the same paths', async () => {
    const handlers = restInPiecesHandlers({ http, base: 'http://other.test/mock/', app: { specUrl: '/mock/x' } });
    server.use(...handlers);
    const docs = await (await fetch('http://other.test/mock/docs')).text();
    expect(docs).toContain('/mock/x');
    expect(restInPiecesHandlers({ http })).toHaveLength(1);
  });

  it('serves simulated failures through MSW as it does over HTTP', async () => {
    const response = await fetch(`${BASE}/users?status=503`);
    expect(response.status).toBe(503);
    expect(response.headers.get('x-simulated')).toBe('true');
    expect(response.headers.get('retry-after')).not.toBeNull();
  });
});
