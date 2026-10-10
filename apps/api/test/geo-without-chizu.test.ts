import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/core.ts';

// Chizu is an optional peer dependency: where it is not installed, /geo/features says which package to install and nothing else
// stops working. Its modules fail to import here, as they do in a project that never installed it.
vi.mock('@johnmorrisdotca/chizu/load', () => {
  throw new Error("Cannot find package '@johnmorrisdotca/chizu'");
});

describe('/geo/features without Chizu installed', () => {
  it('answers 501 and names the package to install, on the list, one record and a country’s list', async () => {
    const app = createApp();
    for (const path of ['/geo/features', '/geo/features/Q200239', '/countries/JP/features']) {
      const res = await app.request(path);
      expect(res.status, path).toBe(501);
      const { error } = (await res.json()) as { error: string };
      expect(error).toContain('npm install @johnmorrisdotca/chizu');
    }
  });

  it('leaves the countries, the flags and the rest of the API working', async () => {
    const app = createApp();
    expect((await app.request('/countries/JP')).status).toBe(200);
    expect((await app.request('/subdivisions?country=JP&limit=1')).status).toBe(200);
    expect((await app.request('/users?limit=1')).status).toBe(200);
    expect((await app.request('/maps/JP.svg')).status).toBe(501);
  });
});
