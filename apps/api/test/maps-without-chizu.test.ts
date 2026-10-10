import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/core.ts';

// Chizu is an optional peer dependency: where it is not installed, /maps says which package to install and nothing else
// stops working. Its modules fail to import here, as they do in a project that never installed it.
vi.mock('@johnmorrisdotca/chizu/load', () => {
  throw new Error("Cannot find package '@johnmorrisdotca/chizu'");
});

describe('GET /maps/{code}.svg without Chizu installed', () => {
  it('answers 501 and names the package to install', async () => {
    const res = await createApp().request('/maps/JP.svg');
    expect(res.status).toBe(501);
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain('@johnmorrisdotca/chizu');
    expect(error).toContain('npm install @johnmorrisdotca/chizu');
  });

  it('leaves the countries, the flags and the rest of the API working', async () => {
    const app = createApp();
    expect((await app.request('/countries/JP')).status).toBe(200);
    expect((await app.request('/flags/jp.svg', { redirect: 'manual' })).status).toBeLessThan(400);
    expect((await app.request('/users?limit=1')).status).toBe(200);
  });
});
