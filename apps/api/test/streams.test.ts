import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { HttpResponse, http } from 'msw/http';
import { setupServer } from 'msw/node';
import { createServer as createVite, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inBrowserFetch } from '../src/browser.ts';
import { streamsFromEnv } from '../src/cli.ts';
import { createApp } from '../src/core.ts';
import { restInPiecesHandlers } from '../src/msw.ts';
import { LIMITS, lastEventId, STREAM_NAMES, sseEvent } from '../src/routes/streams.ts';
import { restInPieces } from '../src/vite.ts';

interface Event {
  id?: string;
  event?: string;
  data?: unknown;
  retry?: string;
  comment?: string;
}

/** The events of an SSE body, as an `EventSource` would see them. */
function parseEvents(text: string): Event[] {
  const events: Event[] = [];
  for (const block of text.split('\n\n')) {
    const event: Event = {};
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) event.comment = line.slice(1).trim();
      else if (line.startsWith('id: ')) event.id = line.slice(4);
      else if (line.startsWith('event: ')) event.event = line.slice(7);
      else if (line.startsWith('retry: ')) event.retry = line.slice(7);
      else if (line.startsWith('data: ')) event.data = JSON.parse(line.slice(6));
    }
    if (Object.keys(event).length > 0) events.push(event);
  }
  return events;
}

const app = createApp();
const play = async (path: string, init?: RequestInit, target = app) => {
  const res = await target.request(path, init);
  return { res, text: await res.text() };
};
const records = async (events: Event[]) =>
  events.filter((event) => event.data !== undefined && event.event === undefined);

describe('GET /streams', () => {
  it('lists the streams with their paths and the datasets they play', async () => {
    const res = await app.request('/streams');
    const list = (await res.json()) as Array<{ name: string; path: string; dataset: string; description: string }>;
    expect(list.map((stream) => stream.name)).toEqual(['messages', 'notifications', 'metrics', 'logs']);
    expect(list.map((stream) => stream.name)).toEqual(STREAM_NAMES);
    expect(list[0]).toMatchObject({ path: '/streams/messages', dataset: 'messages' });
    expect(list.every((stream) => stream.description.length > 10)).toBe(true);
  });
});

