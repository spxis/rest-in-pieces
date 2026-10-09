import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/core.ts';
import { restInPieces } from '../src/vite.ts';

let root: string;
let server: ViteDevServer;
let origin: string;

async function start(plugin: ReturnType<typeof restInPieces>): Promise<{ server: ViteDevServer; origin: string }> {
  const vite = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin],
    optimizeDeps: { noDiscovery: true },
    // An ephemeral port, so no fixed one is held; nothing else is opened.
    server: { host: '127.0.0.1', port: 0, strictPort: true, ws: false },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite is not listening on a port.');
  return { server: vite, origin: `http://127.0.0.1:${address.port}` };
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rest-in-pieces-vite-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>the app</title><p id="vite-page"></p>');
  ({ server, origin } = await start(restInPieces()));
});

afterAll(async () => {
  await server?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('the Vite plugin', () => {
  it('answers the API under /api on the dev server, as app.request does', async () => {
    const response = await fetch(`${origin}/api/users?limit=1&seed=1`);
    const direct = await createApp().request('/users?limit=1&seed=1');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-total-count')).toBe('1000');
    const body = (await response.json()) as { results: unknown[] };
    expect(body.results).toEqual(((await direct.json()) as { results: unknown[] }).results);
    expect(body.results).toHaveLength(1);
  });

  it('leaves every other path to Vite', async () => {
    for (const path of ['/not-api', '/apiary', '/']) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('id="vite-page"');
    }
  });

  it('answers the base itself, writes with a body, and simulated errors', async () => {
    expect(await (await fetch(`${origin}/api`)).text()).toContain('<title>REST in Pieces</title>');
    const created = await fetch(`${origin}/api/generate?limit=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { name: 'person.lastName' } }),
    });
    expect(((await created.json()) as { results: unknown[] }).results).toHaveLength(2);
    const failed = await fetch(`${origin}/api/users?status=503`);
    expect(failed.status).toBe(503);
    expect(failed.headers.get('retry-after')).not.toBeNull();
  });

  it('streams a trickled body in pieces rather than all at once', async () => {
    const response = await fetch(`${origin}/api/users?limit=3&trickle=40`);
    const reader = response.body?.getReader();
    let pieces = 0;
    let text = '';
    for (let read = await reader?.read(); read && !read.done; read = await reader?.read()) {
      pieces++;
      text += new TextDecoder().decode(read.value);
    }
    expect(pieces).toBeGreaterThan(1);
    expect((JSON.parse(text) as { results: unknown[] }).results).toHaveLength(3);
  });

  it('takes another base and app options', async () => {
    const other = await start(restInPieces({ base: '/mock/v1/', app: { specUrl: '/mock/v1/openapi.json' } }));
    try {
      expect(await (await fetch(`${other.origin}/mock/v1/docs`)).text()).toContain('/mock/v1/openapi.json');
      expect(await (await fetch(`${other.origin}/api/users`)).text()).toContain('id="vite-page"');
    } finally {
      await other.server.close();
    }
  });

  it('applies to the dev server only, never to a build', () => {
    expect(restInPieces().apply).toBe('serve');
  });
});
