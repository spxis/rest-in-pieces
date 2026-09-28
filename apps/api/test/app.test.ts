import { describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';

describe('/countries', () => {
  it('returns every country by default', async () => {
    const body = (await (await app.request('/countries')).json()) as unknown[];
    expect(body.length).toBeGreaterThan(200);
  });

  it('honours limit and offset', async () => {
    const all = (await (await app.request('/countries')).json()) as unknown[];
    const page = (await (await app.request('/countries?offset=10&limit=10')).json()) as unknown[];
    expect(page).toEqual(all.slice(10, 20));
  });
});

describe('app', () => {
  it('serves the home page', async () => {
    const res = await app.request('/');
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('REST in Pieces');
  });

  it('allows cross-origin requests', async () => {
    const res = await app.request('/names', { headers: { Origin: 'https://example.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('reports health', async () => {
    expect(await (await app.request('/health')).json()).toEqual({ status: 'ok' });
  });

  it('returns JSON for unknown routes', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not Found' });
  });
});
