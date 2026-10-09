import { describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { CSV_BOM, toCsv } from '../src/lib/format.ts';
import { type Envelope, request } from './helpers.ts';

describe('response simulation', () => {
  it('returns a simulated error for a 4xx or 5xx status', async () => {
    const { res, status, body } = await request('/names?status=503');
    expect(status).toBe(503);
    expect(body).toEqual({ error: 'Service Unavailable', status: 503, simulated: true });
    expect(res.headers.get('x-simulated')).toBe('true');
    expect(res.headers.get('retry-after')).toBe('1');
  });

  it('overrides success statuses and keeps bodyless ones empty', async () => {
    const accepted = await request('/names?status=202&limit=1');
    expect(accepted.status).toBe(202);
    expect(accepted.body.results).toHaveLength(1);

    const empty = await request('/names?status=204&format=csv');
    expect(empty.status).toBe(204);
    expect(empty.text).toBe('');
  });

  it('ignores statuses outside 200-599 instead of clamping them', async () => {
    for (const status of ['700', '100', 'abc']) {
      const { res } = await request(`/names?status=${status}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-simulated')).toBeNull();
    }
  });

  it('fails on demand, with a custom status, or for a fraction of requests', async () => {
    expect((await request('/names?fail=true')).status).toBe(500);
    expect((await request('/names?fail=1&status=429')).status).toBe(429);
    expect((await request('/names?fail=false')).status).toBe(200);

    const statuses = await Promise.all(Array.from({ length: 200 }, () => request('/names?fail=0.5&limit=0')));
    const failures = statuses.filter((r) => r.status === 500).length;
    // 200 trials at p = 0.5: the bounds sit more than five standard deviations out.
    expect(failures).toBeGreaterThan(60);
    expect(failures).toBeLessThan(140);
  });

  it('delays the response once', async () => {
    const started = performance.now();
    await request('/names?delay=120&limit=1');
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(110);
    expect(elapsed).toBeLessThan(230);
  });

  it('applies to item routes and /generate, but never to docs or health', async () => {
    expect((await request('/users/1?status=404')).status).toBe(404);
    expect((await request('/generate?fields=a:person.firstName&status=429')).status).toBe(429);
    for (const path of ['/health', '/openapi.json', '/docs', '/generators', '/resources']) {
      expect((await request(`${path}?fail=true&status=500`)).status).toBe(200);
    }
  });
});

describe('response formats', () => {
  it('writes CSV rows for the page, with a header', async () => {
    const { res, text } = await request('/names?limit=2&format=csv');
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    const lines = text.trimEnd().split('\r\n');
    expect(lines[0]).toBe('index,name,age,address,city,province,postal,country,gender');
    expect(lines).toHaveLength(3);
  });

  it('starts CSV with a UTF-8 byte-order mark and leaves the rows unchanged', async () => {
    const path = '/names?limit=3&locale=ja&format=csv';
    const res = await app.request(path);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    expect(text.charAt(0)).toBe(CSV_BOM);
    expect(text.indexOf(CSV_BOM, 1)).toBe(-1);

    const { body } = await request<Envelope<Record<string, unknown>>>(path.replace('&format=csv', ''));
    expect(text.slice(1)).toBe(toCsv(body.results));
  });

  it('writes YAML', async () => {
    const { res, text } = await request('/names?limit=1', { headers: { Accept: 'application/yaml' } });
    expect(res.headers.get('content-type')).toContain('application/yaml');
    expect(text).toMatch(/^metadata:\n/);
  });

  it('writes well-formed XML for envelopes and bare arrays alike', async () => {
    for (const path of ['/names?limit=2', '/names?limit=2&metadata=false', '/countries?limit=2']) {
      const { res, text } = await request(`${path}&format=xml`);
      expect(res.headers.get('content-type')).toContain('application/xml');
      expect(text.match(/<response>/g)).toHaveLength(1);
      expect(text.trimEnd().endsWith('</response>')).toBe(true);
    }
  });

  it('formats single records too', async () => {
    const { text } = await request('/countries/CA?format=yaml');
    expect(text).toContain('name: Canada');
  });

  it('rejects unknown formats with 400 before doing any work', async () => {
    const { res, status, body } = await request<{ error: string }>('/names?format=json5');
    expect(status).toBe(400);
    expect(body.error).toMatch(/Unsupported format/);
    expect(res.headers.get('x-total-count')).toBeNull();
  });
});
