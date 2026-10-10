import { describe, expect, it } from 'vitest';
import { request } from './helpers.ts';

describe('service endpoints', () => {
  it('reports health and version', async () => {
    const { body } = await request<{ status: string; version: string; uptime: number }>('/health');
    expect(body.status).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('lists the datasets with their fields', async () => {
    const { body } = await request<Array<{ name: string; fields: string[]; seeded: boolean }>>('/resources');
    expect(body.map((r) => r.name)).toEqual([
      'names',
      'users',
      'products',
      'companies',
      'countries',
      'orders',
      'posts',
      'comments',
      'todos',
      'reviews',
      'invoices',
      'transactions',
      'events',
      'messages',
      'notifications',
      'jobs',
      'places',
      'metrics',
      'logs',
    ]);
    expect(body.find((r) => r.name === 'names')?.fields).toContain('province');
    expect(body.find((r) => r.name === 'countries')?.seeded).toBe(false);
  });

  it('serves the home page', async () => {
    const { res, text } = await request('/');
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(text).toContain('REST in Pieces');
  });

  it('allows cross-origin requests and exposes paging headers', async () => {
    const { res } = await request('/names', { headers: { Origin: 'https://example.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-expose-headers')).toContain('Link');
  });

  it('answers a CORS preflight from any origin, for writes with an Authorization header too', async () => {
    const { res, status } = await request('/users/1', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    });
    expect(status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')?.split(',')).toEqual(
      expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    );
    expect(res.headers.get('access-control-allow-headers')?.split(/,\s*/)).toEqual(['authorization', 'content-type']);
    const { res: list } = await request('/users', { headers: { Origin: 'http://localhost:5173' } });
    expect(list.headers.get('access-control-expose-headers')?.split(',')).toEqual(
      expect.arrayContaining(['X-Total-Count', 'Link', 'ETag', 'X-Simulated', 'Retry-After', 'Location']),
    );
  });

  it('returns JSON errors for unknown routes', async () => {
    const { status, body } = await request('/nope');
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Not Found' });
  });
});

describe('OpenAPI', () => {
  it('documents every route with typed schemas', async () => {
    const { body } = await request<{
      openapi: string;
      paths: Record<string, Record<string, { operationId: string; deprecated?: boolean }>>;
      components: { schemas: Record<string, unknown> };
    }>('/openapi.json');
    expect(body.openapi).toBe('3.1.0');
    for (const path of ['/names', '/names/{id}', '/users', '/products', '/companies', '/countries/{id}', '/generate']) {
      expect(body.paths).toHaveProperty(path);
    }
    expect(body.paths['/generate']).toHaveProperty('post');
    expect(body.paths['/random-names']?.get?.deprecated).toBe(true);
    expect(Object.keys(body.components.schemas)).toEqual(
      expect.arrayContaining(['Person', 'User', 'Product', 'Company', 'Country', 'Metadata', 'GenerateRequest']),
    );
    const ids = Object.values(body.paths).flatMap((ops) => Object.values(ops).map((op) => op.operationId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('serves the interactive reference', async () => {
    const { res, text } = await request('/docs');
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(text).toContain('/openapi.json');
  });
});