describe('GET /streams/{name}', () => {
  it("plays the dataset one record at a time, as events with the record's own id", async () => {
    for (const name of STREAM_NAMES) {
      const { res, text } = await play(`/streams/${name}?count=3&every=100`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
      expect(res.headers.get('cache-control')).toContain('no-cache');
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      const events = parseEvents(text);
      expect(events[0]?.retry).toBe(String(LIMITS.retry));
      const rows = await records(events);
      expect(rows.map((event) => event.id)).toEqual(['1', '2', '3']);
      const dataset = (await (await app.request(`/${name}?limit=3&seed=1`)).json()) as { results: unknown[] };
      expect(rows.map((event) => event.data)).toEqual(dataset.results);
      expect(events.at(-1)).toEqual({ id: '3', event: 'end', data: { reason: 'complete', count: 3 } });
    }
  });

  it('is the same stream for the same seed and locale, and another for another', async () => {
    const first = (await play('/streams/messages?count=3&every=100&seed=5')).text;
    expect((await play('/streams/messages?count=3&every=100&seed=5')).text).toBe(first);
    expect((await play('/streams/messages?count=3&every=100&seed=6')).text).not.toBe(first);
    const japanese = parseEvents((await play('/streams/messages?count=2&every=100&locale=ja')).text);
    expect(JSON.stringify(japanese)).toMatch(/[぀-ヿ一-鿿]/);
    const safe = parseEvents((await play('/streams/messages?count=3&every=100&safe=true')).text);
    expect((await records(safe)).every((event) => /@example\.(com|org|net)"/.test(JSON.stringify(event.data)))).toBe(
      true,
    );
  });

  it('paces the events by `every`, and the first one comes at once', async () => {
    const started = performance.now();
    const res = await app.request('/streams/logs?count=4&every=100');
    const reader = res.body?.getReader();
    const arrivals: number[] = [];
    const decoder = new TextDecoder();
    for (let read = await reader?.read(); read && !read.done; read = await reader?.read()) {
      const piece = decoder.decode(read.value);
      if (piece.includes('data: ') && !piece.includes('event: end')) arrivals.push(performance.now() - started);
    }
    expect(arrivals).toHaveLength(4);
    expect(arrivals[0]).toBeLessThan(60);
    expect(arrivals[3]).toBeGreaterThanOrEqual(270);
    for (let i = 1; i < arrivals.length; i++)
      expect((arrivals[i] as number) - (arrivals[i - 1] as number)).toBeGreaterThanOrEqual(80);
  });

  it('resumes after the id a client last saw, from the header or the query, and answers 204 when nothing is left', async () => {
    const resumed = parseEvents(
      (await play('/streams/metrics?count=5&every=100', { headers: { 'Last-Event-ID': '3' } })).text,
    );
    expect((await records(resumed)).map((event) => event.id)).toEqual(['4', '5']);
    const byQuery = parseEvents((await play('/streams/metrics?count=5&every=100&lastEventId=4')).text);
    expect((await records(byQuery)).map((event) => event.id)).toEqual(['5']);
    // The tail of one stream is what a stream that never dropped would have sent.
    const whole = parseEvents((await play('/streams/metrics?count=5&every=100')).text);
    expect((await records(resumed)).map((event) => event.data)).toEqual(
      (await records(whole)).slice(3).map((event) => event.data),
    );
    const done = await app.request('/streams/metrics?count=5', { headers: { 'Last-Event-ID': '5' } });
    expect(done.status).toBe(204);
    expect(await done.text()).toBe('');
    expect((await app.request('/streams/metrics?count=5&lastEventId=99')).status).toBe(204);
    expect(lastEventId('7', undefined)).toBe(7);
    expect(lastEventId(undefined, '8')).toBe(8);
    expect(lastEventId('-1', undefined)).toBe(0);
    expect(lastEventId('abc', '9')).toBe(0);
    expect(lastEventId('12345678901', undefined)).toBe(0);
  });

  it('drops the connection without an end event when asked, so a client reconnects', async () => {
    const dropped = parseEvents((await play('/streams/logs?count=10&every=100&drop=2')).text);
    expect((await records(dropped)).map((event) => event.id)).toEqual(['1', '2']);
    expect(dropped.some((event) => event.event === 'end')).toBe(false);
    const rest = parseEvents(
      (await play('/streams/logs?count=10&every=100&drop=2', { headers: { 'Last-Event-ID': '2' } })).text,
    );
    expect((await records(rest)).map((event) => event.id)).toEqual(['3', '4']);
  });

  it('bounds what it holds: the count, the pace and the time of one connection', async () => {
    // A count past the ceiling and one below one are brought in, and an every below the floor is raised to it.
    const header = (await app.request('/streams/logs?count=999999&every=1&duration=9999')).headers.get(
      'x-stream-events',
    );
    expect(header).toBe(`1-${LIMITS.count.max}`);
    expect((await app.request('/streams/logs?count=0&every=1000')).headers.get('x-stream-events')).toBe('1-1');
    const quick = parseEvents((await play('/streams/logs?count=2&every=1')).text);
    expect(quick.find((event) => event.comment)?.comment).toContain('one every 100 ms');
    // A connection is closed at its duration, with the way back in the comment, and carries on from there.
    const closed = parseEvents((await play('/streams/logs?count=50&every=100&duration=1')).text);
    const rows = await records(closed);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.length).toBeLessThan(11);
    expect(closed.some((event) => event.event === 'end')).toBe(false);
    expect(closed.at(-1)?.comment).toMatch(/^closing after 1 s; reconnect to carry on from id \d+$/);
  }, 5000);

  it('answers 404 for a stream it does not have, 400 for a locale it does not, and refuses on request', async () => {
    const missing = await app.request('/streams/nope');
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: string }).error).toContain('messages, notifications, metrics, logs');
    expect((await app.request('/streams/__proto__')).status).toBe(404);
    expect((await app.request('/streams/logs?locale=xx')).status).toBe(400);
    const refused = await app.request('/streams/logs?status=503');
    expect(refused.status).toBe(503);
    expect(refused.headers.get('retry-after')).toBe('1');
    expect(refused.headers.get('x-simulated')).toBe('true');
    expect(((await refused.json()) as { simulated: boolean }).simulated).toBe(true);
    expect((await app.request('/streams/logs?fail=true')).status).toBe(500);
    expect((await app.request('/streams/logs?status=200&count=1&every=100')).status).toBe(200);
  });

  it('waits before the first event when asked', async () => {
    const started = performance.now();
    const res = await app.request('/streams/logs?count=1&every=100&delay=150');
    expect(performance.now() - started).toBeGreaterThanOrEqual(140);
    expect(res.status).toBe(200);
    await res.text();
  });

  it('stops its timer when the client goes away', async () => {
    const res = await app.request('/streams/logs?count=50&every=100');
    const reader = res.body?.getReader();
    await reader?.read();
    await reader?.read();
    await reader?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 250));
    // Nothing is left running for a closed stream: reading again says it is done.
    expect((await reader?.read())?.done).toBe(true);
  });

  it('is off when the app is made without streams, and on by default', async () => {
    const off = createApp({ streams: false });
    expect((await off.request('/streams')).status).toBe(404);
    expect((await off.request('/streams/logs')).status).toBe(404);
    expect(
      ((await (await off.request('/openapi.json')).json()) as { paths: Record<string, unknown> }).paths[
        '/streams/{name}'
      ],
    ).toBeUndefined();
    expect((await app.request('/streams')).status).toBe(200);
  });

  it('is turned off by REST_IN_PIECES_STREAMS=off, and on otherwise', () => {
    expect(streamsFromEnv({})).toBe(true);
    expect(streamsFromEnv({ REST_IN_PIECES_STREAMS: '' })).toBe(true);
    for (const value of ['off', '0', 'false', 'no', 'OFF'])
      expect(streamsFromEnv({ REST_IN_PIECES_STREAMS: value }), value).toBe(false);
    for (const value of ['on', '1', 'true'])
      expect(streamsFromEnv({ REST_IN_PIECES_STREAMS: value }), value).toBe(true);
  });

  it('is in the OpenAPI document, with the limits in its description', async () => {
    const spec = (await (await app.request('/openapi.json')).json()) as {
      paths: Record<
        string,
        { get: { description?: string; responses: Record<string, unknown>; parameters: Array<{ name: string }> } }
      >;
      tags: Array<{ name: string }>;
    };
    const stream = spec.paths['/streams/{name}']?.get;
    expect(stream?.responses['200']).toMatchObject({ content: { 'text/event-stream': {} } });
    expect(stream?.responses['204']).toBeDefined();
    expect(stream?.parameters.map((parameter) => parameter.name)).toEqual(
      expect.arrayContaining(['name', 'count', 'every', 'duration', 'drop', 'lastEventId', 'seed', 'locale']),
    );
    expect(stream?.description).toContain('500 events');
    expect(spec.paths['/streams']).toBeDefined();
    expect(spec.tags.some((tag) => tag.name === 'Streams')).toBe(true);
  });

  it('writes an event on one line, with the name only when there is one', () => {
    expect(sseEvent(4, { a: '1\n2' })).toBe('id: 4\ndata: {"a":"1\\n2"}\n\n');
    expect(sseEvent(4, { done: true }, 'end')).toBe('id: 4\nevent: end\ndata: {"done":true}\n\n');
  });
});

