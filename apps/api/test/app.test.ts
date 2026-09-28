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

  it('serves an OpenAPI document and interactive docs', async () => {
    const specResponse = await app.request('/openapi.json');
    const spec = (await specResponse.json()) as { paths: Record<string, unknown> };
    expect(spec.paths).toHaveProperty('/generate');
    expect(spec.paths).toHaveProperty('/generators');

    const docsResponse = await app.request('/docs');
    expect(docsResponse.status).toBe(200);
    expect(docsResponse.headers.get('content-type')).toContain('text/html');
    expect(await docsResponse.text()).toContain('/openapi.json');
  });

  it('serializes JSON responses as CSV, YAML, and XML', async () => {
    const csv = await app.request('/generate?fields=name:person.firstName&limit=2&format=csv');
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(await csv.text()).toContain('name');

    const yaml = await app.request('/health', { headers: { Accept: 'application/yaml' } });
    expect(yaml.headers.get('content-type')).toContain('application/yaml');
    expect(await yaml.text()).toContain('status: ok');

    const xml = await app.request('/health?format=xml');
    expect(xml.headers.get('content-type')).toContain('application/xml');
    expect(await xml.text()).toContain('<status>ok</status>');
  });

  it('simulates response delays, status codes, and failures', async () => {
    const delayed = await app.request('/health?delay=1&status=202');
    expect(delayed.status).toBe(202);

    const failed = await app.request('/health?fail=true');
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'Simulated failure' });
  });

  it('returns JSON for unknown routes', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not Found' });
  });
});
