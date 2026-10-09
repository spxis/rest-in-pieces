import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import defaultApp, { app, createApp } from '../src/index.ts';

describe('package entry', () => {
  it('exports the Node app, as the default too, and createApp for a fresh one', async () => {
    expect(defaultApp).toBe(app);
    const response = await createApp().request('/users?limit=5&seed=1');
    expect(((await response.json()) as { results: unknown[] }).results).toHaveLength(5);
    expect(((await (await app.request('/health')).json()) as { version: string }).version).toBe(pkg.version);
  });

  it('points every export at built JavaScript with types, and the source condition at TypeScript', () => {
    for (const [path, target] of Object.entries(pkg.exports)) {
      if (typeof target === 'string' || path === './types') continue;
      const name = path === '.' ? 'index' : path.slice(2);
      expect(target).toEqual({
        'rest-in-pieces:source': `./src/${name}.ts`,
        types: `./dist/${name}.d.ts`,
        default: `./dist/${name}.js`,
      });
    }
  });

  it('ships the OpenAPI document and the types generated from it, built rather than committed', () => {
    expect(pkg.exports['./types']).toEqual({ types: './dist/types.d.ts' });
    expect(pkg.exports['./openapi.json']).toBe('./dist/openapi.json');
  });
});