describe('streams where the API runs', () => {
  const read = async (response: Response) => parseEvents(await response.text());

  it('reaches a client over HTTP, in pieces as they are made', async () => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    await new Promise((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/streams/logs?count=3&every=100`);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body?.getReader();
      const chunks: string[] = [];
      for (let read = await reader?.read(); read && !read.done; read = await reader?.read()) {
        chunks.push(new TextDecoder().decode(read.value));
      }
      // The events arrive as they are made, in more than one piece, not as one body at the end.
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect((await records(parseEvents(chunks.join('')))).map((event) => event.id)).toEqual(['1', '2', '3']);
      // A client that goes away mid-stream leaves nothing held.
      const early = await fetch(`http://127.0.0.1:${port}/streams/logs?count=50&every=100`);
      const quitter = early.body?.getReader();
      await quitter?.read();
      await quitter?.cancel();
    } finally {
      server.close();
      if ('closeAllConnections' in server) server.closeAllConnections();
    }
  });

  it('streams through the in-browser fetch, in pieces', async () => {
    const fetchInTab = inBrowserFetch(
      'https://tab.test/api',
      async () => app,
      () => Promise.reject(new Error('network')),
    );
    const response = await fetchInTab('https://tab.test/api/streams/metrics?count=3&every=100');
    const arrivals: number[] = [];
    const started = performance.now();
    const reader = response.body?.getReader();
    for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read())
      arrivals.push(performance.now() - started);
    expect(arrivals.length).toBeGreaterThanOrEqual(4);
    expect(arrivals.at(-1)).toBeGreaterThanOrEqual(150);
  });

  describe('Mock Service Worker', () => {
    const BASE = 'http://rest-in-pieces.test/api';
    const worker = setupServer(...restInPiecesHandlers({ base: BASE, http }));
    beforeAll(() => worker.listen({ onUnhandledFrame: 'bypass' }));
    afterAll(() => worker.close());

    it('answers a stream, and a handler placed before it still wins', async () => {
      const events = await read(await fetch(`${BASE}/streams/messages?count=2&every=100`));
      expect((await records(events)).map((event) => event.id)).toEqual(['1', '2']);
      worker.use(
        http.get(`${BASE}/streams/messages`, () =>
          HttpResponse.text('data: mine\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
        ),
      );
      expect(await (await fetch(`${BASE}/streams/messages`)).text()).toBe('data: mine\n\n');
      worker.resetHandlers();
    });
  });

  describe('the Vite plugin', () => {
    let root = '';
    let vite: ViteDevServer;
    let origin = '';
    beforeAll(async () => {
      root = mkdtempSync(join(tmpdir(), 'rest-in-pieces-streams-'));
      writeFileSync(join(root, 'index.html'), '<!doctype html><title>app</title>');
      vite = await createVite({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [restInPieces()],
        optimizeDeps: { noDiscovery: true },
        server: { host: '127.0.0.1', port: 0, strictPort: true, ws: false },
      });
      await vite.listen();
      const address = vite.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Vite is not listening.');
      origin = `http://127.0.0.1:${address.port}`;
    });
    afterAll(async () => {
      await vite?.close();
      rmSync(root, { recursive: true, force: true });
    });

    it('serves a stream under /api, resumable with Last-Event-ID, in pieces', async () => {
      const response = await fetch(`${origin}/api/streams/notifications?count=4&every=100`, {
        headers: { 'Last-Event-ID': '1' },
      });
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body?.getReader();
      let pieces = 0;
      let text = '';
      for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
        pieces += 1;
        text += new TextDecoder().decode(chunk.value);
      }
      expect(pieces).toBeGreaterThanOrEqual(3);
      expect((await records(parseEvents(text))).map((event) => event.id)).toEqual(['2', '3', '4']);
    });
  });
});
