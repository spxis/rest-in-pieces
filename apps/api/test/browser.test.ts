import { afterEach, describe, expect, it, vi } from 'vitest';
import { inBrowserFetch, installInBrowserApi } from '../src/browser.ts';
import { createApp } from '../src/core.ts';

const BASE = 'https://spxis.github.io/rest-in-pieces/api';

describe('inBrowserFetch', () => {
  it('answers requests under the base from the in-browser API', async () => {
    const passThrough = vi.fn<typeof fetch>();
    const load = vi.fn(async () => createApp());
    const fetcher = inBrowserFetch(BASE, load, passThrough);

    const response = await fetcher(`${BASE}/names?limit=2&locale=ja`, { headers: { Accept: 'application/json' } });
    const body = (await response.json()) as { results: Array<{ country: string }> };
    expect(response.status).toBe(200);
    expect(response.headers.get('content-language')).toBe('ja');
    expect(body.results).toHaveLength(2);
    expect(body.results[0]?.country).toBe('JP');

    await fetcher(`${BASE}/health`);
    expect(load).toHaveBeenCalledOnce();
    expect(passThrough).not.toHaveBeenCalled();
  });

  it('sends POST bodies through to the API', async () => {
    const fetcher = inBrowserFetch(BASE, async () => createApp(), vi.fn());
    const response = await fetcher(`${BASE}/generate?limit=3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { name: 'person.lastName' } }),
    });
    expect(((await response.json()) as { results: unknown[] }).results).toHaveLength(3);
  });

  it('answers writes, with and without a body', async () => {
    const fetcher = inBrowserFetch(BASE, async () => createApp(), vi.fn());
    const patched = await fetcher(`${BASE}/users/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { active: boolean }).active).toBe(false);
    expect((await fetcher(`${BASE}/users/1`, { method: 'DELETE' })).status).toBe(204);
  });

  it('hands the playground CSV text without the byte-order mark', async () => {
    const fetcher = inBrowserFetch(BASE, async () => createApp(), vi.fn());
    const response = await fetcher(`${BASE}/names?limit=1&format=csv`);
    const text = await response.text();
    expect(text.startsWith('\uFEFF')).toBe(false);
    expect(text.startsWith('index,name,')).toBe(true);
  });

  it('leaves every other URL to the network', async () => {
    const passThrough = vi.fn<typeof fetch>(async () => new Response('real'));
    const load = vi.fn(async () => createApp());
    const fetcher = inBrowserFetch(BASE, load, passThrough);
    for (const url of ['http://localhost:6800/names', 'https://spxis.github.io/rest-in-pieces/apiary']) {
      expect(await (await fetcher(url)).text()).toBe('real');
    }
    expect(load).not.toHaveBeenCalled();
  });
});

describe('installInBrowserApi', () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
    vi.unstubAllGlobals();
  });

  it('answers /api on the page by default and puts fetch back when removed', async () => {
    const network = vi.fn<typeof fetch>(async () => new Response('real'));
    globalThis.fetch = network;
    vi.stubGlobal('location', { href: 'https://example.com/app/' });

    const uninstall = installInBrowserApi();
    const response = await fetch('https://example.com/api/users?limit=1&seed=7');
    expect(((await response.json()) as { results: unknown[] }).results).toHaveLength(1);
    expect(await (await fetch('https://example.com/other')).text()).toBe('real');
    expect(network).toHaveBeenCalledOnce();

    uninstall();
    expect(globalThis.fetch).toBe(network);
  });

  it('takes an absolute base and app options', async () => {
    globalThis.fetch = vi.fn<typeof fetch>();
    installInBrowserApi({ base: 'https://mock.test/v1/', app: { specUrl: '/v1/openapi.json' } });
    const docs = await (await fetch('https://mock.test/v1/docs')).text();
    expect(docs).toContain('/v1/openapi.json');
  });

  it('keeps writes in the tab with app: { session: true }, until /reset', async () => {
    globalThis.fetch = vi.fn<typeof fetch>();
    installInBrowserApi({ base: 'https://tab.test/api', app: { session: true } });
    const remove = await fetch('https://tab.test/api/users/1', { method: 'DELETE' });
    expect(remove.status).toBe(204);
    expect((await fetch('https://tab.test/api/users/1')).status).toBe(404);
    expect((await fetch('https://tab.test/api/reset', { method: 'POST' })).status).toBe(200);
    expect((await fetch('https://tab.test/api/users/1')).status).toBe(200);
  });
});
