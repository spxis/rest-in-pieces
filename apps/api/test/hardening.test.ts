import { describe, expect, it } from 'vitest';
import { createApp } from '../src/core.ts';
import { SCALAR_INTEGRITY, SCALAR_URL, SCALAR_VERSION } from '../src/lib/docsPage.ts';
import { createMockApp } from '../src/mock.ts';
import { petshop } from './specs/petshop.ts';

const app = createApp();

describe('the API reference page', () => {
  for (const [name, path, target] of [
    ['/docs', '/docs', app],
    ['/__mock/docs', '/__mock/docs', createMockApp(petshop)],
  ] as const) {
    it(`${name} loads one pinned version of Scalar and checks it against its SRI hash`, async () => {
      const res = await target.request(path);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(SCALAR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
      expect(SCALAR_INTEGRITY).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
      expect(html).toContain(
        `<script src="${SCALAR_URL}" integrity="${SCALAR_INTEGRITY}" crossorigin="anonymous"></script>`,
      );
      // No script comes from the CDN without a version.
      const scripts = [...html.matchAll(/src="(https:[^"]+)"/g)].map((match) => match[1]);
      expect(scripts).toEqual([SCALAR_URL]);
      expect(html).not.toMatch(/api-reference(\/|")/);
    });
  }
});

describe('Strict-Transport-Security', () => {
  for (const [name, target] of [
    ['the API', app],
    ['a mock of an OpenAPI document', createMockApp(petshop)],
  ] as const) {
    it(`${name} sends it over HTTPS only`, async () => {
      const path = name === 'the API' ? '/health' : '/__mock';
      expect((await target.request(`http://localhost${path}`)).headers.get('strict-transport-security')).toBeNull();
      expect((await target.request(path)).headers.get('strict-transport-security')).toBeNull();
      expect(
        (await target.request(`https://api.example.test${path}`)).headers.get('strict-transport-security'),
      ).toMatch(/^max-age=\d+/);
      const proxied = await target.request(`http://localhost${path}`, { headers: { 'x-forwarded-proto': 'https' } });
      expect(proxied.headers.get('strict-transport-security')).toMatch(/^max-age=\d+/);
      // The other security headers stay on plain HTTP.
      expect((await target.request(path)).headers.get('x-content-type-options')).toBe('nosniff');
    });
  }
});

describe('fail=0.2 with a failSeed', () => {
  const outcomes = async (query: string, count = 150) =>
    Promise.all(
      Array.from(
        { length: count },
        async (_, offset) => (await app.request(`/names?limit=1&offset=${offset}&${query}`)).status,
      ),
    );

  it('fails the same requests every time, decided by the URL alone', async () => {
    const first = await outcomes('fail=0.3&failSeed=7');
    const second = await outcomes('fail=0.3&failSeed=7');
    expect(second).toEqual(first);
    const failed = first.filter((status) => status === 500).length;
    expect(failed).toBeGreaterThan(20);
    expect(failed).toBeLessThan(75);
    expect(new Set(first)).toEqual(new Set([200, 500]));
  });

  it('does not depend on the order of the parameters', async () => {
    for (let offset = 0; offset < 40; offset++) {
      const a = await app.request(`/names?limit=1&offset=${offset}&fail=0.5&failSeed=3`);
      const b = await app.request(`/names?failSeed=3&fail=0.5&offset=${offset}&limit=1`);
      expect(b.status).toBe(a.status);
    }
  });

  it('fails a different share for another seed, and every request a lower rate fails when the rate is raised', async () => {
    const seven = await outcomes('fail=0.3&failSeed=7');
    const eight = await outcomes('fail=0.3&failSeed=8');
    expect(eight).not.toEqual(seven);
    const low = await outcomes('fail=0.2&failSeed=7');
    const high = await outcomes('fail=0.5&failSeed=7');
    low.forEach((status, i) => {
      if (status === 500) expect(high[i]).toBe(500);
    });
  });

  it('is still random without one, as a retry drill wants', async () => {
    const same = await Promise.all(
      Array.from({ length: 60 }, async () => (await app.request('/names?limit=1&fail=0.5')).status),
    );
    expect(new Set(same)).toEqual(new Set([200, 500]));
  });

  it('works on a mock of an OpenAPI document and on a stream', async () => {
    const mock = createMockApp(petshop);
    const run = async () =>
      Promise.all(
        Array.from({ length: 60 }, async (_, id) => (await mock.request(`/pets/${id + 1}?fail=0.5&failSeed=9`)).status),
      );
    const first = await run();
    expect(await run()).toEqual(first);
    expect(new Set(first)).toEqual(new Set([200, 500]));
    const stream = async () =>
      Promise.all(
        Array.from(
          { length: 40 },
          async (_, seed) => (await app.request(`/streams/logs?count=1&seed=${seed}&fail=0.5&failSeed=2`)).status,
        ),
      );
    const streams = await stream();
    expect(await stream()).toEqual(streams);
    expect(new Set(streams)).toEqual(new Set([200, 500]));
  });

  it('is not read as a field filter', async () => {
    const { status } = { status: (await app.request('/names?limit=1&failSeed=7')).status };
    expect(status).toBe(200);
    const body = (await (await app.request('/names?limit=1&failSeed=7')).json()) as { metadata: { total: number } };
    const all = (await (await app.request('/names?limit=1')).json()) as { metadata: { total: number } };
    expect(body.metadata.total).toBe(all.metadata.total);
  });
});
