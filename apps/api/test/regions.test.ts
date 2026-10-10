import { grouping } from '@johnmorrisdotca/kuni/groupings';
import { allSubdivisions, subdivisions as kuniSubdivisions } from '@johnmorrisdotca/kuni/subdivisions';
import { describe, expect, it } from 'vitest';
import { type Envelope, request } from './helpers.ts';

interface Subdivision {
  code: string;
  country: string;
  shortCode: string;
  type: string | null;
  level: number;
  parent: string | null;
  name: string;
  names: { en: string; ja: string | null };
  reading: string | null;
  capital: { en: string; ja: string | null; reading: string | null } | null;
  population: number | null;
  areaKm2: number | null;
  location: { lat: number; lon: number } | null;
}
interface Grouping {
  id: string;
  kind: string;
  name: string;
  names: { en: string; ja: string };
  members: string[];
  memberCount: number;
  source: { licence: string };
  periods: { code: string; since: string | null; until: string | null }[] | null;
}

const subdivisions = async (query: string): Promise<Envelope<Subdivision>> =>
  (await request<Envelope<Subdivision>>(`/subdivisions?${query}`)).body;

describe('/subdivisions', () => {
  it("lists a country's states, provinces or prefectures with Kuni's names and facts, loading only that country", async () => {
    const japan = await subdivisions('country=JP&limit=100');
    expect(japan.metadata.total).toBe(47);
    expect(japan.results.map((one) => one.code)).toEqual((kuniSubdivisions('JP') ?? []).map((one) => one.code));
    const tokyo = japan.results.find((one) => one.code === 'JP-13');
    expect(tokyo).toMatchObject({
      country: 'JP',
      shortCode: '13',
      type: 'metropolis',
      level: 1,
      parent: null,
      name: 'Tokyo',
      names: { en: 'Tokyo', ja: '東京都' },
      reading: 'とうきょうと',
      capital: { en: 'Shinjuku', ja: '新宿区' },
    });
    expect(tokyo?.population as number).toBeGreaterThan(13_000_000);
    expect(tokyo?.location?.lat).toBeCloseTo(35.7, 0);
    const canada = await subdivisions('country=CA&limit=100');
    expect(canada.metadata.total).toBe(13);
    expect(canada.results.find((one) => one.code === 'CA-ON')?.names.en).toBe('Ontario');
  });

  it('is named in the locale: Japanese for ja, English otherwise', async () => {
    expect((await request<Subdivision>('/subdivisions/JP-13?locale=ja')).body.name).toBe('東京都');
    expect((await request<Subdivision>('/subdivisions/JP-13?locale=de')).body.name).toBe('Tokyo');
    expect((await request<Subdivision>('/subdivisions/jp-13')).body.code).toBe('JP-13');
    expect((await request('/subdivisions/JP-99')).status).toBe(404);
    expect((await request('/subdivisions/nowhere')).status).toBe(404);
  });

  it('filters by country, kind and level, sorts by population and searches by name', async () => {
    const prefectures = await subdivisions('type=prefecture&limit=1000');
    expect(prefectures.metadata.total).toBeGreaterThan(40);
    expect(prefectures.results.every((one) => one.type === 'prefecture')).toBe(true);
    const departments = await subdivisions('country=FR&level=2&limit=1000');
    expect(departments.metadata.total).toBeGreaterThan(90);
    expect(departments.results.every((one) => one.parent !== null)).toBe(true);
    const biggest = await subdivisions('country=JP&sortBy=population:numeric&sortDirection=desc&limit=3');
    expect(biggest.results.map((one) => one.code)).toEqual(['JP-13', 'JP-14', 'JP-27']);
    const found = await subdivisions('country=US&q=california');
    expect(found.results.map((one) => one.code)).toEqual(['US-CA']);
  });

  it('loads every country on a request that names none, and then answers a code from any of them', async () => {
    const all = await subdivisions('limit=1');
    expect(all.metadata.total).toBe(allSubdivisions().length);
    expect((await request<Subdivision>('/subdivisions/BR-SP')).body.country).toBe('BR');
    const page = await subdivisions('limit=1000&offset=4000');
    expect(page.results).toHaveLength(1000);
  });

  it('links a subdivision to its country, its parent and its children', async () => {
    const lyon = (
      await request<{ country: { alpha2: string }; parent: { code: string } }>(
        '/subdivisions/FR-69?expand=country,parent',
      )
    ).body;
    expect(lyon.country.alpha2).toBe('FR');
    expect(lyon.parent.code).toBe('FR-ARA');
    const region = (await request<{ children: { code: string }[] }>('/subdivisions/FR-ARA?expand=children')).body;
    expect(region.children.map((one) => one.code)).toContain('FR-69');
    const nested = await request<Envelope<Subdivision>>('/subdivisions/FR-ARA/children?metadata=true&limit=100');
    expect(nested.body.results.map((one) => one.code)).toContain('FR-69');
    expect((await request('/subdivisions/ZZ-1/children')).status).toBe(404);
  });

  it("is a country's own list: /countries/{code}/subdivisions, by any of its codes", async () => {
    for (const code of ['JP', 'jp', 'JPN', '392']) {
      const list = await request<Envelope<Subdivision>>(`/countries/${code}/subdivisions?metadata=true&limit=100`);
      expect(list.body.metadata.total, code).toBe(47);
    }
    expect((await request('/countries/ZZ/subdivisions')).status).toBe(404);
    const none = await request<Envelope<Subdivision>>('/countries/AD/subdivisions?metadata=true');
    expect(none.status).toBe(200);
    const ofCountry = (await request<{ subdivisions: Subdivision[] }>('/countries/CA?expand=subdivisions')).body;
    expect(ofCountry.subdivisions).toHaveLength(13);
  });

  it('answers in csv and sql', async () => {
    const csv = (await request('/subdivisions?country=JP&limit=2&format=csv')).text;
    expect(csv).toContain('code,country,shortCode,type,level');
    expect((await request('/subdivisions?country=JP&limit=2&format=sql&table=pref')).text).toContain(
      'INSERT INTO "pref"',
    );
  });
});

