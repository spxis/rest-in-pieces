import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';
import { describe, expect, it } from 'vitest';
import { cardOf, mapAddress } from '../components/UiPreview.tsx';
import { defaultConfig } from './config.ts';
import { buildRequestUrl, datasetPath, readPath } from './request.ts';

const api = createApp();
const first = async (path: string): Promise<Record<string, unknown>> => {
  const body = (await (await api.request(path)).json()) as unknown;
  const record = Array.isArray(body) ? body[0] : ((body as { results?: unknown[] }).results?.[0] ?? body);
  return record as Record<string, unknown>;
};

describe('the playground and the real reference data', () => {
  it('draws a country, a subdivision, a grouping and a withdrawn country as cards, with the flag where there is one', async () => {
    const country = cardOf(await first('/countries/JP?metadata=true').then((row) => ({ ...row })));
    expect(country).toMatchObject({ title: 'Japan', subtitle: 'Tokyo · AS', aside: 'JP', thing: true });
    expect(country.avatar).toBe('https://cdn.jsdelivr.net/npm/@johnmorrisdotca/hata@1/dist/svg/jp.svg');
    const tokyo = (await (await api.request('/subdivisions/JP-13')).json()) as Record<string, unknown>;
    expect(cardOf(tokyo)).toMatchObject({ title: 'Tokyo', subtitle: 'JP-13 · metropolis', thing: true });
    expect(cardOf(tokyo).aside).toMatch(/^[\d,.\s]+$/);
    expect(cardOf(await first('/groupings?limit=1'))).toMatchObject({ subtitle: 'continent', thing: true });
    expect(cardOf(await first('/countries/withdrawn?limit=1'))).toMatchObject({
      title: 'French Territory of the Afars and the Issas',
      subtitle: 'AIDJ · 1974–1977',
      aside: 'AI',
    });
  });

  it('finds the map of a country or a subdivision on the API the answer came from, and of nothing else', () => {
    expect(mapAddress('http://localhost:6800/countries?limit=10', { alpha2: 'JP', continent: 'AS' })).toBe(
      'http://localhost:6800/maps/JP.svg',
    );
    expect(mapAddress('https://example.test/api/subdivisions?country=JP', { code: 'JP-13', shortCode: '13' })).toBe(
      'https://example.test/api/maps/JP-13.svg',
    );
    expect(mapAddress('http://localhost:6800/users', { id: 1 })).toBeNull();
    expect(mapAddress('http://localhost:6800/countries/JP/subdivisions', { code: 'JP-13', shortCode: '13' })).toBe(
      'http://localhost:6800/maps/JP-13.svg',
    );
  });

  it('asks for the withdrawn countries where they are, inside /countries', () => {
    expect(datasetPath('withdrawn')).toBe('countries/withdrawn');
    expect(datasetPath('users')).toBe('users');
    const config = { ...defaultConfig('http://localhost:6800'), endpoint: 'withdrawn' };
    expect(buildRequestUrl(config)).toBe('http://localhost:6800/countries/withdrawn?limit=10');
    expect(readPath({ endpoint: 'withdrawn', nested: 'successors', parentId: 'SU' })).toBe(
      '/countries/withdrawn/SU/successors',
    );
  });

  it('draws a geographic feature as a card, with a map that lights it, and asks for it under /geo', async () => {
    const biwa = (await (await api.request('/geo/features/Q200239')).json()) as Record<string, unknown>;
    expect(cardOf(biwa)).toMatchObject({ title: 'Lake Biwa', subtitle: 'lake · JP', thing: true });
    const fuji = (await (await api.request('/geo/features?kind=peak&countries=JP&limit=1')).json()) as {
      results: Record<string, unknown>[];
    };
    expect(cardOf(fuji.results[0] as Record<string, unknown>).subtitle).toMatch(/^peak · [\d,]+ m · JP$/);
    expect(mapAddress('http://localhost:6800/geo/features?limit=10', biwa)).toBe(
      'http://localhost:6800/maps/JP.svg?features=all&feature=Q200239',
    );
    expect(mapAddress('http://localhost:6800/geo/features?limit=10', { ...biwa, map: null })).toBeNull();
    expect(datasetPath('features')).toBe('geo/features');
    const config = { ...defaultConfig('http://localhost:6800'), endpoint: 'features' };
    expect(buildRequestUrl(config)).toBe('http://localhost:6800/geo/features?limit=10');
  });
});
