import { describe, expect, it } from 'vitest';
import { type Envelope, request } from './helpers.ts';

interface Feature {
  id: string;
  wikidata: string | null;
  kind: string;
  group: string;
  name: string;
  names: { en: string; ja: string | null };
  reading: string | null;
  rank: number;
  elevation: number | null;
  location: { lat: number; lon: number };
  bbox: { west: number; south: number; east: number; north: number } | null;
  countries: string[];
  map: string | null;
}

const features = async (query: string): Promise<Envelope<Feature>> =>
  (await request<Envelope<Feature>>(`/geo/features?${query}`)).body;

describe('/geo/features', () => {
  it("lists the world's named physical features from Chizu, with no shape in any record", async () => {
    const page = await features('limit=1000');
    expect(page.metadata.total).toBeGreaterThan(2500);
    expect(page.metadata.total).toBeLessThan(4000);
    for (const one of page.results) {
      expect(Object.keys(one).sort()).toEqual(
        [
          'bbox',
          'countries',
          'elevation',
          'group',
          'id',
          'kind',
          'location',
          'map',
          'name',
          'names',
          'rank',
          'reading',
          'wikidata',
        ].sort(),
      );
      expect(JSON.stringify(one).length, one.id).toBeLessThan(1500);
    }
  });

  it('keeps the seas first, then landforms, lakes, rivers and peaks, the biggest first', async () => {
    const page = await features('limit=1000');
    const order = ['marine', 'landforms', 'lakes', 'rivers', 'peaks'];
    const groups = page.results.map((one) => order.indexOf(one.group));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(page.results[0]).toMatchObject({ kind: 'ocean', rank: 0 });
    expect(page.results.some((one) => one.group === 'capitals')).toBe(false);
  });

  it('finds Lake Biwa by its Wikidata item, with its names, its kana, a point and a box in degrees', async () => {
    const { status, body } = await request<Feature>('/geo/features/Q200239');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: 'Q200239',
      wikidata: 'Q200239',
      kind: 'lake',
      group: 'lakes',
      name: 'Lake Biwa',
      names: { en: 'Lake Biwa', ja: '琵琶湖' },
      reading: 'びわこ',
      elevation: null,
      countries: ['JP'],
      map: 'maps/JP.svg?features=all&feature=Q200239',
    });
    expect(body.location.lat).toBeCloseTo(35.3, 0);
    expect(body.location.lon).toBeCloseTo(136.1, 0);
    expect(body.bbox).not.toBeNull();
    const box = body.bbox as NonNullable<Feature['bbox']>;
    expect(box.west).toBeLessThan(body.location.lon);
    expect(box.east).toBeGreaterThan(body.location.lon);
    expect(box.south).toBeLessThan(body.location.lat);
    expect(box.north).toBeGreaterThan(body.location.lat);
    expect(box.east - box.west).toBeLessThan(1);
    expect((await request('/geo/features/q200239')).status).toBe(200);
    expect((await request('/geo/features/nowhere')).status).toBe(404);
  });

  it('names a feature in Japanese for ja, and keeps both names in every locale', async () => {
    const english = (await request<Feature>('/geo/features/Q200239')).body;
    const japanese = (await request<Feature>('/geo/features/Q200239?locale=ja')).body;
    expect(english.name).toBe('Lake Biwa');
    expect(japanese.name).toBe('琵琶湖');
    expect(japanese.names).toEqual(english.names);
  });

  it('filters by kind, group, country and rank', async () => {
    const lakes = await features('kind=lake&countries=JP&limit=100');
    expect(lakes.results.map((one) => one.name)).toContain('Lake Biwa');
    expect(lakes.results.every((one) => one.kind === 'lake' && one.countries.includes('JP'))).toBe(true);
    const seas = await features('group=marine&rank[lte]=1&limit=100');
    expect(seas.metadata.total).toBeGreaterThan(5);
    expect(seas.results.every((one) => one.group === 'marine' && one.rank <= 1)).toBe(true);
    const peaks = await features('kind=peak&countries=JP&limit=100');
    expect(peaks.results.length).toBeGreaterThan(3);
    for (const one of peaks.results) {
      expect(one.bbox).toBeNull();
      expect(one.elevation).toBeGreaterThan(0);
    }
    expect(peaks.results.some((one) => one.names.en.includes('Fuji'))).toBe(true);
  });

  it('searches names in English, Japanese and kana', async () => {
    expect((await features('q=biwa')).results.map((one) => one.id)).toContain('Q200239');
    expect((await features('q=琵琶')).results.map((one) => one.id)).toContain('Q200239');
    expect((await features('q=びわこ')).results.map((one) => one.id)).toContain('Q200239');
    expect((await features('q=zzzzzz')).metadata.total).toBe(0);
  });

  it("lists a country's features at /countries/{code}/features, and expands a feature's countries", async () => {
    const japan = (await request<Envelope<Feature>>('/countries/JP/features?limit=1000')).body;
    expect(japan.results.length).toBeGreaterThan(10);
    expect(japan.results.every((one) => one.countries.includes('JP'))).toBe(true);
    const one = (await request<{ countries: Array<{ alpha2: string }> }>('/geo/features/Q5505?expand=countries')).body;
    expect(one.countries.map((country) => country.alpha2).sort()).toEqual(['KE', 'TZ', 'UG']);
  });

  it('holds an ocean that crosses the 180th meridian as a box with west greater than east, and Africa-wide lakes as small ones', async () => {
    const pacific = (await request<Feature>('/geo/features/Q98')).body;
    expect(pacific.kind).toBe('ocean');
    const box = pacific.bbox as NonNullable<Feature['bbox']>;
    expect(box.west).toBeGreaterThan(box.east);
    const victoria = (await request<Feature>('/geo/features/Q5505')).body;
    const big = victoria.bbox as NonNullable<Feature['bbox']>;
    expect(big.east).toBeGreaterThan(big.west);
    expect(big.east - big.west).toBeLessThan(5);
  });

  it('takes ids only from the real data: Wikidata items where there are any, Natural Earth ids where not, and no ISO-less country', async () => {
    const first = await features('limit=1000');
    const all = [...first.results];
    for (let offset = 1000; offset < first.metadata.total; offset += 1000)
      all.push(...(await features(`limit=1000&offset=${offset}`)).results);
    expect(all).toHaveLength(first.metadata.total);
    const ids = new Set(all.map((one) => one.id));
    expect(ids.size).toBe(first.metadata.total);
    for (const one of all) {
      expect(one.id, one.id).toMatch(/^(Q\d+|ne-[\w-]+)$/);
      expect(one.wikidata, one.id).toBe(/^Q\d+$/.test(one.id) ? one.id : null);
      for (const country of one.countries) expect(country, one.id).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('is in the OpenAPI document, the resource list and the CSV formats', async () => {
    const spec = (
      await request<{ paths: Record<string, unknown>; components: { schemas: Record<string, unknown> } }>(
        '/openapi.json',
      )
    ).body;
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/geo/features', '/geo/features/{id}', '/countries/{id}/features']),
    );
    expect(spec.components.schemas.GeoFeature).toBeDefined();
    const catalog = (await request<Array<{ name: string; path: string; seeded: boolean }>>('/resources')).body;
    expect(catalog.find((one) => one.name === 'features')).toMatchObject({ path: '/geo/features', seeded: false });
    const csv = await request('/geo/features?format=csv&limit=3');
    expect(csv.status).toBe(200);
    expect(csv.text.split('\n')[0]).toContain('id');
  });
});
