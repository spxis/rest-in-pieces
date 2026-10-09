import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';
import { describe, expect, it } from 'vitest';
import { defaultConfig, PAGING_STYLES, type PlaygroundConfig } from './config.ts';
import { buildRequestUrl } from './request.ts';
import { SCENARIOS } from './scenarios.ts';

const BASE = 'http://localhost:6800';
const app = createApp();

function scenario(id: string) {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`No scenario ${id}`);
  return found;
}

async function send(config: PlaygroundConfig) {
  const response = await app.request(buildRequestUrl(config).slice(BASE.length));
  const body = (await response.json()) as {
    metadata: { links: { next: string | null }; nextCursor: string | null };
    results: Array<{ index: number }>;
  };
  return { status: response.status, body, indexes: body.results.map((r) => r.index) };
}

describe.each(PAGING_STYLES.map((style) => style.value))('scenarios with %s paging', (paging) => {
  const start = { ...defaultConfig(BASE), paging, limit: 10 };

  it('Next page moves one page on', async () => {
    const config = { ...start, ...scenario('next-page').apply(start) };
    const { status, indexes } = await send(config);
    expect(status).toBe(200);
    expect(indexes[0]).toBe(10);
    expect(indexes).toHaveLength(10);
  });

  it('End of results lands on the last page', async () => {
    const config = { ...start, ...scenario('end-of-results').apply(start) };
    const { status, body, indexes } = await send(config);
    expect(status).toBe(200);
    expect(indexes.at(-1)).toBe(24);
    expect(body.metadata.links.next).toBeNull();
    expect(body.metadata.nextCursor).toBeNull();
  });
});

describe('the messy data scenario', () => {
  it('asks for messy rows, and Reset clears it', async () => {
    const start = defaultConfig(BASE);
    const messy = { ...start, ...scenario('messy').apply(start) };
    expect(buildRequestUrl(messy)).toContain('messy=true');
    const response = await app.request(
      `${buildRequestUrl({ ...messy, limit: 100 }).slice(BASE.length)}&metadata=false`,
    );
    const rows = (await response.json()) as Array<Record<string, unknown>>;
    const clean = (await (await app.request('/names?limit=100&metadata=false')).json()) as typeof rows;
    expect(rows).not.toEqual(clean);
    expect(rows.map((row) => row.index)).toEqual(clean.map((row) => row.index));
    expect({ ...messy, ...scenario('reset').apply(messy) }.messy).toBe(0);
  });
});