describe("a record's province links to its subdivision", () => {
  it('embeds the subdivision a person or company is in, by name, in English and Japanese', async () => {
    const people = (
      await request<Array<{ province: string; country: string; subdivision: Subdivision | null }>>(
        '/names?limit=200&expand=subdivision&metadata=false',
      )
    ).body;
    const found = people.filter((one) => one.subdivision !== null);
    // Faker\'s Canadian provinces are ISO\'s, so every Canadian person has one.
    expect(found.length).toBe(people.length);
    for (const one of found) {
      expect(one.subdivision?.country).toBe(one.country);
      expect(one.subdivision?.names.en).toBe(one.province);
    }
    const japanese = (
      await request<Array<{ province: string; subdivision: Subdivision | null }>>(
        '/names?locale=ja&limit=50&expand=subdivision&metadata=false',
      )
    ).body;
    for (const one of japanese) expect(one.subdivision?.names.ja, one.province).toBe(one.province);
  });

  it("is null where a locale's regions are not ISO's, and the record is otherwise the same", async () => {
    const people = (
      await request<Array<{ province: string; subdivision: Subdivision | null }>>(
        '/companies?locale=de&limit=50&expand=subdivision&metadata=false',
      )
    ).body;
    expect(people).toHaveLength(50);
    for (const one of people) expect(one.subdivision === null || typeof one.subdivision.code === 'string').toBe(true);
    const plain = (await request<Array<Record<string, unknown>>>('/companies?locale=de&limit=50&metadata=false')).body;
    for (const [at, one] of plain.entries()) {
      const { subdivision: _drop, ...rest } = people[at] as Record<string, unknown>;
      expect(rest).toEqual(one);
    }
  });

  it('is offered by /resources and refused where a dataset has no province', async () => {
    const catalog = (await request<{ name: string; expand: string[] }[]>('/resources')).body;
    expect(catalog.find((one) => one.name === 'names')?.expand).toContain('subdivision');
    expect(catalog.find((one) => one.name === 'companies')?.expand).toContain('subdivision.country');
    expect((await request('/users?expand=subdivision')).status).toBe(400);
  });
});

describe('/groupings', () => {
  it('lists the 107 groupings with their members, definition and source', async () => {
    const all = (await request<Envelope<Grouping>>('/groupings?limit=200')).body;
    expect(all.metadata.total).toBe(107);
    for (const one of all.results) {
      expect(one.members.length, one.id).toBeGreaterThan(0);
      expect(one.memberCount).toBe(one.members.length);
      expect(one.source.licence.length).toBeGreaterThan(2);
    }
    const eu = (await request<Grouping>('/groupings/eu')).body;
    expect(eu).toMatchObject({
      kind: 'membership',
      name: 'European Union',
      names: { ja: '欧州連合' },
      memberCount: 27,
    });
    expect(eu.periods?.length).toBeGreaterThan(27);
    expect((await request<Grouping>('/groupings/EU?locale=ja')).body.name).toBe('欧州連合');
  });

  it('filters by kind and by a member, a list field matching when any entry does', async () => {
    const bodies = (await request<Envelope<Grouping>>('/groupings?kind=membership&limit=100')).body;
    expect(bodies.metadata.total).toBe(23);
    const ofJapan = (await request<Envelope<Grouping>>('/groupings?kind=membership&members=JP&limit=100')).body;
    expect(ofJapan.results.map((one) => one.id)).toEqual(expect.arrayContaining(['un', 'g7', 'g20', 'oecd']));
    expect(ofJapan.results.map((one) => one.id)).not.toContain('eu');
  });

  it("lists a grouping's countries and a country's groupings", async () => {
    const g7 = (await request<Envelope<{ alpha2: string }>>('/groupings/g7/countries?metadata=true&limit=100')).body;
    expect(g7.results.map((one) => one.alpha2)).toEqual(grouping('g7')?.members);
    const bodies = (
      await request<Envelope<Grouping>>('/countries/NO/groupings?kind=membership&metadata=true&limit=100')
    ).body;
    expect(bodies.results.map((one) => one.id)).toEqual(expect.arrayContaining(['un', 'nato', 'eea', 'schengen']));
    const expanded = (await request<{ countries: { alpha2: string }[] }>('/groupings/g7?expand=countries')).body;
    expect(expanded.countries).toHaveLength(7);
    expect((await request('/groupings/nothing/countries')).status).toBe(404);
  });

  it('lists the subdivisions a regional grouping holds', async () => {
    const kanto = (await request<{ subdivisions: Subdivision[] }>('/groupings/jp-kanto?expand=subdivisions')).body;
    expect(kanto.subdivisions.map((one) => one.code)).toEqual([
      'JP-08',
      'JP-09',
      'JP-10',
      'JP-11',
      'JP-12',
      'JP-13',
      'JP-14',
    ]);
    const nested = (await request<Envelope<Subdivision>>('/groupings/jp-kanto/subdivisions?metadata=true')).body;
    expect(nested.results).toHaveLength(7);
    // A grouping of countries has no subdivisions to list, and a grouping of regions no countries.
    expect((await request<Envelope<Subdivision>>('/groupings/eu/subdivisions?metadata=true')).body.results).toEqual([]);
    expect(
      (await request<Envelope<{ alpha2: string }>>('/groupings/jp-kanto/countries?metadata=true')).body.results,
    ).toEqual([]);
  });
});
