import { describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.ts';
import { chooseDelay, MAX_DELAY_MS, requestKey, trickle } from '../src/lib/controls.ts';
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

  it('picks a wait inside a delay range, the same one for the same request', () => {
    const waits = Array.from({ length: 500 }, (_, seed) => chooseDelay('200-800', `/names?delay=200-800&seed=${seed}`));
    for (const wait of waits) {
      expect(wait).toBeGreaterThanOrEqual(200);
      expect(wait).toBeLessThanOrEqual(800);
    }
    expect(new Set(waits).size).toBeGreaterThan(100);
    expect(Math.min(...waits)).toBeLessThan(300);
    expect(Math.max(...waits)).toBeGreaterThan(700);

    // Pinned, so a change to the choice is a deliberate one: a shared URL waits this long everywhere.
    const key = requestKey('http://localhost:6800/names?limit=10&delay=200-800', '/names');
    expect(chooseDelay('200-800', key)).toBe(610);
    expect(requestKey('https://example.org/api/names?delay=200-800&limit=10', '/names')).toBe(key);
  });

  it('reads delay values leniently and clamps them to the ceiling', () => {
    expect(chooseDelay('1500', 'any')).toBe(1500);
    expect(chooseDelay('800-200', 'k')).toBe(chooseDelay('200-800', 'k'));
    expect(chooseDelay('300-300', 'k')).toBe(300);
    expect(chooseDelay('50000', 'k')).toBe(MAX_DELAY_MS);
    const clamped = chooseDelay('9000-20000', 'k');
    expect(clamped).toBeGreaterThanOrEqual(9000);
    expect(clamped).toBeLessThanOrEqual(MAX_DELAY_MS);
    for (const value of [undefined, '', 'abc', '-5', '1.5', '200-', '1-2-3']) expect(chooseDelay(value, 'k')).toBe(0);
  });

  it('waits inside a delay range on a real request', async () => {
    const started = performance.now();
    await request('/names?delay=100-150&limit=1');
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(95);
    expect(elapsed).toBeLessThan(270);
  });

  it('trickles the body in pieces, in every format, without changing a byte', async () => {
    for (const format of ['json', 'csv', 'yaml', 'xml']) {
      // The bare array, since the envelope echoes the query and so would differ by `trickle` itself.
      const path = `/names?limit=10&metadata=false&format=${format}`;
      const plain = new Uint8Array(await (await app.request(path)).arrayBuffer());

      const started = performance.now();
      const res = await app.request(`${path}&trickle=20`);
      const firstByte = performance.now() - started;
      const chunks: Uint8Array[] = [];
      for await (const chunk of res.body as ReadableStream<Uint8Array>) chunks.push(chunk);
      const total = performance.now() - started;

      expect(res.status).toBe(200);
      expect(chunks.length, format).toBeGreaterThan(1);
      expect(total - firstByte).toBeGreaterThanOrEqual((chunks.length - 1) * 20 - 5);
      expect(Buffer.concat(chunks).equals(Buffer.from(plain)), format).toBe(true);
    }
  });

  it('keeps delay and trickle together within the ceiling', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const started = Date.now();
      const pending = (async () => {
        const res = await app.request('/names?limit=100&delay=9800&trickle=100');
        const chunks: Uint8Array[] = [];
        for await (const chunk of res.body as ReadableStream<Uint8Array>) chunks.push(chunk);
        return { chunks, finished: Date.now() };
      })();
      // Small steps, so the stream's own work between timers gets its turn. A real macrotask between steps
      // (setImmediate is not faked) lets that work finish before the clock moves on, so a slow machine cannot
      // read a later finish than the timers allowed. Stop once the body is read.
      let done = false;
      void pending.then(() => {
        done = true;
      });
      for (let elapsed = 0; !done && elapsed < 2 * MAX_DELAY_MS; elapsed += 50) {
        await vi.advanceTimersByTimeAsync(50);
        await new Promise((resolve) => setImmediate(resolve));
      }
      const { chunks, finished } = await pending;
      // 200 ms are left after the delay: room for two gaps, so three pieces.
      expect(chunks).toHaveLength(3);
      expect(finished - started).toBeLessThanOrEqual(MAX_DELAY_MS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends a body whole when there is no time or nothing to split', async () => {
    const pieces = async (res: Response) => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of res.body as ReadableStream<Uint8Array>) chunks.push(chunk);
      return chunks.length;
    };
    const big = 'x'.repeat(10_000);
    expect(await pieces(await trickle(new Response(big), 100, 99))).toBe(1);
    expect(await pieces(await trickle(new Response(big), 100, 250))).toBe(3);
    expect(await pieces(await trickle(new Response('small'), 100, MAX_DELAY_MS))).toBe(1);
    expect((await trickle(new Response(null, { status: 204 }), 100, MAX_DELAY_MS)).body).toBeNull();
    expect((await request('/names?status=204&trickle=50')).status).toBe(204);
  });

  it('treats trickle as a control, never a field filter', async () => {
    const { body } = await request('/names?limit=3&trickle=1');
    expect(body.results).toHaveLength(3);
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
