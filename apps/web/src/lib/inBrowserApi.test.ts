import { createApp } from '@rest-in-pieces/api/core';
import { describe, expect, it, vi } from 'vitest';
import { inBrowserFetch } from './inBrowserApi.ts';

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
    for (const url of ['http://localhost:8080/names', 'https://spxis.github.io/rest-in-pieces/apiary']) {
      expect(await (await fetcher(url)).text()).toBe('real');
    }
    expect(load).not.toHaveBeenCalled();
  });
});
